
-- 2) Promote @dice (mgmt.yungdice@gmail.com) to owner
DO $$
DECLARE _uid uuid;
BEGIN
  SELECT u.id INTO _uid
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.email = 'mgmt.yungdice@gmail.com' OR p.username = 'dice'
  ORDER BY u.created_at ASC LIMIT 1;
  IF _uid IS NOT NULL THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (_uid, 'owner')
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;

-- 3) is_staff includes owner
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('owner','admin','moderator'))
$$;

-- 4) Role-assignment protection trigger
CREATE OR REPLACE FUNCTION public.protect_role_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid();
BEGIN
  -- Service role / SECURITY DEFINER paths (e.g. handle_new_user signup) bypass
  IF _caller IS NULL THEN RETURN NEW; END IF;
  -- 'user' role can always be assigned (e.g. by signup trigger)
  IF NEW.role = 'user' THEN RETURN NEW; END IF;
  -- For owner/admin/moderator: caller must already be owner
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _caller AND role = 'owner') THEN
    RAISE EXCEPTION 'Only an owner can assign the % role', NEW.role;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_role_ins ON public.user_roles;
DROP TRIGGER IF EXISTS trg_protect_role_upd ON public.user_roles;
CREATE TRIGGER trg_protect_role_ins BEFORE INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_role_assignment();
CREATE TRIGGER trg_protect_role_upd BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_role_assignment();

-- 5) Periodic cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_stale_data()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Finished or cancelled game rooms older than 24h (cascades to players/results via FK)
  DELETE FROM public.game_rooms
   WHERE status IN ('finished','cancelled')
     AND COALESCE(finished_at, updated_at, created_at) < now() - INTERVAL '24 hours';
  -- Waiting rooms with no activity for 24h
  DELETE FROM public.game_rooms
   WHERE status = 'waiting' AND created_at < now() - INTERVAL '24 hours';
  -- Stale game invites
  DELETE FROM public.game_invites WHERE created_at < now() - INTERVAL '24 hours';
  -- Chat messages older than 24h
  DELETE FROM public.chat_messages WHERE created_at < now() - INTERVAL '24 hours';
  -- Read notifications older than 7 days
  DELETE FROM public.notifications WHERE read_at IS NOT NULL AND created_at < now() - INTERVAL '7 days';
  -- Expired marketplace listings older than 7 days
  DELETE FROM public.marketplace_listings
   WHERE status IN ('expired','rejected') AND updated_at < now() - INTERVAL '7 days';
END $$;

REVOKE ALL ON FUNCTION public.cleanup_stale_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_data() TO service_role;

-- 6) Enable pg_cron and schedule daily cleanup at 03:00 UTC
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$ BEGIN
  PERFORM cron.unschedule('dice-cleanup-daily');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('dice-cleanup-daily', '0 3 * * *', $$ SELECT public.cleanup_stale_data(); $$);
