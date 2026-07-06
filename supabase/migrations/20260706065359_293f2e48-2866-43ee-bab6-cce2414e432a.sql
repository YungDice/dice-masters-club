-- Fix blackjack private-state persistence, durable game result recording, and achievement evaluation.

-- 1) Replace the old upsert helper for private game state with one that updates
--    on existing room rows. The previous use of upsert without merge behavior
--    left the original deck in place, so hits could repeatedly replay the same card.
CREATE OR REPLACE FUNCTION public.save_game_private_state(_room_id uuid, _state jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _room_id IS NULL THEN
    RAISE EXCEPTION 'Missing room id';
  END IF;

  INSERT INTO public.game_private_state(room_id, state, updated_at)
  VALUES (_room_id, COALESCE(_state, '{}'::jsonb), now())
  ON CONFLICT (room_id) DO UPDATE
    SET state = EXCLUDED.state,
        updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.save_game_private_state(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_game_private_state(uuid,jsonb) TO service_role;

-- 2) Make result recording idempotent per user/room/game, include wager+payout,
--    run achievement evaluation immediately, and keep a 6-argument overload for
--    existing call sites.
CREATE UNIQUE INDEX IF NOT EXISTS game_results_one_per_room_user_kind_idx
ON public.game_results(room_id, user_id, kind)
WHERE room_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_game_result(
  _uid uuid,
  _kind text,
  _delta bigint,
  _outcome text,
  _room_id uuid,
  _details jsonb,
  _wagered bigint DEFAULT 0,
  _payout bigint DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _kind_enum public.game_kind;
  _ins int := 0;
BEGIN
  IF _uid IS NULL OR _kind IS NULL OR _outcome IS NULL THEN
    RETURN;
  END IF;

  _kind_enum := _kind::public.game_kind;

  INSERT INTO public.game_results(room_id,user_id,kind,delta,outcome,details,wagered,payout)
  VALUES (
    _room_id,
    _uid,
    _kind_enum,
    COALESCE(_delta,0),
    CASE WHEN _outcome IN ('push','draw') THEN 'tie' ELSE _outcome END,
    COALESCE(_details,'{}'::jsonb),
    GREATEST(COALESCE(_wagered,0), 0),
    GREATEST(COALESCE(_payout,0), 0)
  )
  ON CONFLICT (room_id, user_id, kind) WHERE room_id IS NOT NULL DO UPDATE
    SET delta = EXCLUDED.delta,
        outcome = EXCLUDED.outcome,
        details = COALESCE(public.game_results.details, '{}'::jsonb) || EXCLUDED.details,
        wagered = GREATEST(public.game_results.wagered, EXCLUDED.wagered),
        payout = GREATEST(public.game_results.payout, EXCLUDED.payout)
  RETURNING 1 INTO _ins;

  BEGIN
    INSERT INTO public.activity_feed(user_id, kind, payload)
    VALUES (_uid, 'game_result', jsonb_build_object('game',_kind,'outcome',_outcome,'delta',_delta,'wagered',_wagered));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  PERFORM public.evaluate_user_achievements(_uid);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_game_result(
  _uid uuid,
  _kind text,
  _delta bigint,
  _outcome text,
  _room_id uuid,
  _details jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.record_game_result(
    _uid,
    _kind,
    _delta,
    _outcome,
    _room_id,
    _details,
    COALESCE((_details->>'stake')::bigint, (_details->>'bet')::bigint, 0),
    COALESCE((_details->>'payout')::bigint, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_game_result(uuid,text,bigint,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_game_result(uuid,text,bigint,text,uuid,jsonb,bigint,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_game_result(uuid,text,bigint,text,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_game_result(uuid,text,bigint,text,uuid,jsonb,bigint,bigint) TO service_role;

-- 3) Fix achievement helpers so they do not silently fail on text IDs, and add
--    the missing case-open, daily-XP, and top-10 checks.
DROP FUNCTION IF EXISTS public.grant_achievement(uuid, uuid);

CREATE OR REPLACE FUNCTION public.grant_achievement(_user_id uuid, _achievement_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
      _ach.dice_reward::bigint,
      'achievement'::tx_type,
      'achievement',
      'achievement',
      NULL::uuid,
      'Achievement: ' || _ach.name,
      'achievement:' || _ach.id || ':' || _user_id::text
    );
  END IF;

  IF COALESCE(_ach.xp_reward, 0) > 0 THEN
    PERFORM set_config('app.bypass_profile_protect','1',true);
    UPDATE public.profiles SET xp = COALESCE(xp,0) + _ach.xp_reward WHERE id = _user_id;
  END IF;

  BEGIN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (_user_id, 'badge_unlock', 'Achievement Unlocked', _ach.name, '/profile');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    INSERT INTO public.activity_feed (user_id, kind, title, body, payload)
    VALUES (_user_id, 'achievement', 'Achievement Unlocked', _ach.name,
            jsonb_build_object('achievement_id', _ach.id, 'name', _ach.name, 'icon', _ach.icon));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.grant_achievement(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_achievement(uuid,text) TO service_role;

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
  IF v_win_rank IS NOT NULL AND v_win_rank <= 10 THEN
    PERFORM public.grant_achievement(_uid, 'top10');
  END IF;

  SELECT r INTO v_xp_rank
  FROM (
    SELECT id, dense_rank() OVER (ORDER BY xp DESC NULLS LAST) AS r
    FROM public.profiles
  ) ranked
  WHERE id = _uid;
  IF v_xp_rank = 1 THEN
    PERFORM public.grant_achievement(_uid, 'top1_xp');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.evaluate_user_achievements(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_user_achievements(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_ach_game_results()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_cf_wins int;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.outcome = 'win' THEN PERFORM public.grant_achievement(NEW.user_id, 'first_blood'); END IF;
  IF GREATEST(COALESCE(NEW.wagered, 0), ABS(COALESCE(NEW.delta, 0))) >= 1000 THEN
    PERFORM public.grant_achievement(NEW.user_id, 'high_roller');
  END IF;
  IF NEW.kind::text = 'coinflip' AND NEW.outcome = 'win' THEN
    SELECT COUNT(*) INTO v_cf_wins FROM public.game_results
      WHERE user_id = NEW.user_id AND kind::text = 'coinflip' AND outcome = 'win';
    IF v_cf_wins >= 10 THEN PERFORM public.grant_achievement(NEW.user_id, 'coinflip_champ'); END IF;
  END IF;
  IF NEW.kind::text = 'poker' THEN PERFORM public.grant_achievement(NEW.user_id, 'poker_starter'); END IF;
  PERFORM public.evaluate_user_achievements(NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_ach_user_baddies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_rarity text;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  PERFORM public.evaluate_user_achievements(NEW.user_id);
  SELECT rarity INTO v_rarity FROM public.baddie_templates WHERE id = NEW.template_id;
  IF v_rarity IN ('legendary','unreal','elias') THEN PERFORM public.grant_achievement(NEW.user_id, 'legendary_hunter'); END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_ach_dice_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.source IN ('baddie_case','baddie_autosell','baddie_income','achievement','daily_leaderboard') THEN
    PERFORM public.evaluate_user_achievements(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ach_on_dice_transactions ON public.dice_transactions;
CREATE TRIGGER ach_on_dice_transactions
AFTER INSERT ON public.dice_transactions
FOR EACH ROW EXECUTE FUNCTION public.tg_ach_dice_transactions();

CREATE OR REPLACE FUNCTION public.tg_ach_daily_leaderboard_rewards()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.rank = 1 THEN
    PERFORM public.grant_achievement(NEW.user_id, 'top1_xp');
  ELSIF NEW.rank = 2 THEN
    PERFORM public.grant_achievement(NEW.user_id, 'top2_xp');
  ELSIF NEW.rank = 3 THEN
    PERFORM public.grant_achievement(NEW.user_id, 'top3_xp');
  END IF;
  PERFORM public.evaluate_user_achievements(NEW.user_id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ach_on_daily_leaderboard_rewards ON public.daily_leaderboard_rewards;
CREATE TRIGGER ach_on_daily_leaderboard_rewards
AFTER INSERT ON public.daily_leaderboard_rewards
FOR EACH ROW EXECUTE FUNCTION public.tg_ach_daily_leaderboard_rewards();

REVOKE ALL ON FUNCTION public.tg_ach_dice_transactions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_ach_daily_leaderboard_rewards() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_ach_dice_transactions() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_ach_daily_leaderboard_rewards() TO service_role;

-- 4) Backfill game_results from finished solo/bot/room states that previously
--    updated rooms and wallets but never created history rows.
WITH room_rows AS (
  SELECT
    r.id AS room_id,
    r.host_id AS user_id,
    r.kind::text AS kind,
    COALESCE((r.state->>'delta')::bigint,
      CASE
        WHEN r.kind::text = 'poker' THEN COALESCE((r.state->>'payout')::bigint,0) - COALESCE((r.state->>'bet')::bigint, r.stake, 0)
        WHEN r.kind::text = 'flappy' THEN COALESCE((r.state->>'reward')::bigint,0)
        WHEN r.kind::text = 'obby' AND r.status = 'finished' THEN COALESCE((r.state->>'reward')::bigint,150)
        WHEN r.kind::text = 'obby' THEN 0
        ELSE 0
      END
    ) AS delta,
    CASE
      WHEN r.kind::text = 'poker' THEN CASE WHEN COALESCE((r.state->>'payout')::bigint,0) > COALESCE((r.state->>'bet')::bigint,r.stake,0) THEN 'win' WHEN COALESCE((r.state->>'payout')::bigint,0) < COALESCE((r.state->>'bet')::bigint,r.stake,0) THEN 'loss' ELSE 'tie' END
      WHEN r.kind::text = 'blackjack' THEN CASE WHEN r.state->>'outcome' IN ('blackjack','win') THEN 'win' WHEN r.state->>'outcome' IN ('push','tie') THEN 'tie' ELSE 'loss' END
      WHEN r.kind::text = 'flappy' THEN CASE WHEN COALESCE((r.state->>'gates')::int,0) > 0 THEN 'win' ELSE 'loss' END
      WHEN r.kind::text = 'obby' THEN CASE WHEN r.status = 'finished' THEN 'win' ELSE 'loss' END
      ELSE CASE WHEN COALESCE((r.state->>'delta')::bigint,0) > 0 THEN 'win' WHEN COALESCE((r.state->>'delta')::bigint,0) < 0 THEN 'loss' ELSE 'tie' END
    END AS outcome,
    COALESCE((r.state->>'bet')::bigint, r.stake, 0) AS wagered,
    CASE
      WHEN r.kind::text = 'poker' THEN COALESCE((r.state->>'payout')::bigint,0)
      WHEN r.kind::text = 'blackjack' THEN COALESCE((r.state->>'bet')::bigint, r.stake, 0) + COALESCE((r.state->>'delta')::bigint,0)
      ELSE GREATEST(COALESCE((r.state->>'delta')::bigint,0),0)
    END AS payout,
    r.state AS details
  FROM public.game_rooms r
  WHERE r.status IN ('finished','cancelled')
    AND r.kind::text IN ('blackjack','poker','flappy','obby')
)
INSERT INTO public.game_results(room_id,user_id,kind,delta,outcome,details,wagered,payout,created_at)
SELECT room_id, user_id, kind::public.game_kind, delta, outcome, details, GREATEST(wagered,0), GREATEST(payout,0), now()
FROM room_rows
ON CONFLICT (room_id, user_id, kind) WHERE room_id IS NOT NULL DO NOTHING;

-- Backfill multiplayer blackjack seats from room state arrays.
WITH seats AS (
  SELECT
    r.id AS room_id,
    (s.value->>'userId')::uuid AS user_id,
    'blackjack'::public.game_kind AS kind,
    COALESCE((s.value->>'delta')::bigint,0) AS delta,
    CASE WHEN s.value->>'outcome' IN ('blackjack','win') THEN 'win'
         WHEN s.value->>'outcome' IN ('push','tie') THEN 'tie'
         ELSE 'loss' END AS outcome,
    jsonb_build_object('mp', true, 'seat', s.value) AS details,
    COALESCE((s.value->>'bet')::bigint, r.stake, 0) AS wagered,
    GREATEST(COALESCE((s.value->>'bet')::bigint, r.stake, 0) + COALESCE((s.value->>'delta')::bigint,0), 0) AS payout
  FROM public.game_rooms r
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.state->'seats','[]'::jsonb)) s(value)
  WHERE r.status = 'finished'
    AND r.kind::text = 'blackjack'
    AND jsonb_typeof(COALESCE(r.state->'seats','[]'::jsonb)) = 'array'
    AND s.value ? 'userId'
)
INSERT INTO public.game_results(room_id,user_id,kind,delta,outcome,details,wagered,payout,created_at)
SELECT room_id,user_id,kind,delta,outcome,details,wagered,payout,now()
FROM seats
ON CONFLICT (room_id, user_id, kind) WHERE room_id IS NOT NULL DO NOTHING;

-- Fill missing wager/payout values for old direct result rows.
UPDATE public.game_results
SET wagered = CASE WHEN wagered = 0 THEN ABS(delta) ELSE wagered END,
    payout = CASE WHEN payout = 0 THEN GREATEST(delta,0) ELSE payout END
WHERE wagered = 0 OR payout = 0;

-- Re-evaluate all users touched by games, baddies, wallet/case history, or profiles.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id AS user_id FROM public.profiles
    UNION SELECT user_id FROM public.game_results
    UNION SELECT user_id FROM public.user_baddies
    UNION SELECT user_id FROM public.dice_transactions WHERE source IN ('baddie_case','baddie_autosell','achievement','daily_leaderboard')
    UNION SELECT user_id FROM public.daily_leaderboard_rewards
  LOOP
    PERFORM public.evaluate_user_achievements(r.user_id);
  END LOOP;
END $$;