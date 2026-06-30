
-- =========================================================
-- Big fixes batch
-- =========================================================

-- 1) profile_tags: users own up to 3 tags. profiles.tag = active.
CREATE TABLE IF NOT EXISTS public.profile_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag TEXT NOT NULL UNIQUE,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profile_tags TO authenticated, anon;
GRANT ALL ON public.profile_tags TO service_role;
ALTER TABLE public.profile_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags_public_read" ON public.profile_tags FOR SELECT USING (true);

-- Backfill any current profiles.tag into profile_tags
INSERT INTO public.profile_tags(user_id, tag)
  SELECT id, tag FROM public.profiles WHERE tag IS NOT NULL
  ON CONFLICT (tag) DO NOTHING;

-- Enforce 3-tag cap
CREATE OR REPLACE FUNCTION public.tg_enforce_tag_cap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.profile_tags WHERE user_id = NEW.user_id;
  IF _n >= 3 THEN RAISE EXCEPTION 'Tag limit reached (max 3 per user)'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tag_cap ON public.profile_tags;
CREATE TRIGGER tag_cap BEFORE INSERT ON public.profile_tags
  FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_tag_cap();

-- Set active tag (must own it)
CREATE OR REPLACE FUNCTION public.set_active_tag(_tag text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _tag IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profile_tags WHERE user_id=_uid AND tag=_tag) THEN
    RAISE EXCEPTION 'You do not own that tag';
  END IF;
  PERFORM set_config('app.bypass_profile_protect','1',true);
  UPDATE public.profiles SET tag=_tag WHERE id=_uid;
  RETURN jsonb_build_object('ok', true, 'tag', _tag);
END $$;

-- 2) game_results: add wagered/payout columns
ALTER TABLE public.game_results
  ADD COLUMN IF NOT EXISTS wagered BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payout BIGINT NOT NULL DEFAULT 0;

-- Aggregated stats view
DROP VIEW IF EXISTS public.user_game_stats;
CREATE VIEW public.user_game_stats
WITH (security_invoker=on) AS
SELECT
  user_id,
  count(*) AS games_played,
  count(*) FILTER (WHERE outcome='win') AS wins,
  count(*) FILTER (WHERE outcome='loss') AS losses,
  count(*) FILTER (WHERE outcome='tie') AS ties,
  COALESCE(sum(GREATEST(wagered,0)),0)::bigint AS total_wagered,
  COALESCE(sum(GREATEST(delta,0)),0)::bigint AS total_won,
  COALESCE(sum(GREATEST(-delta,0)),0)::bigint AS total_lost,
  COALESCE(sum(delta),0)::bigint AS net
FROM public.game_results
GROUP BY user_id;
GRANT SELECT ON public.user_game_stats TO authenticated, anon, service_role;

-- Enhanced record_game_result with wagered/payout
CREATE OR REPLACE FUNCTION public.record_game_result(
  _uid uuid, _kind text, _delta bigint, _outcome text, _room_id uuid, _details jsonb,
  _wagered bigint DEFAULT 0, _payout bigint DEFAULT 0
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF _uid IS NULL OR _kind IS NULL OR _outcome IS NULL THEN RETURN; END IF;
  INSERT INTO public.game_results(room_id,user_id,kind,delta,outcome,details,wagered,payout)
    VALUES (_room_id,_uid,_kind,COALESCE(_delta,0),_outcome,COALESCE(_details,'{}'::jsonb),COALESCE(_wagered,0),COALESCE(_payout,0));
  INSERT INTO public.activity_feed(user_id, kind, payload)
    VALUES (_uid, 'game_result',
      jsonb_build_object('game',_kind,'outcome',_outcome,'delta',_delta,'wagered',_wagered));
END $$;

-- 3) Streak fix
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_streak_date DATE;

