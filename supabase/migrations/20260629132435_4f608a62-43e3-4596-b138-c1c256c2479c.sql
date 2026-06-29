
-- 1. Signup welcome bonus: 500 -> 2500
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uname TEXT; _dname TEXT; _dob DATE; _claimed_18 BOOLEAN;
BEGIN
  _uname := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1) || substr(NEW.id::text,1,4));
  _dname := COALESCE(NEW.raw_user_meta_data->>'display_name', _uname);
  _dob   := COALESCE((NEW.raw_user_meta_data->>'dob')::DATE, NULL);
  _claimed_18 := (NEW.raw_user_meta_data->>'is_18_plus')::boolean IS TRUE;
  IF _dob IS NOT NULL AND _dob > (CURRENT_DATE - INTERVAL '18 years') THEN
    RAISE EXCEPTION 'You must be at least 18 years old to use DICE';
  END IF;
  IF _dob IS NULL THEN
    _dob := DATE '1900-01-01';
    _claimed_18 := FALSE;
  END IF;
  INSERT INTO public.profiles(id, username, display_name, dob, is_18_plus)
    VALUES (NEW.id, _uname, _dname, _dob, _claimed_18);
  INSERT INTO public.profile_private(user_id, dob, is_18_plus)
    VALUES (NEW.id, _dob, _claimed_18)
    ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'user');
  INSERT INTO public.user_settings(user_id) VALUES (NEW.id);
  INSERT INTO public.dice_wallets(user_id, balance) VALUES (NEW.id, 2500);
  INSERT INTO public.dice_transactions(user_id,type,amount,balance_before,balance_after,source,note)
    VALUES (NEW.id,'event',2500,0,2500,'welcome','Welcome bonus');
  RETURN NEW;
END $function$;

-- 2. Idle XP must never lower the user's existing level (bought levels stay).
CREATE OR REPLACE FUNCTION public.award_idle_xp(_uid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _last TIMESTAMPTZ;
  _elapsed_min INT;
  _xp_gain INT;
  _new_xp BIGINT;
  _old_level INT;
  _computed_level INT;
  _new_level INT;
  _dice_awarded BIGINT := 0;
  _xp_per_min CONSTANT INT := 25;
  _max_min_per_call CONSTANT INT := 5;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'No user';
  END IF;

  SELECT last_xp_tick_at, xp, level INTO _last, _new_xp, _old_level
    FROM public.profiles WHERE id = _uid FOR UPDATE;

  IF _last IS NULL THEN
    UPDATE public.profiles SET last_xp_tick_at = now() WHERE id = _uid;
    RETURN jsonb_build_object('xp', _new_xp, 'level', _old_level, 'leveled_up', false, 'dice_awarded', 0, 'gained_xp', 0);
  END IF;

  _elapsed_min := FLOOR(EXTRACT(EPOCH FROM (now() - _last)) / 60)::INT;
  IF _elapsed_min < 1 THEN
    RETURN jsonb_build_object('xp', _new_xp, 'level', _old_level, 'leveled_up', false, 'dice_awarded', 0, 'gained_xp', 0);
  END IF;
  IF _elapsed_min > _max_min_per_call THEN
    _elapsed_min := _max_min_per_call;
  END IF;

  _xp_gain := _elapsed_min * _xp_per_min;
  _new_xp := COALESCE(_new_xp, 0) + _xp_gain;

  -- compute level from xp, but never go below the current stored level
  -- (users can buy levels, which sets level above what xp alone implies)
  _computed_level := 1;
  WHILE 100 * (_computed_level + 1) * (_computed_level + 1) <= _new_xp LOOP
    _computed_level := _computed_level + 1;
  END LOOP;
  _new_level := GREATEST(_computed_level, COALESCE(_old_level, 1));

  UPDATE public.profiles
    SET xp = _new_xp,
        level = _new_level,
        last_xp_tick_at = _last + (_elapsed_min || ' minutes')::INTERVAL
    WHERE id = _uid;

  IF _new_level > COALESCE(_old_level, 1) THEN
    _dice_awarded := 500 * (_new_level - COALESCE(_old_level, 1));
    PERFORM public.wallet_adjust(_uid, _dice_awarded, 'event'::tx_type, 'level_up', NULL, NULL,
      'Level up reward: lvl ' || _old_level || ' -> ' || _new_level);
  END IF;

  RETURN jsonb_build_object(
    'xp', _new_xp,
    'level', _new_level,
    'leveled_up', _new_level > COALESCE(_old_level, 1),
    'levels_gained', _new_level - COALESCE(_old_level, 1),
    'dice_awarded', _dice_awarded,
    'gained_xp', _xp_gain
  );
END $function$;
