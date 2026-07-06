
-- 1) Season Pass: progressive XP curve + infinite tiers past tier_count (500 DICE each)
CREATE OR REPLACE FUNCTION public.season_xp_needed_for_tier(_tier integer)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
  -- cumulative XP needed to REACH tier _tier
  -- tier k (k>=1) costs 1000 + 250*(k-1); total = 875*T + 125*T*T
  SELECT (875::bigint * _tier + 125::bigint * _tier * _tier)::bigint;
$$;

CREATE OR REPLACE FUNCTION public.claim_season_reward_tx(_tier integer, _track text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_u UUID := auth.uid(); v_s public.seasons; v_p public.season_progress;
  v_tier public.season_tiers; v_reward JSONB; v_current_xp BIGINT;
  v_needed BIGINT; v_kind TEXT; v_amount INT; v_is_vip BOOLEAN;
BEGIN
  IF v_u IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _track NOT IN ('free','vip') THEN RAISE EXCEPTION 'bad track'; END IF;
  SELECT * INTO v_s FROM public.current_season();
  IF v_s IS NULL THEN RAISE EXCEPTION 'no active season'; END IF;
  IF _tier < 1 THEN RAISE EXCEPTION 'bad tier'; END IF;
  v_p := public.ensure_season_progress();
  SELECT COALESCE(xp,0) INTO v_current_xp FROM public.profiles WHERE id = v_u;
  v_current_xp := GREATEST(0, v_current_xp - v_p.baseline_xp) + v_p.bonus_xp;
  v_needed := public.season_xp_needed_for_tier(_tier);
  IF v_current_xp < v_needed THEN RAISE EXCEPTION 'tier locked'; END IF;
  IF _track = 'vip' THEN
    SELECT (vip_until IS NOT NULL AND vip_until > now()) INTO v_is_vip FROM public.profiles WHERE id = v_u;
    IF NOT COALESCE(v_is_vip,false) THEN RAISE EXCEPTION 'vip required'; END IF;
  END IF;

  BEGIN
    INSERT INTO public.season_claims(season_id,user_id,tier,track) VALUES (v_s.id, v_u, _tier, _track);
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'already claimed'; END;

  IF _tier <= v_s.tier_count THEN
    SELECT * INTO v_tier FROM public.season_tiers WHERE season_id = v_s.id AND tier = _tier;
    IF v_tier IS NULL THEN RAISE EXCEPTION 'no tier config'; END IF;
    v_reward := CASE WHEN _track = 'free' THEN v_tier.free_reward ELSE v_tier.vip_reward END;
    v_kind := v_reward->>'kind';
    v_amount := COALESCE((v_reward->>'amount')::INT, 0);
  ELSE
    -- Prestige tiers: 500 DICE for each additional tier, on both tracks
    v_kind := 'dice';
    v_amount := 500;
  END IF;

  IF v_kind = 'dice' AND v_amount > 0 THEN
    PERFORM public.wallet_adjust_idem(
      v_u, v_amount::bigint, 'event'::tx_type,
      'season_pass', 'season_tier', NULL::uuid,
      'Season pass tier ' || _tier || ' (' || _track || ')',
      'season_pass:' || v_s.id::text || ':' || _tier::text || ':' || _track
    );
  ELSIF v_kind = 'case_token' AND v_amount > 0 THEN
    INSERT INTO public.user_baddie_case_tokens(user_id, tokens) VALUES (v_u, v_amount)
      ON CONFLICT (user_id) DO UPDATE SET tokens = user_baddie_case_tokens.tokens + v_amount, updated_at = now();
  ELSIF v_kind = 'vip_days' AND v_amount > 0 THEN
    UPDATE public.profiles
       SET vip_until = GREATEST(COALESCE(vip_until, now()), now()) + (v_amount || ' days')::interval
     WHERE id = v_u;
  END IF;
  RETURN jsonb_build_object('ok', true, 'kind', v_kind, 'amount', v_amount);
END $function$;

-- 2) Kuro yuri picture
UPDATE public.yuri_templates
SET image_url = '/__l5e/assets-v1/6e8b01a3-991f-4858-815c-b90e71360edd/yuri-kuro.png'
WHERE id = 'yuri_kuro';

-- 3) Refund + clear all waiting multiplayer blackjack lobbies
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, host_id, stake FROM public.game_rooms WHERE status='waiting' AND kind='blackjack' LOOP
    BEGIN
      PERFORM public.wallet_adjust(r.host_id, r.stake::bigint, 'refund'::tx_type,
        'blackjack_mp', 'blackjack', r.id, 'Lobby cancelled — cleanup');
    EXCEPTION WHEN OTHERS THEN NULL; END;
    UPDATE public.game_rooms SET status='cancelled', finished_at=now() WHERE id=r.id;
  END LOOP;
END $$;
