
-- ============ TABLES ============
CREATE TABLE IF NOT EXISTS public.daily_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  mission_date DATE NOT NULL,
  mission_key TEXT NOT NULL,
  target INT NOT NULL,
  progress INT NOT NULL DEFAULT 0,
  reward_dice INT NOT NULL DEFAULT 0,
  reward_xp INT NOT NULL DEFAULT 0,
  slot INT NOT NULL,
  completed_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, mission_date, slot)
);
GRANT SELECT, INSERT, UPDATE ON public.daily_missions TO authenticated;
GRANT ALL ON public.daily_missions TO service_role;
ALTER TABLE public.daily_missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_missions_self_read" ON public.daily_missions
  FOR SELECT USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS daily_missions_user_date_idx
  ON public.daily_missions (user_id, mission_date DESC);

CREATE TABLE IF NOT EXISTS public.user_streaks (
  user_id UUID PRIMARY KEY,
  current_streak INT NOT NULL DEFAULT 0,
  best_streak INT NOT NULL DEFAULT 0,
  last_completion_date DATE,
  last_weekly_claim_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_streaks TO authenticated;
GRANT ALL ON public.user_streaks TO service_role;
ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_streaks_self_read" ON public.user_streaks
  FOR SELECT USING (user_id = auth.uid());

-- Free-case token wallet
CREATE TABLE IF NOT EXISTS public.user_baddie_case_tokens (
  user_id UUID PRIMARY KEY,
  tokens INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_baddie_case_tokens TO authenticated;
GRANT ALL ON public.user_baddie_case_tokens TO service_role;
ALTER TABLE public.user_baddie_case_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_tokens_self_read" ON public.user_baddie_case_tokens
  FOR SELECT USING (user_id = auth.uid());

-- ============ MISSION POOL ============
-- Definitions live inline in the seeder (kept in code so mission balance is version-controlled).

CREATE OR REPLACE FUNCTION public.seed_daily_missions(_user UUID)
RETURNS SETOF public.daily_missions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'UTC')::date;
  v_pool JSONB := '[
    {"key":"win_dice_games", "target":2, "reward_dice":300, "reward_xp":150},
    {"key":"open_case",      "target":1, "reward_dice":500, "reward_xp":100},
    {"key":"earn_dice",      "target":500,"reward_dice":250,"reward_xp":150},
    {"key":"play_games",     "target":5, "reward_dice":200, "reward_xp":100},
    {"key":"win_any_game",   "target":3, "reward_dice":400, "reward_xp":150},
    {"key":"collect_baddie", "target":1, "reward_dice":200, "reward_xp":80},
    {"key":"donate_crew",    "target":200,"reward_dice":250,"reward_xp":100},
    {"key":"chat_message",   "target":3, "reward_dice":150, "reward_xp":50}
  ]'::jsonb;
  v_len INT := jsonb_array_length(v_pool);
  v_seed BIGINT;
  v_idx INT[];
  v_pick JSONB;
  i INT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.daily_missions WHERE user_id = _user AND mission_date = v_today) THEN
    RETURN QUERY SELECT * FROM public.daily_missions
      WHERE user_id = _user AND mission_date = v_today ORDER BY slot;
    RETURN;
  END IF;

  -- Deterministic per user + date so it survives page reloads
  v_seed := ('x' || substr(md5(_user::text || v_today::text), 1, 12))::bit(48)::bigint;
  v_idx := ARRAY[
    (v_seed % v_len)::int,
    ((v_seed / 7) % v_len)::int,
    ((v_seed / 53) % v_len)::int
  ];
  -- Ensure uniqueness: bump duplicates forward
  IF v_idx[2] = v_idx[1] THEN v_idx[2] := (v_idx[2] + 1) % v_len; END IF;
  IF v_idx[3] = v_idx[1] OR v_idx[3] = v_idx[2] THEN v_idx[3] := (v_idx[3] + 2) % v_len; END IF;
  IF v_idx[3] = v_idx[1] OR v_idx[3] = v_idx[2] THEN v_idx[3] := (v_idx[3] + 1) % v_len; END IF;

  FOR i IN 1..3 LOOP
    v_pick := v_pool -> v_idx[i];
    INSERT INTO public.daily_missions
      (user_id, mission_date, mission_key, target, reward_dice, reward_xp, slot)
      VALUES (_user, v_today, v_pick->>'key', (v_pick->>'target')::int,
              (v_pick->>'reward_dice')::int, (v_pick->>'reward_xp')::int, i);
  END LOOP;

  RETURN QUERY SELECT * FROM public.daily_missions
    WHERE user_id = _user AND mission_date = v_today ORDER BY slot;
