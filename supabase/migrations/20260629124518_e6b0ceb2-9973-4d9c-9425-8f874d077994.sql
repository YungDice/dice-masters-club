
-- =========================================================
-- buy_listing_tx (corrected)
-- =========================================================
CREATE OR REPLACE FUNCTION public.buy_listing_tx(
  _buyer uuid, _listing_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _l public.marketplace_listings; _op text; _buyer_tag text;
BEGIN
  _op := 'buy:' || _listing_id::text;
  IF EXISTS (SELECT 1 FROM public.dice_transactions WHERE operation_id = _op || ':b') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_processed');
  END IF;
  SELECT * INTO _l FROM public.marketplace_listings WHERE id = _listing_id FOR UPDATE;
  IF _l.id IS NULL THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF _l.status <> 'active' THEN RAISE EXCEPTION 'Listing not available'; END IF;
  IF _l.seller_id = _buyer THEN RAISE EXCEPTION 'Cannot buy own listing'; END IF;
  IF _l.sale_type = 'auction' THEN
    RAISE EXCEPTION 'Auction listing — place a bid instead';
  END IF;
  IF _l.category = 'tag' AND _l.tag_value IS NOT NULL THEN
    SELECT tag INTO _buyer_tag FROM public.profiles WHERE id = _buyer FOR UPDATE;
    IF _buyer_tag IS NOT NULL THEN
      RAISE EXCEPTION 'You already own a tag';
    END IF;
  END IF;
  PERFORM public.wallet_adjust_idem(_buyer, -_l.price, 'marketplace_purchase'::tx_type,
    'marketplace', 'listing', _l.id, 'Buy ' || COALESCE(_l.title,''), _op || ':b');
  PERFORM public.wallet_adjust_idem(_l.seller_id, _l.price, 'marketplace_sale'::tx_type,
    'marketplace', 'listing', _l.id, 'Sold ' || COALESCE(_l.title,''), _op || ':s');
  IF _l.category = 'tag' AND _l.tag_value IS NOT NULL THEN
    UPDATE public.profiles SET tag = _l.tag_value WHERE id = _buyer;
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
REVOKE EXECUTE ON FUNCTION public.buy_listing_tx(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.buy_listing_tx(uuid,uuid) TO service_role;

-- =========================================================
-- place_bid_tx (corrected)
-- =========================================================
CREATE OR REPLACE FUNCTION public.place_bid_tx(
  _bidder uuid, _listing_id uuid, _amount bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _l public.marketplace_listings; _prev_bid public.marketplace_bids;
        _op text; _required bigint; _new_bid_id uuid;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'Bid must be positive'; END IF;
  SELECT * INTO _l FROM public.marketplace_listings WHERE id = _listing_id FOR UPDATE;
  IF _l.id IS NULL THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF _l.status <> 'active' THEN RAISE EXCEPTION 'Listing not active'; END IF;
  IF COALESCE(_l.sale_type,'fixed') <> 'auction' THEN RAISE EXCEPTION 'Not an auction'; END IF;
  IF _l.seller_id = _bidder THEN RAISE EXCEPTION 'Cannot bid on own listing'; END IF;
  IF _l.auction_ends_at IS NOT NULL AND _l.auction_ends_at < now() THEN
    RAISE EXCEPTION 'Auction already ended';
  END IF;
  _required := CASE
    WHEN COALESCE(_l.current_bid, 0) > 0
      THEN _l.current_bid + GREATEST(10, CEIL(_l.current_bid * 0.05)::bigint)
    ELSE COALESCE(_l.min_bid, _l.price, 1)
  END;
  IF _amount < _required THEN
    RAISE EXCEPTION 'Bid must be at least % DICE', _required;
  END IF;

  _op := 'bid:' || _listing_id::text || ':' || _bidder::text || ':' || _amount::text;
  IF EXISTS (SELECT 1 FROM public.dice_transactions WHERE operation_id = _op) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_processed');
  END IF;

  -- Refund previous active high bidder, if any
  SELECT * INTO _prev_bid FROM public.marketplace_bids
    WHERE listing_id = _l.id AND status = 'active'
    ORDER BY amount DESC LIMIT 1 FOR UPDATE;
  IF _prev_bid.id IS NOT NULL THEN
    UPDATE public.marketplace_bids SET status = 'outbid' WHERE id = _prev_bid.id;
    PERFORM public.wallet_adjust_idem(_prev_bid.bidder_id, _prev_bid.amount,
      'auction_outbid'::tx_type, 'marketplace', 'listing', _l.id,
      'Outbid refund', 'outbid:' || _prev_bid.id::text);
    INSERT INTO public.notifications(user_id, kind, title, body, link)
      VALUES (_prev_bid.bidder_id, 'auction_outbid', 'You were outbid',
              'Someone outbid you on ' || COALESCE(_l.title,''), '/marketplace/' || _l.id::text);
  END IF;

  -- Escrow new bid
  PERFORM public.wallet_adjust_idem(_bidder, -_amount, 'game_stake'::tx_type,
    'auction_bid', 'listing', _l.id, 'Bid on ' || COALESCE(_l.title,''), _op);
  INSERT INTO public.marketplace_bids(listing_id, bidder_id, amount, status)
    VALUES (_l.id, _bidder, _amount, 'active')
    RETURNING id INTO _new_bid_id;
  UPDATE public.marketplace_listings
     SET current_bid = _amount, current_bidder_id = _bidder
   WHERE id = _l.id;
  RETURN jsonb_build_object('ok', true, 'amount', _amount);
END $$;
REVOKE EXECUTE ON FUNCTION public.place_bid_tx(uuid,uuid,bigint) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.place_bid_tx(uuid,uuid,bigint) TO service_role;

-- =========================================================
-- settle_auction_tx (corrected)
-- =========================================================
CREATE OR REPLACE FUNCTION public.settle_auction_tx(_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _l public.marketplace_listings; _bid public.marketplace_bids;
        _op text; _winner_tag text;
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
    -- No bids: return tag to seller if applicable
    IF _l.category = 'tag' AND _l.tag_value IS NOT NULL THEN
      UPDATE public.profiles SET tag = _l.tag_value WHERE id = _l.seller_id;
    END IF;
    UPDATE public.marketplace_listings SET status = 'expired' WHERE id = _l.id;
    RETURN jsonb_build_object('ok', true, 'sold', false);
  END IF;

  -- Tag-specific: if winner already owns a tag, refund and return tag to seller
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
REVOKE EXECUTE ON FUNCTION public.settle_auction_tx(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.settle_auction_tx(uuid) TO service_role;
