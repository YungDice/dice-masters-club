-- ============================================================
-- DICE Club expansion: progression, collection, social, events
-- ============================================================

-- Baddie ownership metadata: safe mode, Base placement, prestige and traits.
ALTER TABLE public.user_baddies
  ADD COLUMN IF NOT EXISTS is_protected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prestige smallint NOT NULL DEFAULT 0 CHECK (prestige >= 0 AND prestige <= 99),
  ADD COLUMN IF NOT EXISTS trait text,
  ADD COLUMN IF NOT EXISTS variant text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS base_slot smallint;

ALTER TABLE public.user_baddies
  DROP CONSTRAINT IF EXISTS user_baddies_base_slot_check;
ALTER TABLE public.user_baddies
  ADD CONSTRAINT user_baddies_base_slot_check CHECK (base_slot IS NULL OR base_slot BETWEEN 1 AND 10);

CREATE UNIQUE INDEX IF NOT EXISTS user_baddies_base_slot_uniq
  ON public.user_baddies(user_id, base_slot) WHERE base_slot IS NOT NULL;

UPDATE public.user_baddies
SET trait = CASE mod(abs(hashtextextended(id::text, 11)), 4)
  WHEN 0 THEN 'Lucky'
  WHEN 1 THEN 'Golden'
  WHEN 2 THEN 'Night Owl'
  ELSE 'Diamond Aura'
END
WHERE trait IS NULL;

CREATE OR REPLACE FUNCTION public.assign_baddie_trait()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.trait IS NULL THEN
    NEW.trait := (ARRAY['Lucky','Golden','Night Owl','Diamond Aura'])[1 + floor(random() * 4)::int];
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS user_baddies_assign_trait ON public.user_baddies;
CREATE TRIGGER user_baddies_assign_trait
  BEFORE INSERT ON public.user_baddies
  FOR EACH ROW EXECUTE FUNCTION public.assign_baddie_trait();

-- A protected Baddie cannot be silently consumed, listed, or transferred.
CREATE OR REPLACE FUNCTION public.guard_protected_baddie()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_protected
     AND COALESCE(current_setting('app.allow_protected_baddie', true), '') <> '1' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Protected Baddies cannot be removed. Disable Safe Mode first.';
    END IF;
    IF NEW.listing_id IS DISTINCT FROM OLD.listing_id AND NEW.listing_id IS NOT NULL THEN
      RAISE EXCEPTION 'Protected Baddies cannot be listed. Disable Safe Mode first.';
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Protected Baddies cannot be traded. Disable Safe Mode first.';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS user_baddies_guard_protected ON public.user_baddies;
CREATE TRIGGER user_baddies_guard_protected
  BEFORE UPDATE OR DELETE ON public.user_baddies
  FOR EACH ROW EXECUTE FUNCTION public.guard_protected_baddie();

-- ============================================================
-- Daily missions, streaks, season pass and achievements
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_progression (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_streak integer NOT NULL DEFAULT 0,
  last_mission_claim_date date,
  season_xp integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_mission_definitions (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  target integer NOT NULL CHECK (target > 0),
  reward_dice integer NOT NULL CHECK (reward_dice >= 0),
  reward_xp integer NOT NULL DEFAULT 0 CHECK (reward_xp >= 0),
  sort_order integer NOT NULL DEFAULT 0
);

INSERT INTO public.daily_mission_definitions(id, title, description, target, reward_dice, reward_xp, sort_order)
VALUES
  ('play_games', 'Warm up the table', 'Play 3 games today.', 3, 250, 25, 1),
  ('open_case', 'Fresh pull', 'Open 1 Baddie Case today.', 1, 200, 20, 2),
  ('earn_dice', 'Stack chips', 'Earn 1,000 DICE today.', 1000, 350, 35, 3)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description, target = EXCLUDED.target,
  reward_dice = EXCLUDED.reward_dice, reward_xp = EXCLUDED.reward_xp, sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS public.user_daily_missions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id text NOT NULL REFERENCES public.daily_mission_definitions(id) ON DELETE CASCADE,
  mission_date date NOT NULL,
  progress integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  PRIMARY KEY(user_id, mission_id, mission_date)
);
CREATE INDEX IF NOT EXISTS user_daily_missions_lookup_idx ON public.user_daily_missions(user_id, mission_date);

