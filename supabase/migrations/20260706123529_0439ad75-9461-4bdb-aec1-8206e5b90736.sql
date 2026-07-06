
-- Yuri autosell + sell RPC
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS yuri_autosell_rarities text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.set_yuri_autosell_rarities(_rarities text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cleaned text[];
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT COALESCE(array_agg(DISTINCT r), '{}')
  INTO cleaned
  FROM unnest(_rarities) r
  WHERE r IN ('common','uncommon','rare','epic','legendary');
  UPDATE public.profiles SET yuri_autosell_rarities = cleaned WHERE id = uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.sell_yuri_tx(_yuri_id uuid)
RETURNS TABLE(price integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  y record;
  rate integer;
  sell_price integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT y.*, t.income_per_hour AS iph, t.rarity AS rar
  INTO y
  FROM public.user_yuri y
  JOIN public.yuri_templates t ON t.id = y.template_id
  WHERE y.id = _yuri_id AND y.user_id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  rate := COALESCE(y.iph, 100);
  sell_price := GREATEST(1, rate * 4); -- ~4h income sell value
  DELETE FROM public.user_yuri WHERE id = _yuri_id AND user_id = uid;
  PERFORM public.wallet_adjust(uid, sell_price::bigint, 'sell'::tx_type, 'yuri_sell', 'yuri', _yuri_id, 'Yuri sold');
  price := sell_price;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_yuri_autosell_rarities(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sell_yuri_tx(uuid) TO authenticated;

-- Crew leaderboard: returns crews sorted by chosen metric
CREATE OR REPLACE FUNCTION public.leaderboard_crews(_order text DEFAULT 'total', _limit integer DEFAULT 50)
RETURNS TABLE(id uuid, name text, tag text, avatar_url text, level integer, total_score integer, weekly_score integer, member_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _order = 'level' THEN
    RETURN QUERY SELECT c.id, c.name, c.tag, c.avatar_url, c.level, c.total_score, c.weekly_score, c.member_count
                 FROM public.crews c
                 ORDER BY c.level DESC, c.xp DESC
                 LIMIT GREATEST(1, LEAST(_limit, 200));
  ELSIF _order = 'weekly' THEN
    RETURN QUERY SELECT c.id, c.name, c.tag, c.avatar_url, c.level, c.total_score, c.weekly_score, c.member_count
                 FROM public.crews c
                 ORDER BY c.weekly_score DESC
                 LIMIT GREATEST(1, LEAST(_limit, 200));
  ELSE
    RETURN QUERY SELECT c.id, c.name, c.tag, c.avatar_url, c.level, c.total_score, c.weekly_score, c.member_count
                 FROM public.crews c
                 ORDER BY c.total_score DESC
                 LIMIT GREATEST(1, LEAST(_limit, 200));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.leaderboard_crews(text, integer) TO anon, authenticated;
