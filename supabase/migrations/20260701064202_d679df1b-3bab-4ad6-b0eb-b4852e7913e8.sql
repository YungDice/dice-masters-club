
-- ============================================================
-- 1) Schema additions
-- ============================================================
ALTER TABLE public.user_baddies
  ADD COLUMN IF NOT EXISTS listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_baddies_listing ON public.user_baddies(listing_id) WHERE listing_id IS NOT NULL;

ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS baddie_id uuid REFERENCES public.user_baddies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_baddie ON public.marketplace_listings(baddie_id) WHERE baddie_id IS NOT NULL;

-- Allow owners to see their own baddies whether listed or not (already true via existing policy).

-- ============================================================
-- 2) baddie_upgrades history
-- ============================================================
CREATE TABLE IF NOT EXISTS public.baddie_upgrades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_template_id text NOT NULL REFERENCES public.baddie_templates(id),
  material_template_ids text[] NOT NULL,
  material_count int NOT NULL,
  chance_pct numeric(6,3) NOT NULL,
  success boolean NOT NULL,
  awarded_baddie_id uuid REFERENCES public.user_baddies(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.baddie_upgrades TO authenticated;
GRANT ALL    ON public.baddie_upgrades TO service_role;
ALTER TABLE public.baddie_upgrades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bu_read_own ON public.baddie_upgrades;
CREATE POLICY bu_read_own ON public.baddie_upgrades FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_baddie_upgrades_user ON public.baddie_upgrades(user_id, created_at DESC);

-- ============================================================
-- 3) list_baddie_for_sale_tx
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_baddie_for_sale_tx(_baddie_id uuid, _price bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_b record; v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _price IS NULL OR _price < 100 OR _price > 100000000 THEN
    RAISE EXCEPTION 'Price must be between 100 and 100,000,000 DICE';
  END IF;

  SELECT b.*, t.name AS tname, t.rarity AS rrarity, t.image_url AS timg, t.income_per_hour AS rate
    INTO v_b
    FROM public.user_baddies b JOIN public.baddie_templates t ON t.id = b.template_id
   WHERE b.id = _baddie_id AND b.user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Baddie not found'; END IF;
  IF v_b.listing_id IS NOT NULL THEN RAISE EXCEPTION 'Baddie is already listed'; END IF;

  INSERT INTO public.marketplace_listings(
    seller_id, title, description, category, price,
    baddie_id, preview_url, tags, sale_type, ownership_confirmed, status
  ) VALUES (
    v_user,
    v_b.tname || ' (' || v_b.rrarity || ')',
    'Baddie — ' || v_b.rrarity || ' · ' || v_b.rate || ' DICE/hour passive income.',
    'baddie', _price,
    v_b.id, v_b.timg, ARRAY[v_b.rrarity, 'baddie']::text[],
    'fixed', TRUE, 'active'
  ) RETURNING id INTO v_id;

  UPDATE public.user_baddies SET listing_id = v_id WHERE id = v_b.id;

  INSERT INTO public.activity_feed(user_id, kind, payload) VALUES
    (v_user, 'baddie_listed', jsonb_build_object('listing_id', v_id, 'name', v_b.tname, 'rarity', v_b.rrarity, 'price', _price));

  RETURN jsonb_build_object('ok', true, 'listing_id', v_id);
END $$;
REVOKE ALL ON FUNCTION public.list_baddie_for_sale_tx(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_baddie_for_sale_tx(uuid, bigint) TO authenticated;

-- ============================================================
-- 4) cancel_listing_tx
-- ============================================================
CREATE OR REPLACE FUNCTION public.cancel_listing_tx(_listing_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_l record;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_l FROM public.marketplace_listings WHERE id = _listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF v_l.seller_id <> v_user THEN RAISE EXCEPTION 'Not your listing'; END IF;
  IF v_l.status <> 'active' THEN RAISE EXCEPTION 'Only active listings can be cancelled'; END IF;
  IF v_l.sale_type = 'auction' AND v_l.current_bidder_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot cancel auction with bids';
  END IF;

  UPDATE public.marketplace_listings SET status = 'removed' WHERE id = _listing_id;

  IF v_l.category = 'baddie' AND v_l.baddie_id IS NOT NULL THEN
    UPDATE public.user_baddies SET listing_id = NULL WHERE id = v_l.baddie_id AND user_id = v_user;
  END IF;

  INSERT INTO public.activity_feed(user_id, kind, payload)
    VALUES (v_user, 'listing_cancelled', jsonb_build_object('listing_id', _listing_id, 'title', v_l.title));

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.cancel_listing_tx(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_listing_tx(uuid) TO authenticated;

-- ============================================================
-- 5) Update buy_listing_tx to handle 'baddie'
-- ============================================================
CREATE OR REPLACE FUNCTION public.buy_listing_tx(_buyer uuid, _listing_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _l public.marketplace_listings; _op text; _seller_new_uname text; _owned int;
BEGIN
  _op := 'buy:' || _listing_id::text;
  IF EXISTS (SELECT 1 FROM public.dice_transactions WHERE operation_id = _op || ':b') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_processed');
  END IF;
  SELECT * INTO _l FROM public.marketplace_listings WHERE id = _listing_id FOR UPDATE;
  IF _l.id IS NULL THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF _l.status <> 'active' THEN RAISE EXCEPTION 'Listing not available'; END IF;
  IF _l.seller_id = _buyer THEN RAISE EXCEPTION 'Cannot buy own listing'; END IF;
  IF _l.sale_type = 'auction' THEN RAISE EXCEPTION 'Auction listing — place a bid instead'; END IF;

  IF _l.category = 'tag' AND _l.tag_value IS NOT NULL THEN
    SELECT count(*) INTO _owned FROM public.profile_tags WHERE user_id = _buyer;
    IF _owned >= 3 THEN RAISE EXCEPTION 'You already own 3 tags (max)'; END IF;
    IF EXISTS (SELECT 1 FROM public.profile_tags WHERE tag = _l.tag_value AND user_id <> _l.seller_id) THEN
      RAISE EXCEPTION 'Tag already owned by another user';
    END IF;
  END IF;
  IF _l.category = 'username' AND _l.username_value IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(_l.username_value) AND id <> _l.seller_id) THEN
      RAISE EXCEPTION 'That username is no longer available';
    END IF;
  END IF;
  IF _l.category = 'baddie' THEN
    IF _l.baddie_id IS NULL THEN RAISE EXCEPTION 'Listing missing baddie reference'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.user_baddies WHERE id = _l.baddie_id AND user_id = _l.seller_id AND listing_id = _l.id) THEN
      RAISE EXCEPTION 'Baddie is no longer available';
    END IF;
  END IF;

  PERFORM public.wallet_adjust_idem(_buyer, -_l.price, 'marketplace_purchase'::tx_type,
    'marketplace', 'listing', _l.id, 'Buy ' || COALESCE(_l.title,''), _op || ':b');
  PERFORM public.wallet_adjust_idem(_l.seller_id, _l.price, 'marketplace_sale'::tx_type,
    'marketplace', 'listing', _l.id, 'Sold ' || COALESCE(_l.title,''), _op || ':s');
  PERFORM set_config('app.bypass_profile_protect','1',true);

  IF _l.category = 'tag' AND _l.tag_value IS NOT NULL THEN
    DELETE FROM public.profile_tags WHERE tag = _l.tag_value AND user_id = _l.seller_id;
    INSERT INTO public.profile_tags(user_id, tag) VALUES (_buyer, _l.tag_value);
    UPDATE public.profiles SET tag = NULL WHERE id = _l.seller_id AND tag = _l.tag_value;
    UPDATE public.profiles SET tag = _l.tag_value WHERE id = _buyer AND tag IS NULL;
  ELSIF _l.category = 'username' AND _l.username_value IS NOT NULL THEN
    _seller_new_uname := 'user_' || substr(replace(_l.seller_id::text,'-',''),1,10);
    UPDATE public.profiles SET username = _seller_new_uname, username_changed_at = now(), username_free_change_available = TRUE
      WHERE id = _l.seller_id;
    UPDATE public.profiles SET username = _l.username_value, username_changed_at = now() WHERE id = _buyer;
  ELSIF _l.category = 'baddie' AND _l.baddie_id IS NOT NULL THEN
    -- Transfer baddie ownership; reset collection timer so buyer can't claim seller's uncollected income
    UPDATE public.user_baddies
       SET user_id = _buyer, listing_id = NULL, last_collected_at = now()
     WHERE id = _l.baddie_id AND user_id = _l.seller_id;
  END IF;

  UPDATE public.marketplace_listings
     SET status='sold', winner_id=_buyer, sales_count = COALESCE(sales_count,0)+1
   WHERE id = _l.id;
  INSERT INTO public.marketplace_purchases(listing_id, buyer_id, seller_id, price)
    VALUES (_l.id, _buyer, _l.seller_id, _l.price)
    ON CONFLICT (listing_id) DO NOTHING;
  INSERT INTO public.activity_feed(user_id, kind, payload) VALUES
    (_buyer,     'marketplace_buy',  jsonb_build_object('listing_id',_l.id,'title',_l.title,'price',_l.price,'category',_l.category)),
    (_l.seller_id,'marketplace_sell', jsonb_build_object('listing_id',_l.id,'title',_l.title,'price',_l.price,'category',_l.category));
  RETURN jsonb_build_object('ok', true, 'listing_id', _l.id, 'category', _l.category);
END $$;

-- ============================================================
-- 6) collect_baddie_tx: block if listed
-- ============================================================
CREATE OR REPLACE FUNCTION public.collect_baddie_tx(_baddie_id uuid)
RETURNS TABLE(amount integer, last_collected_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_b RECORD; v_rate int; v_secs int; v_amt int; v_op text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT b.*, t.income_per_hour AS rate INTO v_b
    FROM public.user_baddies b JOIN public.baddie_templates t ON t.id = b.template_id
   WHERE b.id = _baddie_id AND b.user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Baddie not found'; END IF;
  IF v_b.listing_id IS NOT NULL THEN RAISE EXCEPTION 'Baddie is listed on the marketplace'; END IF;
  v_rate := v_b.rate;
  v_secs := LEAST(EXTRACT(EPOCH FROM (now() - v_b.last_collected_at))::int, 24*3600);
  v_amt := (v_rate * v_secs) / 3600;
  IF v_amt <= 0 THEN RAISE EXCEPTION 'Nothing to collect yet'; END IF;
  UPDATE public.user_baddies SET last_collected_at = now() WHERE id = _baddie_id;
  v_op := 'baddie_collect:' || _baddie_id::text || ':' || floor(extract(epoch from now())/60)::text;
  PERFORM public.wallet_adjust_idem(v_user, v_amt, 'event'::tx_type,
    'baddie_income', 'baddie', _baddie_id, 'Baddie passive income', v_op);
  INSERT INTO public.activity_feed(user_id, kind, payload)
    VALUES (v_user, 'baddie_income', jsonb_build_object('baddie_id',_baddie_id,'amount',v_amt));
  amount := v_amt; last_collected_at := now(); RETURN NEXT;
END $$;

-- ============================================================
-- 7) sell_baddie_tx: block if listed
-- ============================================================
CREATE OR REPLACE FUNCTION public.sell_baddie_tx(_baddie_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_b record; v_price int; v_op text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT b.*, t.income_per_hour AS rate, t.name AS tname, t.rarity AS rrarity
    INTO v_b FROM public.user_baddies b JOIN public.baddie_templates t ON t.id = b.template_id
   WHERE b.id = _baddie_id AND b.user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Baddie not found'; END IF;
  IF v_b.listing_id IS NOT NULL THEN RAISE EXCEPTION 'Baddie is listed on the marketplace'; END IF;
  v_price := GREATEST(FLOOR(v_b.rate / 2)::int, 1);
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
                         'rarity', v_b.rrarity, 'price', v_price));
  RETURN jsonb_build_object('ok', true, 'price', v_price);
