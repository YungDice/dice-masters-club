
-- 1) Force challenges INSERT by non-staff to pending_review
CREATE OR REPLACE FUNCTION public.tg_challenge_status_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_staff(auth.uid()) THEN
    NEW.status := 'pending_review';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_challenge_status_guard ON public.challenges;
CREATE TRIGGER trg_challenge_status_guard
BEFORE INSERT ON public.challenges
FOR EACH ROW EXECUTE FUNCTION public.tg_challenge_status_guard();

-- 2) Revoke EXECUTE on SECURITY DEFINER functions from anon/authenticated/public
-- except the small set that the client legitimately calls.
DO $$
DECLARE r record;
  keep text[] := ARRAY[
    'has_role','is_staff','is_vip',
    'change_username',
    'open_baddie_case_tx','collect_baddie_tx','sell_baddie_tx','buy_baddie_slot_tx'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    IF NOT (r.proname = ANY(keep)) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
      EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', r.sig);
    END IF;
  END LOOP;
END $$;

-- Ensure the kept ones are callable from the client.
GRANT EXECUTE ON FUNCTION public.change_username(text)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_baddie_case_tx()                TO authenticated;
GRANT EXECUTE ON FUNCTION public.collect_baddie_tx(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.sell_baddie_tx(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.buy_baddie_slot_tx()                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_vip(uuid)                         TO authenticated;

-- 3) Column-level privacy on profiles: hide dob / is_18_plus / terms_accepted_at
--    from anon and authenticated. service_role keeps full access.
REVOKE SELECT (dob, is_18_plus, terms_accepted_at) ON public.profiles FROM anon, authenticated, PUBLIC;

-- 4) Column-level privacy on game_players: never expose `state` (may carry hidden
--    per-player game state) to other authenticated users. Server uses service_role.
REVOKE SELECT (state) ON public.game_players FROM anon, authenticated, PUBLIC;
