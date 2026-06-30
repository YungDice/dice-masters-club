-- Presence, daily streaks, global game totals and central bet limits.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_streak_at timestamptz;

CREATE OR REPLACE FUNCTION public.touch_daily_streak(_uid uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _last_day date;
  _today date := (now() AT TIME ZONE 'UTC')::date;
  _streak integer;
BEGIN
  SELECT (last_streak_at AT TIME ZONE 'UTC')::date, COALESCE(streak_days, 0)
    INTO _last_day, _streak
  FROM public.profiles
  WHERE id = _uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  IF _last_day IS NULL THEN
    _streak := 1;
  ELSIF _last_day = _today THEN
    UPDATE public.profiles SET last_seen_at = now(), last_login_at = now() WHERE id = _uid;
    RETURN _streak;
  ELSIF _last_day = _today - 1 THEN
    _streak := _streak + 1;
  ELSE
    _streak := 1;
  END IF;

  UPDATE public.profiles
     SET streak_days = _streak,
         last_streak_at = now(),
         last_seen_at = now(),
         last_login_at = now()
   WHERE id = _uid;
  RETURN _streak;
END $$;

CREATE OR REPLACE FUNCTION public.touch_presence()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _streak integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _streak := public.touch_daily_streak(_uid);
  RETURN jsonb_build_object('ok', true, 'streak_days', _streak);
END $$;

REVOKE ALL ON FUNCTION public.touch_presence() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_presence() TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_daily_tx(_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _op text; _streak integer;
BEGIN
  _op := 'daily:' || _uid::text || ':' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
  IF EXISTS (SELECT 1 FROM public.dice_transactions WHERE operation_id = _op) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;
  _streak := public.touch_daily_streak(_uid);
  PERFORM public.wallet_adjust_idem(
    _uid, 100, 'daily_reward'::public.tx_type, 'daily', NULL, NULL,
    'Daily login reward', _op
  );
  RETURN jsonb_build_object('ok', true, 'reward', 100, 'streak_days', _streak);
END $$;

-- Every game uses wallet_adjust for its stake, so this enforces the limit even
-- when a particular game page has an older client-side validator.
CREATE OR REPLACE FUNCTION public.wallet_adjust(
  _user uuid, _delta bigint, _type public.tx_type, _source text,
  _ref_kind text, _ref_id uuid, _note text
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _bef bigint; _aft bigint; _vip boolean; _limit bigint;
BEGIN
  IF _type = 'game_stake'::public.tx_type AND _delta < 0 THEN
    SELECT COALESCE(vip_until > now(), false) INTO _vip FROM public.profiles WHERE id = _user;
    _limit := CASE WHEN COALESCE(_vip, false) THEN 10000 ELSE 2000 END;
    IF -_delta > _limit THEN
      RAISE EXCEPTION 'Maximum bet is % DICE for your account', _limit;
    END IF;
  END IF;

  INSERT INTO public.dice_wallets(user_id) VALUES (_user) ON CONFLICT DO NOTHING;
  SELECT balance INTO _bef FROM public.dice_wallets WHERE user_id = _user FOR UPDATE;
  _aft := _bef + _delta;
  IF _aft < 0 THEN RAISE EXCEPTION 'Insufficient DICE balance'; END IF;
  UPDATE public.dice_wallets SET balance = _aft,
    lifetime_earned = lifetime_earned + GREATEST(_delta, 0),
    lifetime_spent = lifetime_spent + GREATEST(-_delta, 0),
    updated_at = now()
  WHERE user_id = _user;
  INSERT INTO public.dice_transactions(user_id,type,amount,balance_before,balance_after,source,ref_kind,ref_id,note)
    VALUES (_user,_type,_delta,_bef,_aft,_source,_ref_kind,_ref_id,_note);
  RETURN _aft;
END $$;

CREATE TABLE IF NOT EXISTS public.user_game_stats (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  games integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_game_stats TO authenticated, anon;
GRANT ALL ON public.user_game_stats TO service_role;
ALTER TABLE public.user_game_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_game_stats_read ON public.user_game_stats;
CREATE POLICY user_game_stats_read ON public.user_game_stats FOR SELECT USING (true);

INSERT INTO public.user_game_stats(user_id, wins, losses, games, updated_at)
SELECT user_id,
       COUNT(*) FILTER (WHERE outcome = 'win'),
       COUNT(*) FILTER (WHERE outcome = 'loss'),
       COUNT(*) FILTER (WHERE outcome IN ('win', 'loss', 'tie')),
       now()
FROM public.game_results
GROUP BY user_id
ON CONFLICT (user_id) DO UPDATE SET
  wins = EXCLUDED.wins,
  losses = EXCLUDED.losses,
  games = EXCLUDED.games,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.rollup_game_result()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_game_stats(user_id, wins, losses, games, updated_at)
  VALUES (
    NEW.user_id,
    CASE WHEN NEW.outcome = 'win' THEN 1 ELSE 0 END,
    CASE WHEN NEW.outcome = 'loss' THEN 1 ELSE 0 END,
    CASE WHEN NEW.outcome IN ('win', 'loss', 'tie') THEN 1 ELSE 0 END,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    wins = public.user_game_stats.wins + EXCLUDED.wins,
    losses = public.user_game_stats.losses + EXCLUDED.losses,
    games = public.user_game_stats.games + EXCLUDED.games,
    updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS game_results_rollup_stats ON public.game_results;
CREATE TRIGGER game_results_rollup_stats
AFTER INSERT ON public.game_results
FOR EACH ROW EXECUTE FUNCTION public.rollup_game_result();