CREATE TABLE IF NOT EXISTS public.season_pass_rewards (
  level integer PRIMARY KEY CHECK (level BETWEEN 1 AND 100),
  xp_required integer NOT NULL CHECK (xp_required >= 0),
  reward_dice integer NOT NULL DEFAULT 0,
  cosmetic_id text,
  label text NOT NULL
);
INSERT INTO public.season_pass_rewards(level, xp_required, reward_dice, cosmetic_id, label)
VALUES
  (1, 0, 300, NULL, 'Opening Hand'),
  (2, 50, 450, NULL, 'Fresh Stack'),
  (3, 120, 600, 'dice-neon', 'Neon Dice Skin'),
  (4, 220, 800, NULL, 'High Roller Cache'),
  (5, 350, 1200, 'frame-gold', 'Gold Profile Frame'),
  (6, 520, 1500, NULL, 'Table Runner'),
  (7, 720, 2000, 'title-case-addict', 'Case Addict Title'),
  (8, 960, 2600, NULL, 'Lucky Break'),
  (9, 1240, 3200, 'banner-midnight', 'Midnight Banner'),
  (10, 1600, 5000, 'frame-unreal', 'Unreal Hunter Frame')
ON CONFLICT (level) DO UPDATE SET
  xp_required = EXCLUDED.xp_required, reward_dice = EXCLUDED.reward_dice,
  cosmetic_id = EXCLUDED.cosmetic_id, label = EXCLUDED.label;

CREATE TABLE IF NOT EXISTS public.user_season_reward_claims (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level integer NOT NULL REFERENCES public.season_pass_rewards(level) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, level)
);

