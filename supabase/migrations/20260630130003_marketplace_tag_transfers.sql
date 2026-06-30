-- Override marketplace settlement so a tag stays on the seller profile while it
-- is listed and moves between tag collections only after a completed sale.

CREATE OR REPLACE FUNCTION public.buy_listing_tx(_buyer uuid, _listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _l public.marketplace_listings;
  _op text;
  _buyer_count integer;
  _replacement text;
  _seller_new_uname text;
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
    IF NOT EXISTS (
      SELECT 1 FROM public.user_tags
      WHERE user_id = _l.seller_id AND lower(tag) = lower(_l.tag_value)
      FOR UPDATE
    ) THEN
      RAISE EXCEPTION 'Seller no longer owns this tag';
    END IF;
    PERFORM 1 FROM public.profiles WHERE id = _buyer FOR UPDATE;
    SELECT count(*) INTO _buyer_count FROM public.user_tags WHERE user_id = _buyer;
    IF _buyer_count >= 3 THEN
      RAISE EXCEPTION 'You already own 3 tags. Sell or remove one first.';
    END IF;
  END IF;

  IF _l.category = 'username' AND _l.username_value IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.profiles
       WHERE lower(username) = lower(_l.username_value) AND id <> _l.seller_id
     ) THEN
    RAISE EXCEPTION 'That username is no longer available';
  END IF;

  PERFORM public.wallet_adjust_idem(
    _buyer, -_l.price, 'marketplace_purchase'::public.tx_type,
    'marketplace', 'listing', _l.id, 'Buy ' || COALESCE(_l.title,''), _op || ':b'
  );
  PERFORM public.wallet_adjust_idem(
    _l.seller_id, _l.price, 'marketplace_sale'::public.tx_type,
    'marketplace', 'listing', _l.id, 'Sold ' || COALESCE(_l.title,''), _op || ':s'
  );

  PERFORM set_config('app.bypass_profile_protect', '1', true);
  PERFORM set_config('app.allow_tag_transfer', '1', true);

  IF _l.category = 'tag' AND _l.tag_value IS NOT NULL THEN
    DELETE FROM public.user_tags
      WHERE user_id = _l.seller_id AND lower(tag) = lower(_l.tag_value);
    INSERT INTO public.user_tags(user_id, tag) VALUES (_buyer, upper(_l.tag_value));

    SELECT tag INTO _replacement FROM public.user_tags
      WHERE user_id = _l.seller_id ORDER BY created_at LIMIT 1;
    UPDATE public.profiles SET tag = _replacement
      WHERE id = _l.seller_id AND lower(COALESCE(tag, '')) = lower(_l.tag_value);
    UPDATE public.profiles SET tag = COALESCE(tag, upper(_l.tag_value)) WHERE id = _buyer;

  ELSIF _l.category = 'username' AND _l.username_value IS NOT NULL THEN
    _seller_new_uname := 'user_' || substr(replace(_l.seller_id::text,'-',''),1,10);
    UPDATE public.profiles
       SET username = _seller_new_uname,
           username_changed_at = now(),
           username_free_change_available = true
     WHERE id = _l.seller_id;
    UPDATE public.profiles
       SET username = _l.username_value,
           username_changed_at = now()
     WHERE id = _buyer;
  END IF;

  UPDATE public.marketplace_listings
     SET status = 'sold', winner_id = _buyer, sales_count = COALESCE(sales_count, 0) + 1
   WHERE id = _l.id;
  INSERT INTO public.marketplace_purchases(listing_id, buyer_id, seller_id, price)
    VALUES (_l.id, _buyer, _l.seller_id, _l.price)
    ON CONFLICT (listing_id) DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'listing_id', _l.id, 'category', _l.category);
END $$;

