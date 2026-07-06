
CREATE OR REPLACE FUNCTION public.buy_cosmetic_tx(_cosmetic_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_c   public.cosmetics%ROWTYPE;
  v_vip boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT * INTO v_c FROM public.cosmetics WHERE id = _cosmetic_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'cosmetic not found'; END IF;

  IF v_c.vip_only THEN
    SELECT COALESCE(vip_until, 'epoch'::timestamptz) > now() INTO v_vip FROM public.profiles WHERE id = v_uid;
    IF NOT COALESCE(v_vip, false) THEN RAISE EXCEPTION 'vip only cosmetic'; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_cosmetics WHERE user_id = v_uid AND cosmetic_id = _cosmetic_id) THEN
    RAISE EXCEPTION 'already owned';
  END IF;

  IF v_c.price_dice > 0 THEN
    PERFORM public.wallet_adjust_idem(
      v_uid,
      (-v_c.price_dice)::bigint,
      'fee'::tx_type,
      'cosmetic_purchase',
      'cosmetic',
      _cosmetic_id,
      'Unlock cosmetic: ' || COALESCE(v_c.name, v_c.slug),
      'cosmetic:' || _cosmetic_id::text || ':' || v_uid::text
    );
  END IF;

  INSERT INTO public.user_cosmetics(user_id, cosmetic_id) VALUES (v_uid, _cosmetic_id);
  RETURN jsonb_build_object('ok', true, 'cosmetic_id', _cosmetic_id);
END;
$function$;
