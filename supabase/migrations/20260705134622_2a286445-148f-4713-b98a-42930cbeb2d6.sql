-- =========================================================
-- Security hardening pass
-- =========================================================

-- 1) SECURITY DEFINER view → SECURITY INVOKER (Postgres 15+)
ALTER VIEW public.user_game_stats SET (security_invoker = true);

-- 2) Pin search_path on the two remaining mutable-search-path functions
ALTER FUNCTION public.baddie_tier_mult_bp(text) SET search_path = public;
ALTER FUNCTION public.baddie_upgrade_chance(bigint, bigint, text) SET search_path = public;

-- 3) Revoke EXECUTE from anon on ALL SECURITY DEFINER functions in public.
--    Any legitimately public one can be re-granted below (there are none right now).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

-- 4) Revoke EXECUTE from authenticated on trigger functions and purely internal
--    server-only helpers. These must never be called directly from clients — they
--    run from triggers or from other SECURITY DEFINER RPCs.
REVOKE EXECUTE ON FUNCTION public.tg_ach_baddie_upgrades()           FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_ach_friendships()               FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_ach_game_results()              FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_ach_marketplace_seller()        FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_ach_upgrades()                  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_ach_user_baddies()              FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_ach_user_streaks()              FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_ach_wallet()                    FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_missions_from_chat()            FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_missions_from_game_result()     FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_missions_from_tx()              FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.grant_achievement(uuid, uuid)      FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.evaluate_user_achievements(uuid)   FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mission_tick(uuid, text, integer)  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_daily_missions(uuid)          FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_trades()                    FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_weekly_crew_rankings()    FROM authenticated;

-- 5) Restrict daily_leaderboard_rewards visibility to owner + staff.
DROP POLICY IF EXISTS daily_rewards_read_all ON public.daily_leaderboard_rewards;
CREATE POLICY daily_rewards_read_own
  ON public.daily_leaderboard_rewards
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role));

-- 6) Column-level protection: hide date-of-birth and age-verification metadata
--    from the public SELECT policy on profiles. Owner reads must go through
--    profile_private / a dedicated SECURITY DEFINER accessor.
REVOKE SELECT (dob, is_18_plus, terms_accepted_at) ON public.profiles FROM anon, authenticated, PUBLIC;
