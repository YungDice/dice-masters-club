-- Refreshes must derive progress from server records, never accumulate again on page load.
CREATE OR REPLACE FUNCTION public.refresh_daily_missions_tx()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_today date := (now() AT TIME ZONE 'UTC')::date;
        v_games int; v_cases int; v_earned bigint;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT count(*) INTO v_games FROM public.game_results
    WHERE user_id = v_user AND (created_at AT TIME ZONE 'UTC')::date = v_today;
  SELECT count(*) INTO v_cases FROM public.dice_transactions
    WHERE user_id = v_user AND source = 'baddie_case' AND (created_at AT TIME ZONE 'UTC')::date = v_today;
  SELECT COALESCE(sum(amount), 0) INTO v_earned FROM public.dice_transactions
    WHERE user_id = v_user AND amount > 0 AND (created_at AT TIME ZONE 'UTC')::date = v_today;

  UPDATE public.user_daily_missions m
    SET progress = CASE m.mission_id
      WHEN 'play_games' THEN LEAST(v_games, (SELECT target FROM public.daily_mission_definitions WHERE id = m.mission_id))
      WHEN 'open_case' THEN LEAST(v_cases, (SELECT target FROM public.daily_mission_definitions WHERE id = m.mission_id))
      WHEN 'earn_dice' THEN LEAST(v_earned::int, (SELECT target FROM public.daily_mission_definitions WHERE id = m.mission_id))
      ELSE m.progress END
    WHERE m.user_id = v_user AND m.mission_date = v_today;
END $$;
