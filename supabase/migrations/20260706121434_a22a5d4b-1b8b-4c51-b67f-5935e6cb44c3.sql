
-- ============ 1. Fix game_rooms/game_players RLS infinite recursion ============
-- SECURITY DEFINER helpers that bypass RLS, breaking the policy cycle.

CREATE OR REPLACE FUNCTION public._is_room_participant(_room_id uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.game_players
    WHERE room_id = _room_id AND user_id = _uid
  );
$$;

CREATE OR REPLACE FUNCTION public._is_room_host(_room_id uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.game_rooms WHERE id = _room_id AND host_id = _uid
  );
$$;

DROP POLICY IF EXISTS gr_read ON public.game_rooms;
CREATE POLICY gr_read ON public.game_rooms FOR SELECT TO authenticated
  USING (
    (NOT is_private)
    OR host_id = auth.uid()
    OR public._is_room_participant(id, auth.uid())
  );

DROP POLICY IF EXISTS gp_read ON public.game_players;
CREATE POLICY gp_read ON public.game_players FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public._is_room_host(room_id, auth.uid())
    OR public._is_room_participant(room_id, auth.uid())
  );

-- ============ 2. Add user_emoji to profiles (shown next to nickname) ============
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_emoji text;

-- ============ 3. Crew: owner awards DICE to a member from the crew bank ============
-- Deducts from crews.total_score, credits target's wallet, logs an activity row.
CREATE OR REPLACE FUNCTION public.award_crew_dice_tx(_target uuid, _amount integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _crew_id uuid;
  _bank integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount IS NULL OR _amount < 10 OR _amount > 1000000 THEN
    RAISE EXCEPTION 'Amount must be between 10 and 1,000,000';
  END IF;

  -- caller must be crew owner
  SELECT crew_id INTO _crew_id
  FROM public.crew_members
  WHERE user_id = _uid AND role = 'owner'
  LIMIT 1;
  IF _crew_id IS NULL THEN RAISE EXCEPTION 'Only the crew owner can award DICE'; END IF;

  -- target must be a member of the same crew
  IF NOT EXISTS (
    SELECT 1 FROM public.crew_members
    WHERE crew_id = _crew_id AND user_id = _target
  ) THEN
    RAISE EXCEPTION 'Target is not a member of your crew';
  END IF;

  -- check bank
  SELECT total_score INTO _bank FROM public.crews WHERE id = _crew_id FOR UPDATE;
  IF _bank < _amount THEN RAISE EXCEPTION 'Crew bank has insufficient points (%)', _bank; END IF;

  -- deduct from bank
  UPDATE public.crews SET total_score = total_score - _amount WHERE id = _crew_id;

  -- credit target wallet
  PERFORM public.wallet_adjust(
    _target, _amount, 'crew_award', 'crew', 'crew', _crew_id, 'Crew award'
  );

  RETURN jsonb_build_object('ok', true, 'amount', _amount, 'target', _target, 'crew_id', _crew_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_crew_dice_tx(uuid, integer) TO authenticated;
