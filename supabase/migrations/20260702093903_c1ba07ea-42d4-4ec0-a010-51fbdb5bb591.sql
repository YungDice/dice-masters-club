
CREATE TABLE IF NOT EXISTS public.seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  xp_per_tier INT NOT NULL DEFAULT 500,
  tier_count INT NOT NULL DEFAULT 30,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.seasons TO anon, authenticated;
GRANT ALL ON public.seasons TO service_role;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seasons_public_read" ON public.seasons FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.season_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  tier INT NOT NULL,
  free_reward JSONB NOT NULL DEFAULT '{}'::jsonb,
  vip_reward JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (season_id, tier)
);
GRANT SELECT ON public.season_tiers TO anon, authenticated;
GRANT ALL ON public.season_tiers TO service_role;
ALTER TABLE public.season_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "season_tiers_public_read" ON public.season_tiers FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.season_progress (
  season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  baseline_xp INT NOT NULL DEFAULT 0,
  bonus_xp INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, user_id)
);
GRANT SELECT ON public.season_progress TO authenticated;
GRANT ALL ON public.season_progress TO service_role;
ALTER TABLE public.season_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "season_progress_self_read" ON public.season_progress FOR SELECT USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.season_claims (
  season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  tier INT NOT NULL,
  track TEXT NOT NULL CHECK (track IN ('free','vip')),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, user_id, tier, track)
);
GRANT SELECT ON public.season_claims TO authenticated;
GRANT ALL ON public.season_claims TO service_role;
ALTER TABLE public.season_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "season_claims_self_read" ON public.season_claims FOR SELECT USING (user_id = auth.uid());

-- ============ CURRENT SEASON HELPER ============
CREATE OR REPLACE FUNCTION public.current_season()
RETURNS public.seasons LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.seasons
   WHERE active = true AND now() BETWEEN starts_at AND ends_at
   ORDER BY starts_at DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.current_season() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_season() TO authenticated, service_role;

-- ============ ENSURE PROGRESS ROW ============
CREATE OR REPLACE FUNCTION public.ensure_season_progress()
RETURNS public.season_progress LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_u UUID := auth.uid(); v_s public.seasons; v_p public.season_progress; v_xp INT;
BEGIN
  IF v_u IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT * INTO v_s FROM public.current_season();
  IF v_s IS NULL THEN RAISE EXCEPTION 'no active season'; END IF;
  SELECT * INTO v_p FROM public.season_progress WHERE season_id = v_s.id AND user_id = v_u FOR UPDATE;
  IF v_p IS NULL THEN
    SELECT COALESCE(total_xp,0) INTO v_xp FROM public.profiles WHERE id = v_u;
    INSERT INTO public.season_progress(season_id,user_id,baseline_xp) VALUES (v_s.id, v_u, COALESCE(v_xp,0))
      RETURNING * INTO v_p;
  END IF;
  RETURN v_p;
END $$;
REVOKE ALL ON FUNCTION public.ensure_season_progress() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_season_progress() TO authenticated, service_role;

