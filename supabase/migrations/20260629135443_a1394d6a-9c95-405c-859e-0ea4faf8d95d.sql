
REVOKE ALL ON FUNCTION public.award_daily_leaderboard_rewards() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_daily_leaderboard_rewards() TO service_role;