CREATE OR REPLACE FUNCTION public.settle_auction_tx(_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _l public.marketplace_listings;
  _bid public.marketplace_bids;
  _op text;
  _buyer_count integer;
  _replacement text;
  _seller_new_uname text;
BEGIN
  SELECT * INTO _l FROM public.marketplace_listings WHERE id = _listing_id FOR UPDATE;
  IF _l.id IS NULL THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF COALESCE(_l.sale_type, 'fixed') <> 'auction' THEN RAISE EXCEPTION 'Not an auction'; END IF;
  IF _l.status <> 'active' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_settled'); END IF;
  IF _l.auction_ends_at IS NULL OR _l.auction_ends_at > now() THEN RAISE EXCEPTION 'Auction not yet ended'; END IF;

  _op := 'auction-settle:' || _listing_id::text;
  IF EXISTS (SELECT 1 FROM public.dice_transactions WHERE operation_id = _op || ':s') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_processed');
  END IF;

  SELECT * INTO _bid FROM public.marketplace_bids
   WHERE listing_id = _l.id AND status = 'active'
   ORDER BY amount DESC LIMIT 1 FOR UPDATE;

  IF _bid.id IS NULL THEN
    -- Nothing leaves the seller collection when an auction expires without a winner.
    UPDATE public.marketplace_listings SET status = 'expired' WHERE id = _l.id;
    RETURN jsonb_build_object('ok', true, 'sold', false);
  END IF;

  IF _l.category = 'tag' AND _l.tag_value IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_tags
      WHERE user_id = _l.seller_id AND lower(tag) = lower(_l.tag_value)
      FOR UPDATE
    ) THEN
      RAISE EXCEPTION 'Seller no longer owns this tag';
    END IF;
    PERFORM 1 FROM public.profiles WHERE id = _bid.bidder_id FOR UPDATE;
    SELECT count(*) INTO _buyer_count FROM public.user_tags WHERE user_id = _bid.bidder_id;
    IF _buyer_count >= 3 THEN
      UPDATE public.marketplace_bids SET status = 'refunded' WHERE id = _bid.id;
      PERFORM public.wallet_adjust_idem(
        _bid.bidder_id, _bid.amount, 'refund'::public.tx_type,
        'auction', 'listing', _l.id, 'Winner already owns 3 tags', _op || ':winner-refund'
      );
      UPDATE public.marketplace_listings SET status = 'expired' WHERE id = _l.id;
      RETURN jsonb_build_object('ok', true, 'sold', false, 'reason', 'winner_tag_limit');
    END IF;
  ELSIF _l.category = 'username' AND _l.username_value IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.profiles
       WHERE lower(username) = lower(_l.username_value) AND id <> _l.seller_id
     ) THEN
    UPDATE public.marketplace_bids SET status = 'refunded' WHERE id = _bid.id;
    PERFORM public.wallet_adjust_idem(
      _bid.bidder_id, _bid.amount, 'refund'::public.tx_type,
      'auction', 'listing', _l.id, 'Username unavailable', _op || ':winner-refund'
    );
    UPDATE public.marketplace_listings SET status = 'expired' WHERE id = _l.id;
    RETURN jsonb_build_object('ok', true, 'sold', false, 'reason', 'username_unavailable');
  END IF;

  PERFORM set_config('app.bypass_profile_protect', '1', true);
  PERFORM set_config('app.allow_tag_transfer', '1', true);

  IF _l.category = 'tag' AND _l.tag_value IS NOT NULL THEN
    DELETE FROM public.user_tags
      WHERE user_id = _l.seller_id AND lower(tag) = lower(_l.tag_value);
    INSERT INTO public.user_tags(user_id, tag) VALUES (_bid.bidder_id, upper(_l.tag_value));
    SELECT tag INTO _replacement FROM public.user_tags
      WHERE user_id = _l.seller_id ORDER BY created_at LIMIT 1;
    UPDATE public.profiles SET tag = _replacement
      WHERE id = _l.seller_id AND lower(COALESCE(tag,'')) = lower(_l.tag_value);
    UPDATE public.profiles SET tag = COALESCE(tag, upper(_l.tag_value)) WHERE id = _bid.bidder_id;

  ELSIF _l.category = 'username' AND _l.username_value IS NOT NULL THEN
    _seller_new_uname := 'user_' || substr(replace(_l.seller_id::text,'-',''),1,10);
    UPDATE public.profiles
       SET username = _seller_new_uname,
           username_changed_at = now(),
           username_free_change_available = true
     WHERE id = _l.seller_id;
    UPDATE public.profiles
       SET username = _l.username_value,
           username_changed_at = now()
     WHERE id = _bid.bidder_id;
  END IF;

  UPDATE public.marketplace_bids SET status = 'won' WHERE id = _bid.id;
  PERFORM public.wallet_adjust_idem(
    _l.seller_id, _bid.amount, 'auction_won'::public.tx_type,
    'marketplace', 'listing', _l.id, 'Auction sold ' || COALESCE(_l.title,''), _op || ':s'
  );
  UPDATE public.marketplace_listings
     SET status = 'sold', winner_id = _bid.bidder_id,
         current_bid = _bid.amount, current_bidder_id = _bid.bidder_id,
         sales_count = COALESCE(sales_count, 0) + 1
   WHERE id = _l.id;
  INSERT INTO public.marketplace_purchases(listing_id, buyer_id, seller_id, price)
    VALUES (_l.id, _bid.bidder_id, _l.seller_id, _bid.amount)
    ON CONFLICT (listing_id) DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'sold', true,
    'buyer_id', _bid.bidder_id, 'amount', _bid.amount, 'category', _l.category);
END $$;
