
-- ============ Profiles: restrict reads to authenticated ============
DROP POLICY IF EXISTS p_read ON public.profiles;
CREATE POLICY p_read ON public.profiles FOR SELECT TO authenticated USING (true);

-- ============ Game rooms: restrict to authenticated only ============
DROP POLICY IF EXISTS gr_read ON public.game_rooms;
CREATE POLICY gr_read ON public.game_rooms FOR SELECT TO authenticated
  USING ((NOT is_private) OR (host_id = auth.uid()) OR EXISTS (
    SELECT 1 FROM public.game_players WHERE game_players.room_id = game_rooms.id AND game_players.user_id = auth.uid()
  ));

-- ============ Game players: restrict to authenticated participants/host ============
DROP POLICY IF EXISTS gp_read ON public.game_players;
CREATE POLICY gp_read ON public.game_players FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.game_rooms r WHERE r.id = game_players.room_id AND r.host_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.game_players gp2 WHERE gp2.room_id = game_players.room_id AND gp2.user_id = auth.uid())
  );

-- ============ Game results: restrict to authenticated participants ============
DROP POLICY IF EXISTS grs_read ON public.game_results;
CREATE POLICY grs_read ON public.game_results FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.game_players gp WHERE gp.room_id = game_results.room_id AND gp.user_id = auth.uid())
  );

-- ============ Friendships: only addressee can update status ============
DROP POLICY IF EXISTS f_upd ON public.friendships;
CREATE POLICY f_upd ON public.friendships FOR UPDATE TO authenticated
  USING (addressee_id = auth.uid())
  WITH CHECK (addressee_id = auth.uid());

-- ============ Challenge comments/likes/participants: authenticated only ============
DROP POLICY IF EXISTS cc_read ON public.challenge_comments;
CREATE POLICY cc_read ON public.challenge_comments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS cl_read ON public.challenge_likes;
CREATE POLICY cl_read ON public.challenge_likes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS cp_read ON public.challenge_participants;
CREATE POLICY cp_read ON public.challenge_participants FOR SELECT TO authenticated USING (true);

-- ============ Storage buckets: authenticated reads only ============
DROP POLICY IF EXISTS "avatars read" ON storage.objects;
CREATE POLICY "avatars read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "mkt read" ON storage.objects;
CREATE POLICY "mkt read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'marketplace');

DROP POLICY IF EXISTS "gallery_read_auth" ON storage.objects;
CREATE POLICY "gallery_read_auth" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'gallery');

DROP POLICY IF EXISTS "gallery_upd_own" ON storage.objects;
CREATE POLICY "gallery_upd_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'gallery' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'gallery' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============ VIP helper + chat enforcement ============
CREATE OR REPLACE FUNCTION public.is_vip(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND vip_until IS NOT NULL AND vip_until > now())
$$;
REVOKE ALL ON FUNCTION public.is_vip(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_vip(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Signed-in can post chat" ON public.chat_messages;
CREATE POLICY "Signed-in can post chat" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (length(coalesce(body, '')) <= 500 OR public.is_vip(auth.uid()))
    AND (media_url IS NULL OR public.is_vip(auth.uid()))
  );

-- ============ Age verification server-side in signup trigger ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE _uname TEXT; _dname TEXT; _dob DATE; _claimed_18 BOOLEAN;
BEGIN
  _uname := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1) || substr(NEW.id::text,1,4));
  _dname := COALESCE(NEW.raw_user_meta_data->>'display_name', _uname);
  _dob   := COALESCE((NEW.raw_user_meta_data->>'dob')::DATE, NULL);
  _claimed_18 := (NEW.raw_user_meta_data->>'is_18_plus')::boolean IS TRUE;

  -- Enforce 18+ server-side when DOB is provided
  IF _dob IS NOT NULL AND _dob > (CURRENT_DATE - INTERVAL '18 years') THEN
    RAISE EXCEPTION 'You must be at least 18 years old to use DICE';
  END IF;

  -- For OAuth signups with no DOB, mark as not-yet-verified
  IF _dob IS NULL THEN
    _dob := DATE '1900-01-01';
    _claimed_18 := FALSE;
  END IF;

  INSERT INTO public.profiles(id, username, display_name, dob, is_18_plus)
    VALUES (NEW.id, _uname, _dname, _dob, _claimed_18);
  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'user');
  INSERT INTO public.user_settings(user_id) VALUES (NEW.id);
  INSERT INTO public.dice_wallets(user_id, balance) VALUES (NEW.id, 500);
  INSERT INTO public.dice_transactions(user_id,type,amount,balance_before,balance_after,source,note)
    VALUES (NEW.id,'event',500,0,500,'welcome','Welcome bonus');
  RETURN NEW;
END $function$;

-- ============ Lock down SECURITY DEFINER function execute privileges ============
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.wallet_adjust(uuid, bigint, tx_type, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_adjust(uuid, bigint, tx_type, text, text, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.change_username(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_username(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
