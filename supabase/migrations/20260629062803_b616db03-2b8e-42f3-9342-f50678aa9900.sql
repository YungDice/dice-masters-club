
-- Convert helpers to SECURITY INVOKER (they only need to read rows the caller can already see)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','moderator'))
$$;

CREATE OR REPLACE FUNCTION public.is_vip(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND vip_until IS NOT NULL AND vip_until > now())
$$;

CREATE OR REPLACE FUNCTION public.change_username(_new_username text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $function$
DECLARE _uid UUID := auth.uid(); _last TIMESTAMPTZ; _days INT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _new_username !~ '^[a-zA-Z0-9_]{3,20}$' THEN
    RAISE EXCEPTION 'Username must be 3-20 chars, letters/numbers/underscore only';
  END IF;
  SELECT username_changed_at INTO _last FROM public.profiles WHERE id = _uid;
  IF _last IS NOT NULL THEN
    _days := EXTRACT(DAY FROM (now() - _last))::INT;
    IF _days < 90 THEN
      RAISE EXCEPTION 'You can change your username again in % days', (90 - _days);
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(_new_username) AND id <> _uid) THEN
    RAISE EXCEPTION 'Username already taken';
  END IF;
  UPDATE public.profiles SET username = _new_username, username_changed_at = now() WHERE id = _uid;
  RETURN jsonb_build_object('ok', true, 'username', _new_username);
END $function$;
