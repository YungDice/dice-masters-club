
CREATE OR REPLACE FUNCTION public.is_friend(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND ((requester_id = _a AND addressee_id = _b)
        OR (requester_id = _b AND addressee_id = _a))
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_profile(_viewer uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    _viewer = _target
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _target
        AND (
          p.privacy_profile = 'public'
          OR (p.privacy_profile = 'friends' AND public.is_friend(_viewer, _target))
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.is_crew_member(_user uuid, _crew uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.crew_members WHERE user_id = _user AND crew_id = _crew);
$$;

CREATE OR REPLACE FUNCTION public.is_challenge_participant(_user uuid, _challenge uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.challenge_participants WHERE user_id = _user AND challenge_id = _challenge);
$$;

REVOKE EXECUTE ON FUNCTION public.is_friend(uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_profile(uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_crew_member(uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_challenge_participant(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_friend(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_profile(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_crew_member(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_challenge_participant(uuid,uuid) TO authenticated;

DROP POLICY IF EXISTS "p_read" ON public.profiles;
CREATE POLICY "p_read" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.can_view_profile(auth.uid(), id));

DROP POLICY IF EXISTS "tags_public_read" ON public.profile_tags;
CREATE POLICY "tags_read" ON public.profile_tags
  FOR SELECT TO authenticated
  USING (public.can_view_profile(auth.uid(), user_id));

DROP POLICY IF EXISTS "ua_read" ON public.user_achievements;
CREATE POLICY "ua_read" ON public.user_achievements
  FOR SELECT TO authenticated
  USING (public.can_view_profile(auth.uid(), user_id));

DROP POLICY IF EXISTS "cp_read" ON public.challenge_participants;
CREATE POLICY "cp_read" ON public.challenge_participants
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_challenge_participant(auth.uid(), challenge_id)
    OR EXISTS (SELECT 1 FROM public.challenges c WHERE c.id = challenge_id AND c.creator_id = auth.uid())
  );

DROP POLICY IF EXISTS "crew_donations_public_read" ON public.crew_donations;
CREATE POLICY "crew_donations_read" ON public.crew_donations
  FOR SELECT TO authenticated
  USING (public.is_crew_member(auth.uid(), crew_id));

DROP POLICY IF EXISTS "crew_members_public_read" ON public.crew_members;
CREATE POLICY "crew_members_read" ON public.crew_members
  FOR SELECT TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.dominion_debit_resources(
  _user uuid, _scrap bigint, _power bigint, _roll_credits bigint
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE updated int;
BEGIN
  UPDATE public.dominion_profiles
     SET scrap = scrap - _scrap,
         power = power - _power,
         roll_credits = roll_credits - _roll_credits
   WHERE user_id = _user
     AND scrap >= _scrap
     AND power >= _power
     AND roll_credits >= _roll_credits;
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.dominion_debit_energy(
  _user uuid, _energy_cost int, _cap int, _regen_per_sec double precision
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_energy int;
BEGIN
  UPDATE public.dominion_profiles
     SET command_energy = LEAST(
           _cap,
           FLOOR(command_energy + EXTRACT(EPOCH FROM (now() - command_energy_updated_at)) * _regen_per_sec)::int
         ) - _energy_cost,
         command_energy_updated_at = now()
   WHERE user_id = _user
     AND LEAST(
           _cap,
           FLOOR(command_energy + EXTRACT(EPOCH FROM (now() - command_energy_updated_at)) * _regen_per_sec)::int
         ) >= _energy_cost
  RETURNING command_energy INTO new_energy;
  RETURN new_energy;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dominion_debit_resources(uuid,bigint,bigint,bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dominion_debit_energy(uuid,int,int,double precision) FROM PUBLIC, anon, authenticated;
