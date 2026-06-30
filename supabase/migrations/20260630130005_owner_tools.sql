-- Owner role support and privileged owner-only actions.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('owner', 'admin', 'moderator')
  )
$$;

CREATE OR REPLACE FUNCTION public.owner_grant_role_tx(
  _actor uuid, _target uuid, _role public.app_role
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(_actor, 'owner'::public.app_role) THEN
    RAISE EXCEPTION 'Owner role required';
  END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (_target, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO public.audit_logs(actor_id, action, entity, entity_id, metadata)
    VALUES (_actor, 'grant_role', 'user', _target, jsonb_build_object('role', _role));
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.owner_grant_achievement_tx(
  _actor uuid, _target uuid, _achievement uuid, _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _name text;
BEGIN
  IF NOT public.has_role(_actor, 'owner'::public.app_role) THEN
    RAISE EXCEPTION 'Owner role required';
  END IF;
  SELECT name INTO _name FROM public.achievements WHERE id = _achievement;
  IF _name IS NULL THEN RAISE EXCEPTION 'Achievement not found'; END IF;
  INSERT INTO public.user_achievements(user_id, achievement_id)
    VALUES (_target, _achievement)
    ON CONFLICT DO NOTHING;
  INSERT INTO public.moderation_actions(moderator_id, action, target_kind, target_id, reason)
    VALUES (_actor, 'grant_achievement', 'achievement', _achievement, _reason);
  INSERT INTO public.notifications(user_id, kind, title, body, link)
    VALUES (_target, 'badge_unlock', 'Achievement unlocked', _name, '/profile');
  RETURN jsonb_build_object('ok', true, 'name', _name);
END $$;

REVOKE ALL ON FUNCTION public.owner_grant_role_tx(uuid,uuid,public.app_role) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.owner_grant_achievement_tx(uuid,uuid,uuid,text) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.owner_grant_role_tx(uuid,uuid,public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.owner_grant_achievement_tx(uuid,uuid,uuid,text) TO service_role;
