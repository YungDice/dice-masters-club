
-- 1) Backfill any non-standard outcome values to canonical ones.
UPDATE public.game_results SET outcome = 'tie'
  WHERE outcome IN ('draw','tied','push','neutral');
UPDATE public.game_results SET outcome = 'win'  WHERE outcome IN ('victory','won');
UPDATE public.game_results SET outcome = 'loss' WHERE outcome IN ('defeat','lost');
UPDATE public.game_results SET outcome = 'tie'  WHERE outcome IS NULL OR outcome NOT IN ('win','loss','tie');

-- 2) Enforce canonical values going forward.
ALTER TABLE public.game_results
  DROP CONSTRAINT IF EXISTS game_results_outcome_check;
ALTER TABLE public.game_results
  ALTER COLUMN outcome SET NOT NULL,
  ADD CONSTRAINT game_results_outcome_check CHECK (outcome IN ('win','loss','tie'));

-- 3) Rewrite the stats function so wins + losses + draws == games_played.
CREATE OR REPLACE FUNCTION public.get_user_profile_stats(_uid uuid)
RETURNS TABLE (
  user_id uuid,
  games_played bigint,
  wins bigint,
  losses bigint,
  draws bigint,
  wagered bigint,
  payout bigint,
  net bigint,
  win_loss_ratio numeric,
  rank_score numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _uid AS user_id,
    COALESCE(COUNT(*), 0)::bigint AS games_played,
    COALESCE(COUNT(*) FILTER (WHERE outcome = 'win'),  0)::bigint AS wins,
    COALESCE(COUNT(*) FILTER (WHERE outcome = 'loss'), 0)::bigint AS losses,
    COALESCE(COUNT(*) FILTER (WHERE outcome = 'tie'),  0)::bigint AS draws,
    COALESCE(SUM(wagered), 0)::bigint AS wagered,
    COALESCE(SUM(payout),  0)::bigint AS payout,
    COALESCE(SUM(delta),   0)::bigint AS net,
    CASE
      WHEN COALESCE(COUNT(*) FILTER (WHERE outcome = 'loss'), 0) = 0
        THEN COALESCE(COUNT(*) FILTER (WHERE outcome = 'win'), 0)::numeric
      ELSE ROUND(
        COALESCE(COUNT(*) FILTER (WHERE outcome = 'win'), 0)::numeric
        / NULLIF(COUNT(*) FILTER (WHERE outcome = 'loss'), 0)::numeric, 3)
    END AS win_loss_ratio,
    (COALESCE(COUNT(*) FILTER (WHERE outcome = 'win'), 0) * GREATEST(
      CASE
        WHEN COALESCE(COUNT(*) FILTER (WHERE outcome = 'loss'), 0) = 0
          THEN GREATEST(COALESCE(COUNT(*) FILTER (WHERE outcome = 'win'), 0), 1)::numeric
        ELSE COALESCE(COUNT(*) FILTER (WHERE outcome = 'win'), 0)::numeric
             / NULLIF(COUNT(*) FILTER (WHERE outcome = 'loss'), 0)::numeric
      END, 0.3))::numeric(12,2) AS rank_score
  FROM public.game_results
  WHERE user_id = _uid;
$$;
