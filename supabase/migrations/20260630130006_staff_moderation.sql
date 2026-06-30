-- Admins and owners can close unsafe listings/challenges without losing held funds.

CREATE OR REPLACE FUNCTION public.moderate_listing_tx(
  _actor uuid, _listing_id uuid, _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _l public.marketplace_listings; _bid record; _op text;
BEGIN
  IF NOT (public.has_role(_actor, 'owner'::public.app_role) OR public.has_role(_actor, 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Admin or Owner role required';
  END IF;
  SELECT * INTO _l FROM public.marketplace_listings WHERE id = _listing_id FOR UPDATE;
  IF _l.id IS NULL THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF _l.status IN ('sold', 'removed') THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_closed'); END IF;

  _op := 'moderate-listing:' || _listing_id::text;
  FOR _bid IN
    SELECT id, bidder_id, amount FROM public.marketplace_bids
    WHERE listing_id = _listing_id AND status = 'active'
    FOR UPDATE
  LOOP
    UPDATE public.marketplace_bids SET status = 'refunded' WHERE id = _bid.id;
    PERFORM public.wallet_adjust_idem(
      _bid.bidder_id, _bid.amount, 'refund'::public.tx_type,
      'marketplace_moderation', 'listing', _listing_id,
      'Listing removed — bid refunded', _op || ':bid:' || _bid.id::text
    );
  END LOOP;

  -- Usernames/tags were never removed at listing time, so marking the listing
  -- removed safely leaves the seller with the original item.
  UPDATE public.marketplace_listings SET status = 'removed' WHERE id = _listing_id;
  INSERT INTO public.moderation_actions(moderator_id, action, target_kind, target_id, reason)
    VALUES (_actor, 'remove_listing', 'listing', _listing_id, _reason);
  INSERT INTO public.notifications(user_id, kind, title, body, link)
    VALUES (_l.seller_id, 'marketplace_sale', 'Listing removed', COALESCE(_reason, 'An administrator removed your listing.'), '/marketplace');
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.moderate_challenge_tx(
  _actor uuid, _challenge_id uuid, _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _c public.challenges; _op text;
BEGIN
  IF NOT (public.has_role(_actor, 'owner'::public.app_role) OR public.has_role(_actor, 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Admin or Owner role required';
  END IF;
  SELECT * INTO _c FROM public.challenges WHERE id = _challenge_id FOR UPDATE;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'Challenge not found'; END IF;
  IF _c.status = 'archived' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_closed'); END IF;

  UPDATE public.challenges SET status = 'archived' WHERE id = _challenge_id;
  _op := 'moderate-challenge:' || _challenge_id::text;
  IF _c.creator_id IS NOT NULL AND NOT public.is_staff(_c.creator_id) THEN
    PERFORM public.wallet_adjust_idem(
      _c.creator_id, 500, 'refund'::public.tx_type,
      'challenge_moderation', 'challenge', _challenge_id,
      'Challenge removed — creation fee refunded', _op || ':creation-fee'
    );
  END IF;
  INSERT INTO public.moderation_actions(moderator_id, action, target_kind, target_id, reason)
    VALUES (_actor, 'remove_challenge', 'challenge', _challenge_id, _reason);
  IF _c.creator_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, kind, title, body, link)
      VALUES (_c.creator_id, 'challenge_rejected', 'Challenge removed', COALESCE(_reason, 'An administrator removed your challenge.'), '/challenges');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.moderate_listing_tx(uuid,uuid,text) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.moderate_challenge_tx(uuid,uuid,text) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.moderate_listing_tx(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.moderate_challenge_tx(uuid,uuid,text) TO service_role;