END $$;

-- ============================================================
-- 8) Multi-case opening
-- ============================================================
CREATE OR REPLACE FUNCTION public.open_baddie_cases_tx(_count integer)
RETURNS TABLE(template_id text, name text, rarity text, income_per_hour integer,
              user_baddie_id uuid, image_url text, autosold boolean, sell_price integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_cost_per int := 1000;
  v_total_cost bigint;
  v_is_vip boolean; v_autosell text[]; v_bought int;
  v_total int; v_pick int; v_acc int;
  v_t record; v_new uuid; v_op text; v_will_autosell boolean; v_price int;
  i int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _count IS NULL OR _count < 1 OR _count > 10 THEN
    RAISE EXCEPTION 'Count must be between 1 and 10';
  END IF;

  SELECT COALESCE(vip_until > now(), false),
         COALESCE(autosell_rarities, '{}'::text[]),
         COALESCE(baddie_slots_bought,0)
    INTO v_is_vip, v_autosell, v_bought FROM public.profiles WHERE id = v_user;

  SELECT COALESCE(SUM(weight),0) INTO v_total FROM public.baddie_templates;
  IF v_total <= 0 THEN RAISE EXCEPTION 'No baddie templates configured'; END IF;

  v_total_cost := v_cost_per::bigint * _count;
  v_op := 'baddie_open_multi:' || v_user::text || ':' || gen_random_uuid()::text;
  PERFORM public.wallet_adjust_idem(v_user, -v_total_cost, 'event'::tx_type,
    'baddie_case', 'baddie_case', NULL, 'Opened ' || _count || ' Baddie Cases', v_op);

  FOR i IN 1.._count LOOP
    v_acc := 0;
    v_pick := 1 + floor(random() * v_total)::int;
    FOR v_t IN SELECT * FROM public.baddie_templates ORDER BY weight DESC, id LOOP
      v_acc := v_acc + v_t.weight;
      IF v_pick <= v_acc THEN
        v_will_autosell := v_is_vip AND (v_t.rarity = ANY(v_autosell));
        IF v_will_autosell THEN
          v_price := GREATEST(FLOOR(v_t.income_per_hour/2)::int, 1);
          PERFORM public.wallet_adjust_idem(v_user, v_price, 'event'::tx_type,
            'baddie_autosell', 'baddie_case', NULL, 'Autosold ' || v_t.name,
            v_op || ':as:' || i::text);
          template_id := v_t.id; name := v_t.name; rarity := v_t.rarity;
          income_per_hour := v_t.income_per_hour; user_baddie_id := NULL;
          image_url := v_t.image_url; autosold := TRUE; sell_price := v_price;
        ELSE
          INSERT INTO public.user_baddies(user_id, template_id, name)
            VALUES (v_user, v_t.id, v_t.name) RETURNING id INTO v_new;
          template_id := v_t.id; name := v_t.name; rarity := v_t.rarity;
          income_per_hour := v_t.income_per_hour; user_baddie_id := v_new;
          image_url := v_t.image_url; autosold := FALSE; sell_price := NULL;
        END IF;
        RETURN NEXT;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;
  RETURN;
END $$;
REVOKE ALL ON FUNCTION public.open_baddie_cases_tx(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_baddie_cases_tx(int) TO authenticated;

-- ============================================================
-- 9) Upgrader
-- ============================================================
CREATE OR REPLACE FUNCTION public.baddie_upgrade_chance(_material_value bigint, _target_value bigint, _target_rarity text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_chance numeric; v_cap numeric;
BEGIN
  IF _material_value <= 0 OR _target_value <= 0 THEN RETURN 0; END IF;
  -- Base formula: materials_value / (materials_value + target_value * 2)
  v_chance := _material_value::numeric / (_material_value + _target_value * 2);
  -- Rarity caps
  v_cap := CASE _target_rarity
    WHEN 'elias'     THEN 0.10
    WHEN 'unreal'    THEN 0.25
    WHEN 'legendary' THEN 0.75
    WHEN 'epic'      THEN 0.85
    ELSE 0.95
  END;
  RETURN LEAST(v_chance, v_cap);
END $$;

CREATE OR REPLACE FUNCTION public.upgrade_baddies_tx(_target_template_id text, _material_baddie_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_target public.baddie_templates;
  v_mat_value bigint := 0;
  v_target_value bigint;
  v_chance numeric;
  v_roll numeric;
  v_success boolean;
  v_material_templates text[] := '{}';
  v_new_baddie uuid := NULL;
  v_rec record;
  v_count int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _material_baddie_ids IS NULL OR array_length(_material_baddie_ids,1) IS NULL THEN
    RAISE EXCEPTION 'Select at least one Baddie as material';
  END IF;
  IF array_length(_material_baddie_ids,1) > 20 THEN RAISE EXCEPTION 'Maximum 20 materials per upgrade'; END IF;

  SELECT * INTO v_target FROM public.baddie_templates WHERE id = _target_template_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target Baddie not found'; END IF;
  v_target_value := v_target.income_per_hour;

  -- Lock and validate all materials
  FOR v_rec IN
    SELECT b.id, b.listing_id, t.income_per_hour, t.id AS tid
      FROM public.user_baddies b JOIN public.baddie_templates t ON t.id = b.template_id
     WHERE b.id = ANY(_material_baddie_ids) AND b.user_id = v_user
     FOR UPDATE
  LOOP
    IF v_rec.listing_id IS NOT NULL THEN RAISE EXCEPTION 'Listed Baddies cannot be used as material'; END IF;
    v_mat_value := v_mat_value + v_rec.income_per_hour;
    v_material_templates := array_append(v_material_templates, v_rec.tid);
  END LOOP;

  IF array_length(v_material_templates,1) IS NULL
     OR array_length(v_material_templates,1) <> array_length(_material_baddie_ids,1) THEN
    RAISE EXCEPTION 'Some selected Baddies are missing or not yours';
  END IF;

  v_chance := public.baddie_upgrade_chance(v_mat_value, v_target_value, v_target.rarity);
  v_roll := random();
  v_success := v_roll < v_chance;

  -- Consume materials regardless of outcome
  DELETE FROM public.user_baddies WHERE id = ANY(_material_baddie_ids) AND user_id = v_user;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> array_length(_material_baddie_ids,1) THEN
    RAISE EXCEPTION 'Consumption mismatch — aborting';
  END IF;

  IF v_success THEN
    INSERT INTO public.user_baddies(user_id, template_id, name)
      VALUES (v_user, v_target.id, v_target.name) RETURNING id INTO v_new_baddie;
  END IF;

  INSERT INTO public.baddie_upgrades(user_id, target_template_id, material_template_ids, material_count, chance_pct, success, awarded_baddie_id)
    VALUES (v_user, v_target.id, v_material_templates, array_length(_material_baddie_ids,1),
            round(v_chance * 100, 3), v_success, v_new_baddie);

  INSERT INTO public.activity_feed(user_id, kind, payload)
    VALUES (v_user, CASE WHEN v_success THEN 'baddie_upgrade_success' ELSE 'baddie_upgrade_fail' END,
      jsonb_build_object('target', v_target.name, 'rarity', v_target.rarity,
                         'materials', array_length(_material_baddie_ids,1),
                         'chance', round(v_chance * 100, 2)));

  RETURN jsonb_build_object(
    'ok', true,
    'success', v_success,
    'chance', round(v_chance * 100, 3),
    'roll', round(v_roll * 100, 3),
    'target', jsonb_build_object('id', v_target.id, 'name', v_target.name, 'rarity', v_target.rarity,
                                 'income_per_hour', v_target.income_per_hour, 'image_url', v_target.image_url),
    'new_baddie_id', v_new_baddie
  );
END $$;
REVOKE ALL ON FUNCTION public.upgrade_baddies_tx(text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upgrade_baddies_tx(text, uuid[]) TO authenticated;