END $$;

-- Public wrapper (auth.uid())
CREATE OR REPLACE FUNCTION public.get_today_missions()
RETURNS SETOF public.daily_missions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN QUERY SELECT * FROM public.seed_daily_missions(auth.uid());
END $$;
REVOKE EXECUTE ON FUNCTION public.get_today_missions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_today_missions() TO authenticated;

-- ============ PROGRESS TICKER ============
CREATE OR REPLACE FUNCTION public.mission_tick(_user UUID, _key TEXT, _delta INT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'UTC')::date;
  v_row public.daily_missions;
  v_op TEXT;
  v_streak_row public.user_streaks;
  v_new_streak INT;
BEGIN
  IF _user IS NULL OR _delta <= 0 THEN RETURN; END IF;
  -- Ensure today's missions exist
  PERFORM 1 FROM public.daily_missions WHERE user_id = _user AND mission_date = v_today LIMIT 1;
  IF NOT FOUND THEN PERFORM public.seed_daily_missions(_user); END IF;

  FOR v_row IN
    SELECT * FROM public.daily_missions
     WHERE user_id = _user AND mission_date = v_today AND mission_key = _key
       AND completed_at IS NULL
     FOR UPDATE
  LOOP
    UPDATE public.daily_missions
       SET progress = LEAST(target, progress + _delta),
           completed_at = CASE WHEN progress + _delta >= target THEN now() ELSE completed_at END
     WHERE id = v_row.id
     RETURNING * INTO v_row;

    IF v_row.completed_at IS NOT NULL AND v_row.claimed_at IS NULL THEN
      v_op := 'mission:' || v_row.id::text;
      IF v_row.reward_dice > 0 THEN
        PERFORM public.wallet_adjust_idem(_user, v_row.reward_dice::bigint, 'event'::tx_type,
          'mission', 'mission', v_row.id, 'Mission: ' || v_row.mission_key, v_op);
      END IF;
      IF v_row.reward_xp > 0 THEN
        UPDATE public.profiles SET xp = COALESCE(xp,0) + v_row.reward_xp WHERE id = _user;
      END IF;
      UPDATE public.daily_missions SET claimed_at = now() WHERE id = v_row.id;

      -- Streak update (min 1 mission per day)
      SELECT * INTO v_streak_row FROM public.user_streaks WHERE user_id = _user FOR UPDATE;
      IF v_streak_row.user_id IS NULL THEN
        INSERT INTO public.user_streaks(user_id, current_streak, best_streak, last_completion_date)
          VALUES (_user, 1, 1, v_today);
      ELSIF v_streak_row.last_completion_date = v_today THEN
        -- Already counted for today
        NULL;
      ELSIF v_streak_row.last_completion_date = v_today - 1 THEN
        v_new_streak := v_streak_row.current_streak + 1;
        UPDATE public.user_streaks
           SET current_streak = v_new_streak,
               best_streak = GREATEST(best_streak, v_new_streak),
               last_completion_date = v_today, updated_at = now()
         WHERE user_id = _user;
      ELSE
        UPDATE public.user_streaks
           SET current_streak = 1,
               best_streak = GREATEST(best_streak, 1),
               last_completion_date = v_today, updated_at = now()
         WHERE user_id = _user;
      END IF;

      INSERT INTO public.activity_feed(user_id, kind, payload)
        VALUES (_user, 'mission_done',
          jsonb_build_object('key', v_row.mission_key, 'reward_dice', v_row.reward_dice, 'reward_xp', v_row.reward_xp));
    END IF;
  END LOOP;
END $$;

