
-- Gallery likes table
CREATE TABLE public.gallery_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.gallery_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.gallery_likes TO authenticated;
GRANT ALL ON public.gallery_likes TO service_role;
ALTER TABLE public.gallery_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed-in can view likes" ON public.gallery_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can like" ON public.gallery_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike own" ON public.gallery_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.gallery_likes;

-- Global chat
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.chat_messages TO authenticated;
GRANT DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in can read chat" ON public.chat_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Signed-in can post chat" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Author or staff can delete" ON public.chat_messages FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_staff(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

CREATE INDEX chat_messages_created_idx ON public.chat_messages (created_at DESC);
