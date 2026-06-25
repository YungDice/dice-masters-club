
-- Add username change tracking
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;

-- Gallery items
CREATE TABLE IF NOT EXISTS public.gallery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_path TEXT NOT NULL,
  media_kind TEXT NOT NULL,
  caption TEXT,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gallery_items TO authenticated;
GRANT SELECT ON public.gallery_items TO anon;
GRANT ALL ON public.gallery_items TO service_role;

ALTER TABLE public.gallery_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gi_read_public" ON public.gallery_items FOR SELECT USING (is_public OR user_id = auth.uid());
CREATE POLICY "gi_ins" ON public.gallery_items FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "gi_upd" ON public.gallery_items FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "gi_del" ON public.gallery_items FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_gallery_created ON public.gallery_items (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_user ON public.gallery_items (user_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.gallery_items;

-- Username change RPC with 90-day cooldown
CREATE OR REPLACE FUNCTION public.change_username(_new_username TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
END $$;

GRANT EXECUTE ON FUNCTION public.change_username(TEXT) TO authenticated;