CREATE TABLE IF NOT EXISTS public.achievement_definitions (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  reward_dice integer NOT NULL DEFAULT 0,
  icon text NOT NULL DEFAULT 'trophy',
  sort_order integer NOT NULL DEFAULT 0
);
INSERT INTO public.achievement_definitions(id, title, description, reward_dice, icon, sort_order)
VALUES
  ('first_win', 'First Blood', 'Win your first game.', 250, 'swords', 1),
  ('case_breaker', 'Case Breaker', 'Open 10 Baddie Cases.', 500, 'package', 2),
  ('collector_10', 'Collector', 'Own 10 Baddies at once.', 750, 'sparkles', 3),
  ('prestige_1', 'Shiny Business', 'Create your first Prestige Baddie.', 1000, 'gem', 4),
  ('crew_player', 'Crew Player', 'Join or create a Crew.', 400, 'users', 5),
  ('high_roller', 'High Roller', 'Play a game with a 5,000+ DICE stake.', 800, 'crown', 6)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description,
  reward_dice = EXCLUDED.reward_dice, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS public.user_achievements (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id text NOT NULL REFERENCES public.achievement_definitions(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  PRIMARY KEY(user_id, achievement_id)
);

CREATE OR REPLACE FUNCTION public.ensure_club_progress_tx()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.user_progression(user_id) VALUES (v_user) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_daily_missions(user_id, mission_id, mission_date)
    SELECT v_user, id, v_today FROM public.daily_mission_definitions
    ON CONFLICT (user_id, mission_id, mission_date) DO NOTHING;
  PERFORM public.refresh_daily_missions_tx();
  PERFORM public.check_achievements_tx();
  RETURN jsonb_build_object('ok', true, 'day', v_today);
END $$;

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
      WHEN 'play_games' THEN LEAST(m.progress + 0 + v_games, (SELECT target FROM public.daily_mission_definitions WHERE id = m.mission_id))
      WHEN 'open_case' THEN LEAST(m.progress + 0 + v_cases, (SELECT target FROM public.daily_mission_definitions WHERE id = m.mission_id))
      WHEN 'earn_dice' THEN LEAST(m.progress + 0 + v_earned::int, (SELECT target FROM public.daily_mission_definitions WHERE id = m.mission_id))
      ELSE m.progress END
    WHERE m.user_id = v_user AND m.mission_date = v_today;
END $$;

CREATE OR REPLACE FUNCTION public.claim_daily_mission_tx(_mission_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_today date := (now() AT TIME ZONE 'UTC')::date;
        v_m public.user_daily_missions; v_def public.daily_mission_definitions;
        v_streak int; v_op text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM public.ensure_club_progress_tx();
  SELECT * INTO v_m FROM public.user_daily_missions
    WHERE user_id = v_user AND mission_id = _mission_id AND mission_date = v_today FOR UPDATE;
  SELECT * INTO v_def FROM public.daily_mission_definitions WHERE id = _mission_id;
  IF v_m.user_id IS NULL OR v_def.id IS NULL THEN RAISE EXCEPTION 'Mission not found'; END IF;
  IF v_m.claimed_at IS NOT NULL THEN RAISE EXCEPTION 'Mission already claimed'; END IF;
  IF v_m.progress < v_def.target THEN RAISE EXCEPTION 'Mission is not complete'; END IF;

  UPDATE public.user_daily_missions SET claimed_at = now()
    WHERE user_id = v_user AND mission_id = _mission_id AND mission_date = v_today;
  v_op := 'daily_mission:' || v_user::text || ':' || _mission_id || ':' || v_today::text;
  PERFORM public.wallet_adjust_idem(v_user, v_def.reward_dice, 'event'::tx_type,
    'daily_mission', 'mission', NULL, v_def.title, v_op);

  SELECT CASE WHEN last_mission_claim_date = v_today - 1 THEN daily_streak + 1 ELSE 1 END
    INTO v_streak FROM public.user_progression WHERE user_id = v_user FOR UPDATE;
  UPDATE public.user_progression
    SET daily_streak = v_streak, last_mission_claim_date = v_today,
        season_xp = season_xp + v_def.reward_xp, updated_at = now()
    WHERE user_id = v_user;
  INSERT INTO public.activity_feed(user_id, kind, payload)
    VALUES (v_user, 'daily_mission', jsonb_build_object('mission', _mission_id, 'streak', v_streak, 'reward', v_def.reward_dice));
  RETURN jsonb_build_object('ok', true, 'reward', v_def.reward_dice, 'xp', v_def.reward_xp, 'streak', v_streak);
END $$;

CREATE OR REPLACE FUNCTION public.check_achievements_tx()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_wins int; v_cases int; v_baddies int; v_prestige int; v_stake int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT count(*) INTO v_wins FROM public.game_results WHERE user_id = v_user AND outcome = 'win';
  SELECT count(*) INTO v_cases FROM public.dice_transactions WHERE user_id = v_user AND source = 'baddie_case';
  SELECT count(*) INTO v_baddies FROM public.user_baddies WHERE user_id = v_user;
  SELECT count(*) INTO v_prestige FROM public.user_baddies WHERE user_id = v_user AND prestige > 0;
  SELECT COALESCE(max(abs(amount)), 0) INTO v_stake FROM public.dice_transactions WHERE user_id = v_user AND source IN ('dice_solo','slots','coinflip');

  INSERT INTO public.user_achievements(user_id, achievement_id)
  SELECT v_user, id FROM public.achievement_definitions WHERE
    (id = 'first_win' AND v_wins >= 1) OR
    (id = 'case_breaker' AND v_cases >= 10) OR
    (id = 'collector_10' AND v_baddies >= 10) OR
    (id = 'prestige_1' AND v_prestige >= 1) OR
    (id = 'high_roller' AND v_stake >= 5000)
  ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.claim_achievement_tx(_achievement_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_a public.user_achievements; v_def public.achievement_definitions; v_op text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM public.check_achievements_tx();
  SELECT * INTO v_a FROM public.user_achievements WHERE user_id = v_user AND achievement_id = _achievement_id FOR UPDATE;
  SELECT * INTO v_def FROM public.achievement_definitions WHERE id = _achievement_id;
  IF v_a.user_id IS NULL THEN RAISE EXCEPTION 'Achievement is still locked'; END IF;
  IF v_a.claimed_at IS NOT NULL THEN RAISE EXCEPTION 'Achievement already claimed'; END IF;
  UPDATE public.user_achievements SET claimed_at = now() WHERE user_id = v_user AND achievement_id = _achievement_id;
  v_op := 'achievement:' || v_user::text || ':' || _achievement_id;
  PERFORM public.wallet_adjust_idem(v_user, v_def.reward_dice, 'event'::tx_type,
    'achievement', 'achievement', NULL, v_def.title, v_op);
  RETURN jsonb_build_object('ok', true, 'reward', v_def.reward_dice);
END $$;

-- ============================================================
-- Cosmetics and season claims
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_cosmetics (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cosmetic_id text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'season_pass',
  PRIMARY KEY(user_id, cosmetic_id)
);
CREATE TABLE IF NOT EXISTS public.user_equipped_cosmetics (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  dice_skin text,
  profile_frame text,
  banner text,
  title text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.claim_season_reward_tx(_level integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_reward public.season_pass_rewards; v_xp int; v_op text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.user_progression(user_id) VALUES (v_user) ON CONFLICT DO NOTHING;
  SELECT * INTO v_reward FROM public.season_pass_rewards WHERE level = _level;
  SELECT season_xp INTO v_xp FROM public.user_progression WHERE user_id = v_user FOR UPDATE;
  IF v_reward.level IS NULL THEN RAISE EXCEPTION 'Season reward not found'; END IF;
  IF v_xp < v_reward.xp_required THEN RAISE EXCEPTION 'More season XP required'; END IF;
  INSERT INTO public.user_season_reward_claims(user_id, level) VALUES (v_user, _level)
    ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RAISE EXCEPTION 'Season reward already claimed'; END IF;
  v_op := 'season:' || v_user::text || ':' || _level::text;
  IF v_reward.reward_dice > 0 THEN
    PERFORM public.wallet_adjust_idem(v_user, v_reward.reward_dice, 'event'::tx_type,
      'season_pass', 'season', NULL, v_reward.label, v_op);
  END IF;
  IF v_reward.cosmetic_id IS NOT NULL THEN
    INSERT INTO public.user_cosmetics(user_id, cosmetic_id, source) VALUES (v_user, v_reward.cosmetic_id, 'season_pass') ON CONFLICT DO NOTHING;
  END IF;
  RETURN jsonb_build_object('ok', true, 'reward', v_reward.reward_dice, 'cosmetic_id', v_reward.cosmetic_id);
END $$;

CREATE OR REPLACE FUNCTION public.equip_cosmetic_tx(_cosmetic_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_slot text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_cosmetics WHERE user_id = v_user AND cosmetic_id = _cosmetic_id) THEN
    RAISE EXCEPTION 'Cosmetic not owned';
  END IF;
  v_slot := CASE
    WHEN _cosmetic_id LIKE 'dice-%' THEN 'dice_skin'
    WHEN _cosmetic_id LIKE 'frame-%' THEN 'profile_frame'
    WHEN _cosmetic_id LIKE 'banner-%' THEN 'banner'
    WHEN _cosmetic_id LIKE 'title-%' THEN 'title'
    ELSE NULL END;
  IF v_slot IS NULL THEN RAISE EXCEPTION 'Unknown cosmetic slot'; END IF;
  INSERT INTO public.user_equipped_cosmetics(user_id) VALUES (v_user) ON CONFLICT DO NOTHING;
  EXECUTE format('UPDATE public.user_equipped_cosmetics SET %I = $1, updated_at = now() WHERE user_id = $2', v_slot)
    USING _cosmetic_id, v_user;
  RETURN jsonb_build_object('ok', true, 'slot', v_slot, 'cosmetic_id', _cosmetic_id);
END $$;

-- ============================================================
-- Baddie Base, prestige and safe mode
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_baddie_protection_tx(_baddie_id uuid, _protected boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.user_baddies SET is_protected = _protected WHERE id = _baddie_id AND user_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Baddie not found'; END IF;
  RETURN jsonb_build_object('ok', true, 'protected', _protected);
END $$;

CREATE OR REPLACE FUNCTION public.set_baddie_base_slot_tx(_baddie_id uuid, _slot smallint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _slot IS NOT NULL AND (_slot < 1 OR _slot > 10) THEN RAISE EXCEPTION 'Base slot must be between 1 and 10'; END IF;
  IF _slot IS NOT NULL THEN
    UPDATE public.user_baddies SET base_slot = NULL WHERE user_id = v_user AND base_slot = _slot AND id <> _baddie_id;
  END IF;
  UPDATE public.user_baddies SET base_slot = _slot WHERE id = _baddie_id AND user_id = v_user AND listing_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Baddie not found or listed'; END IF;
  RETURN jsonb_build_object('ok', true, 'slot', _slot);
END $$;

CREATE OR REPLACE FUNCTION public.prestige_baddies_tx(_primary_id uuid, _material_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_primary public.user_baddies; v_material public.user_baddies;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _primary_id = _material_id THEN RAISE EXCEPTION 'Choose two different Baddies'; END IF;
  SELECT * INTO v_primary FROM public.user_baddies WHERE id = _primary_id AND user_id = v_user FOR UPDATE;
  SELECT * INTO v_material FROM public.user_baddies WHERE id = _material_id AND user_id = v_user FOR UPDATE;
  IF v_primary.id IS NULL OR v_material.id IS NULL THEN RAISE EXCEPTION 'Baddie not found'; END IF;
  IF v_primary.template_id <> v_material.template_id THEN RAISE EXCEPTION 'Prestige requires two matching Baddies'; END IF;
  IF v_primary.listing_id IS NOT NULL OR v_material.listing_id IS NOT NULL THEN RAISE EXCEPTION 'Listed Baddies cannot be used for Prestige'; END IF;
  IF v_primary.is_protected OR v_material.is_protected THEN RAISE EXCEPTION 'Disable Safe Mode before using a Baddie for Prestige'; END IF;
  DELETE FROM public.user_baddies WHERE id = _material_id;
  UPDATE public.user_baddies SET prestige = prestige + 1, variant = 'prestige' WHERE id = _primary_id;
  INSERT INTO public.activity_feed(user_id, kind, payload)
    VALUES (v_user, 'baddie_prestige', jsonb_build_object('baddie_id', _primary_id, 'template_id', v_primary.template_id));
  PERFORM public.check_achievements_tx();
  RETURN jsonb_build_object('ok', true, 'baddie_id', _primary_id, 'prestige', v_primary.prestige + 1);
END $$;

-- ============================================================
-- Crews, direct Baddie trading and tournament entry
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 3 AND 24),
  tag text NOT NULL UNIQUE CHECK (tag ~ '^[A-Z0-9]{2,5}$'),
  invite_code text NOT NULL UNIQUE,
  leader_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_dice bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.crew_members (
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('leader','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(crew_id, user_id),
  UNIQUE(user_id)
);
CREATE TABLE IF NOT EXISTS public.crew_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount bigint NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.create_crew_tx(_name text, _tag text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_crew uuid; v_code text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.crew_members WHERE user_id = v_user) THEN RAISE EXCEPTION 'Leave your current Crew first'; END IF;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  INSERT INTO public.crews(name, tag, invite_code, leader_id)
    VALUES (trim(_name), upper(trim(_tag)), v_code, v_user) RETURNING id INTO v_crew;
  INSERT INTO public.crew_members(crew_id, user_id, role) VALUES (v_crew, v_user, 'leader');
  INSERT INTO public.activity_feed(user_id, kind, payload) VALUES (v_user, 'crew_created', jsonb_build_object('crew_id', v_crew));
  INSERT INTO public.user_achievements(user_id, achievement_id) VALUES (v_user, 'crew_player') ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'crew_id', v_crew, 'invite_code', v_code);
END $$;

CREATE OR REPLACE FUNCTION public.join_crew_tx(_invite_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_crew public.crews;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.crew_members WHERE user_id = v_user) THEN RAISE EXCEPTION 'Leave your current Crew first'; END IF;
  SELECT * INTO v_crew FROM public.crews WHERE invite_code = upper(trim(_invite_code));
  IF v_crew.id IS NULL THEN RAISE EXCEPTION 'Crew invite code not found'; END IF;
  INSERT INTO public.crew_members(crew_id, user_id) VALUES (v_crew.id, v_user);
  INSERT INTO public.user_achievements(user_id, achievement_id) VALUES (v_user, 'crew_player') ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'crew_id', v_crew.id, 'name', v_crew.name);
END $$;

CREATE OR REPLACE FUNCTION public.contribute_to_crew_tx(_amount bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_crew uuid; v_op text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount < 100 OR _amount > 1000000 THEN RAISE EXCEPTION 'Contribution must be between 100 and 1,000,000 DICE'; END IF;
  SELECT crew_id INTO v_crew FROM public.crew_members WHERE user_id = v_user;
  IF v_crew IS NULL THEN RAISE EXCEPTION 'Join a Crew first'; END IF;
  v_op := 'crew_contribution:' || v_user::text || ':' || gen_random_uuid()::text;
  PERFORM public.wallet_adjust_idem(v_user, -_amount, 'event'::tx_type, 'crew', 'crew', v_crew, 'Crew contribution', v_op);
  INSERT INTO public.crew_contributions(crew_id, user_id, amount) VALUES (v_crew, v_user, _amount);
  UPDATE public.crews SET total_dice = total_dice + _amount WHERE id = v_crew;
  RETURN jsonb_build_object('ok', true, 'amount', _amount, 'crew_id', v_crew);
END $$;

CREATE TABLE IF NOT EXISTS public.baddie_trade_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offered_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offered_to uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offered_baddie_id uuid NOT NULL REFERENCES public.user_baddies(id) ON DELETE CASCADE,
  requested_baddie_id uuid NOT NULL REFERENCES public.user_baddies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','cancelled','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);
CREATE INDEX IF NOT EXISTS baddie_trade_offer_inbox_idx ON public.baddie_trade_offers(offered_to, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.create_baddie_trade_offer_tx(_target_user uuid, _offered_baddie uuid, _requested_baddie uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_id uuid; v_offered public.user_baddies; v_requested public.user_baddies;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _target_user = v_user OR _offered_baddie = _requested_baddie THEN RAISE EXCEPTION 'Invalid trade offer'; END IF;
  SELECT * INTO v_offered FROM public.user_baddies WHERE id = _offered_baddie AND user_id = v_user FOR UPDATE;
  SELECT * INTO v_requested FROM public.user_baddies WHERE id = _requested_baddie AND user_id = _target_user FOR UPDATE;
  IF v_offered.id IS NULL OR v_requested.id IS NULL THEN RAISE EXCEPTION 'Selected Baddie is no longer available'; END IF;
  IF v_offered.listing_id IS NOT NULL OR v_requested.listing_id IS NOT NULL OR v_offered.is_protected OR v_requested.is_protected THEN RAISE EXCEPTION 'Listed or protected Baddies cannot be traded'; END IF;
  INSERT INTO public.baddie_trade_offers(offered_by, offered_to, offered_baddie_id, requested_baddie_id)
    VALUES (v_user, _target_user, _offered_baddie, _requested_baddie) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'offer_id', v_id);
END $$;

CREATE OR REPLACE FUNCTION public.accept_baddie_trade_offer_tx(_offer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_offer public.baddie_trade_offers; v_a public.user_baddies; v_b public.user_baddies;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_offer FROM public.baddie_trade_offers WHERE id = _offer_id AND offered_to = v_user AND status = 'open' FOR UPDATE;
  IF v_offer.id IS NULL THEN RAISE EXCEPTION 'Trade offer is no longer available'; END IF;
  SELECT * INTO v_a FROM public.user_baddies WHERE id = v_offer.offered_baddie_id AND user_id = v_offer.offered_by FOR UPDATE;
  SELECT * INTO v_b FROM public.user_baddies WHERE id = v_offer.requested_baddie_id AND user_id = v_user FOR UPDATE;
  IF v_a.id IS NULL OR v_b.id IS NULL OR v_a.listing_id IS NOT NULL OR v_b.listing_id IS NOT NULL OR v_a.is_protected OR v_b.is_protected THEN
    UPDATE public.baddie_trade_offers SET status = 'expired' WHERE id = _offer_id;
    RAISE EXCEPTION 'A Baddie in this trade is unavailable';
  END IF;
  UPDATE public.user_baddies SET user_id = v_user, base_slot = NULL WHERE id = v_a.id;
  UPDATE public.user_baddies SET user_id = v_offer.offered_by, base_slot = NULL WHERE id = v_b.id;
  UPDATE public.baddie_trade_offers SET status = 'accepted', accepted_at = now() WHERE id = _offer_id;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.cancel_baddie_trade_offer_tx(_offer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.baddie_trade_offers SET status = 'cancelled' WHERE id = _offer_id AND offered_by = v_user AND status = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'Trade offer not found'; END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE TABLE IF NOT EXISTS public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  entry_fee bigint NOT NULL DEFAULT 0 CHECK (entry_fee >= 0),
  prize_pool bigint NOT NULL DEFAULT 0 CHECK (prize_pool >= 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','live','finished')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.tournament_entries (
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tournament_id, user_id)
);
INSERT INTO public.tournaments(title, description, starts_at, ends_at, entry_fee, prize_pool, status)
SELECT 'Weekend Dice Cup', 'Earn points from every game result. Top scores take the pot.', now(), now() + interval '7 days', 500, 25000, 'open'
WHERE NOT EXISTS (SELECT 1 FROM public.tournaments WHERE status IN ('open','live'));

CREATE OR REPLACE FUNCTION public.join_tournament_tx(_tournament_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_t public.tournaments; v_op text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_t FROM public.tournaments WHERE id = _tournament_id FOR UPDATE;
  IF v_t.id IS NULL OR v_t.status NOT IN ('open','live') OR v_t.ends_at <= now() THEN RAISE EXCEPTION 'Tournament is not open'; END IF;
  INSERT INTO public.tournament_entries(tournament_id, user_id) VALUES (_tournament_id, v_user) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RAISE EXCEPTION 'Already entered'; END IF;
  v_op := 'tournament_entry:' || _tournament_id::text || ':' || v_user::text;
  IF v_t.entry_fee > 0 THEN
    PERFORM public.wallet_adjust_idem(v_user, -v_t.entry_fee, 'event'::tx_type, 'tournament', 'tournament', _tournament_id, v_t.title, v_op);
  END IF;
  UPDATE public.tournaments SET prize_pool = prize_pool + v_t.entry_fee WHERE id = _tournament_id;
  RETURN jsonb_build_object('ok', true, 'entry_fee', v_t.entry_fee);
END $$;

-- ============================================================
-- Server-authoritative Risk Room
-- ============================================================
CREATE TABLE IF NOT EXISTS public.risk_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stake bigint NOT NULL CHECK (stake BETWEEN 100 AND 100000),
  multiplier numeric(6,2) NOT NULL,
  won boolean NOT NULL,
  payout bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.play_risk_room_tx(_stake bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_won boolean; v_mult numeric := 2.20; v_payout bigint; v_id uuid; v_op text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _stake < 100 OR _stake > 100000 THEN RAISE EXCEPTION 'Stake must be between 100 and 100,000 DICE'; END IF;
  v_op := 'risk_room:' || v_user::text || ':' || gen_random_uuid()::text;
  PERFORM public.wallet_adjust_idem(v_user, -_stake, 'event'::tx_type, 'risk_room', 'risk', NULL, 'Risk Room entry', v_op || ':stake');
  v_won := random() < 0.42;
  v_payout := CASE WHEN v_won THEN floor(_stake * v_mult)::bigint ELSE 0 END;
  IF v_payout > 0 THEN
    PERFORM public.wallet_adjust_idem(v_user, v_payout, 'event'::tx_type, 'risk_room', 'risk', NULL, 'Risk Room reward', v_op || ':payout');
  END IF;
  INSERT INTO public.risk_runs(user_id, stake, multiplier, won, payout)
    VALUES (v_user, _stake, v_mult, v_won, v_payout) RETURNING id INTO v_id;
  INSERT INTO public.activity_feed(user_id, kind, payload) VALUES (v_user, 'risk_room', jsonb_build_object('won', v_won, 'stake', _stake, 'payout', v_payout));
  RETURN jsonb_build_object('ok', true, 'run_id', v_id, 'won', v_won, 'payout', v_payout, 'multiplier', v_mult);
END $$;

-- Tournament score is generated from server-created game results only.
CREATE OR REPLACE FUNCTION public.score_tournament_game_result()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.tournament_entries e SET score = score + CASE WHEN NEW.outcome = 'win' THEN 10 WHEN NEW.outcome = 'tie' THEN 2 ELSE 1 END
  FROM public.tournaments t
  WHERE e.user_id = NEW.user_id AND e.tournament_id = t.id AND t.status IN ('open','live') AND t.starts_at <= NEW.created_at AND t.ends_at >= NEW.created_at;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS game_results_tournament_score ON public.game_results;
CREATE TRIGGER game_results_tournament_score AFTER INSERT ON public.game_results
  FOR EACH ROW EXECUTE FUNCTION public.score_tournament_game_result();

-- ============================================================
-- Access policies and RPC grants
-- ============================================================
GRANT SELECT ON public.daily_mission_definitions, public.user_progression, public.user_daily_missions,
  public.season_pass_rewards, public.user_season_reward_claims, public.achievement_definitions,
  public.user_achievements, public.user_cosmetics, public.user_equipped_cosmetics,
  public.crews, public.crew_members, public.crew_contributions, public.baddie_trade_offers,
  public.tournaments, public.tournament_entries, public.risk_runs TO authenticated;
GRANT ALL ON public.user_progression, public.user_daily_missions, public.user_season_reward_claims,
  public.user_achievements, public.user_cosmetics, public.user_equipped_cosmetics,
  public.crews, public.crew_members, public.crew_contributions, public.baddie_trade_offers,
  public.tournaments, public.tournament_entries, public.risk_runs TO service_role;

ALTER TABLE public.user_progression ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_mission_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_daily_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_pass_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_season_reward_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievement_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_cosmetics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_equipped_cosmetics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.baddie_trade_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS progression_read_own ON public.user_progression;
CREATE POLICY progression_read_own ON public.user_progression FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS daily_defs_read ON public.daily_mission_definitions;
CREATE POLICY daily_defs_read ON public.daily_mission_definitions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS daily_missions_read_own ON public.user_daily_missions;
CREATE POLICY daily_missions_read_own ON public.user_daily_missions FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS season_rewards_read ON public.season_pass_rewards;
CREATE POLICY season_rewards_read ON public.season_pass_rewards FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS season_claims_read_own ON public.user_season_reward_claims;
CREATE POLICY season_claims_read_own ON public.user_season_reward_claims FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS achievement_defs_read ON public.achievement_definitions;
CREATE POLICY achievement_defs_read ON public.achievement_definitions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS achievements_read_own ON public.user_achievements;
CREATE POLICY achievements_read_own ON public.user_achievements FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS cosmetics_read_own ON public.user_cosmetics;
CREATE POLICY cosmetics_read_own ON public.user_cosmetics FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS equipped_read_own ON public.user_equipped_cosmetics;
CREATE POLICY equipped_read_own ON public.user_equipped_cosmetics FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS crews_read ON public.crews;
CREATE POLICY crews_read ON public.crews FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS crew_members_read ON public.crew_members;
CREATE POLICY crew_members_read ON public.crew_members FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS crew_contributions_read ON public.crew_contributions;
CREATE POLICY crew_contributions_read ON public.crew_contributions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS trades_read_involved ON public.baddie_trade_offers;
CREATE POLICY trades_read_involved ON public.baddie_trade_offers FOR SELECT TO authenticated USING (offered_by = auth.uid() OR offered_to = auth.uid());
DROP POLICY IF EXISTS tournaments_read ON public.tournaments;
CREATE POLICY tournaments_read ON public.tournaments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS tournament_entries_read ON public.tournament_entries;
CREATE POLICY tournament_entries_read ON public.tournament_entries FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS risk_runs_read_own ON public.risk_runs;
CREATE POLICY risk_runs_read_own ON public.risk_runs FOR SELECT TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON FUNCTION public.ensure_club_progress_tx() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.refresh_daily_missions_tx() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_daily_mission_tx(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.check_achievements_tx() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_achievement_tx(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_season_reward_tx(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.equip_cosmetic_tx(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_baddie_protection_tx(uuid,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_baddie_base_slot_tx(uuid,smallint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.prestige_baddies_tx(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_crew_tx(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_crew_tx(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contribute_to_crew_tx(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_baddie_trade_offer_tx(uuid,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_baddie_trade_offer_tx(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_baddie_trade_offer_tx(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_tournament_tx(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.play_risk_room_tx(bigint) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.ensure_club_progress_tx(), public.refresh_daily_missions_tx(),
  public.claim_daily_mission_tx(text), public.check_achievements_tx(), public.claim_achievement_tx(text),
  public.claim_season_reward_tx(integer), public.equip_cosmetic_tx(text),
  public.set_baddie_protection_tx(uuid,boolean), public.set_baddie_base_slot_tx(uuid,smallint),
  public.prestige_baddies_tx(uuid,uuid), public.create_crew_tx(text,text), public.join_crew_tx(text),
  public.contribute_to_crew_tx(bigint), public.create_baddie_trade_offer_tx(uuid,uuid,uuid),
  public.accept_baddie_trade_offer_tx(uuid), public.cancel_baddie_trade_offer_tx(uuid),
  public.join_tournament_tx(uuid), public.play_risk_room_tx(bigint) TO authenticated;
