
-- Enum for mission metric type
DO $$ BEGIN
  CREATE TYPE public.crew_mission_metric AS ENUM ('donations', 'new_members');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1) Templates ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crew_mission_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  metric public.crew_mission_metric NOT NULL,
  target BIGINT NOT NULL CHECK (target > 0),
  reward_points BIGINT NOT NULL DEFAULT 0,
  reward_dice BIGINT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.crew_mission_templates TO authenticated, anon;
GRANT ALL ON public.crew_mission_templates TO service_role;
ALTER TABLE public.crew_mission_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Templates are public read" ON public.crew_mission_templates FOR SELECT USING (true);

-- 2) Weekly missions per crew -----------------------------------------
CREATE TABLE IF NOT EXISTS public.crew_missions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_id UUID NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  slot SMALLINT NOT NULL CHECK (slot BETWEEN 1 AND 3),
  template_id UUID NOT NULL REFERENCES public.crew_mission_templates(id),
  metric public.crew_mission_metric NOT NULL,
  target BIGINT NOT NULL,
  progress BIGINT NOT NULL DEFAULT 0,
  reward_points BIGINT NOT NULL DEFAULT 0,
  reward_dice BIGINT NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('admin','auto')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (crew_id, week_start, slot)
);
CREATE INDEX IF NOT EXISTS idx_crew_missions_lookup ON public.crew_missions(crew_id, week_start);

GRANT SELECT ON public.crew_missions TO authenticated;
GRANT ALL ON public.crew_missions TO service_role;
ALTER TABLE public.crew_missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Any signed-in user can read missions" ON public.crew_missions FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public._touch_crew_missions_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_touch_crew_missions ON public.crew_missions;
CREATE TRIGGER trg_touch_crew_missions BEFORE UPDATE ON public.crew_missions
FOR EACH ROW EXECUTE FUNCTION public._touch_crew_missions_updated();

-- Seed templates
INSERT INTO public.crew_mission_templates(code, name, description, metric, target, reward_points, reward_dice) VALUES
  ('donate_10k',   'Small pot',       'Members donate 10,000 DICE together this week', 'donations', 10000,   2500,  2500),
  ('donate_50k',   'Big pot',         'Members donate 50,000 DICE together this week', 'donations', 50000,  10000, 10000),
  ('donate_200k',  'Whale week',      'Members donate 200,000 DICE together this week','donations', 200000, 25000, 30000),
  ('recruit_2',    'Fresh blood',     'Recruit 2 new members this week',                 'new_members', 2,     5000,  5000),
  ('recruit_5',    'Grow the crew',   'Recruit 5 new members this week',                 'new_members', 5,    15000, 15000)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  metric = EXCLUDED.metric, target = EXCLUDED.target,
  reward_points = EXCLUDED.reward_points, reward_dice = EXCLUDED.reward_dice;

-- 3) Progress triggers -------------------------------------------------
-- Helper: current ISO week Monday (UTC)
CREATE OR REPLACE FUNCTION public.current_week_start() RETURNS DATE
LANGUAGE sql IMMUTABLE AS $$ SELECT date_trunc('week', (now() AT TIME ZONE 'UTC'))::date $$;

CREATE OR REPLACE FUNCTION public._crew_mission_award(_mission public.crew_missions)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_members UUID[];
  v_per BIGINT;
  v_uid UUID;
