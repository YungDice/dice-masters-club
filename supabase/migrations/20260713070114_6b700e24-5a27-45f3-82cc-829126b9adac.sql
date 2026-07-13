
-- 1) Reports anti-spam: prevent duplicate reports on the same target from same user,
--    and hard rate-limit to 10 reports per user per hour via BEFORE INSERT trigger.
CREATE UNIQUE INDEX IF NOT EXISTS reports_unique_reporter_target
  ON public.reports(reporter_id, target_kind, target_id)
  WHERE status IN ('open','reviewing');

CREATE OR REPLACE FUNCTION public.enforce_report_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE recent_count INT;
BEGIN
  SELECT COUNT(*) INTO recent_count
    FROM public.reports
    WHERE reporter_id = NEW.reporter_id
      AND created_at > now() - interval '1 hour';
  IF recent_count >= 10 THEN
    RAISE EXCEPTION 'Report rate limit reached. Try again later.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_report_rate_limit ON public.reports;
CREATE TRIGGER trg_enforce_report_rate_limit
  BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_report_rate_limit();

-- 2) Season leaderboard RPC (SECURITY DEFINER bypasses RLS on season_progress)
CREATE OR REPLACE FUNCTION public.leaderboard_season_pass(_limit INT DEFAULT 50)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  tag TEXT,
  level INT,
  season_xp BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH s AS (
    SELECT id FROM public.seasons WHERE active = true ORDER BY starts_at DESC LIMIT 1
  )
  SELECT p.id AS user_id, p.username, p.display_name, p.avatar_url, p.tag, p.level,
         GREATEST(0, (p.xp - COALESCE(sp.baseline_xp, 0)))::BIGINT + COALESCE(sp.bonus_xp, 0)::BIGINT AS season_xp
  FROM public.season_progress sp
  JOIN s ON sp.season_id = s.id
  JOIN public.profiles p ON p.id = sp.user_id
  ORDER BY season_xp DESC NULLS LAST
  LIMIT COALESCE(_limit, 50);
$$;

REVOKE ALL ON FUNCTION public.leaderboard_season_pass(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leaderboard_season_pass(INT) TO authenticated;
