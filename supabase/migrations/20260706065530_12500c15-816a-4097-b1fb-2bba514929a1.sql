CREATE OR REPLACE FUNCTION public.finalize_stale_user_games(_uid uuid, _older_than_seconds integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  _cutoff timestamptz := now() - (GREATEST(COALESCE(_older_than_seconds, 30), 5) || ' seconds')::interval;
  _count int := 0;
  _delta bigint;
  _outcome text;
  _wagered bigint;
  _payout bigint;
  _next_state jsonb;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_user');
  END IF;

  FOR r IN
    SELECT *
    FROM public.game_rooms
    WHERE host_id = _uid
      AND status = 'active'
      AND updated_at < _cutoff
      AND kind::text IN ('blackjack','poker','flappy','obby')
      AND NOT EXISTS (
        SELECT 1 FROM public.game_results gr
        WHERE gr.room_id = game_rooms.id AND gr.user_id = _uid
      )
    ORDER BY updated_at
    LIMIT 25
  LOOP
    _wagered := COALESCE((r.state->>'bet')::bigint, r.stake, 0);
    _payout := 0;
    _delta := 0;
    _outcome := 'loss';
    _next_state := COALESCE(r.state, '{}'::jsonb);

    IF r.kind::text = 'blackjack' THEN
      _delta := -GREATEST(_wagered, 0);
      _next_state := _next_state || jsonb_build_object(
        'status', 'finished',
        'outcome', 'loss',
        'delta', _delta,
        'abandoned', true
      );
    ELSIF r.kind::text = 'poker' THEN
      _delta := -GREATEST(_wagered, 0);
      _next_state := _next_state || jsonb_build_object(
        'phase', 'finished',
        'outcome', 'none',
        'payout', 0,
        'abandoned', true
      );
    ELSIF r.kind::text = 'flappy' THEN
      _payout := COALESCE((r.state->>'reward')::bigint, 0);
      _delta := _payout;
      _outcome := CASE WHEN COALESCE((r.state->>'gates')::int, 0) > 0 THEN 'win' ELSE 'loss' END;
      _next_state := _next_state || jsonb_build_object('finished', true, 'abandoned', true);
    ELSIF r.kind::text = 'obby' THEN
      _delta := 0;
      _outcome := 'loss';
      _next_state := _next_state || jsonb_build_object('finished', true, 'abandoned', true);
    END IF;

    UPDATE public.game_rooms
    SET status = 'finished',
        state = _next_state,
        finished_at = now(),
        updated_at = now()
    WHERE id = r.id AND status = 'active';

    PERFORM public.record_game_result(
      _uid,
      r.kind::text,
      _delta,
      _outcome,
      r.id,
      jsonb_build_object('abandoned', true, 'stale_seconds', _older_than_seconds),
      _wagered,
      _payout
    );
    _count := _count + 1;
  END LOOP;

  PERFORM public.evaluate_user_achievements(_uid);
  RETURN jsonb_build_object('ok', true, 'finalized', _count);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_stale_user_games(uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_stale_user_games(uuid,integer) TO service_role;