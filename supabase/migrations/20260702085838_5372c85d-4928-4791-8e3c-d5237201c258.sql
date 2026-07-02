
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

  SELECT EXISTS(
    SELECT 1 FROM public.friendships
     WHERE status = 'accepted'
       AND ((requester_id = v_user AND addressee_id = _to)
         OR (addressee_id = v_user AND requester_id = _to))
  ) INTO v_friend;
  IF NOT v_friend THEN RAISE EXCEPTION 'You can only trade with accepted friends'; END IF;

  IF NOT public.rate_limit_hit(v_user, 'trade_create', 3600, 20) THEN
    RAISE EXCEPTION 'Too many trade offers — slow down';
  END IF;

  INSERT INTO public.trades(from_user, to_user, from_baddies, to_baddies, from_dice, to_dice, note)
    VALUES (v_user, _to, COALESCE(_from_baddies,'{}'), COALESCE(_to_baddies,'{}'),
            COALESCE(_from_dice,0), COALESCE(_to_dice,0), NULLIF(trim(_note),''))
    RETURNING id INTO v_trade_id;

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

  IF COALESCE(array_length(_to_baddies,1),0) > 0 THEN
    IF (SELECT COUNT(*) FROM public.user_baddies
         WHERE id = ANY(_to_baddies) AND user_id = _to
           AND listing_id IS NULL AND trade_id IS NULL) <> array_length(_to_baddies,1) THEN
      RAISE EXCEPTION 'Requested baddie(s) are unavailable';
    END IF;
  END IF;

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
