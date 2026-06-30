ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS baddie_slots_bought integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.buy_baddie_slot_tx()
RETURNS TABLE(slots_bought integer, new_balance bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cur int;
  cost int := 25000;
  bal bigint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT baddie_slots_bought INTO cur FROM public.profiles WHERE id = uid FOR UPDATE;
  IF cur IS NULL THEN cur := 0; END IF;
  -- VIP base 4, non-VIP base 2 -> max 10 total means up to (10 - base) bought; we cap absolute at 10 - 2 = 8
  IF cur >= 8 THEN RAISE EXCEPTION 'max baddie slots reached'; END IF;
  PERFORM public.wallet_adjust_idem(uid, -cost, 'baddie_slot_purchase', 'baddie_slot:' || uid::text || ':' || (cur+1)::text, NULL::jsonb);
  UPDATE public.profiles SET baddie_slots_bought = cur + 1 WHERE id = uid;
  SELECT balance INTO bal FROM public.dice_wallets WHERE user_id = uid;
  RETURN QUERY SELECT cur + 1, bal;
END;
$$;
REVOKE ALL ON FUNCTION public.buy_baddie_slot_tx() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_baddie_slot_tx() TO authenticated;