-- ============ ADD BONUS XP ============
CREATE OR REPLACE FUNCTION public.add_season_bonus_xp(_amount INT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_u UUID := auth.uid(); v_s public.seasons;
BEGIN
  IF v_u IS NULL OR _amount IS NULL OR _amount <= 0 THEN RETURN; END IF;
  SELECT * INTO v_s FROM public.current_season();
  IF v_s IS NULL THEN RETURN; END IF;
  PERFORM public.ensure_season_progress();
  UPDATE public.season_progress
     SET bonus_xp = bonus_xp + _amount, updated_at = now()
   WHERE season_id = v_s.id AND user_id = v_u;
END $$;
REVOKE ALL ON FUNCTION public.add_season_bonus_xp(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_season_bonus_xp(INT) TO authenticated, service_role;

-- ============ CLAIM REWARD ============
CREATE OR REPLACE FUNCTION public.claim_season_reward_tx(_tier INT, _track TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_u UUID := auth.uid(); v_s public.seasons; v_p public.season_progress;
  v_tier public.season_tiers; v_reward JSONB; v_current_xp INT;
  v_needed INT; v_kind TEXT; v_amount INT; v_is_vip BOOLEAN;
BEGIN
  IF v_u IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _track NOT IN ('free','vip') THEN RAISE EXCEPTION 'bad track'; END IF;
  SELECT * INTO v_s FROM public.current_season();
  IF v_s IS NULL THEN RAISE EXCEPTION 'no active season'; END IF;
  IF _tier < 1 OR _tier > v_s.tier_count THEN RAISE EXCEPTION 'bad tier'; END IF;

  v_p := public.ensure_season_progress();
  SELECT COALESCE(total_xp,0) INTO v_current_xp FROM public.profiles WHERE id = v_u;
  v_current_xp := GREATEST(0, v_current_xp - v_p.baseline_xp) + v_p.bonus_xp;
  v_needed := _tier * v_s.xp_per_tier;
  IF v_current_xp < v_needed THEN RAISE EXCEPTION 'tier locked'; END IF;

  IF _track = 'vip' THEN
    SELECT (vip_until IS NOT NULL AND vip_until > now()) INTO v_is_vip FROM public.profiles WHERE id = v_u;
    IF NOT COALESCE(v_is_vip,false) THEN RAISE EXCEPTION 'vip required'; END IF;
  END IF;

  SELECT * INTO v_tier FROM public.season_tiers WHERE season_id = v_s.id AND tier = _tier;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'no tier config'; END IF;

  BEGIN
    INSERT INTO public.season_claims(season_id,user_id,tier,track) VALUES (v_s.id, v_u, _tier, _track);
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'already claimed'; END;

  v_reward := CASE WHEN _track = 'free' THEN v_tier.free_reward ELSE v_tier.vip_reward END;
  v_kind := v_reward->>'kind';
  v_amount := COALESCE((v_reward->>'amount')::INT, 0);

  IF v_kind = 'dice' AND v_amount > 0 THEN
    PERFORM public.wallet_adjust_idem(v_u, v_amount, 'event'::tx_type,
      'season_pass:' || v_s.id::text || ':' || _tier::text || ':' || _track,
      jsonb_build_object('season', v_s.id, 'tier', _tier, 'track', _track));
  ELSIF v_kind = 'case_token' AND v_amount > 0 THEN
    INSERT INTO public.user_baddie_case_tokens(user_id, tokens) VALUES (v_u, v_amount)
      ON CONFLICT (user_id) DO UPDATE SET tokens = user_baddie_case_tokens.tokens + v_amount, updated_at = now();
  ELSIF v_kind = 'vip_days' AND v_amount > 0 THEN
    UPDATE public.profiles
       SET vip_until = GREATEST(COALESCE(vip_until, now()), now()) + (v_amount || ' days')::interval
     WHERE id = v_u;
  END IF;

  RETURN jsonb_build_object('ok', true, 'kind', v_kind, 'amount', v_amount);
END $$;
REVOKE ALL ON FUNCTION public.claim_season_reward_tx(INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_season_reward_tx(INT, TEXT) TO authenticated, service_role;

-- ============ SEED SEASON 1 ============
DO $$
DECLARE v_sid UUID; i INT; v_free JSONB; v_vip JSONB;
BEGIN
  IF EXISTS (SELECT 1 FROM public.seasons WHERE active = true AND now() BETWEEN starts_at AND ends_at) THEN
    RETURN;
  END IF;
  INSERT INTO public.seasons(name, starts_at, ends_at, xp_per_tier, tier_count, active)
    VALUES ('Season 1: Golden Rush', now(), now() + interval '30 days', 500, 30, true)
    RETURNING id INTO v_sid;

  FOR i IN 1..30 LOOP
    -- Free track: 200 DICE base, case token every 10 tiers, 500 at tier 30
    IF i % 10 = 0 THEN
      v_free := jsonb_build_object('kind','case_token','amount',1);
    ELSIF i = 15 THEN
      v_free := jsonb_build_object('kind','dice','amount',500);
    ELSE
      v_free := jsonb_build_object('kind','dice','amount',200);
    END IF;

    -- VIP track: 500 DICE base, case token every 5 tiers, VIP day at 10/20, big at 30
    IF i = 30 THEN
      v_vip := jsonb_build_object('kind','case_token','amount',5);
    ELSIF i % 10 = 0 THEN
      v_vip := jsonb_build_object('kind','vip_days','amount',1);
    ELSIF i % 5 = 0 THEN
      v_vip := jsonb_build_object('kind','case_token','amount',1);
    ELSE
      v_vip := jsonb_build_object('kind','dice','amount',500);
    END IF;

    INSERT INTO public.season_tiers(season_id, tier, free_reward, vip_reward)
      VALUES (v_sid, i, v_free, v_vip);
  END LOOP;
END $$;
