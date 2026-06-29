
-- Idle XP heartbeat tracker
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_xp_tick_at TIMESTAMPTZ;

-- Server-authoritative XP tick. Called by an authenticated server fn for the
-- current user. Awards +25 XP per elapsed full minute since last tick (cap 5
-- minutes per call so a tab waking from sleep doesn't dump huge XP). Computes
-- level from xp using the same curve as the client (100 * level^2), and for
-- each level gained awards 500 DICE.
CREATE OR REPLACE FUNCTION public.award_idle_xp(_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _last TIMESTAMPTZ;
  _elapsed_min INT;
  _xp_gain INT;
  _new_xp BIGINT;
  _old_level INT;
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

  -- recompute level from total xp (level n requires 100 * n^2 cumulative)
  _new_level := 1;
  WHILE 100 * (_new_level + 1) * (_new_level + 1) <= _new_xp LOOP
    _new_level := _new_level + 1;
  END LOOP;

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
END $$;

REVOKE EXECUTE ON FUNCTION public.award_idle_xp(uuid) FROM PUBLIC, anon, authenticated;
-- Only callable from server-side code that uses service role (our server fn).
