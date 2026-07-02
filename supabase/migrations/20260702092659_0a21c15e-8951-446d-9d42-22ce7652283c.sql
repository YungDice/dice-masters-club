
-- Tier column on user_baddies
ALTER TABLE public.user_baddies
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'base';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_baddies_tier_chk') THEN
    ALTER TABLE public.user_baddies
      ADD CONSTRAINT user_baddies_tier_chk CHECK (tier IN ('base','shiny','elite','prestige'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_baddies_user_tpl_tier
  ON public.user_baddies(user_id, template_id, tier);

-- Tier income multiplier (integer basis-points to keep math exact)
CREATE OR REPLACE FUNCTION public.baddie_tier_mult_bp(_tier text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE COALESCE(_tier,'base')
    WHEN 'shiny'    THEN 11000
    WHEN 'elite'    THEN 12500
    WHEN 'prestige' THEN 15000
    ELSE 10000
  END;
$$;

-- Update collect_baddie_tx to scale by tier
CREATE OR REPLACE FUNCTION public.collect_baddie_tx(_baddie_id uuid)
RETURNS TABLE(amount integer, last_collected_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_user uuid := auth.uid(); v_b RECORD; v_rate int; v_secs int; v_amt int; v_op text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT b.*, t.income_per_hour AS rate INTO v_b
    FROM public.user_baddies b JOIN public.baddie_templates t ON t.id = b.template_id
   WHERE b.id = _baddie_id AND b.user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Baddie not found'; END IF;
  IF v_b.listing_id IS NOT NULL THEN RAISE EXCEPTION 'Baddie is listed on the marketplace'; END IF;
  v_rate := (v_b.rate * public.baddie_tier_mult_bp(v_b.tier)) / 10000;
  v_secs := LEAST(EXTRACT(EPOCH FROM (now() - v_b.last_collected_at))::int, 24*3600);
  v_amt := (v_rate * v_secs) / 3600;
  IF v_amt <= 0 THEN RAISE EXCEPTION 'Nothing to collect yet'; END IF;
  UPDATE public.user_baddies SET last_collected_at = now() WHERE id = _baddie_id;
  v_op := 'baddie_collect:' || _baddie_id::text || ':' || floor(extract(epoch from now())/60)::text;
  PERFORM public.wallet_adjust_idem(v_user, v_amt, 'event'::tx_type,
    'baddie_income', 'baddie', _baddie_id, 'Baddie passive income', v_op);
  INSERT INTO public.activity_feed(user_id, kind, payload)
    VALUES (v_user, 'baddie_income', jsonb_build_object('baddie_id',_baddie_id,'amount',v_amt,'tier',v_b.tier));
  amount := v_amt; last_collected_at := now(); RETURN NEXT;
END $$;

-- Update sell_baddie_tx to price by tier
CREATE OR REPLACE FUNCTION public.sell_baddie_tx(_baddie_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_user uuid := auth.uid(); v_b record; v_rate int; v_price int; v_op text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT b.*, t.income_per_hour AS rate, t.name AS tname, t.rarity AS rrarity
    INTO v_b FROM public.user_baddies b JOIN public.baddie_templates t ON t.id = b.template_id
   WHERE b.id = _baddie_id AND b.user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Baddie not found'; END IF;
  IF v_b.listing_id IS NOT NULL THEN RAISE EXCEPTION 'Baddie is listed on the marketplace'; END IF;
  v_rate  := (v_b.rate * public.baddie_tier_mult_bp(v_b.tier)) / 10000;
  v_price := GREATEST(FLOOR(v_rate / 2)::int, 1);
  v_op := 'baddie_sell:' || _baddie_id::text;
  IF EXISTS (SELECT 1 FROM public.dice_transactions WHERE operation_id = v_op) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_sold');
  END IF;
  DELETE FROM public.user_baddies WHERE id = _baddie_id AND user_id = v_user;
  PERFORM public.wallet_adjust_idem(v_user, v_price, 'event'::tx_type,
    'baddie_sell', 'baddie', _baddie_id, 'Sold Baddie ' || COALESCE(v_b.tname,''), v_op);
  INSERT INTO public.activity_feed(user_id, kind, payload)
    VALUES (v_user, 'baddie_sold',
      jsonb_build_object('template_id', v_b.template_id, 'name', v_b.tname,
                         'rarity', v_b.rrarity, 'tier', v_b.tier, 'price', v_price));
  RETURN jsonb_build_object('ok', true, 'price', v_price, 'tier', v_b.tier);
END $$;

-- Fusion: 3 same template + same tier -> 1 of next tier
CREATE OR REPLACE FUNCTION public.fuse_baddies_tx(_baddie_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_rows record;
  v_template text;
  v_tier text;
  v_next text;
  v_count int;
  v_new_id uuid;
  v_name text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _baddie_ids IS NULL OR array_length(_baddie_ids,1) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'Provide exactly 3 baddie ids';
  END IF;

  -- Lock the rows in a stable order
  PERFORM 1 FROM public.user_baddies
    WHERE id = ANY(_baddie_ids) AND user_id = v_user
    ORDER BY id FOR UPDATE;

  SELECT COUNT(*), MIN(template_id), MIN(tier), MIN(name)
    INTO v_count, v_template, v_tier, v_name
    FROM public.user_baddies
   WHERE id = ANY(_baddie_ids)
     AND user_id = v_user
     AND listing_id IS NULL
     AND trade_id IS NULL;

  IF v_count <> 3 THEN RAISE EXCEPTION 'One or more Baddies are unavailable (listed, in trade, or missing)'; END IF;

  -- Verify all three share template + tier
  IF EXISTS (
    SELECT 1 FROM public.user_baddies
    WHERE id = ANY(_baddie_ids) AND user_id = v_user
    GROUP BY template_id, tier
    HAVING COUNT(*) = 3
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'All 3 Baddies must share the same template and tier';
  END IF;

  v_next := CASE v_tier
    WHEN 'base'  THEN 'shiny'
    WHEN 'shiny' THEN 'elite'
    WHEN 'elite' THEN 'prestige'
    ELSE NULL
  END;
  IF v_next IS NULL THEN RAISE EXCEPTION 'Prestige is the maximum tier'; END IF;

  DELETE FROM public.user_baddies WHERE id = ANY(_baddie_ids) AND user_id = v_user;

  INSERT INTO public.user_baddies(user_id, template_id, name, tier, last_collected_at)
    VALUES (v_user, v_template, v_name, v_next, now())
    RETURNING id INTO v_new_id;

  INSERT INTO public.activity_feed(user_id, kind, title, body, payload)
    VALUES (v_user, 'baddie_fuse', 'Baddie Fusion',
            'Forged a ' || v_next || ' Baddie',
            jsonb_build_object('template_id', v_template, 'from_tier', v_tier,
                               'to_tier', v_next, 'new_id', v_new_id));

  RETURN jsonb_build_object('ok', true, 'new_id', v_new_id, 'tier', v_next, 'template_id', v_template);
END $$;

REVOKE ALL ON FUNCTION public.fuse_baddies_tx(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fuse_baddies_tx(uuid[]) TO authenticated;
