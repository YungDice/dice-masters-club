
INSERT INTO public.achievements (id, name, description, icon, dice_reward, xp_reward) VALUES
  ('top1_xp',    'XP Champion',    'Finish #1 on the daily XP leaderboard.',    'trophy', 1000, 0),
  ('top1_dice',  'DICE Tycoon',    'Hold the #1 DICE balance in the kingdom.',  'gem',    1000, 0),
  ('top1_level', 'Level Sovereign', 'Reach the highest level on the server.',    'crown',  1000, 0),
  ('top2_xp',    'Silver Mind',    'Finish #2 on the daily XP leaderboard.',    'medal',   500, 0),
  ('top3_xp',    'Bronze Grind',   'Finish #3 on the daily XP leaderboard.',    'award',   250, 0)
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, icon=EXCLUDED.icon, dice_reward=EXCLUDED.dice_reward, xp_reward=EXCLUDED.xp_reward;

CREATE OR REPLACE FUNCTION public.award_daily_leaderboard_rewards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _today date := (now() AT TIME ZONE 'UTC')::date;
  _yday  date := _today - 1;
  _rank int := 0;
  _amounts bigint[] := ARRAY[1500, 750, 500];
  _vip_hours int[] := ARRAY[24, 12, 0];
  _ach text[] := ARRAY['top1_xp','top2_xp','top3_xp'];
  _row record;
  _winners jsonb := '[]'::jsonb;
  _base timestamptz;
  _top_dice uuid;
  _top_level uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.daily_leaderboard_rewards WHERE reward_date = _yday) THEN
    INSERT INTO public.daily_xp_snapshots (user_id, xp, updated_at)
      SELECT id, xp, now() FROM public.profiles
      ON CONFLICT (user_id) DO UPDATE SET xp = EXCLUDED.xp, updated_at = now();
    RETURN jsonb_build_object('ok', false, 'reason', 'already_awarded');
  END IF;

  FOR _row IN
    SELECT p.id AS user_id, p.xp, COALESCE(s.xp,0) AS prev_xp, (p.xp - COALESCE(s.xp,0)) AS gained
    FROM public.profiles p
    LEFT JOIN public.daily_xp_snapshots s ON s.user_id = p.id
    WHERE p.xp > COALESCE(s.xp,0)
    ORDER BY gained DESC
    LIMIT 3
  LOOP
    _rank := _rank + 1;
    IF _amounts[_rank] > 0 THEN
      PERFORM public.wallet_adjust_idem(_row.user_id, _amounts[_rank], 'event'::tx_type,
        'daily_leaderboard', NULL, NULL,
        'Daily leaderboard rank #' || _rank,
        'dlb:' || _yday::text || ':' || _rank::text);
    END IF;
    IF _vip_hours[_rank] > 0 THEN
      SELECT vip_until INTO _base FROM public.profiles WHERE id = _row.user_id FOR UPDATE;
      _base := GREATEST(COALESCE(_base, now()), now());
      UPDATE public.profiles SET vip_until = _base + (_vip_hours[_rank] || ' hours')::interval WHERE id = _row.user_id;
    END IF;
    INSERT INTO public.daily_leaderboard_rewards (reward_date, rank, user_id, xp_gained, dice_awarded, vip_hours)
      VALUES (_yday, _rank, _row.user_id, _row.gained, _amounts[_rank], _vip_hours[_rank]);
    INSERT INTO public.notifications (user_id, kind, title, body, link)
      VALUES (_row.user_id, 'event', 'Daily leaderboard reward!',
        'You finished #' || _rank || ' yesterday — +' || _amounts[_rank] || ' DICE' ||
        CASE WHEN _vip_hours[_rank] > 0 THEN ' & ' || _vip_hours[_rank] || 'h VIP' ELSE '' END, '/leaderboard');
    INSERT INTO public.user_achievements (user_id, achievement_id)
      VALUES (_row.user_id, _ach[_rank]) ON CONFLICT DO NOTHING;
    _winners := _winners || jsonb_build_object('rank', _rank, 'user_id', _row.user_id, 'gained', _row.gained);
  END LOOP;

  -- Top 1 DICE
  SELECT user_id INTO _top_dice FROM public.dice_wallets ORDER BY balance DESC NULLS LAST LIMIT 1;
  IF _top_dice IS NOT NULL THEN
    INSERT INTO public.user_achievements (user_id, achievement_id) VALUES (_top_dice, 'top1_dice') ON CONFLICT DO NOTHING;
  END IF;

  -- Top 1 Level
  SELECT id INTO _top_level FROM public.profiles ORDER BY level DESC NULLS LAST, xp DESC NULLS LAST LIMIT 1;
  IF _top_level IS NOT NULL THEN
    INSERT INTO public.user_achievements (user_id, achievement_id) VALUES (_top_level, 'top1_level') ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.daily_xp_snapshots (user_id, xp, updated_at)
    SELECT id, xp, now() FROM public.profiles
    ON CONFLICT (user_id) DO UPDATE SET xp = EXCLUDED.xp, updated_at = now();

  RETURN jsonb_build_object('ok', true, 'date', _yday, 'winners', _winners);
END $function$;
