
DROP FUNCTION IF EXISTS public.open_baddie_case_tx();

ALTER TABLE public.baddie_templates DROP CONSTRAINT IF EXISTS baddie_templates_rarity_check;
ALTER TABLE public.baddie_templates ADD CONSTRAINT baddie_templates_rarity_check
  CHECK (rarity IN ('common','uncommon','rare','epic','legendary','unreal','elias'));

UPDATE public.baddie_templates SET weight=5000, income_per_hour=20  WHERE id='rookie';
UPDATE public.baddie_templates SET weight=2500, income_per_hour=45  WHERE id='hustler';
UPDATE public.baddie_templates SET weight=1400, income_per_hour=90  WHERE id='shark';
UPDATE public.baddie_templates SET weight=700,  income_per_hour=180 WHERE id='queen';
UPDATE public.baddie_templates SET weight=300,  income_per_hour=360 WHERE id='legend';

INSERT INTO public.baddie_templates(id, name, rarity, weight, income_per_hour, image_url) VALUES
  ('phantom','Neon Phantom','unreal',80,720,NULL),
  ('elias','Elias','elias',20,1500,'/__l5e/assets-v1/94a447a5-a0fd-42da-b28d-e8613187b096/elias.png')
ON CONFLICT (id) DO UPDATE
  SET name=EXCLUDED.name, rarity=EXCLUDED.rarity, weight=EXCLUDED.weight,
      income_per_hour=EXCLUDED.income_per_hour, image_url=EXCLUDED.image_url;

CREATE FUNCTION public.open_baddie_case_tx()
 RETURNS TABLE(template_id text, name text, rarity text, income_per_hour integer, user_baddie_id uuid, image_url text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid(); v_cost INTEGER := 1000; v_is_vip BOOLEAN;
  v_count INTEGER; v_cap INTEGER; v_total INTEGER; v_pick INTEGER;
  v_acc INTEGER := 0; v_t RECORD; v_new UUID; v_op TEXT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT COALESCE(vip_until > now(), false) INTO v_is_vip FROM public.profiles WHERE id = v_user;
  v_cap := CASE WHEN v_is_vip THEN 4 ELSE 2 END;
  SELECT COUNT(*) INTO v_count FROM public.user_baddies WHERE user_id = v_user;
  IF v_count >= v_cap THEN
    RAISE EXCEPTION 'Baddie Base full (%/%). Release a Baddie before opening another case.', v_count, v_cap;
  END IF;
  SELECT COALESCE(SUM(weight),0) INTO v_total FROM public.baddie_templates;
  IF v_total <= 0 THEN RAISE EXCEPTION 'No baddie templates configured'; END IF;

  v_op := 'baddie_open:' || v_user::text || ':' || gen_random_uuid()::text;
  PERFORM public.wallet_adjust_idem(v_user, -v_cost, 'event'::tx_type,
    'baddie_case', 'baddie_case', NULL, 'Opened Baddie Case', v_op);

  v_pick := 1 + floor(random() * v_total)::INTEGER;
  FOR v_t IN SELECT * FROM public.baddie_templates ORDER BY weight DESC, id LOOP
    v_acc := v_acc + v_t.weight;
    IF v_pick <= v_acc THEN
      INSERT INTO public.user_baddies(user_id, template_id, name)
      VALUES (v_user, v_t.id, v_t.name) RETURNING id INTO v_new;
      INSERT INTO public.activity_feed(user_id, kind, payload)
        VALUES (v_user, 'baddie_unlocked',
          jsonb_build_object('template_id',v_t.id,'name',v_t.name,'rarity',v_t.rarity,
                             'income_per_hour',v_t.income_per_hour,'image_url',v_t.image_url));
      template_id := v_t.id; name := v_t.name; rarity := v_t.rarity;
      income_per_hour := v_t.income_per_hour; user_baddie_id := v_new; image_url := v_t.image_url;
      RETURN NEXT; RETURN;
    END IF;
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION public.collect_baddie_tx(_baddie_id uuid)
 RETURNS TABLE(amount integer, last_collected_at timestamp with time zone)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid(); v_b RECORD; v_rate INTEGER;
  v_secs INTEGER; v_amt INTEGER; v_cap_secs INTEGER := 24 * 3600; v_op TEXT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT b.*, t.income_per_hour AS rate INTO v_b
  FROM public.user_baddies b
  JOIN public.baddie_templates t ON t.id = b.template_id
  WHERE b.id = _baddie_id AND b.user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Baddie not found'; END IF;
  v_rate := v_b.rate;
  v_secs := LEAST(EXTRACT(EPOCH FROM (now() - v_b.last_collected_at))::INTEGER, v_cap_secs);
  v_amt := (v_rate * v_secs) / 3600;
  IF v_amt <= 0 THEN RAISE EXCEPTION 'Nothing to collect yet'; END IF;
  UPDATE public.user_baddies SET last_collected_at = now() WHERE id = _baddie_id;
  v_op := 'baddie_collect:' || _baddie_id::text || ':' || floor(extract(epoch from now())/60)::text;
  PERFORM public.wallet_adjust_idem(v_user, v_amt, 'event'::tx_type,
    'baddie_income', 'baddie', _baddie_id, 'Baddie passive income', v_op);
  INSERT INTO public.activity_feed(user_id, kind, payload)
    VALUES (v_user, 'baddie_income', jsonb_build_object('baddie_id',_baddie_id,'amount',v_amt));
  amount := v_amt; last_collected_at := now(); RETURN NEXT;
END $function$;

CREATE OR REPLACE FUNCTION public.grant_achievement_tx(_user uuid, _achievement text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _caller uuid := auth.uid();
BEGIN
  IF NOT public.has_role(_caller, 'owner') THEN RAISE EXCEPTION 'Owners only'; END IF;
  INSERT INTO public.user_achievements(user_id, achievement_id) VALUES (_user, _achievement)
    ON CONFLICT DO NOTHING;
  INSERT INTO public.moderation_actions(actor_id, action, target_kind, target_id, reason, details)
    VALUES (_caller, 'grant_achievement', 'user', _user, NULL, jsonb_build_object('achievement',_achievement));
  INSERT INTO public.activity_feed(user_id, kind, payload)
    VALUES (_user, 'achievement', jsonb_build_object('achievement',_achievement));
  RETURN jsonb_build_object('ok', true);
END $function$;
