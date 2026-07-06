
-- =====================================================
-- Yuri Case System
-- =====================================================
CREATE TABLE IF NOT EXISTS public.yuri_templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  rarity text NOT NULL,
  income_per_hour integer NOT NULL DEFAULT 100,
  image_url text,
  weight integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.yuri_templates TO anon, authenticated;
GRANT ALL ON public.yuri_templates TO service_role;
ALTER TABLE public.yuri_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Yuri templates readable" ON public.yuri_templates;
CREATE POLICY "Yuri templates readable" ON public.yuri_templates FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.user_yuri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id text NOT NULL REFERENCES public.yuri_templates(id),
  case_slot smallint,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  last_collected_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_yuri_slot_range CHECK (case_slot IS NULL OR (case_slot BETWEEN 1 AND 8)),
  CONSTRAINT user_yuri_unique_slot UNIQUE (user_id, case_slot)
);
CREATE INDEX IF NOT EXISTS user_yuri_user_idx ON public.user_yuri(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_yuri TO authenticated;
GRANT ALL ON public.user_yuri TO service_role;
ALTER TABLE public.user_yuri ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own yuri" ON public.user_yuri;
CREATE POLICY "Users read own yuri" ON public.user_yuri FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users manage own yuri" ON public.user_yuri;
CREATE POLICY "Users manage own yuri" ON public.user_yuri FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Seed templates
INSERT INTO public.yuri_templates (id, name, rarity, income_per_hour, weight) VALUES
  ('yuri_sakura',   'Sakura',   'common',    120, 500),
  ('yuri_hana',     'Hana',     'common',    130, 500),
  ('yuri_yui',      'Yui',      'uncommon',  220, 300),
  ('yuri_rei',      'Rei',      'uncommon',  240, 300),
  ('yuri_mei',      'Mei',      'rare',      380, 150),
  ('yuri_akari',    'Akari',    'rare',      400, 150),
  ('yuri_ayame',    'Ayame',    'epic',      620, 60),
  ('yuri_kuro',     'Kuro',     'epic',      650, 60),
  ('yuri_shiro',    'Shiro',    'legendary', 900, 20),
  ('yuri_luna',     'Luna',     'legendary', 950, 20)
ON CONFLICT (id) DO NOTHING;

-- Open Yuri case: costs 1200 DICE per pull, produces a random Yuri girl.
CREATE OR REPLACE FUNCTION public.open_yuri_case(_count integer)
RETURNS SETOF public.user_yuri
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  total_cost integer;
  total_weight integer;
  i integer;
  r double precision;
  pick record;
  cumulative integer;
  new_row public.user_yuri%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _count IS NULL OR _count < 1 OR _count > 10 THEN RAISE EXCEPTION 'count 1..10'; END IF;
  total_cost := 1200 * _count;
  PERFORM public.wallet_adjust(uid, (-total_cost)::bigint, 'game_stake'::tx_type, 'yuri_case', 'yuri', NULL::uuid, 'Yuri case open');
  SELECT COALESCE(SUM(weight),0) INTO total_weight FROM public.yuri_templates;
  IF total_weight <= 0 THEN RAISE EXCEPTION 'no yuri templates'; END IF;
  FOR i IN 1.._count LOOP
    r := random() * total_weight;
    cumulative := 0;
    FOR pick IN SELECT id, weight FROM public.yuri_templates ORDER BY weight DESC LOOP
      cumulative := cumulative + pick.weight;
      IF r < cumulative THEN
        INSERT INTO public.user_yuri (user_id, template_id) VALUES (uid, pick.id) RETURNING * INTO new_row;
        RETURN NEXT new_row;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;
  RETURN;
END;
$$;
GRANT EXECUTE ON FUNCTION public.open_yuri_case(integer) TO authenticated;

-- Place a Yuri girl into a case slot (1-8). Slot may be occupied → swap.
CREATE OR REPLACE FUNCTION public.yuri_place(_yuri_id uuid, _slot smallint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE uid uuid := auth.uid(); prev uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _slot NOT BETWEEN 1 AND 8 THEN RAISE EXCEPTION 'slot 1..8'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_yuri WHERE id = _yuri_id AND user_id = uid) THEN
    RAISE EXCEPTION 'not your yuri';
  END IF;
  -- Free up slot on target girl (may already be placed elsewhere).
  UPDATE public.user_yuri SET case_slot = NULL WHERE id = _yuri_id;
  -- Clear existing occupant of the target slot (returned to inventory).
  UPDATE public.user_yuri SET case_slot = NULL WHERE user_id = uid AND case_slot = _slot;
  UPDATE public.user_yuri SET case_slot = _slot, last_collected_at = now() WHERE id = _yuri_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.yuri_place(uuid, smallint) TO authenticated;

-- Remove from case slot back to inventory.
CREATE OR REPLACE FUNCTION public.yuri_unplace(_yuri_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  UPDATE public.user_yuri SET case_slot = NULL WHERE id = _yuri_id AND user_id = uid;
END;
$$;
GRANT EXECUTE ON FUNCTION public.yuri_unplace(uuid) TO authenticated;

-- Collect combined dice from an active duo. duo_group 1..4 → slots (2g-1, 2g)
CREATE OR REPLACE FUNCTION public.yuri_collect_duo(_group smallint)
RETURNS TABLE(amount bigint) 
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  s1 smallint := (_group * 2 - 1)::smallint;
  s2 smallint := (_group * 2)::smallint;
  y1 record;
  y2 record;
  secs integer;
  rate integer;
  cap integer := 240000;
  earned bigint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _group NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION 'group 1..4'; END IF;
  SELECT uy.*, t.income_per_hour INTO y1 FROM public.user_yuri uy JOIN public.yuri_templates t ON t.id = uy.template_id WHERE uy.user_id = uid AND uy.case_slot = s1;
  SELECT uy.*, t.income_per_hour INTO y2 FROM public.user_yuri uy JOIN public.yuri_templates t ON t.id = uy.template_id WHERE uy.user_id = uid AND uy.case_slot = s2;
  IF y1.id IS NULL OR y2.id IS NULL THEN RAISE EXCEPTION 'duo incomplete'; END IF;
  rate := y1.income_per_hour + y2.income_per_hour;
  secs := LEAST(GREATEST(EXTRACT(EPOCH FROM (now() - GREATEST(y1.last_collected_at, y2.last_collected_at)))::integer, 0), 30*24*3600);
  earned := LEAST(((rate * secs) / 3600)::bigint, cap::bigint);
  IF earned <= 0 THEN RAISE EXCEPTION 'nothing to collect'; END IF;
  PERFORM public.wallet_adjust(uid, earned, 'game_payout'::tx_type, 'yuri_duo', 'yuri', NULL::uuid, 'Yuri duo collect');
  UPDATE public.user_yuri SET last_collected_at = now() WHERE id IN (y1.id, y2.id);
  RETURN QUERY SELECT earned;
END;
$$;
GRANT EXECUTE ON FUNCTION public.yuri_collect_duo(smallint) TO authenticated;

-- =====================================================
-- Lobby cleanup: abandoned game_rooms
-- =====================================================
CREATE OR REPLACE FUNCTION public.cleanup_abandoned_lobbies()
RETURNS TABLE(cancelled_waiting integer, finished_active integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE cw integer := 0; fa integer := 0;
BEGIN
  WITH x AS (
    UPDATE public.game_rooms SET status = 'cancelled', finished_at = now()
    WHERE status = 'waiting' AND updated_at < now() - interval '1 hour'
    RETURNING 1
  ) SELECT count(*)::int INTO cw FROM x;
  WITH x AS (
    UPDATE public.game_rooms SET status = 'finished', finished_at = now()
    WHERE status = 'active' AND updated_at < now() - interval '2 hours'
    RETURNING 1
  ) SELECT count(*)::int INTO fa FROM x;
  RETURN QUERY SELECT cw, fa;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cleanup_abandoned_lobbies() TO service_role;