CREATE OR REPLACE FUNCTION public.touch_presence()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid := auth.uid(); _last DATE; _today DATE := (now() AT TIME ZONE 'UTC')::date;
        _streak int; _new_streak int;
BEGIN
  IF _uid IS NULL THEN RETURN jsonb_build_object('ok',false); END IF;
  PERFORM set_config('app.bypass_profile_protect','1',true);
  UPDATE public.profiles SET last_seen_at = now() WHERE id=_uid;
  SELECT last_streak_date, streak_days INTO _last, _streak FROM public.profiles WHERE id=_uid FOR UPDATE;
  IF _last IS DISTINCT FROM _today THEN
    IF _last = _today - 1 THEN _new_streak := COALESCE(_streak,0) + 1;
    ELSE _new_streak := 1; END IF;
    PERFORM set_config('app.bypass_profile_protect','1',true);
    UPDATE public.profiles SET last_streak_date=_today, streak_days=_new_streak WHERE id=_uid;
    RETURN jsonb_build_object('ok',true,'streak',_new_streak,'changed',true);
  END IF;
  RETURN jsonb_build_object('ok',true,'streak',_streak,'changed',false);
END $$;
GRANT EXECUTE ON FUNCTION public.touch_presence() TO authenticated;

-- 4) Bet limit helper
CREATE OR REPLACE FUNCTION public.assert_bet_within_limit(_uid uuid, _amount bigint)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE _max bigint;
BEGIN
  _max := CASE WHEN public.is_vip(_uid) THEN 10000 ELSE 2000 END;
  IF _amount > _max THEN
    RAISE EXCEPTION 'Bet exceeds your limit (% DICE). %', _max,
      CASE WHEN public.is_vip(_uid) THEN '' ELSE 'Become VIP to raise limit to 10,000.' END;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.assert_bet_within_limit(uuid,bigint) TO authenticated, service_role;

