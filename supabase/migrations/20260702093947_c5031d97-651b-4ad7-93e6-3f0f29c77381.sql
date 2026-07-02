
CREATE OR REPLACE FUNCTION public.ensure_season_progress()
RETURNS public.season_progress LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_u UUID := auth.uid(); v_s public.seasons; v_p public.season_progress; v_xp INT;
BEGIN
  IF v_u IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT * INTO v_s FROM public.current_season();
  IF v_s IS NULL THEN RAISE EXCEPTION 'no active season'; END IF;
  SELECT * INTO v_p FROM public.season_progress WHERE season_id = v_s.id AND user_id = v_u FOR UPDATE;
  IF v_p IS NULL THEN
    SELECT COALESCE(xp,0) INTO v_xp FROM public.profiles WHERE id = v_u;
    INSERT INTO public.season_progress(season_id,user_id,baseline_xp) VALUES (v_s.id, v_u, COALESCE(v_xp,0))
      RETURNING * INTO v_p;
  END IF;
  RETURN v_p;
END $$;

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
  SELECT COALESCE(xp,0) INTO v_current_xp FROM public.profiles WHERE id = v_u;
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
