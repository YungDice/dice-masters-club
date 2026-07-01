CREATE OR REPLACE FUNCTION public.create_baddie_trade_offer_tx(_target_user uuid, _offered_baddie uuid, _requested_baddie uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_id uuid; v_offered public.user_baddies; v_requested public.user_baddies;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _target_user = v_user OR _offered_baddie = _requested_baddie THEN RAISE EXCEPTION 'Invalid trade offer'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'::public.friend_status
      AND ((f.requester_id = v_user AND f.addressee_id = _target_user)
        OR (f.addressee_id = v_user AND f.requester_id = _target_user))
  ) THEN
    RAISE EXCEPTION 'Trade offers require an accepted friendship';
  END IF;
  SELECT * INTO v_offered FROM public.user_baddies WHERE id = _offered_baddie AND user_id = v_user FOR UPDATE;
  SELECT * INTO v_requested FROM public.user_baddies WHERE id = _requested_baddie AND user_id = _target_user FOR UPDATE;
  IF v_offered.id IS NULL OR v_requested.id IS NULL THEN RAISE EXCEPTION 'Selected Baddie is no longer available'; END IF;
  IF v_offered.listing_id IS NOT NULL OR v_requested.listing_id IS NOT NULL OR v_offered.is_protected OR v_requested.is_protected THEN
    RAISE EXCEPTION 'Listed or protected Baddies cannot be traded';
  END IF;
  INSERT INTO public.baddie_trade_offers(offered_by, offered_to, offered_baddie_id, requested_baddie_id)
    VALUES (v_user, _target_user, _offered_baddie, _requested_baddie) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'offer_id', v_id);
END $$;
