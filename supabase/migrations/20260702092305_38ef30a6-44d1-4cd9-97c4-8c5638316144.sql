
CREATE OR REPLACE FUNCTION public.grant_achievement(_user_id uuid, _achievement_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ach record;
  _rows int;
BEGIN
  IF _user_id IS NULL OR _achievement_id IS NULL THEN RETURN false; END IF;

  SELECT * INTO _ach FROM public.achievements WHERE id = _achievement_id;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO public.user_achievements (user_id, achievement_id)
  VALUES (_user_id, _achievement_id)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS _rows = ROW_COUNT;
  IF _rows = 0 THEN RETURN false; END IF;

  IF COALESCE(_ach.dice_reward, 0) > 0 THEN
    PERFORM public.wallet_adjust_idem(
      _user_id,
      _ach.dice_reward,
      'achievement:' || _ach.id || ':' || _user_id::text,
      'achievement',
      jsonb_build_object('achievement_id', _ach.id, 'name', _ach.name)
    );
  END IF;

  IF COALESCE(_ach.xp_reward, 0) > 0 THEN
    UPDATE public.profiles SET xp = COALESCE(xp,0) + _ach.xp_reward WHERE id = _user_id;
  END IF;

  INSERT INTO public.notifications (user_id, kind, title, body, data)
  VALUES (_user_id, 'achievement', 'Achievement Unlocked', _ach.name,
          jsonb_build_object('achievement_id', _ach.id));

  INSERT INTO public.activity_feed (user_id, kind, title, body, payload)
  VALUES (_user_id, 'achievement', 'Achievement Unlocked', _ach.name,
          jsonb_build_object('achievement_id', _ach.id, 'name', _ach.name, 'icon', _ach.icon));

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_achievement(uuid, text) FROM PUBLIC, anon, authenticated;