-- ============ CLAIM WEEKLY (day 7) BONUS ============
CREATE OR REPLACE FUNCTION public.claim_weekly_streak_tx()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_today DATE := (now() AT TIME ZONE 'UTC')::date;
  v_s public.user_streaks;
  v_reward INT := 2500;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_s FROM public.user_streaks WHERE user_id = v_user FOR UPDATE;
  IF v_s.user_id IS NULL OR v_s.current_streak < 7 THEN
    RAISE EXCEPTION 'Need a 7-day streak to claim';
  END IF;
  IF v_s.last_weekly_claim_date IS NOT NULL
     AND v_s.last_weekly_claim_date > v_today - 7 THEN
    RAISE EXCEPTION 'Already claimed this week';
  END IF;

  PERFORM public.wallet_adjust_idem(v_user, v_reward::bigint, 'event'::tx_type,
    'streak_weekly', 'streak', NULL, 'Weekly streak reward',
    'streakwk:' || v_user::text || ':' || v_today::text);

  INSERT INTO public.user_baddie_case_tokens(user_id, tokens) VALUES (v_user, 1)
    ON CONFLICT (user_id) DO UPDATE SET tokens = user_baddie_case_tokens.tokens + 1, updated_at = now();

  UPDATE public.user_streaks SET last_weekly_claim_date = v_today WHERE user_id = v_user;

  INSERT INTO public.notifications(user_id, kind, title, body, link)
    VALUES (v_user, 'event', '7-Day Streak reward!',
      '+2,500 DICE and a free Baddie Case token added.', '/baddies');

  RETURN jsonb_build_object('ok', true, 'dice', v_reward, 'case_tokens_added', 1);
END $$;

-- ============ AUTOMATIC PROGRESS TRIGGERS ============
-- game_results → play_games / win_any_game / win_dice_games
CREATE OR REPLACE FUNCTION public.tg_missions_from_game_result()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_won BOOLEAN;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  v_won := COALESCE(NEW.won, false);
  PERFORM public.mission_tick(NEW.user_id, 'play_games', 1);
  IF v_won THEN
    PERFORM public.mission_tick(NEW.user_id, 'win_any_game', 1);
    IF NEW.game_type = 'dice' OR NEW.game_type = 'dice_pvp' THEN
      PERFORM public.mission_tick(NEW.user_id, 'win_dice_games', 1);
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_missions_game_result ON public.game_results;
CREATE TRIGGER trg_missions_game_result
AFTER INSERT ON public.game_results
FOR EACH ROW EXECUTE FUNCTION public.tg_missions_from_game_result();

-- dice_transactions → open_case / earn_dice / collect_baddie
CREATE OR REPLACE FUNCTION public.tg_missions_from_tx()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  -- Case openings (paid + free)
  IF NEW.source IN ('baddie_case') AND NEW.amount < 0 THEN
    PERFORM public.mission_tick(NEW.user_id, 'open_case', 1);
  END IF;
  -- Baddie passive income collection
  IF NEW.source = 'baddie_income' AND NEW.amount > 0 THEN
    PERFORM public.mission_tick(NEW.user_id, 'collect_baddie', 1);
  END IF;
  -- Crew donation
  IF NEW.source = 'crew_donate' AND NEW.amount < 0 THEN
    PERFORM public.mission_tick(NEW.user_id, 'donate_crew', GREATEST(-NEW.amount, 0)::int);
  END IF;
  -- Earn DICE aggregate (positive credit from gameplay/rewards/marketplace/baddie/challenge)
  IF NEW.amount > 0
     AND NEW.type IN ('game_payout','marketplace_sale','challenge_reward','event','daily_reward')
     AND NEW.source NOT IN ('mission','streak_weekly','level_up','crew_weekly','daily_leaderboard') THEN
    PERFORM public.mission_tick(NEW.user_id, 'earn_dice', NEW.amount::int);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_missions_dice_tx ON public.dice_transactions;
CREATE TRIGGER trg_missions_dice_tx
AFTER INSERT ON public.dice_transactions
FOR EACH ROW EXECUTE FUNCTION public.tg_missions_from_tx();

-- chat_messages → chat_message
CREATE OR REPLACE FUNCTION public.tg_missions_from_chat()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    PERFORM public.mission_tick(NEW.user_id, 'chat_message', 1);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_missions_chat ON public.chat_messages;
CREATE TRIGGER trg_missions_chat
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.tg_missions_from_chat();

