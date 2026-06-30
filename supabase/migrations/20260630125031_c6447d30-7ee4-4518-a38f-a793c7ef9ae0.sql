CREATE TABLE IF NOT EXISTS public.baddie_templates (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  rarity       TEXT NOT NULL CHECK (rarity IN ('common','uncommon','rare','epic','legendary')),
  income_per_hour INTEGER NOT NULL CHECK (income_per_hour > 0),
  image_url    TEXT,
  weight       INTEGER NOT NULL DEFAULT 100,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.baddie_templates TO authenticated, anon;
GRANT ALL ON public.baddie_templates TO service_role;
ALTER TABLE public.baddie_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY baddie_templates_read ON public.baddie_templates FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.user_baddies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  template_id  TEXT NOT NULL REFERENCES public.baddie_templates(id),
  name         TEXT,
  acquired_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_collected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_baddies_user ON public.user_baddies(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_baddies TO authenticated;
GRANT ALL ON public.user_baddies TO service_role;
ALTER TABLE public.user_baddies ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_baddies_owner_read ON public.user_baddies FOR SELECT USING (auth.uid() = user_id);

-- Seed a small starter roster (idempotent).
INSERT INTO public.baddie_templates (id, name, rarity, income_per_hour, weight)
VALUES
  ('rookie',     'Rookie Roller',   'common',     20,  500),
  ('hustler',    'Card Hustler',    'uncommon',   45,  300),
  ('shark',      'Pit Shark',       'rare',       90,  140),
  ('queen',      'Casino Queen',    'epic',      180,   50),
  ('legend',     'Vegas Legend',    'legendary', 360,   10)
ON CONFLICT (id) DO NOTHING;

-- Case price (constant for now).
CREATE OR REPLACE FUNCTION public.open_baddie_case_tx()
RETURNS TABLE (template_id TEXT, name TEXT, rarity TEXT, income_per_hour INTEGER, user_baddie_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_cost INTEGER := 1000;
  v_is_vip BOOLEAN;
  v_count INTEGER;
  v_cap INTEGER;
  v_total INTEGER;
  v_pick INTEGER;
  v_acc INTEGER := 0;
  v_t RECORD;
  v_new UUID;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT COALESCE(vip_until > now(), false) INTO v_is_vip FROM public.profiles WHERE id = v_user;
  v_cap := CASE WHEN v_is_vip THEN 4 ELSE 2 END;

  SELECT COUNT(*) INTO v_count FROM public.user_baddies WHERE user_id = v_user;
  IF v_count >= v_cap THEN
    RAISE EXCEPTION 'Baddie Base full (%/%). Release one before opening another case.', v_count, v_cap;
  END IF;

  -- Charge cost atomically via the wallet helper (must exist already in this project).
  PERFORM public.wallet_debit(v_user, v_cost, 'baddie_case', NULL);

  SELECT COALESCE(SUM(weight),0) INTO v_total FROM public.baddie_templates;
  IF v_total <= 0 THEN RAISE EXCEPTION 'no templates'; END IF;
  v_pick := 1 + floor(random() * v_total)::INTEGER;

  FOR v_t IN SELECT * FROM public.baddie_templates ORDER BY weight DESC LOOP
    v_acc := v_acc + v_t.weight;
    IF v_pick <= v_acc THEN
      INSERT INTO public.user_baddies(user_id, template_id, name)
      VALUES (v_user, v_t.id, v_t.name)
      RETURNING id INTO v_new;

      template_id := v_t.id; name := v_t.name; rarity := v_t.rarity;
      income_per_hour := v_t.income_per_hour; user_baddie_id := v_new;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.open_baddie_case_tx() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_baddie_case_tx() TO authenticated;

CREATE OR REPLACE FUNCTION public.collect_baddie_tx(_baddie_id UUID)
RETURNS TABLE (amount INTEGER, last_collected_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_b RECORD;
  v_rate INTEGER;
  v_secs INTEGER;
  v_amt INTEGER;
  v_cap_secs INTEGER := 24 * 3600;  -- cap accrual to 24h to prevent abuse on long absences
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT b.*, t.income_per_hour INTO v_b
  FROM public.user_baddies b
  JOIN public.baddie_templates t ON t.id = b.template_id
  WHERE b.id = _baddie_id AND b.user_id = v_user
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not your baddie'; END IF;

  v_rate := v_b.income_per_hour;
  v_secs := LEAST(EXTRACT(EPOCH FROM (now() - v_b.last_collected_at))::INTEGER, v_cap_secs);
  v_amt := (v_rate * v_secs) / 3600;
  IF v_amt <= 0 THEN RAISE EXCEPTION 'Nothing to collect yet'; END IF;

  UPDATE public.user_baddies SET last_collected_at = now() WHERE id = _baddie_id;
  PERFORM public.wallet_credit(v_user, v_amt, 'baddie_income', _baddie_id::TEXT);

  amount := v_amt; last_collected_at := now();
  RETURN NEXT;
END $$;
REVOKE EXECUTE ON FUNCTION public.collect_baddie_tx(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.collect_baddie_tx(UUID) TO authenticated;
