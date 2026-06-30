
-- 1) Marketplace: support username listings
ALTER TABLE public.marketplace_listings ADD COLUMN IF NOT EXISTS username_value text;

-- 2) Profile: VIP-only full-page profile background image
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profile_bg_url text;

-- 3) Trigger: revert profile_bg_url for non-VIP users (mirrors banner_url)
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL THEN RETURN NEW; END IF;
  IF public.is_staff(_caller) THEN RETURN NEW; END IF;
  IF NEW.vip_until    IS DISTINCT FROM OLD.vip_until    THEN NEW.vip_until    := OLD.vip_until;    END IF;
  IF NEW.level        IS DISTINCT FROM OLD.level        THEN NEW.level        := OLD.level;        END IF;
  IF NEW.xp           IS DISTINCT FROM OLD.xp           THEN NEW.xp           := OLD.xp;           END IF;
  IF NEW.reputation   IS DISTINCT FROM OLD.reputation   THEN NEW.reputation   := OLD.reputation;   END IF;
  IF NEW.streak_days  IS DISTINCT FROM OLD.streak_days  THEN NEW.streak_days  := OLD.streak_days;  END IF;
  IF NEW.is_18_plus   IS DISTINCT FROM OLD.is_18_plus   THEN NEW.is_18_plus   := OLD.is_18_plus;   END IF;
  IF NEW.dob          IS DISTINCT FROM OLD.dob          THEN NEW.dob          := OLD.dob;          END IF;
  IF NEW.tag          IS DISTINCT FROM OLD.tag          THEN NEW.tag          := OLD.tag;          END IF;
  IF NEW.username     IS DISTINCT FROM OLD.username     THEN NEW.username     := OLD.username;     END IF;
  IF NEW.username_changed_at IS DISTINCT FROM OLD.username_changed_at THEN NEW.username_changed_at := OLD.username_changed_at; END IF;
  IF NEW.banner_url IS DISTINCT FROM OLD.banner_url AND NOT public.is_vip(_caller) THEN
    NEW.banner_url := OLD.banner_url;
  END IF;
  IF NEW.profile_bg_url IS DISTINCT FROM OLD.profile_bg_url AND NOT public.is_vip(_caller) THEN
    NEW.profile_bg_url := OLD.profile_bg_url;
  END IF;
  RETURN NEW;
END $$;

-- 4) buy_listing_tx: handle username transfer (seller gets placeholder name)
CREATE OR REPLACE FUNCTION public.buy_listing_tx(_buyer uuid, _listing_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _l public.marketplace_listings; _op text; _buyer_tag text; _seller_new_uname text;
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
    SELECT tag INTO _buyer_tag FROM public.profiles WHERE id = _buyer FOR UPDATE;
    IF _buyer_tag IS NOT NULL THEN RAISE EXCEPTION 'You already own a tag'; END IF;
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
  IF _l.category = 'tag' AND _l.tag_value IS NOT NULL THEN
    UPDATE public.profiles SET tag = _l.tag_value WHERE id = _buyer;
  ELSIF _l.category = 'username' AND _l.username_value IS NOT NULL THEN
    _seller_new_uname := 'user_' || substr(replace(_l.seller_id::text,'-',''),1,10);
    UPDATE public.profiles SET username = _seller_new_uname, username_changed_at = now() WHERE id = _l.seller_id;
    UPDATE public.profiles SET username = _l.username_value, username_changed_at = now() WHERE id = _buyer;
  END IF;
  UPDATE public.marketplace_listings
     SET status = 'sold', winner_id = _buyer,
         sales_count = COALESCE(sales_count, 0) + 1
   WHERE id = _l.id;
  INSERT INTO public.marketplace_purchases(listing_id, buyer_id, seller_id, price)
    VALUES (_l.id, _buyer, _l.seller_id, _l.price)
    ON CONFLICT (listing_id) DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'listing_id', _l.id, 'category', _l.category);
END $$;