-- 5) Modify buy_listing_tx to enforce 3-tag cap and write to profile_tags
CREATE OR REPLACE FUNCTION public.buy_listing_tx(_buyer uuid, _listing_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _l public.marketplace_listings; _op text; _seller_new_uname text; _owned int;
BEGIN
  _op := 'buy:' || _listing_id::text;
  IF EXISTS (SELECT 1 FROM public.dice_transactions WHERE operation_id = _op || ':b') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_processed');
  END IF;
  SELECT * INTO _l FROM public.marketplace_listings WHERE id = _listing_id FOR UPDATE;
  IF _l.id IS NULL THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF _l.status <> 'active' THEN RAISE EXCEPTION 'Listing not available'; END IF;
  IF _l.seller_id = _buyer THEN RAISE EXCEPTION 'Cannot buy own listing'; END IF;
  IF _l.sale_type = 'auction' THEN RAISE EXCEPTION 'Auction listing — place a bid instead'; END IF;
  IF _l.category = 'tag' AND _l.tag_value IS NOT NULL THEN
    SELECT count(*) INTO _owned FROM public.profile_tags WHERE user_id = _buyer;
    IF _owned >= 3 THEN RAISE EXCEPTION 'You already own 3 tags (max)'; END IF;
    IF EXISTS (SELECT 1 FROM public.profile_tags WHERE tag = _l.tag_value AND user_id <> _l.seller_id) THEN
      RAISE EXCEPTION 'Tag already owned by another user';
    END IF;
  END IF;
  IF _l.category = 'username' AND _l.username_value IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(_l.username_value) AND id <> _l.seller_id) THEN
      RAISE EXCEPTION 'That username is no longer available';
    END IF;
  END IF;
  PERFORM public.wallet_adjust_idem(_buyer, -_l.price, 'marketplace_purchase'::tx_type,
    'marketplace', 'listing', _l.id, 'Buy ' || COALESCE(_l.title,''), _op || ':b');
  PERFORM public.wallet_adjust_idem(_l.seller_id, _l.price, 'marketplace_sale'::tx_type,
    'marketplace', 'listing', _l.id, 'Sold ' || COALESCE(_l.title,''), _op || ':s');
  PERFORM set_config('app.bypass_profile_protect','1',true);
  IF _l.category = 'tag' AND _l.tag_value IS NOT NULL THEN
    -- Transfer tag ownership
    DELETE FROM public.profile_tags WHERE tag = _l.tag_value AND user_id = _l.seller_id;
    INSERT INTO public.profile_tags(user_id, tag) VALUES (_buyer, _l.tag_value);
    -- If seller had it as active, clear; if buyer has none active, set
    UPDATE public.profiles SET tag = NULL WHERE id = _l.seller_id AND tag = _l.tag_value;
    UPDATE public.profiles SET tag = _l.tag_value WHERE id = _buyer AND tag IS NULL;
  ELSIF _l.category = 'username' AND _l.username_value IS NOT NULL THEN
    _seller_new_uname := 'user_' || substr(replace(_l.seller_id::text,'-',''),1,10);
    UPDATE public.profiles
       SET username = _seller_new_uname, username_changed_at = now(),
           username_free_change_available = TRUE
     WHERE id = _l.seller_id;
    UPDATE public.profiles
       SET username = _l.username_value, username_changed_at = now()
     WHERE id = _buyer;
  END IF;
  UPDATE public.marketplace_listings
     SET status='sold', winner_id=_buyer, sales_count = COALESCE(sales_count,0)+1
   WHERE id = _l.id;
  INSERT INTO public.marketplace_purchases(listing_id, buyer_id, seller_id, price)
    VALUES (_l.id, _buyer, _l.seller_id, _l.price)
    ON CONFLICT (listing_id) DO NOTHING;
  INSERT INTO public.activity_feed(user_id, kind, payload) VALUES
    (_buyer, 'marketplace_buy', jsonb_build_object('listing_id',_l.id,'title',_l.title,'price',_l.price)),
    (_l.seller_id, 'marketplace_sell', jsonb_build_object('listing_id',_l.id,'title',_l.title,'price',_l.price));
  RETURN jsonb_build_object('ok', true, 'listing_id', _l.id, 'category', _l.category);
END $$;

