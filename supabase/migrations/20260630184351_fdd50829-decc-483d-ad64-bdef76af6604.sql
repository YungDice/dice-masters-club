
UPDATE public.baddie_templates SET image_url = '/__l5e/assets-v1/4c949473-590b-4ff8-ab92-1143694e2aa9/rare.jpg' WHERE id = 'shark';

CREATE OR REPLACE FUNCTION public.buy_baddie_slot_tx()
RETURNS TABLE(slots_bought integer, new_balance bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  cur int;
  cost int := 25000;
  bal bigint;
  v_op text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT baddie_slots_bought INTO cur FROM public.profiles WHERE id = uid FOR UPDATE;
  IF cur IS NULL THEN cur := 0; END IF;
  IF cur >= 8 THEN RAISE EXCEPTION 'max baddie slots reached'; END IF;
  v_op := 'baddie_slot:' || uid::text || ':' || (cur+1)::text;
  PERFORM public.wallet_adjust_idem(uid, -cost::bigint, 'event'::tx_type,
    'baddie_slot', 'baddie_slot', NULL::uuid, 'Bought baddie slot', v_op);
  UPDATE public.profiles SET baddie_slots_bought = cur + 1 WHERE id = uid;
  SELECT balance INTO bal FROM public.dice_wallets WHERE user_id = uid;
  RETURN QUERY SELECT cur + 1, bal;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.buy_baddie_slot_tx() TO authenticated;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS autosell_rarities text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.set_autosell_rarities(_rarities text[])
RETURNS text[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_is_vip boolean;
  v_clean text[];
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT COALESCE(vip_until > now(), false) INTO v_is_vip FROM public.profiles WHERE id = uid;
  IF NOT v_is_vip THEN RAISE EXCEPTION 'VIP required for autosell'; END IF;
  SELECT COALESCE(array_agg(DISTINCT r), '{}')
  INTO v_clean
  FROM unnest(COALESCE(_rarities,'{}'::text[])) r
  WHERE r IN ('common','uncommon','rare','epic','legendary','unreal','elias');
  UPDATE public.profiles SET autosell_rarities = v_clean WHERE id = uid;
  RETURN v_clean;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.set_autosell_rarities(text[]) TO authenticated;

DROP FUNCTION IF EXISTS public.open_baddie_case_tx();
CREATE OR REPLACE FUNCTION public.open_baddie_case_tx()
RETURNS TABLE(template_id text, name text, rarity text, income_per_hour integer, user_baddie_id uuid, image_url text, autosold boolean, sell_price integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid(); v_cost INTEGER := 1000; v_is_vip BOOLEAN;
  v_count INTEGER; v_cap INTEGER; v_total INTEGER; v_pick INTEGER;
  v_acc INTEGER := 0; v_t RECORD; v_new UUID; v_op TEXT;
  v_autosell text[]; v_bought int; v_will_autosell boolean; v_price int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT COALESCE(vip_until > now(), false), COALESCE(autosell_rarities, '{}'::text[]), COALESCE(baddie_slots_bought,0)
    INTO v_is_vip, v_autosell, v_bought FROM public.profiles WHERE id = v_user;
  v_cap := LEAST(10, CASE WHEN v_is_vip THEN 4 ELSE 2 END + v_bought);
  SELECT COUNT(*) INTO v_count FROM public.user_baddies WHERE user_id = v_user;

  SELECT COALESCE(SUM(weight),0) INTO v_total FROM public.baddie_templates;
  IF v_total <= 0 THEN RAISE EXCEPTION 'No baddie templates configured'; END IF;

  v_op := 'baddie_open:' || v_user::text || ':' || gen_random_uuid()::text;
  PERFORM public.wallet_adjust_idem(v_user, -v_cost::bigint, 'event'::tx_type,
    'baddie_case', 'baddie_case', NULL, 'Opened Baddie Case', v_op);

  v_pick := 1 + floor(random() * v_total)::INTEGER;
  FOR v_t IN SELECT * FROM public.baddie_templates ORDER BY weight DESC, id LOOP
    v_acc := v_acc + v_t.weight;
    IF v_pick <= v_acc THEN
      v_will_autosell := v_is_vip AND (v_t.rarity = ANY(v_autosell));
      IF NOT v_will_autosell AND v_count >= v_cap THEN
        RAISE EXCEPTION 'Baddie Base full (%/%). Sell a Baddie or enable autosell.', v_count, v_cap;
      END IF;
      IF v_will_autosell THEN
        v_price := GREATEST(floor(v_t.income_per_hour / 2)::int, 1);
        PERFORM public.wallet_adjust_idem(v_user, v_price::bigint, 'event'::tx_type,
          'baddie_autosell', 'baddie_template', NULL, 'Autosold ' || v_t.name,
          'baddie_autosell:' || v_op);
        INSERT INTO public.activity_feed(user_id, kind, payload)
          VALUES (v_user, 'baddie_autosold',
            jsonb_build_object('template_id',v_t.id,'name',v_t.name,'rarity',v_t.rarity,'price',v_price));
        template_id := v_t.id; name := v_t.name; rarity := v_t.rarity;
        income_per_hour := v_t.income_per_hour; user_baddie_id := NULL;
        image_url := v_t.image_url; autosold := true; sell_price := v_price;
      ELSE
        INSERT INTO public.user_baddies(user_id, template_id, name)
        VALUES (v_user, v_t.id, v_t.name) RETURNING id INTO v_new;
        INSERT INTO public.activity_feed(user_id, kind, payload)
          VALUES (v_user, 'baddie_unlocked',
            jsonb_build_object('template_id',v_t.id,'name',v_t.name,'rarity',v_t.rarity,
                               'income_per_hour',v_t.income_per_hour,'image_url',v_t.image_url));
        template_id := v_t.id; name := v_t.name; rarity := v_t.rarity;
        income_per_hour := v_t.income_per_hour; user_baddie_id := v_new;
        image_url := v_t.image_url; autosold := false; sell_price := NULL;
      END IF;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'Pick failed';
END;
$function$;
GRANT EXECUTE ON FUNCTION public.open_baddie_case_tx() TO authenticated;
