
DROP FUNCTION IF EXISTS public.expire_auctions();
CREATE OR REPLACE FUNCTION public.expire_auctions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r public.marketplace_listings;
BEGIN
  FOR r IN
    SELECT * FROM public.marketplace_listings
    WHERE sale_type = 'auction' AND status = 'active'
      AND auction_ends_at IS NOT NULL AND auction_ends_at < now()
  LOOP
    PERFORM public.settle_auction_tx(r.id);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.expire_auctions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_auctions() TO service_role;

DROP POLICY IF EXISTS "user_baddies_friend_or_trade_read" ON public.user_baddies;
CREATE POLICY "user_baddies_friend_or_trade_read"
ON public.user_baddies
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND ((f.requester_id = auth.uid() AND f.addressee_id = user_baddies.user_id)
        OR (f.addressee_id = auth.uid() AND f.requester_id = user_baddies.user_id))
  )
  OR EXISTS (
    SELECT 1 FROM public.trades t
    WHERE (t.from_user = auth.uid() OR t.to_user = auth.uid())
      AND (user_baddies.id = ANY(t.from_baddies) OR user_baddies.id = ANY(t.to_baddies))
  )
);

CREATE OR REPLACE FUNCTION public.leaderboard_wins(_limit integer DEFAULT 50)
RETURNS TABLE (user_id uuid, wins bigint, losses bigint, rank_score bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.user_id,
         COUNT(*) FILTER (WHERE g.outcome = 'win')::bigint AS wins,
         COUNT(*) FILTER (WHERE g.outcome = 'loss')::bigint AS losses,
         (COUNT(*) FILTER (WHERE g.outcome = 'win')::bigint * 3
          - COUNT(*) FILTER (WHERE g.outcome = 'loss')::bigint)::bigint AS rank_score
  FROM public.game_results g
  WHERE g.user_id IS NOT NULL
  GROUP BY g.user_id
  HAVING COUNT(*) FILTER (WHERE g.outcome = 'win') > 0
  ORDER BY rank_score DESC, wins DESC
  LIMIT GREATEST(1, LEAST(_limit, 200));
$$;
REVOKE ALL ON FUNCTION public.leaderboard_wins(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leaderboard_wins(integer) TO authenticated;