-- Same for settle_auction
CREATE OR REPLACE FUNCTION public.settle_auction_tx(_listing_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _l public.marketplace_listings; _bid public.marketplace_bids;
        _op text; _seller_new_uname text; _owned int;
BEGIN
  SELECT * INTO _l FROM public.marketplace_listings WHERE id = _listing_id FOR UPDATE;
  IF _l.id IS NULL THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF COALESCE(_l.sale_type,'fixed') <> 'auction' THEN RAISE EXCEPTION 'Not an auction'; END IF;
  IF _l.status <> 'active' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_settled'); END IF;
  IF _l.auction_ends_at IS NULL OR _l.auction_ends_at > now() THEN
    RAISE EXCEPTION 'Auction not yet ended';
  END IF;
  _op := 'auction-settle:' || _listing_id::text;
  IF EXISTS (SELECT 1 FROM public.dice_transactions WHERE operation_id = _op || ':s') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_processed');
  END IF;
  SELECT * INTO _bid FROM public.marketplace_bids
    WHERE listing_id = _l.id AND status = 'active'
    ORDER BY amount DESC LIMIT 1 FOR UPDATE;
  PERFORM set_config('app.bypass_profile_protect','1',true);
  IF _bid.id IS NULL THEN
    UPDATE public.marketplace_listings SET status = 'expired' WHERE id = _l.id;
    RETURN jsonb_build_object('ok', true, 'sold', false);
  END IF;
  IF _l.category = 'tag' AND _l.tag_value IS NOT NULL THEN
    SELECT count(*) INTO _owned FROM public.profile_tags WHERE user_id = _bid.bidder_id;
    IF _owned >= 3 THEN
      UPDATE public.marketplace_bids SET status='refunded' WHERE id = _bid.id;
      PERFORM public.wallet_adjust_idem(_bid.bidder_id, _bid.amount, 'refund'::tx_type,
        'auction', 'listing', _l.id, 'Winner at 3-tag cap', _op || ':wr');
      UPDATE public.marketplace_listings SET status='expired' WHERE id = _l.id;
      RETURN jsonb_build_object('ok', true, 'sold', false, 'reason', 'cap');
    END IF;
    DELETE FROM public.profile_tags WHERE tag = _l.tag_value AND user_id = _l.seller_id;
    INSERT INTO public.profile_tags(user_id, tag) VALUES (_bid.bidder_id, _l.tag_value);
    UPDATE public.profiles SET tag = NULL WHERE id = _l.seller_id AND tag = _l.tag_value;
    UPDATE public.profiles SET tag = _l.tag_value WHERE id = _bid.bidder_id AND tag IS NULL;
  ELSIF _l.category = 'username' AND _l.username_value IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(_l.username_value) AND id <> _l.seller_id) THEN
      UPDATE public.marketplace_bids SET status='refunded' WHERE id = _bid.id;
      PERFORM public.wallet_adjust_idem(_bid.bidder_id, _bid.amount, 'refund'::tx_type,
        'auction', 'listing', _l.id, 'Username unavailable', _op || ':wr');
      UPDATE public.marketplace_listings SET status='expired' WHERE id = _l.id;
      RETURN jsonb_build_object('ok', true, 'sold', false, 'reason', 'username_unavailable');
    END IF;
    _seller_new_uname := 'user_' || substr(replace(_l.seller_id::text,'-',''),1,10);
    UPDATE public.profiles
       SET username=_seller_new_uname, username_changed_at=now(), username_free_change_available=TRUE
     WHERE id = _l.seller_id;
    UPDATE public.profiles SET username=_l.username_value, username_changed_at=now() WHERE id=_bid.bidder_id;
  END IF;
  UPDATE public.marketplace_bids SET status='won' WHERE id = _bid.id;
  PERFORM public.wallet_adjust_idem(_l.seller_id, _bid.amount, 'auction_won'::tx_type,
    'marketplace', 'listing', _l.id, 'Auction sold ' || COALESCE(_l.title,''), _op || ':s');
  UPDATE public.marketplace_listings
     SET status='sold', winner_id=_bid.bidder_id, current_bid=_bid.amount, current_bidder_id=_bid.bidder_id,
         sales_count = COALESCE(sales_count,0)+1
   WHERE id = _l.id;
  INSERT INTO public.marketplace_purchases(listing_id, buyer_id, seller_id, price)
    VALUES (_l.id, _bid.bidder_id, _l.seller_id, _bid.amount) ON CONFLICT (listing_id) DO NOTHING;
  INSERT INTO public.notifications(user_id, kind, title, body, link) VALUES
    (_l.seller_id, 'marketplace_sale', 'Auction sold!',
       COALESCE(_l.title,'') || ' sold for ' || _bid.amount || ' DICE', '/marketplace/' || _l.id::text),
    (_bid.bidder_id, 'auction_won', 'You won the auction!',
       COALESCE(_l.title,'') || ' for ' || _bid.amount || ' DICE', '/marketplace/' || _l.id::text);
  INSERT INTO public.activity_feed(user_id, kind, payload) VALUES
    (_bid.bidder_id,'auction_won', jsonb_build_object('listing_id',_l.id,'title',_l.title,'price',_bid.amount));
  RETURN jsonb_build_object('ok', true, 'sold', true, 'buyer_id', _bid.bidder_id, 'amount', _bid.amount);
END $$;