-- 5) settle_auction_tx: handle username transfer on auction win
CREATE OR REPLACE FUNCTION public.settle_auction_tx(_listing_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _l public.marketplace_listings; _bid public.marketplace_bids;
        _op text; _winner_tag text; _seller_new_uname text;
BEGIN
  SELECT * INTO _l FROM public.marketplace_listings WHERE id = _listing_id FOR UPDATE;
  IF _l.id IS NULL THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF COALESCE(_l.sale_type,'fixed') <> 'auction' THEN RAISE EXCEPTION 'Not an auction'; END IF;
  IF _l.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_settled');
  END IF;
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

  IF _bid.id IS NULL THEN
    IF _l.category = 'tag' AND _l.tag_value IS NOT NULL THEN
      UPDATE public.profiles SET tag = _l.tag_value WHERE id = _l.seller_id;
    END IF;
    -- username: nothing to restore (seller still owns it)
    UPDATE public.marketplace_listings SET status = 'expired' WHERE id = _l.id;
    RETURN jsonb_build_object('ok', true, 'sold', false);
  END IF;

  IF _l.category = 'tag' AND _l.tag_value IS NOT NULL THEN
    SELECT tag INTO _winner_tag FROM public.profiles WHERE id = _bid.bidder_id FOR UPDATE;
    IF _winner_tag IS NOT NULL THEN
      UPDATE public.marketplace_bids SET status = 'refunded' WHERE id = _bid.id;
      PERFORM public.wallet_adjust_idem(_bid.bidder_id, _bid.amount, 'refund'::tx_type,
        'auction', 'listing', _l.id, 'Winner already had tag', _op || ':wr');
      UPDATE public.profiles SET tag = _l.tag_value WHERE id = _l.seller_id;
      UPDATE public.marketplace_listings SET status = 'expired' WHERE id = _l.id;
      RETURN jsonb_build_object('ok', true, 'sold', false, 'reason', 'winner_had_tag');
    END IF;
    UPDATE public.profiles SET tag = _l.tag_value WHERE id = _bid.bidder_id;
  ELSIF _l.category = 'username' AND _l.username_value IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(_l.username_value) AND id <> _l.seller_id) THEN
      UPDATE public.marketplace_bids SET status = 'refunded' WHERE id = _bid.id;
      PERFORM public.wallet_adjust_idem(_bid.bidder_id, _bid.amount, 'refund'::tx_type,
        'auction', 'listing', _l.id, 'Username unavailable', _op || ':wr');
      UPDATE public.marketplace_listings SET status = 'expired' WHERE id = _l.id;
      RETURN jsonb_build_object('ok', true, 'sold', false, 'reason', 'username_unavailable');
    END IF;
    _seller_new_uname := 'user_' || substr(replace(_l.seller_id::text,'-',''),1,10);
    UPDATE public.profiles SET username = _seller_new_uname, username_changed_at = now() WHERE id = _l.seller_id;
    UPDATE public.profiles SET username = _l.username_value, username_changed_at = now() WHERE id = _bid.bidder_id;
  END IF;

  UPDATE public.marketplace_bids SET status = 'won' WHERE id = _bid.id;
  PERFORM public.wallet_adjust_idem(_l.seller_id, _bid.amount,
    'auction_won'::tx_type, 'marketplace', 'listing', _l.id,
    'Auction sold ' || COALESCE(_l.title,''), _op || ':s');
  UPDATE public.marketplace_listings
     SET status = 'sold', winner_id = _bid.bidder_id,
         current_bid = _bid.amount, current_bidder_id = _bid.bidder_id,
         sales_count = COALESCE(sales_count, 0) + 1
   WHERE id = _l.id;
  INSERT INTO public.marketplace_purchases(listing_id, buyer_id, seller_id, price)
    VALUES (_l.id, _bid.bidder_id, _l.seller_id, _bid.amount)
    ON CONFLICT (listing_id) DO NOTHING;
  INSERT INTO public.notifications(user_id, kind, title, body, link) VALUES
    (_l.seller_id, 'marketplace_sale', 'Auction sold!',
       COALESCE(_l.title,'') || ' sold for ' || _bid.amount || ' DICE', '/marketplace/' || _l.id::text),
    (_bid.bidder_id, 'auction_won', 'You won the auction!',
       COALESCE(_l.title,'') || ' for ' || _bid.amount || ' DICE', '/marketplace/' || _l.id::text);
  RETURN jsonb_build_object('ok', true, 'sold', true,
    'buyer_id', _bid.bidder_id, 'amount', _bid.amount, 'category', _l.category);
END $$;
