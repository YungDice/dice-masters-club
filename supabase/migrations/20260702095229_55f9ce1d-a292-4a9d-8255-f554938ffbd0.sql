
-- Fix wallet_adjust_idem callers with wrong signature (5-arg → 8-arg)

CREATE OR REPLACE FUNCTION public.grant_achievement(_user_id uuid, _achievement_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ach record; _rows int;
BEGIN
  IF _user_id IS NULL OR _achievement_id IS NULL THEN RETURN false; END IF;
  SELECT * INTO _ach FROM public.achievements WHERE id = _achievement_id;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.user_achievements (user_id, achievement_id)
  VALUES (_user_id, _achievement_id) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS _rows = ROW_COUNT;
  IF _rows = 0 THEN RETURN false; END IF;
  IF COALESCE(_ach.dice_reward, 0) > 0 THEN
    PERFORM public.wallet_adjust_idem(
      _user_id, _ach.dice_reward::bigint, 'event'::tx_type,
      'achievement', 'achievement', _ach.id,
      _ach.name,
      'achievement:' || _ach.id::text || ':' || _user_id::text
    );
  END IF;
  IF COALESCE(_ach.xp_reward, 0) > 0 THEN
    UPDATE public.profiles SET xp = COALESCE(xp,0) + _ach.xp_reward WHERE id = _user_id;
  END IF;
  INSERT INTO public.notifications (user_id, kind, title, body, data)
  VALUES (_user_id, 'achievement', 'Achievement Unlocked', _ach.name,
          jsonb_build_object('achievement_id', _ach.id));
  INSERT INTO public.activity_feed (user_id, kind, title, body, payload)
  VALUES (_user_id, 'achievement', 'Achievement Unlocked', _ach.name,
          jsonb_build_object('achievement_id', _ach.id, 'name', _ach.name, 'icon', _ach.icon));
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.claim_season_reward_tx(_tier int, _track text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;

-- Fix missions trigger — the game_results table uses "kind" and "outcome", not "game_type"/"won"
CREATE OR REPLACE FUNCTION public.tg_missions_from_game_result()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_won boolean;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  v_won := COALESCE(NEW.outcome = 'win', false);
  PERFORM public.mission_tick(NEW.user_id, 'play_games', 1);
  IF v_won THEN
    PERFORM public.mission_tick(NEW.user_id, 'win_any_game', 1);
    IF NEW.kind::text = 'dice' OR NEW.kind::text = 'dice_pvp' THEN
      PERFORM public.mission_tick(NEW.user_id, 'win_dice_games', 1);
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Add foreign keys so PostgREST can embed profiles for crew queries
ALTER TABLE public.crew_members
  DROP CONSTRAINT IF EXISTS crew_members_user_id_profile_fkey;
ALTER TABLE public.crew_members
  ADD CONSTRAINT crew_members_user_id_profile_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.crew_join_requests
  DROP CONSTRAINT IF EXISTS crew_join_requests_user_id_profile_fkey;
ALTER TABLE public.crew_join_requests
  ADD CONSTRAINT crew_join_requests_user_id_profile_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.crew_donations
  DROP CONSTRAINT IF EXISTS crew_donations_user_id_profile_fkey;
ALTER TABLE public.crew_donations
  ADD CONSTRAINT crew_donations_user_id_profile_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- RPC to update crew customization (avatar/banner/description) by owner/officer
CREATE OR REPLACE FUNCTION public.update_crew_customization(
  _crew_id uuid, _avatar_url text, _banner_url text, _description text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role crew_role;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT role INTO v_role FROM public.crew_members WHERE crew_id = _crew_id AND user_id = auth.uid();
  IF v_role NOT IN ('owner','officer') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.crews
     SET avatar_url  = COALESCE(_avatar_url,  avatar_url),
         banner_url  = COALESCE(_banner_url,  banner_url),
         description = COALESCE(_description, description),
         updated_at  = now()
   WHERE id = _crew_id;
END $$;
REVOKE ALL ON FUNCTION public.update_crew_customization(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_crew_customization(uuid,text,text,text) TO authenticated;