-- 6) Admin moderation: delete listing & challenge
CREATE OR REPLACE FUNCTION public.admin_delete_listing_tx(_listing_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _caller uuid := auth.uid(); _l public.marketplace_listings; _bid public.marketplace_bids;
BEGIN
  IF NOT public.is_staff(_caller) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO _l FROM public.marketplace_listings WHERE id=_listing_id FOR UPDATE;
  IF _l.id IS NULL THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF _l.status = 'active' AND COALESCE(_l.sale_type,'fixed')='auction' THEN
    SELECT * INTO _bid FROM public.marketplace_bids WHERE listing_id=_l.id AND status='active'
      ORDER BY amount DESC LIMIT 1 FOR UPDATE;
    IF _bid.id IS NOT NULL THEN
      UPDATE public.marketplace_bids SET status='refunded' WHERE id=_bid.id;
      PERFORM public.wallet_adjust_idem(_bid.bidder_id, _bid.amount, 'refund'::tx_type,
        'admin_delete', 'listing', _l.id, 'Admin removed listing', 'adminrm:' || _bid.id::text);
    END IF;
  END IF;
  UPDATE public.marketplace_listings SET status='rejected' WHERE id=_l.id;
  INSERT INTO public.moderation_actions(actor_id, action, target_kind, target_id, reason, details)
    VALUES (_caller, 'delete_listing', 'listing', _l.id, _reason,
            jsonb_build_object('seller_id',_l.seller_id,'title',_l.title));
  INSERT INTO public.notifications(user_id, kind, title, body, link)
    VALUES (_l.seller_id, 'event', 'Listing removed',
      COALESCE('Your listing "' || _l.title || '" was removed by staff.','Your listing was removed.') ||
      COALESCE(' Reason: ' || _reason, ''), '/marketplace');
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_delete_listing_tx(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_challenge_tx(_challenge_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _caller uuid := auth.uid(); _c public.challenges; _fee bigint;
BEGIN
  IF NOT public.is_staff(_caller) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO _c FROM public.challenges WHERE id=_challenge_id FOR UPDATE;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'Challenge not found'; END IF;
  -- Refund creation fee (500 standard)
  _fee := 500;
  IF _c.creator_id IS NOT NULL THEN
    PERFORM public.wallet_adjust_idem(_c.creator_id, _fee, 'refund'::tx_type,
      'admin_delete', 'challenge', _c.id, 'Refund: challenge removed', 'admincrm:' || _c.id::text);
  END IF;
  DELETE FROM public.challenges WHERE id=_c.id;
  INSERT INTO public.moderation_actions(actor_id, action, target_kind, target_id, reason, details)
    VALUES (_caller, 'delete_challenge', 'challenge', _c.id, _reason,
            jsonb_build_object('creator_id',_c.creator_id,'title',_c.title,'refunded',_fee));
  IF _c.creator_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, kind, title, body, link)
      VALUES (_c.creator_id, 'event', 'Challenge removed',
        'Your challenge was removed by staff. ' || _fee || ' DICE refunded.' || COALESCE(' Reason: ' || _reason, ''),
        '/challenges');
  END IF;
  RETURN jsonb_build_object('ok', true, 'refunded', _fee);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_delete_challenge_tx(uuid,text) TO authenticated;

-- Grant achievement (owner only)
CREATE OR REPLACE FUNCTION public.grant_achievement_tx(_user uuid, _achievement text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _caller uuid := auth.uid();
BEGIN
  IF NOT public.has_role(_caller, 'owner') THEN RAISE EXCEPTION 'Owners only'; END IF;
  INSERT INTO public.user_achievements(user_id, achievement_id) VALUES (_user, _achievement)
    ON CONFLICT DO NOTHING;
  INSERT INTO public.moderation_actions(actor_id, action, target_kind, target_id, reason, details)
    VALUES (_caller, 'grant_achievement', 'user', _user, NULL, jsonb_build_object('achievement',_achievement));
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.grant_achievement_tx(uuid,text) TO authenticated;

-- Realtime helpful for activity feed (idempotent)
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='activity_feed';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_feed';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
