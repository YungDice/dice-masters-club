
-- 1) New income values per rarity
UPDATE public.baddie_templates SET income_per_hour = CASE rarity
  WHEN 'common' THEN 50
  WHEN 'uncommon' THEN 100
  WHEN 'rare' THEN 200
  WHEN 'epic' THEN 350
  WHEN 'legendary' THEN 800
  WHEN 'unreal' THEN 1500
  WHEN 'elias' THEN 5000
  ELSE income_per_hour END;

-- 2) Sell-baddie RPC: atomic delete + credit (half hourly income)
CREATE OR REPLACE FUNCTION public.sell_baddie_tx(_baddie_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid(); v_b record; v_price int; v_op text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT b.*, t.income_per_hour AS rate, t.name AS tname, t.rarity AS rrarity
    INTO v_b FROM public.user_baddies b
    JOIN public.baddie_templates t ON t.id = b.template_id
   WHERE b.id = _baddie_id AND b.user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Baddie not found'; END IF;
  v_price := GREATEST(FLOOR(v_b.rate / 2)::int, 1);
  v_op := 'baddie_sell:' || _baddie_id::text;
  IF EXISTS (SELECT 1 FROM public.dice_transactions WHERE operation_id = v_op) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_sold');
  END IF;
  DELETE FROM public.user_baddies WHERE id = _baddie_id AND user_id = v_user;
  PERFORM public.wallet_adjust_idem(v_user, v_price, 'event'::tx_type,
    'baddie_sell', 'baddie', _baddie_id, 'Sold Baddie ' || COALESCE(v_b.tname,''), v_op);
  INSERT INTO public.activity_feed(user_id, kind, payload)
    VALUES (v_user, 'baddie_sold',
      jsonb_build_object('template_id', v_b.template_id, 'name', v_b.tname,
                         'rarity', v_b.rrarity, 'price', v_price));
  RETURN jsonb_build_object('ok', true, 'price', v_price);
END $$;

REVOKE EXECUTE ON FUNCTION public.sell_baddie_tx(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sell_baddie_tx(uuid) TO authenticated;
