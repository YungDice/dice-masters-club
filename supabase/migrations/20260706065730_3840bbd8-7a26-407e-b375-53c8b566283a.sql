CREATE OR REPLACE FUNCTION public.evaluate_user_achievements(_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wins int := 0;
  v_cf_wins int := 0;
  v_max_wager bigint := 0;
  v_owned_baddies int := 0;
  v_opened_cases bigint := 0;
  v_has_legend int := 0;
  v_ups int := 0;
  v_friends int := 0;
  v_sales int := 0;
  v_max_bal bigint := 0;
  v_streak int := 0;
  v_win_rank int;
  v_xp_rank int;
  v_level_rank int;
  v_dice_rank int;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;

  SELECT COUNT(*) FILTER (WHERE outcome = 'win'),
         COUNT(*) FILTER (WHERE outcome = 'win' AND kind::text = 'coinflip'),
         COALESCE(MAX(GREATEST(wagered, ABS(delta))), 0)
    INTO v_wins, v_cf_wins, v_max_wager
  FROM public.game_results
  WHERE user_id = _uid;

  IF v_wins > 0 THEN PERFORM public.grant_achievement(_uid, 'first_blood'); END IF;
  IF v_max_wager >= 1000 THEN PERFORM public.grant_achievement(_uid, 'high_roller'); END IF;
  IF v_cf_wins >= 10 THEN PERFORM public.grant_achievement(_uid, 'coinflip_champ'); END IF;
  IF EXISTS (SELECT 1 FROM public.game_results WHERE user_id = _uid AND kind::text = 'poker') THEN
    PERFORM public.grant_achievement(_uid, 'poker_starter');
  END IF;

  SELECT COUNT(*) INTO v_owned_baddies FROM public.user_baddies WHERE user_id = _uid;
  SELECT COALESCE(SUM(
    CASE
      WHEN note ~ 'Opened [0-9]+ Baddie Cases' THEN substring(note from 'Opened ([0-9]+) Baddie Cases')::bigint
      WHEN note ~ 'Opened [0-9]+ free Baddie Cases' THEN substring(note from 'Opened ([0-9]+) free Baddie Cases')::bigint
      WHEN note = 'Opened Baddie Case' THEN 1
      ELSE 0
    END
  ), 0)
    INTO v_opened_cases
  FROM public.dice_transactions
  WHERE user_id = _uid AND source = 'baddie_case';

  IF GREATEST(v_owned_baddies::bigint, v_opened_cases) >= 100 THEN
    PERFORM public.grant_achievement(_uid, 'cases_100');
  END IF;

  SELECT COUNT(*) INTO v_has_legend
    FROM public.user_baddies ub JOIN public.baddie_templates bt ON bt.id = ub.template_id
    WHERE ub.user_id = _uid AND bt.rarity IN ('legendary','unreal','elias');
  IF v_has_legend > 0 THEN PERFORM public.grant_achievement(_uid, 'legendary_hunter'); END IF;

  SELECT COUNT(*) INTO v_ups FROM public.baddie_upgrades WHERE user_id = _uid AND success IS TRUE;
  IF v_ups >= 10 THEN PERFORM public.grant_achievement(_uid, 'upgrades_10'); END IF;

  SELECT COUNT(*) INTO v_friends FROM public.friendships
    WHERE status::text = 'accepted' AND (requester_id = _uid OR addressee_id = _uid);
  IF v_friends >= 5 THEN PERFORM public.grant_achievement(_uid, 'social_player'); END IF;

  SELECT COUNT(*) INTO v_sales FROM public.marketplace_purchases WHERE seller_id = _uid;
  IF v_sales > 0 THEN PERFORM public.grant_achievement(_uid, 'marketplace_seller'); END IF;

  SELECT COALESCE(MAX(GREATEST(balance, lifetime_earned)), 0) INTO v_max_bal FROM public.dice_wallets WHERE user_id = _uid;
  SELECT GREATEST(v_max_bal, COALESCE(MAX(balance_after), 0)) INTO v_max_bal FROM public.dice_transactions WHERE user_id = _uid;
  IF v_max_bal >= 1000000 THEN PERFORM public.grant_achievement(_uid, 'millionaire'); END IF;

  SELECT COALESCE(GREATEST(current_streak, best_streak), 0) INTO v_streak FROM public.user_streaks WHERE user_id = _uid;
  IF v_streak >= 7 THEN PERFORM public.grant_achievement(_uid, 'streak_7'); END IF;
  IF v_streak >= 30 THEN PERFORM public.grant_achievement(_uid, 'streak_30'); END IF;

  SELECT r INTO v_win_rank
  FROM (
    SELECT user_id, dense_rank() OVER (ORDER BY COUNT(*) FILTER (WHERE outcome='win') DESC) AS r
    FROM public.game_results
    GROUP BY user_id
    HAVING COUNT(*) FILTER (WHERE outcome='win') > 0
  ) ranked
  WHERE user_id = _uid;

  SELECT r INTO v_xp_rank
  FROM (
    SELECT id, dense_rank() OVER (ORDER BY xp DESC NULLS LAST) AS r
    FROM public.profiles
    WHERE COALESCE(xp,0) > 0
  ) ranked
  WHERE id = _uid;

  SELECT r INTO v_level_rank
  FROM (
    SELECT id, dense_rank() OVER (ORDER BY level DESC NULLS LAST, xp DESC NULLS LAST) AS r
    FROM public.profiles
    WHERE COALESCE(level,1) > 1 OR COALESCE(xp,0) > 0
  ) ranked
  WHERE id = _uid;

  SELECT r INTO v_dice_rank
  FROM (
    SELECT user_id, dense_rank() OVER (ORDER BY balance DESC NULLS LAST) AS r
    FROM public.dice_wallets
    WHERE COALESCE(balance,0) > 0
  ) ranked
  WHERE user_id = _uid;

  IF LEAST(
    COALESCE(v_win_rank, 2147483647),
    COALESCE(v_xp_rank, 2147483647),
    COALESCE(v_level_rank, 2147483647),
    COALESCE(v_dice_rank, 2147483647)
  ) <= 10 THEN
    PERFORM public.grant_achievement(_uid, 'top10');
  END IF;

  IF v_xp_rank = 1 THEN
    PERFORM public.grant_achievement(_uid, 'top1_xp');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_user_achievements(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_user_achievements(uuid) TO service_role;