
-- 1) Add trade_id lock column to user_baddies
ALTER TABLE public.user_baddies ADD COLUMN IF NOT EXISTS trade_id uuid;
CREATE INDEX IF NOT EXISTS user_baddies_trade_id_idx ON public.user_baddies(trade_id);

-- 2) Trades table
DO $$ BEGIN
  CREATE TYPE public.trade_status AS ENUM ('pending','accepted','declined','cancelled','expired','completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_baddies uuid[] NOT NULL DEFAULT '{}',
  to_baddies uuid[] NOT NULL DEFAULT '{}',
  from_dice bigint NOT NULL DEFAULT 0 CHECK (from_dice >= 0),
  to_dice bigint NOT NULL DEFAULT 0 CHECK (to_dice >= 0),
  status public.trade_status NOT NULL DEFAULT 'pending',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  CHECK (from_user <> to_user)
);

CREATE INDEX IF NOT EXISTS trades_from_user_idx ON public.trades(from_user, status, created_at DESC);
CREATE INDEX IF NOT EXISTS trades_to_user_idx ON public.trades(to_user, status, created_at DESC);
CREATE INDEX IF NOT EXISTS trades_status_expires_idx ON public.trades(status, expires_at);

GRANT SELECT, INSERT, UPDATE ON public.trades TO authenticated;
GRANT ALL ON public.trades TO service_role;

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trades: participants can view"
  ON public.trades FOR SELECT TO authenticated
  USING (auth.uid() = from_user OR auth.uid() = to_user);

-- Writes go through SECURITY DEFINER RPCs; no direct INSERT/UPDATE policy.

