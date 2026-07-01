CREATE OR REPLACE FUNCTION public.list_tradeable_friend_baddies_tx(_friend_id uuid)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  template_id text,
  name text,
  prestige smallint,
  trait text,
  variant text,
  rarity text,
  income_per_hour integer,
  image_url text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _friend_id IS NULL OR _friend_id = v_user THEN RAISE EXCEPTION 'Choose a friend'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'::public.friend_status
      AND ((f.requester_id = v_user AND f.addressee_id = _friend_id)
        OR (f.addressee_id = v_user AND f.requester_id = _friend_id))
  ) THEN
    RAISE EXCEPTION 'You can only trade with accepted friends';
  END IF;

  RETURN QUERY
  SELECT b.id, b.user_id, b.template_id, b.name, b.prestige, b.trait, b.variant,
         t.rarity, t.income_per_hour, t.image_url
  FROM public.user_baddies b
  JOIN public.baddie_templates t ON t.id = b.template_id
  WHERE b.user_id = _friend_id
    AND b.listing_id IS NULL
    AND b.is_protected = false
  ORDER BY t.income_per_hour DESC, b.acquired_at DESC;
END $$;

REVOKE ALL ON FUNCTION public.list_tradeable_friend_baddies_tx(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_tradeable_friend_baddies_tx(uuid) TO authenticated;
