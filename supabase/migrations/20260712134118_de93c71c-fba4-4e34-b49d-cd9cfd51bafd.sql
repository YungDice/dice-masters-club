
-- ============================================================
-- 1) Move sensitive columns off public.profiles
-- Data already replicated in public.profile_private
-- ============================================================

-- Backfill profile_private for any rows still only on profiles
INSERT INTO public.profile_private(user_id, dob, is_18_plus, terms_accepted_at)
SELECT id, dob, is_18_plus, terms_accepted_at FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- Update handle_new_user to stop writing these columns to profiles
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
  INSERT INTO public.profiles(id, username, display_name)
    VALUES (NEW.id, _uname, _dname);
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

-- Update protect trigger before dropping columns
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.vip_until    IS DISTINCT FROM OLD.vip_until    THEN NEW.vip_until    := OLD.vip_until;    END IF;
  IF NEW.level        IS DISTINCT FROM OLD.level        THEN NEW.level        := OLD.level;        END IF;
  IF NEW.xp           IS DISTINCT FROM OLD.xp           THEN NEW.xp           := OLD.xp;           END IF;
  IF NEW.tag          IS DISTINCT FROM OLD.tag          THEN NEW.tag          := OLD.tag;          END IF;
  IF NEW.reputation   IS DISTINCT FROM OLD.reputation   THEN NEW.reputation   := OLD.reputation;   END IF;
  IF NEW.streak_days  IS DISTINCT FROM OLD.streak_days  THEN NEW.streak_days  := OLD.streak_days;  END IF;
  IF NEW.username     IS DISTINCT FROM OLD.username     THEN NEW.username     := OLD.username;     END IF;
  IF NEW.username_changed_at IS DISTINCT FROM OLD.username_changed_at THEN NEW.username_changed_at := OLD.username_changed_at; END IF;
  RETURN NEW;
END $function$;

-- Drop the sensitive columns from profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS dob;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_18_plus;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS terms_accepted_at;

-- ============================================================
-- 2) crews: restrict owner UPDATE to editable columns via trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.protect_crew_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.member_count  IS DISTINCT FROM OLD.member_count  THEN NEW.member_count  := OLD.member_count;  END IF;
  IF NEW.level         IS DISTINCT FROM OLD.level         THEN NEW.level         := OLD.level;         END IF;
  IF NEW.xp            IS DISTINCT FROM OLD.xp            THEN NEW.xp            := OLD.xp;            END IF;
  IF NEW.weekly_score  IS DISTINCT FROM OLD.weekly_score  THEN NEW.weekly_score  := OLD.weekly_score;  END IF;
  IF NEW.total_score   IS DISTINCT FROM OLD.total_score   THEN NEW.total_score   := OLD.total_score;   END IF;
  IF NEW.treasury      IS DISTINCT FROM OLD.treasury      THEN NEW.treasury      := OLD.treasury;      END IF;
  IF NEW.owner_id      IS DISTINCT FROM OLD.owner_id      THEN NEW.owner_id      := OLD.owner_id;      END IF;
  IF NEW.created_at    IS DISTINCT FROM OLD.created_at    THEN NEW.created_at    := OLD.created_at;    END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_protect_crew_privileged ON public.crews;
CREATE TRIGGER trg_protect_crew_privileged
  BEFORE UPDATE ON public.crews
  FOR EACH ROW EXECUTE FUNCTION public.protect_crew_privileged_fields();

-- ============================================================
-- 3) dominion_profiles: same protection for server-controlled fields
-- ============================================================
CREATE OR REPLACE FUNCTION public.protect_dominion_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.power           IS DISTINCT FROM OLD.power           THEN NEW.power           := OLD.power;           END IF;
  IF NEW.scrap           IS DISTINCT FROM OLD.scrap           THEN NEW.scrap           := OLD.scrap;           END IF;
  IF NEW.roll_credits    IS DISTINCT FROM OLD.roll_credits    THEN NEW.roll_credits    := OLD.roll_credits;    END IF;
  IF NEW.command_energy  IS DISTINCT FROM OLD.command_energy  THEN NEW.command_energy  := OLD.command_energy;  END IF;
  IF NEW.xp              IS DISTINCT FROM OLD.xp              THEN NEW.xp              := OLD.xp;              END IF;
  IF NEW.hq_level        IS DISTINCT FROM OLD.hq_level        THEN NEW.hq_level        := OLD.hq_level;        END IF;
  IF NEW.user_id         IS DISTINCT FROM OLD.user_id         THEN NEW.user_id         := OLD.user_id;         END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_protect_dominion_profile ON public.dominion_profiles;
CREATE TRIGGER trg_protect_dominion_profile
  BEFORE UPDATE ON public.dominion_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_dominion_profile_fields();

-- ============================================================
-- 4) game_players.state: prevent leaking other players' state
-- Revoke column read; server code uses service role (bypasses column ACL).
-- ============================================================
REVOKE SELECT (state) ON public.game_players FROM anon, authenticated, PUBLIC;

-- ============================================================
-- 5) user_cosmetics: restrict SELECT to owner only
-- ============================================================
DROP POLICY IF EXISTS uc_read_own_or_public ON public.user_cosmetics;
CREATE POLICY uc_read_own ON public.user_cosmetics
  FOR SELECT USING (user_id = auth.uid());

-- ============================================================
-- 6) Set search_path on remaining mutable-search-path functions
-- ============================================================
ALTER FUNCTION public._touch_crew_missions_updated() SET search_path = public;
ALTER FUNCTION public.baddie_storage_cap(text)       SET search_path = public;
ALTER FUNCTION public.current_week_start()           SET search_path = public;
ALTER FUNCTION public.season_xp_needed_for_tier(integer) SET search_path = public;

-- ============================================================
-- 7) Restrict EXECUTE on SECURITY DEFINER functions
-- Anon should not execute any of them. Also lock down internal
-- trigger/cron functions from authenticated callers.
-- ============================================================
DO $$
DECLARE r RECORD; sig TEXT;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    sig := format('public.%I(%s)', r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', sig);
  END LOOP;
END $$;

-- Internal/trigger/cron functions: also revoke from authenticated
DO $$
DECLARE r RECORD; sig TEXT;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND (
        p.proname LIKE 'tg\_%'
        OR p.proname LIKE '\_crew\_%'
        OR p.proname LIKE 'protect\_%'
        OR p.proname IN (
          'handle_new_user',
          'expire_auctions','expire_trades','expire_vip_status',
          'cleanup_abandoned_lobbies','cleanup_stale_data',
          'seed_daily_missions','mission_tick',
          'finalize_stale_user_games','finalize_weekly_crew_rankings',
          'award_daily_leaderboard_rewards','award_idle_xp',
          'grant_achievement','evaluate_user_achievements',
          'record_game_result','pvp_payout_tx','wallet_adjust','wallet_adjust_idem',
          'assert_bet_within_limit','rate_limit_hit','grant_achievement_tx',
          'save_game_private_state','add_season_bonus_xp',
          'admin_delete_challenge_tx','admin_delete_listing_tx',
          'review_cosmetic_submission','review_proof_tx',
          'award_crew_dice_tx','_touch_crew_missions_updated'
        )
      )
  LOOP
    sig := format('public.%I(%s)', r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', sig);
  END LOOP;
END $$;