-- 3) create_trade_tx
CREATE OR REPLACE FUNCTION public.create_trade_tx(
  _to uuid,
  _from_baddies uuid[],
  _to_baddies uuid[],
  _from_dice bigint,
  _to_dice bigint,
  _note text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_trade_id uuid;
  v_friend boolean;
  v_locked int;
  v_op text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _to IS NULL OR _to = v_user THEN RAISE EXCEPTION 'Invalid recipient'; END IF;
  IF COALESCE(_from_dice,0) < 0 OR COALESCE(_to_dice,0) < 0 THEN RAISE EXCEPTION 'DICE must be positive'; END IF;
  IF COALESCE(_from_dice,0) > 10000000 OR COALESCE(_to_dice,0) > 10000000 THEN RAISE EXCEPTION 'DICE amount too large'; END IF;
  IF COALESCE(array_length(_from_baddies,1),0) = 0
     AND COALESCE(array_length(_to_baddies,1),0) = 0
     AND COALESCE(_from_dice,0) = 0
     AND COALESCE(_to_dice,0) = 0 THEN
    RAISE EXCEPTION 'Trade must include at least one baddie or DICE amount';
  END IF;
  IF COALESCE(array_length(_from_baddies,1),0) > 10 OR COALESCE(array_length(_to_baddies,1),0) > 10 THEN
    RAISE EXCEPTION 'Max 10 baddies per side';
  END IF;

  -- Must be friends (accepted)
  SELECT EXISTS(
    SELECT 1 FROM public.friendships
     WHERE status = 'accepted'
       AND ((user_id = v_user AND friend_id = _to) OR (user_id = _to AND friend_id = v_user))
  ) INTO v_friend;
  IF NOT v_friend THEN RAISE EXCEPTION 'You can only trade with accepted friends'; END IF;

  -- Rate limit: max 20 trade creates per hour
  IF NOT public.rate_limit_hit(v_user, 'trade_create', 3600, 20) THEN
    RAISE EXCEPTION 'Too many trade offers — slow down';
  END IF;

  INSERT INTO public.trades(from_user, to_user, from_baddies, to_baddies, from_dice, to_dice, note)
    VALUES (v_user, _to, COALESCE(_from_baddies,'{}'), COALESCE(_to_baddies,'{}'),
            COALESCE(_from_dice,0), COALESCE(_to_dice,0), NULLIF(trim(_note),''))
    RETURNING id INTO v_trade_id;

  -- Lock offered baddies (must belong to sender, must not be already listed/traded)
  IF COALESCE(array_length(_from_baddies,1),0) > 0 THEN
    UPDATE public.user_baddies
       SET trade_id = v_trade_id
     WHERE id = ANY(_from_baddies)
       AND user_id = v_user
       AND listing_id IS NULL
       AND trade_id IS NULL;
    GET DIAGNOSTICS v_locked = ROW_COUNT;
    IF v_locked <> array_length(_from_baddies,1) THEN
      RAISE EXCEPTION 'One or more of your baddies is unavailable (listed, in another trade, or not yours)';
    END IF;
  END IF;

  -- Verify requested baddies belong to recipient and are unlocked
  IF COALESCE(array_length(_to_baddies,1),0) > 0 THEN
    IF (SELECT COUNT(*) FROM public.user_baddies
         WHERE id = ANY(_to_baddies) AND user_id = _to
           AND listing_id IS NULL AND trade_id IS NULL) <> array_length(_to_baddies,1) THEN
      RAISE EXCEPTION 'Requested baddie(s) are unavailable';
    END IF;
  END IF;

  -- Escrow sender's DICE
  IF COALESCE(_from_dice,0) > 0 THEN
    v_op := 'trade_escrow:' || v_trade_id::text;
    PERFORM public.wallet_adjust_idem(v_user, -_from_dice, 'escrow_lock'::tx_type,
      'trade', 'trade', v_trade_id, 'Trade offer escrow', v_op);
  END IF;

  INSERT INTO public.notifications(user_id, kind, title, body, link)
    VALUES (_to, 'trade_offer', 'New trade offer',
      'You received a new trade offer.', '/trades');

  RETURN jsonb_build_object('ok', true, 'trade_id', v_trade_id);
END $$;

-- 4) respond_trade_tx
CREATE OR REPLACE FUNCTION public.respond_trade_tx(_trade_id uuid, _accept boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_t public.trades;
  v_op text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_t FROM public.trades WHERE id = _trade_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trade not found'; END IF;
  IF v_t.status <> 'pending' THEN RAISE EXCEPTION 'Trade already resolved'; END IF;
  IF v_t.to_user <> v_user THEN RAISE EXCEPTION 'Only the recipient can respond'; END IF;
  IF v_t.expires_at < now() THEN
    -- Auto-expire
    UPDATE public.trades SET status='expired', resolved_at=now() WHERE id=_trade_id;
    UPDATE public.user_baddies SET trade_id = NULL WHERE trade_id = _trade_id;
    IF v_t.from_dice > 0 THEN
      PERFORM public.wallet_adjust_idem(v_t.from_user, v_t.from_dice, 'refund'::tx_type,
        'trade', 'trade', _trade_id, 'Trade expired refund', 'trade_expire:' || _trade_id::text);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  IF NOT _accept THEN
    UPDATE public.trades SET status='declined', resolved_at=now() WHERE id=_trade_id;
    UPDATE public.user_baddies SET trade_id = NULL WHERE trade_id = _trade_id;
    IF v_t.from_dice > 0 THEN
      PERFORM public.wallet_adjust_idem(v_t.from_user, v_t.from_dice, 'refund'::tx_type,
        'trade', 'trade', _trade_id, 'Trade declined refund', 'trade_decline:' || _trade_id::text);
    END IF;
    INSERT INTO public.notifications(user_id, kind, title, body, link)
      VALUES (v_t.from_user, 'trade_declined', 'Trade declined',
        'Your trade offer was declined.', '/trades');
    RETURN jsonb_build_object('ok', true, 'accepted', false);
  END IF;

  -- ACCEPT — verify recipient still owns requested baddies and unlocked
  IF COALESCE(array_length(v_t.to_baddies,1),0) > 0 THEN
    IF (SELECT COUNT(*) FROM public.user_baddies
         WHERE id = ANY(v_t.to_baddies) AND user_id = v_t.to_user
           AND listing_id IS NULL AND trade_id IS NULL) <> array_length(v_t.to_baddies,1) THEN
      RAISE EXCEPTION 'You no longer own the requested baddie(s)';
    END IF;
  END IF;

  -- Verify sender's offered baddies still locked to this trade
  IF COALESCE(array_length(v_t.from_baddies,1),0) > 0 THEN
    IF (SELECT COUNT(*) FROM public.user_baddies
         WHERE id = ANY(v_t.from_baddies) AND user_id = v_t.from_user AND trade_id = _trade_id) <> array_length(v_t.from_baddies,1) THEN
      RAISE EXCEPTION 'Offered baddie(s) are no longer available';
    END IF;
  END IF;

  -- Debit recipient's DICE (may fail with insufficient funds — aborts whole tx)
  IF v_t.to_dice > 0 THEN
    v_op := 'trade_pay_to:' || _trade_id::text;
    PERFORM public.wallet_adjust_idem(v_user, -v_t.to_dice, 'trade'::tx_type,
      'trade', 'trade', _trade_id, 'Trade payment', v_op);
  END IF;

  -- Swap baddies
  IF COALESCE(array_length(v_t.from_baddies,1),0) > 0 THEN
    UPDATE public.user_baddies
       SET user_id = v_t.to_user, trade_id = NULL, last_collected_at = now()
     WHERE id = ANY(v_t.from_baddies) AND user_id = v_t.from_user;
  END IF;
  IF COALESCE(array_length(v_t.to_baddies,1),0) > 0 THEN
    UPDATE public.user_baddies
       SET user_id = v_t.from_user, trade_id = NULL, last_collected_at = now()
     WHERE id = ANY(v_t.to_baddies) AND user_id = v_t.to_user;
  END IF;

  -- Credit each side with the other's DICE (from_dice was already escrowed)
  IF v_t.from_dice > 0 THEN
    PERFORM public.wallet_adjust_idem(v_t.to_user, v_t.from_dice, 'trade'::tx_type,
      'trade', 'trade', _trade_id, 'Trade received DICE', 'trade_credit_to:' || _trade_id::text);
  END IF;
  IF v_t.to_dice > 0 THEN
    PERFORM public.wallet_adjust_idem(v_t.from_user, v_t.to_dice, 'trade'::tx_type,
      'trade', 'trade', _trade_id, 'Trade received DICE', 'trade_credit_from:' || _trade_id::text);
  END IF;

  UPDATE public.trades SET status='completed', resolved_at=now() WHERE id=_trade_id;

  INSERT INTO public.activity_feed(user_id, kind, payload) VALUES
    (v_t.from_user, 'trade_completed', jsonb_build_object('trade_id', _trade_id, 'with', v_t.to_user)),
    (v_t.to_user,   'trade_completed', jsonb_build_object('trade_id', _trade_id, 'with', v_t.from_user));

  INSERT INTO public.notifications(user_id, kind, title, body, link)
    VALUES (v_t.from_user, 'trade_accepted', 'Trade accepted!',
      'Your trade offer was accepted.', '/trades');

  RETURN jsonb_build_object('ok', true, 'accepted', true);
END $$;

-- 5) cancel_trade_tx (sender only, while pending)
CREATE OR REPLACE FUNCTION public.cancel_trade_tx(_trade_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_t public.trades;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_t FROM public.trades WHERE id = _trade_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trade not found'; END IF;
  IF v_t.from_user <> v_user THEN RAISE EXCEPTION 'Only the sender can cancel'; END IF;
  IF v_t.status <> 'pending' THEN RAISE EXCEPTION 'Trade already resolved'; END IF;

  UPDATE public.trades SET status='cancelled', resolved_at=now() WHERE id=_trade_id;
  UPDATE public.user_baddies SET trade_id = NULL WHERE trade_id = _trade_id;
  IF v_t.from_dice > 0 THEN
    PERFORM public.wallet_adjust_idem(v_user, v_t.from_dice, 'refund'::tx_type,
      'trade', 'trade', _trade_id, 'Trade cancelled refund', 'trade_cancel:' || _trade_id::text);
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- 6) expire_trades (batch, called by pg_cron)
CREATE OR REPLACE FUNCTION public.expire_trades()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT * FROM public.trades
    WHERE status = 'pending' AND expires_at < now()
    LIMIT 200
  LOOP
    UPDATE public.trades SET status='expired', resolved_at=now() WHERE id=r.id AND status='pending';
    UPDATE public.user_baddies SET trade_id = NULL WHERE trade_id = r.id;
    IF r.from_dice > 0 THEN
      PERFORM public.wallet_adjust_idem(r.from_user, r.from_dice, 'refund'::tx_type,
        'trade', 'trade', r.id, 'Trade expired refund', 'trade_expire:' || r.id::text);
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Schedule expiry every 10 minutes
DO $$ BEGIN
  PERFORM cron.unschedule('expire-trades');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('expire-trades', '*/10 * * * *', $$SELECT public.expire_trades();$$);
