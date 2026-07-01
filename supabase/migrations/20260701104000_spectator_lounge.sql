CREATE TABLE IF NOT EXISTS public.spectator_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('🔥','🎲','😱','👏','💀')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS spectator_reactions_room_idx ON public.spectator_reactions(room_id, created_at DESC);

GRANT SELECT ON public.spectator_reactions TO authenticated;
GRANT ALL ON public.spectator_reactions TO service_role;
ALTER TABLE public.spectator_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spectator_reactions_read_public_room ON public.spectator_reactions;
CREATE POLICY spectator_reactions_read_public_room ON public.spectator_reactions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.game_rooms r WHERE r.id = spectator_reactions.room_id AND r.is_private = false)
  );

CREATE OR REPLACE FUNCTION public.send_spectator_reaction_tx(_room_id uuid, _emoji text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_recent integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _emoji NOT IN ('🔥','🎲','😱','👏','💀') THEN RAISE EXCEPTION 'Unsupported reaction'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.game_rooms WHERE id = _room_id AND is_private = false AND status = 'active') THEN
    RAISE EXCEPTION 'Only active public rooms can be watched';
  END IF;
  SELECT count(*) INTO v_recent FROM public.spectator_reactions
    WHERE user_id = v_user AND created_at > now() - interval '60 seconds';
  IF v_recent >= 20 THEN RAISE EXCEPTION 'Slow down and enjoy the match'; END IF;
  INSERT INTO public.spectator_reactions(room_id, user_id, emoji) VALUES (_room_id, v_user, _emoji);
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.send_spectator_reaction_tx(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_spectator_reaction_tx(uuid,text) TO authenticated;
