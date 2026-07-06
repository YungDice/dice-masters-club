
-- 1) Fix buy_baddie_slot_tx to use full 8-arg wallet_adjust_idem signature
CREATE OR REPLACE FUNCTION public.buy_baddie_slot_tx()
RETURNS TABLE(slots_bought integer, new_balance bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cur int;
  cost int := 25000;
  bal bigint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT baddie_slots_bought INTO cur FROM public.profiles WHERE id = uid FOR UPDATE;
  IF cur IS NULL THEN cur := 0; END IF;
  IF cur >= 8 THEN RAISE EXCEPTION 'max baddie slots reached'; END IF;
  PERFORM public.wallet_adjust_idem(
    uid, (-cost)::bigint, 'event'::tx_type,
    'baddie_slot_purchase', 'baddie_slot', NULL::uuid,
    'Baddie slot purchase',
    'baddie_slot:' || uid::text || ':' || (cur+1)::text
  );
  UPDATE public.profiles SET baddie_slots_bought = cur + 1 WHERE id = uid;
  SELECT balance INTO bal FROM public.dice_wallets WHERE user_id = uid;
  RETURN QUERY SELECT cur + 1, bal;
END;
$$;
REVOKE ALL ON FUNCTION public.buy_baddie_slot_tx() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_baddie_slot_tx() TO authenticated;

-- 2) Add missing notification_kind enum values (idempotent)
ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'event';
ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'achievement';
ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'trade_offer';
ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'trade_declined';
ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'crew';
ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'system';

