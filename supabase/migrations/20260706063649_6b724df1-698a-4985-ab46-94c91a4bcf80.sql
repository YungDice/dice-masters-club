CREATE OR REPLACE FUNCTION public.submit_cosmetic(
  _kind text, _name text, _rarity text, _meta jsonb, _price_dice integer
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _fee constant integer := 25000;
  _sub_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _kind NOT IN ('title','frame','banner','emote','dice_skin') THEN RAISE EXCEPTION 'invalid kind'; END IF;
  IF length(coalesce(_name,'')) < 2 THEN RAISE EXCEPTION 'name too short'; END IF;
  IF _price_dice < 0 OR _price_dice > 1000000 THEN RAISE EXCEPTION 'invalid price'; END IF;

  PERFORM public.wallet_adjust_idem(
    _uid, (-_fee)::bigint, 'fee'::tx_type,
    'cosmetic_submission', 'cosmetic_submission', NULL::uuid,
    'Cosmetic submission fee',
    'cs_fee:' || _uid::text || ':' || gen_random_uuid()::text
  );

  INSERT INTO public.cosmetic_submissions(submitter_id, kind, name, rarity, meta, price_dice, fee_paid, status)
  VALUES (_uid, _kind, _name, coalesce(_rarity,'rare'), coalesce(_meta,'{}'::jsonb), _price_dice, _fee, 'pending')
  RETURNING id INTO _sub_id;

  RETURN _sub_id;
END $$;

REVOKE ALL ON FUNCTION public.submit_cosmetic(text,text,text,jsonb,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_cosmetic(text,text,text,jsonb,integer) TO authenticated;