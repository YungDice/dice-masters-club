
-- Daily leaderboard rewards system
CREATE TABLE IF NOT EXISTS public.daily_xp_snapshots (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.daily_xp_snapshots TO authenticated;
GRANT ALL ON public.daily_xp_snapshots TO service_role;
ALTER TABLE public.daily_xp_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "snapshots_read_own" ON public.daily_xp_snapshots FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.daily_leaderboard_rewards (
  reward_date date NOT NULL,
  rank int NOT NULL CHECK (rank BETWEEN 1 AND 3),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  xp_gained bigint NOT NULL DEFAULT 0,
  dice_awarded bigint NOT NULL DEFAULT 0,
  vip_hours int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reward_date, rank)
);
GRANT SELECT ON public.daily_leaderboard_rewards TO authenticated;
GRANT ALL ON public.daily_leaderboard_rewards TO service_role;
ALTER TABLE public.daily_leaderboard_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_rewards_read_all" ON public.daily_leaderboard_rewards FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.award_daily_leaderboard_rewards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'UTC')::date;
  _yday  date := _today - 1;
  _rank int := 0;
  _amounts bigint[] := ARRAY[1500, 750, 500];
  _vip_hours int[] := ARRAY[24, 12, 0];
  _row record;
  _winners jsonb := '[]'::jsonb;
  _base timestamptz;
BEGIN
  -- Idempotent on date
  IF EXISTS (SELECT 1 FROM public.daily_leaderboard_rewards WHERE reward_date = _yday) THEN
    -- still refresh today's snapshots
    INSERT INTO public.daily_xp_snapshots (user_id, xp, updated_at)
      SELECT id, xp, now() FROM public.profiles
      ON CONFLICT (user_id) DO UPDATE SET xp = EXCLUDED.xp, updated_at = now();
    RETURN jsonb_build_object('ok', false, 'reason', 'already_awarded');
  END IF;

  FOR _row IN
    SELECT p.id AS user_id,
           p.xp,
           COALESCE(s.xp, 0) AS prev_xp,
           (p.xp - COALESCE(s.xp, 0)) AS gained
    FROM public.profiles p
    LEFT JOIN public.daily_xp_snapshots s ON s.user_id = p.id
    WHERE p.xp > COALESCE(s.xp, 0)
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
      UPDATE public.profiles SET vip_until = _base + (_vip_hours[_rank] || ' hours')::interval
        WHERE id = _row.user_id;
    END IF;
    INSERT INTO public.daily_leaderboard_rewards (reward_date, rank, user_id, xp_gained, dice_awarded, vip_hours)
      VALUES (_yday, _rank, _row.user_id, _row.gained, _amounts[_rank], _vip_hours[_rank]);
    INSERT INTO public.notifications (user_id, kind, title, body, link)
      VALUES (_row.user_id, 'event', 'Daily leaderboard reward!',
        'You finished #' || _rank || ' yesterday — +' || _amounts[_rank] || ' DICE' ||
        CASE WHEN _vip_hours[_rank] > 0 THEN ' & ' || _vip_hours[_rank] || 'h VIP' ELSE '' END,
        '/leaderboard');
    _winners := _winners || jsonb_build_object('rank', _rank, 'user_id', _row.user_id, 'gained', _row.gained);
  END LOOP;

  -- Refresh snapshots for next day
  INSERT INTO public.daily_xp_snapshots (user_id, xp, updated_at)
    SELECT id, xp, now() FROM public.profiles
    ON CONFLICT (user_id) DO UPDATE SET xp = EXCLUDED.xp, updated_at = now();

  RETURN jsonb_build_object('ok', true, 'date', _yday, 'winners', _winners);
END $$;

REVOKE EXECUTE ON FUNCTION public.award_daily_leaderboard_rewards() FROM PUBLIC, anon, authenticated;

-- Schedule daily at 00:05 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('award-daily-leaderboard') WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'award-daily-leaderboard'
    );
    PERFORM cron.schedule('award-daily-leaderboard', '5 0 * * *',
      $cron$SELECT public.award_daily_leaderboard_rewards();$cron$);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Seed snapshots so the first day has a baseline (no rewards before tomorrow)
INSERT INTO public.daily_xp_snapshots (user_id, xp)
  SELECT id, xp FROM public.profiles
  ON CONFLICT (user_id) DO NOTHING;