BEGIN
  IF _mission.reward_points > 0 THEN
    UPDATE public.crews
       SET weekly_score = weekly_score + _mission.reward_points,
           total_score  = total_score  + _mission.reward_points,
           xp = xp + _mission.reward_points
     WHERE id = _mission.crew_id;
  END IF;

  SELECT array_agg(user_id) INTO v_members FROM public.crew_members WHERE crew_id = _mission.crew_id;
  IF _mission.reward_dice > 0 AND v_members IS NOT NULL AND array_length(v_members,1) > 0 THEN
    v_per := GREATEST(1, _mission.reward_dice / array_length(v_members, 1));
    FOREACH v_uid IN ARRAY v_members LOOP
      PERFORM public.wallet_adjust_idem(v_uid, v_per, 'event'::tx_type, 'crew_mission_reward', 'crew_mission', _mission.id, 'Crew mission complete',
        'crew_mission:' || _mission.id::text || ':' || v_uid::text);
    END LOOP;
  END IF;

  IF v_members IS NOT NULL THEN
    FOREACH v_uid IN ARRAY v_members LOOP
      INSERT INTO public.notifications(user_id, kind, title, body, link)
      VALUES (v_uid, 'event', 'Crew mission complete!',
        'Your crew completed a weekly mission.', '/crews/' || _mission.crew_id::text);
    END LOOP;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._crew_missions_bump(_crew_id UUID, _metric public.crew_mission_metric, _delta BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_week DATE := public.current_week_start();
  v_row public.crew_missions;
BEGIN
  IF _delta <= 0 THEN RETURN; END IF;
  FOR v_row IN
    SELECT * FROM public.crew_missions
     WHERE crew_id = _crew_id AND week_start = v_week AND metric = _metric AND completed_at IS NULL
  LOOP
    UPDATE public.crew_missions
       SET progress = LEAST(target, progress + _delta),
           completed_at = CASE WHEN progress + _delta >= target THEN now() ELSE NULL END
     WHERE id = v_row.id
    RETURNING * INTO v_row;
    IF v_row.completed_at IS NOT NULL THEN
      PERFORM public._crew_mission_award(v_row);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public._crew_missions_on_donation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._crew_missions_bump(NEW.crew_id, 'donations'::public.crew_mission_metric, NEW.amount);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_crew_missions_on_donation ON public.crew_donations;
CREATE TRIGGER trg_crew_missions_on_donation AFTER INSERT ON public.crew_donations
FOR EACH ROW EXECUTE FUNCTION public._crew_missions_on_donation();

CREATE OR REPLACE FUNCTION public._crew_missions_on_new_member()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._crew_missions_bump(NEW.crew_id, 'new_members'::public.crew_mission_metric, 1);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_crew_missions_on_new_member ON public.crew_members;
CREATE TRIGGER trg_crew_missions_on_new_member AFTER INSERT ON public.crew_members
FOR EACH ROW EXECUTE FUNCTION public._crew_missions_on_new_member();

-- 4) RPCs --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crew_missions_this_week(_crew_id UUID)
RETURNS TABLE(id UUID, slot SMALLINT, template_id UUID, code TEXT, name TEXT, description TEXT,
              metric public.crew_mission_metric, target BIGINT, progress BIGINT, reward_points BIGINT,
              reward_dice BIGINT, source TEXT, completed_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.slot, m.template_id, t.code, t.name, t.description, m.metric, m.target,
         m.progress, m.reward_points, m.reward_dice, m.source, m.completed_at
    FROM public.crew_missions m
    JOIN public.crew_mission_templates t ON t.id = m.template_id
   WHERE m.crew_id = _crew_id AND m.week_start = public.current_week_start()
   ORDER BY m.slot;
$$;
GRANT EXECUTE ON FUNCTION public.crew_missions_this_week(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_crew_mission(_slot INT, _template_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_m public.crew_members;
  v_t public.crew_mission_templates;
  v_week DATE := public.current_week_start();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _slot < 1 OR _slot > 3 THEN RAISE EXCEPTION 'Invalid slot'; END IF;
  SELECT * INTO v_m FROM public.crew_members WHERE user_id = v_uid;
  IF NOT FOUND OR v_m.role NOT IN ('owner','officer') THEN RAISE EXCEPTION 'Only owner/officers can set missions'; END IF;
  SELECT * INTO v_t FROM public.crew_mission_templates WHERE id = _template_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown template'; END IF;

  INSERT INTO public.crew_missions(crew_id, week_start, slot, template_id, metric, target, reward_points, reward_dice, source, progress, completed_at)
    VALUES (v_m.crew_id, v_week, _slot, v_t.id, v_t.metric, v_t.target, v_t.reward_points, v_t.reward_dice, 'admin', 0, NULL)
  ON CONFLICT (crew_id, week_start, slot) DO UPDATE
    SET template_id = EXCLUDED.template_id, metric = EXCLUDED.metric, target = EXCLUDED.target,
        reward_points = EXCLUDED.reward_points, reward_dice = EXCLUDED.reward_dice,
        source = 'admin', progress = 0, completed_at = NULL;

  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.set_crew_mission(INT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.autofill_crew_missions()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_week DATE := public.current_week_start();
  v_crew RECORD;
  v_slot INT;
  v_t public.crew_mission_templates;
  v_count INT := 0;
BEGIN
  FOR v_crew IN SELECT id FROM public.crews LOOP
    FOR v_slot IN 1..3 LOOP
      IF NOT EXISTS (SELECT 1 FROM public.crew_missions WHERE crew_id = v_crew.id AND week_start = v_week AND slot = v_slot) THEN
        SELECT * INTO v_t FROM public.crew_mission_templates
         WHERE active = true
           AND id NOT IN (SELECT template_id FROM public.crew_missions WHERE crew_id = v_crew.id AND week_start = v_week)
         ORDER BY random() LIMIT 1;
        IF FOUND THEN
          INSERT INTO public.crew_missions(crew_id, week_start, slot, template_id, metric, target, reward_points, reward_dice, source)
          VALUES (v_crew.id, v_week, v_slot, v_t.id, v_t.metric, v_t.target, v_t.reward_points, v_t.reward_dice, 'auto');
          v_count := v_count + 1;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'filled', v_count);
END $$;
GRANT EXECUTE ON FUNCTION public.autofill_crew_missions() TO authenticated, service_role;
