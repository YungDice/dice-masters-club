-- Users may collect up to three tags. A listed tag remains owned and visible
-- until the marketplace transaction actually completes.

CREATE TABLE IF NOT EXISTS public.user_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag text NOT NULL CHECK (tag ~ '^[A-Z0-9]{2,6}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_tags_tag_unique_lower ON public.user_tags (lower(tag));
CREATE UNIQUE INDEX IF NOT EXISTS user_tags_user_tag_unique_lower ON public.user_tags (user_id, lower(tag));
GRANT SELECT ON public.user_tags TO authenticated, anon;
GRANT ALL ON public.user_tags TO service_role;
ALTER TABLE public.user_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_tags_read ON public.user_tags;
CREATE POLICY user_tags_read ON public.user_tags FOR SELECT USING (true);

INSERT INTO public.user_tags(user_id, tag)
SELECT id, upper(tag) FROM public.profiles WHERE tag IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.keep_active_tag_when_listed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.tag IS NOT NULL
     AND NEW.tag IS NULL
     AND COALESCE(current_setting('app.allow_tag_transfer', true), '') <> '1' THEN
    NEW.tag := OLD.tag;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_keep_active_tag_when_listed ON public.profiles;
CREATE TRIGGER profiles_keep_active_tag_when_listed
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.keep_active_tag_when_listed();

CREATE OR REPLACE FUNCTION public.claim_collection_tag_tx(_uid uuid, _tag text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _tag_norm text := upper(trim(_tag)); _count integer;
BEGIN
  IF _tag_norm !~ '^[A-Z0-9]{2,6}$' THEN
    RAISE EXCEPTION 'Tag must be 2-6 letters or numbers';
  END IF;
  PERFORM 1 FROM public.profiles WHERE id = _uid FOR UPDATE;
  SELECT count(*) INTO _count FROM public.user_tags WHERE user_id = _uid;
  IF _count >= 3 THEN
    RAISE EXCEPTION 'You can own a maximum of 3 tags. Sell or remove one first.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.marketplace_listings
    WHERE category = 'tag' AND lower(tag_value) = lower(_tag_norm) AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'That tag is listed for sale — buy it from the marketplace.';
  END IF;
  PERFORM public.wallet_adjust(
    _uid, -5000, 'fee'::public.tx_type, 'tag_claim', NULL, NULL, 'Claim tag #' || _tag_norm
  );
  INSERT INTO public.user_tags(user_id, tag) VALUES (_uid, _tag_norm);
  PERFORM set_config('app.allow_tag_transfer', '1', true);
  UPDATE public.profiles SET tag = COALESCE(tag, _tag_norm) WHERE id = _uid;
  RETURN jsonb_build_object('ok', true, 'tag', _tag_norm);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'That tag is already taken';
END $$;

CREATE OR REPLACE FUNCTION public.list_collection_tag_tx(
  _seller uuid, _tag text, _price bigint, _sale_type text, _duration_hours integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _tag_norm text := upper(trim(_tag)); _ends timestamptz; _listing uuid;
BEGIN
  IF _price < 100 OR _price > 1000000 THEN RAISE EXCEPTION 'Invalid price'; END IF;
  IF _sale_type NOT IN ('fixed', 'auction') THEN RAISE EXCEPTION 'Invalid sale type'; END IF;
  IF _duration_hours < 1 OR _duration_hours > 168 THEN
    RAISE EXCEPTION 'Auction duration must be between 1 hour and 7 days';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_tags WHERE user_id = _seller AND tag = _tag_norm
  ) THEN
    RAISE EXCEPTION 'You do not own this tag';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.marketplace_listings
    WHERE seller_id = _seller AND category = 'tag'
      AND lower(tag_value) = lower(_tag_norm) AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'That tag already has an active listing';
  END IF;
  _ends := CASE WHEN _sale_type = 'auction'
    THEN now() + make_interval(hours => _duration_hours) ELSE NULL END;
  INSERT INTO public.marketplace_listings(
    seller_id, title, description, category, price, tag_value, sale_type,
    auction_ends_at, min_bid, ownership_confirmed, status
  ) VALUES (
    _seller, 'Tag #' || _tag_norm, 'Discord-style user tag #' || _tag_norm || '.', 'tag',
    _price, _tag_norm, _sale_type, _ends,
    CASE WHEN _sale_type = 'auction' THEN _price ELSE NULL END,
    true, 'active'
  ) RETURNING id INTO _listing;
  RETURN jsonb_build_object('ok', true, 'id', _listing);
END $$;

REVOKE ALL ON FUNCTION public.claim_collection_tag_tx(uuid,text) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.list_collection_tag_tx(uuid,text,bigint,text,integer) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.claim_collection_tag_tx(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_collection_tag_tx(uuid,text,bigint,text,integer) TO service_role;