-- 3) Public stats RPC — same source of truth as leaderboard_wins
DROP FUNCTION IF EXISTS public.get_user_profile_stats(uuid);
CREATE OR REPLACE FUNCTION public.get_user_profile_stats(_uid uuid)
RETURNS TABLE (
  user_id uuid,
  games_played bigint,
  wins bigint,
  losses bigint,
  draws bigint,
  wagered bigint,
  payout bigint,
  net bigint,
  win_loss_ratio numeric,
  rank_score numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _uid AS user_id,
    COALESCE(COUNT(*), 0)::bigint AS games_played,
    COALESCE(COUNT(*) FILTER (WHERE outcome = 'win'), 0)::bigint AS wins,
    COALESCE(COUNT(*) FILTER (WHERE outcome = 'loss'), 0)::bigint AS losses,
    COALESCE(COUNT(*) FILTER (WHERE outcome NOT IN ('win','loss')), 0)::bigint AS draws,
    COALESCE(SUM(wagered), 0)::bigint AS wagered,
    COALESCE(SUM(payout), 0)::bigint AS payout,
    COALESCE(SUM(delta), 0)::bigint AS net,
    CASE
      WHEN COALESCE(COUNT(*) FILTER (WHERE outcome = 'loss'), 0) = 0
        THEN COALESCE(COUNT(*) FILTER (WHERE outcome = 'win'), 0)::numeric
      ELSE ROUND(
        COALESCE(COUNT(*) FILTER (WHERE outcome = 'win'), 0)::numeric
        / NULLIF(COUNT(*) FILTER (WHERE outcome = 'loss'), 0)::numeric, 3)
    END AS win_loss_ratio,
    (COALESCE(COUNT(*) FILTER (WHERE outcome = 'win'), 0) * GREATEST(
      CASE
        WHEN COALESCE(COUNT(*) FILTER (WHERE outcome = 'loss'), 0) = 0
          THEN GREATEST(COALESCE(COUNT(*) FILTER (WHERE outcome = 'win'), 0), 1)::numeric
        ELSE COALESCE(COUNT(*) FILTER (WHERE outcome = 'win'), 0)::numeric
             / NULLIF(COUNT(*) FILTER (WHERE outcome = 'loss'), 0)::numeric
      END, 0.3))::numeric(12,2) AS rank_score
  FROM public.game_results
  WHERE user_id = _uid;
$$;
REVOKE ALL ON FUNCTION public.get_user_profile_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_profile_stats(uuid) TO authenticated, anon;

-- 4) delete_tag — allow user to free up a tag slot
CREATE OR REPLACE FUNCTION public.delete_tag_tx(_tag text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_tag text;
  v_active text;
  v_listed uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT tag INTO v_tag FROM public.profile_tags WHERE user_id = uid AND tag = _tag;
  IF v_tag IS NULL THEN RAISE EXCEPTION 'Tag not owned'; END IF;
  SELECT id INTO v_listed FROM public.marketplace_listings
    WHERE seller_id = uid AND category = 'tag' AND tag_value = _tag AND status = 'active'
    LIMIT 1;
  IF v_listed IS NOT NULL THEN RAISE EXCEPTION 'Tag is listed on the marketplace — cancel the listing first'; END IF;
  DELETE FROM public.profile_tags WHERE user_id = uid AND tag = _tag;
  SELECT tag INTO v_active FROM public.profiles WHERE id = uid;
  IF v_active = _tag THEN
    UPDATE public.profiles SET tag = NULL WHERE id = uid;
  END IF;
  RETURN jsonb_build_object('ok', true, 'deleted', _tag);
END $$;
REVOKE ALL ON FUNCTION public.delete_tag_tx(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_tag_tx(text) TO authenticated;

-- 5) Baddie storage capacity by tier
CREATE OR REPLACE FUNCTION public.baddie_storage_cap(_tier text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (CASE COALESCE(_tier,'base')
    WHEN 'shiny'    THEN 240000
    WHEN 'elite'    THEN 360000
    WHEN 'prestige' THEN 480000
    ELSE 120000
  END)::bigint;
$$;
GRANT EXECUTE ON FUNCTION public.baddie_storage_cap(text) TO authenticated, anon;

-- Enforce cap inside collect_baddie_tx
CREATE OR REPLACE FUNCTION public.collect_baddie_tx(_baddie_id uuid)
RETURNS TABLE(amount integer, last_collected_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_b RECORD;
  v_rate int;
  v_secs int;
  v_amt bigint;
  v_cap bigint;
  v_op text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT b.*, t.income_per_hour AS rate INTO v_b
    FROM public.user_baddies b JOIN public.baddie_templates t ON t.id = b.template_id
   WHERE b.id = _baddie_id AND b.user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Baddie not found'; END IF;
  IF v_b.listing_id IS NOT NULL THEN RAISE EXCEPTION 'Baddie is listed on the marketplace'; END IF;
  v_rate := (v_b.rate * public.baddie_tier_mult_bp(v_b.tier)) / 10000;
  v_secs := LEAST(EXTRACT(EPOCH FROM (now() - v_b.last_collected_at))::int, 30*24*3600);
  v_amt  := ((v_rate::bigint * v_secs) / 3600);
  v_cap  := public.baddie_storage_cap(v_b.tier);
  IF v_amt > v_cap THEN v_amt := v_cap; END IF;
  IF v_amt <= 0 THEN RAISE EXCEPTION 'Nothing to collect yet'; END IF;
  UPDATE public.user_baddies SET last_collected_at = now() WHERE id = _baddie_id;
  v_op := 'baddie_collect:' || _baddie_id::text || ':' || floor(extract(epoch from now())/60)::text;
  PERFORM public.wallet_adjust_idem(v_user, v_amt, 'event'::tx_type,
    'baddie_income', 'baddie', _baddie_id, 'Baddie passive income', v_op);
  INSERT INTO public.activity_feed(user_id, kind, payload)
    VALUES (v_user, 'baddie_income', jsonb_build_object('baddie_id',_baddie_id,'amount',v_amt,'tier',v_b.tier));
  amount := v_amt::int; last_collected_at := now(); RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.collect_baddie_tx(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.collect_baddie_tx(uuid) TO authenticated;
