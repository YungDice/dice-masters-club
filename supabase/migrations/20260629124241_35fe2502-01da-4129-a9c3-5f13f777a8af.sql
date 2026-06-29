
-- =========================================================
-- 1. Rate limiting
-- =========================================================
CREATE TABLE IF NOT EXISTS public.rate_limits (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count       INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, key, window_start)
);
GRANT SELECT ON public.rate_limits TO authenticated;
GRANT ALL   ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- No direct write policy; only SECURITY DEFINER RPC may write.
CREATE POLICY "rate_limits_self_read" ON public.rate_limits
  FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.rate_limit_hit(
  _user uuid, _key text, _window_seconds int, _max_hits int
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _bucket TIMESTAMPTZ;
  _count  INT;
BEGIN
  IF _user IS NULL THEN RETURN FALSE; END IF;
  _bucket := to_timestamp(floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds);
  INSERT INTO public.rate_limits(user_id, key, window_start, count)
    VALUES (_user, _key, _bucket, 1)
    ON CONFLICT (user_id, key, window_start)
    DO UPDATE SET count = public.rate_limits.count + 1
    RETURNING count INTO _count;
  RETURN _count <= _max_hits;
END $$;
REVOKE EXECUTE ON FUNCTION public.rate_limit_hit(uuid,text,int,int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.rate_limit_hit(uuid,text,int,int) TO service_role;

-- =========================================================
-- 2. Atomic marketplace: buy / bid / settle
-- =========================================================
CREATE OR REPLACE FUNCTION public.buy_listing_tx(
  _buyer uuid, _listing_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _l public.marketplace_listings; _op text;
BEGIN
  _op := 'buy:' || _listing_id::text;
  IF EXISTS (SELECT 1 FROM public.dice_transactions WHERE operation_id = _op) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_processed');
  END IF;
  SELECT * INTO _l FROM public.marketplace_listings WHERE id = _listing_id FOR UPDATE;
  IF _l.id IS NULL THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF _l.status <> 'active' THEN RAISE EXCEPTION 'Listing not available'; END IF;
  IF _l.seller_id = _buyer THEN RAISE EXCEPTION 'Cannot buy own listing'; END IF;
  IF _l.sale_type IS NOT NULL AND _l.sale_type <> 'fixed' THEN
    RAISE EXCEPTION 'Auction listing — place bid instead';
  END IF;
  PERFORM public.wallet_adjust_idem(_buyer, -_l.price, 'marketplace_buy'::tx_type,
    'marketplace', 'listing', _l.id, 'Buy ' || COALESCE(_l.title,''), _op || ':b');
  PERFORM public.wallet_adjust_idem(_l.seller_id, _l.price, 'marketplace_sell'::tx_type,
    'marketplace', 'listing', _l.id, 'Sold ' || COALESCE(_l.title,''), _op || ':s');
  UPDATE public.marketplace_listings
     SET status = 'sold', sold_to = _buyer, sold_at = now()
   WHERE id = _l.id;
  INSERT INTO public.marketplace_purchases(listing_id, buyer_id, seller_id, price)
    VALUES (_l.id, _buyer, _l.seller_id, _l.price)
    ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'listing_id', _l.id, 'category', _l.category);
END $$;
REVOKE EXECUTE ON FUNCTION public.buy_listing_tx(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.buy_listing_tx(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.place_bid_tx(
  _bidder uuid, _listing_id uuid, _amount bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _l public.marketplace_listings; _prev_bid public.marketplace_bids; _op text;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'Bid must be positive'; END IF;
  SELECT * INTO _l FROM public.marketplace_listings WHERE id = _listing_id FOR UPDATE;
  IF _l.id IS NULL THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF _l.status <> 'active' THEN RAISE EXCEPTION 'Listing not active'; END IF;
  IF _l.sale_type <> 'auction' THEN RAISE EXCEPTION 'Not an auction'; END IF;
  IF _l.seller_id = _bidder THEN RAISE EXCEPTION 'Cannot bid on own listing'; END IF;
  IF _l.ends_at IS NOT NULL AND _l.ends_at < now() THEN
    RAISE EXCEPTION 'Auction already ended';
  END IF;
  IF _amount <= COALESCE(_l.current_bid, _l.starting_bid, _l.price, 0) THEN
    RAISE EXCEPTION 'Bid must exceed current bid';
  END IF;

  _op := 'bid:' || _listing_id::text || ':' || _bidder::text || ':' || _amount::text;
  IF EXISTS (SELECT 1 FROM public.dice_transactions WHERE operation_id = _op) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_processed');
  END IF;

  -- Refund previous high bidder (if any)
  SELECT * INTO _prev_bid FROM public.marketplace_bids
    WHERE listing_id = _l.id AND status = 'active'
    ORDER BY amount DESC LIMIT 1 FOR UPDATE;
  IF _prev_bid.id IS NOT NULL THEN
    UPDATE public.marketplace_bids SET status = 'outbid' WHERE id = _prev_bid.id;
    PERFORM public.wallet_adjust_idem(_prev_bid.bidder_id, _prev_bid.amount,
      'auction_outbid'::tx_type, 'marketplace', 'listing', _l.id,
      'Outbid refund', 'outbid:' || _prev_bid.id::text);
  END IF;

  -- Escrow the new bid
  PERFORM public.wallet_adjust_idem(_bidder, -_amount, 'marketplace_buy'::tx_type,
    'marketplace', 'listing', _l.id, 'Bid escrow', _op);
  INSERT INTO public.marketplace_bids(listing_id, bidder_id, amount, status)
    VALUES (_l.id, _bidder, _amount, 'active');
  UPDATE public.marketplace_listings
     SET current_bid = _amount, top_bidder_id = _bidder
   WHERE id = _l.id;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.place_bid_tx(uuid,uuid,bigint) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.place_bid_tx(uuid,uuid,bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_auction_tx(_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _l public.marketplace_listings; _bid public.marketplace_bids; _op text;
BEGIN
  SELECT * INTO _l FROM public.marketplace_listings WHERE id = _listing_id FOR UPDATE;
  IF _l.id IS NULL THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF _l.sale_type <> 'auction' THEN RAISE EXCEPTION 'Not an auction'; END IF;
  IF _l.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_settled');
  END IF;
  IF _l.ends_at IS NULL OR _l.ends_at > now() THEN
    RAISE EXCEPTION 'Auction not yet ended';
  END IF;
  _op := 'auction-settle:' || _listing_id::text;
  IF EXISTS (SELECT 1 FROM public.dice_transactions WHERE operation_id = _op || ':s') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_processed');
  END IF;

  SELECT * INTO _bid FROM public.marketplace_bids
    WHERE listing_id = _l.id AND status = 'active'
    ORDER BY amount DESC LIMIT 1 FOR UPDATE;

  IF _bid.id IS NULL THEN
    UPDATE public.marketplace_listings SET status = 'expired' WHERE id = _l.id;
    RETURN jsonb_build_object('ok', true, 'sold', false);
  END IF;

  UPDATE public.marketplace_bids SET status = 'won' WHERE id = _bid.id;
  PERFORM public.wallet_adjust_idem(_l.seller_id, _bid.amount,
    'auction_won'::tx_type, 'marketplace', 'listing', _l.id,
    'Auction sold ' || COALESCE(_l.title,''), _op || ':s');
  UPDATE public.marketplace_listings
     SET status = 'sold', sold_to = _bid.bidder_id, sold_at = now(),
         current_bid = _bid.amount, top_bidder_id = _bid.bidder_id
   WHERE id = _l.id;
  INSERT INTO public.marketplace_purchases(listing_id, buyer_id, seller_id, price)
    VALUES (_l.id, _bid.bidder_id, _l.seller_id, _bid.amount)
    ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'sold', true,
    'buyer_id', _bid.bidder_id, 'amount', _bid.amount, 'category', _l.category);
END $$;
REVOKE EXECUTE ON FUNCTION public.settle_auction_tx(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.settle_auction_tx(uuid) TO service_role;

-- Bulk sweeper for cron
CREATE OR REPLACE FUNCTION public.expire_auctions()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT id FROM public.marketplace_listings
    WHERE sale_type = 'auction' AND status = 'active' AND ends_at IS NOT NULL AND ends_at < now()
    LIMIT 200
  LOOP
    BEGIN
      PERFORM public.settle_auction_tx(r.id);
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      -- skip and continue
      NULL;
    END;
  END LOOP;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.expire_auctions() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.expire_auctions() TO service_role;

-- =========================================================
-- 3. Atomic PvP settle (idempotent payouts)
-- =========================================================
CREATE OR REPLACE FUNCTION public.pvp_payout_tx(
  _room_id uuid, _source text,
  _winner uuid, _winner_amount bigint,
  _loser uuid,  _loser_amount  bigint,
  _note text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _op_base text;
BEGIN
  _op_base := _source || '-payout:' || _room_id::text;
  IF _winner IS NOT NULL AND _winner_amount > 0 THEN
    PERFORM public.wallet_adjust_idem(_winner, _winner_amount, 'game_payout'::tx_type,
      _source, _source, _room_id, _note, _op_base || ':w');
  END IF;
  IF _loser IS NOT NULL AND _loser_amount > 0 THEN
    PERFORM public.wallet_adjust_idem(_loser, _loser_amount, 'game_payout'::tx_type,
      _source, _source, _room_id, _note, _op_base || ':l');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.pvp_payout_tx(uuid,text,uuid,bigint,uuid,bigint,text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.pvp_payout_tx(uuid,text,uuid,bigint,uuid,bigint,text) TO service_role;

-- =========================================================
-- 4. Expire VIPs (cosmetic — vip_until check is also live)
-- =========================================================
CREATE OR REPLACE FUNCTION public.expire_vip_status()
RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH x AS (
    UPDATE public.profiles SET vip_until = NULL
      WHERE vip_until IS NOT NULL AND vip_until < now() - INTERVAL '1 day'
    RETURNING 1
  ) SELECT count(*)::int FROM x;
$$;
REVOKE EXECUTE ON FUNCTION public.expire_vip_status() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.expire_vip_status() TO service_role;

-- =========================================================
-- 5. Cron schedules
-- =========================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$ BEGIN
  PERFORM cron.unschedule('dice-cleanup-stale-data');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  PERFORM cron.unschedule('dice-expire-auctions');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  PERFORM cron.unschedule('dice-expire-vip');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  PERFORM cron.unschedule('dice-rate-limits-cleanup');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('dice-cleanup-stale-data', '17 * * * *',
  $cron$ SELECT public.cleanup_stale_data(); $cron$);
SELECT cron.schedule('dice-expire-auctions',  '*/2 * * * *',
  $cron$ SELECT public.expire_auctions(); $cron$);
SELECT cron.schedule('dice-expire-vip',       '7 0 * * *',
  $cron$ SELECT public.expire_vip_status(); $cron$);
SELECT cron.schedule('dice-rate-limits-cleanup', '*/30 * * * *',
  $cron$ DELETE FROM public.rate_limits WHERE window_start < now() - INTERVAL '2 hours'; $cron$);