-- ============ USE FREE CASE TOKEN IN BADDIE OPEN ============
-- Extend open_baddie_cases_tx to consume tokens first (each token = one free open in the batch)
CREATE OR REPLACE FUNCTION public.open_baddie_cases_tx(_count integer)
 RETURNS TABLE(template_id text, name text, rarity text, income_per_hour integer, user_baddie_id uuid, image_url text, autosold boolean, sell_price integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_cost_per int := 1000;
  v_free_tokens int := 0;
  v_paid int;
  v_total_cost bigint;
  v_is_vip boolean; v_autosell text[]; v_bought int;
  v_total int; v_pick int; v_acc int;
  v_t record; v_new uuid; v_op text; v_will_autosell boolean; v_price int;
  i int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _count IS NULL OR _count < 1 OR _count > 10 THEN
    RAISE EXCEPTION 'Count must be between 1 and 10';
  END IF;

  SELECT COALESCE(vip_until > now(), false),
         COALESCE(autosell_rarities, '{}'::text[]),
         COALESCE(baddie_slots_bought,0)
    INTO v_is_vip, v_autosell, v_bought FROM public.profiles WHERE id = v_user;

  SELECT COALESCE(SUM(weight),0) INTO v_total FROM public.baddie_templates;
  IF v_total <= 0 THEN RAISE EXCEPTION 'No baddie templates configured'; END IF;

  -- Consume free tokens (up to _count)
  SELECT tokens INTO v_free_tokens FROM public.user_baddie_case_tokens WHERE user_id = v_user FOR UPDATE;
  v_free_tokens := COALESCE(v_free_tokens, 0);
  IF v_free_tokens > _count THEN v_free_tokens := _count; END IF;
  IF v_free_tokens > 0 THEN
    UPDATE public.user_baddie_case_tokens SET tokens = tokens - v_free_tokens, updated_at = now()
     WHERE user_id = v_user;
  END IF;

  v_paid := _count - v_free_tokens;
  v_total_cost := v_cost_per::bigint * v_paid;
  v_op := 'baddie_open_multi:' || v_user::text || ':' || gen_random_uuid()::text;
  IF v_total_cost > 0 THEN
    PERFORM public.wallet_adjust_idem(v_user, -v_total_cost, 'event'::tx_type,
      'baddie_case', 'baddie_case', NULL, 'Opened ' || v_paid || ' Baddie Cases', v_op);
  END IF;
  -- Log a zero-amount marker so the open_case trigger fires for free opens
  IF v_free_tokens > 0 THEN
    INSERT INTO public.dice_transactions(user_id, type, amount, balance_before, balance_after, source, ref_kind, ref_id, note, operation_id)
      SELECT v_user, 'event'::tx_type, 0, w.balance, w.balance, 'baddie_case', 'baddie_case', NULL,
             'Opened ' || v_free_tokens || ' free Baddie Cases (token)',
             'baddie_open_free:' || v_user::text || ':' || gen_random_uuid()::text
        FROM public.dice_wallets w WHERE w.user_id = v_user;
    -- Additional ticks for the free opens (paid ones already ticked once via wallet_adjust)
    FOR i IN 1..v_free_tokens LOOP
      PERFORM public.mission_tick(v_user, 'open_case', 1);
    END LOOP;
  END IF;

  FOR i IN 1.._count LOOP
    v_acc := 0;
    v_pick := 1 + floor(random() * v_total)::int;
    FOR v_t IN SELECT * FROM public.baddie_templates ORDER BY weight DESC, id LOOP
      v_acc := v_acc + v_t.weight;
      IF v_pick <= v_acc THEN
        v_will_autosell := v_is_vip AND (v_t.rarity = ANY(v_autosell));
        IF v_will_autosell THEN
          v_price := GREATEST(FLOOR(v_t.income_per_hour/2)::int, 1);
          PERFORM public.wallet_adjust_idem(v_user, v_price, 'event'::tx_type,
            'baddie_autosell', 'baddie_case', NULL, 'Autosold ' || v_t.name,
            v_op || ':as:' || i::text);
          template_id := v_t.id; name := v_t.name; rarity := v_t.rarity;
          income_per_hour := v_t.income_per_hour; user_baddie_id := NULL;
          image_url := v_t.image_url; autosold := TRUE; sell_price := v_price;
        ELSE
          INSERT INTO public.user_baddies(user_id, template_id, name)
            VALUES (v_user, v_t.id, v_t.name) RETURNING id INTO v_new;
          template_id := v_t.id; name := v_t.name; rarity := v_t.rarity;
          income_per_hour := v_t.income_per_hour; user_baddie_id := v_new;
          image_url := v_t.image_url; autosold := FALSE; sell_price := NULL;
        END IF;
        RETURN NEXT;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;
  RETURN;
END $function$;
