-- 1) Permanent ledger so gallery like rewards are paid once per (user, item) forever
CREATE TABLE IF NOT EXISTS public.gallery_like_rewards (
  user_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.gallery_items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);
GRANT ALL ON public.gallery_like_rewards TO service_role;
ALTER TABLE public.gallery_like_rewards ENABLE ROW LEVEL SECURITY;
-- no policies: only service_role / SECURITY DEFINER code may touch this ledger

-- Backfill so existing likes are not re-rewarded
INSERT INTO public.gallery_like_rewards (user_id, item_id)
SELECT user_id, item_id FROM public.gallery_likes
ON CONFLICT DO NOTHING;

-- Atomic claim: returns true only the first time this pair is recorded
CREATE OR REPLACE FUNCTION public.claim_gallery_like_reward(_user uuid, _item uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _inserted boolean := false;
BEGIN
  INSERT INTO public.gallery_like_rewards (user_id, item_id)
  VALUES (_user, _item)
  ON CONFLICT DO NOTHING;
  _inserted := FOUND;
  RETURN _inserted;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_gallery_like_reward(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_gallery_like_reward(uuid, uuid) TO service_role;

-- 2) Atomic Dominion resource credit, guarded by the buildings' collection timestamps
CREATE OR REPLACE FUNCTION public.dominion_collect_tx(
  _user uuid,
  _building_ids uuid[],
  _expected_stamps timestamptz[],
  _scrap bigint,
  _power bigint,
  _rc bigint,
  _cap bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _claimed int := 0;
  _row public.dominion_profiles;
BEGIN
  -- Serialize concurrent collects for this player
  PERFORM pg_advisory_xact_lock(hashtext('dominion_collect:' || _user::text));

  IF _building_ids IS NOT NULL AND array_length(_building_ids, 1) > 0 THEN
    WITH expected AS (
      SELECT unnest(_building_ids) AS id, unnest(_expected_stamps) AS stamp
    ), upd AS (
      UPDATE public.dominion_buildings b
         SET last_collected_at = now()
        FROM expected e
       WHERE b.id = e.id
         AND b.user_id = _user
         AND b.last_collected_at = e.stamp
      RETURNING b.id
    )
    SELECT count(*) INTO _claimed FROM upd;

    -- Another concurrent request already collected this window
    IF _claimed <> array_length(_building_ids, 1) THEN
      SELECT * INTO _row FROM public.dominion_profiles WHERE user_id = _user;
      RETURN jsonb_build_object(
        'claimed', false,
        'scrap', _row.scrap, 'power', _row.power, 'roll_credits', _row.roll_credits
      );
    END IF;
  END IF;

  UPDATE public.dominion_profiles
     SET scrap = LEAST(_cap, scrap + GREATEST(_scrap, 0)),
         power = LEAST(_cap, power + GREATEST(_power, 0)),
         roll_credits = LEAST(_cap, roll_credits + GREATEST(_rc, 0))
   WHERE user_id = _user
  RETURNING * INTO _row;

  IF _row.user_id IS NULL THEN
    RAISE EXCEPTION 'District not initialized';
  END IF;

  RETURN jsonb_build_object(
    'claimed', true,
    'scrap', _row.scrap, 'power', _row.power, 'roll_credits', _row.roll_credits
  );
END;
$$;
REVOKE ALL ON FUNCTION public.dominion_collect_tx(uuid, uuid[], timestamptz[], bigint, bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dominion_collect_tx(uuid, uuid[], timestamptz[], bigint, bigint, bigint, bigint) TO service_role;

-- 3) Lock down internal email-queue SECURITY DEFINER helpers + pin search_path
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;

REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO postgres;
GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO postgres;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO postgres;