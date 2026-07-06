
-- ============================================================
-- DICE Dominion — Phase 1 foundation
-- ============================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE public.dominion_building_kind AS ENUM (
    'headquarters','salvage_yard','power_core','dice_forge','vault','command_center','workshop'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.dominion_job_kind AS ENUM ('build','upgrade','train','research');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.dominion_unit_kind AS ENUM ('scout_roller','shield_guard','crusher_tank','sky_drone');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.dominion_research_branch AS ENUM ('industry','tactics','logistics');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- dominion_profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dominion_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hq_level int NOT NULL DEFAULT 1,
  roll_credits bigint NOT NULL DEFAULT 200,
  scrap bigint NOT NULL DEFAULT 250,
  power bigint NOT NULL DEFAULT 100,
  command_energy int NOT NULL DEFAULT 20,
  command_energy_updated_at timestamptz NOT NULL DEFAULT now(),
  workers int NOT NULL DEFAULT 3,
  xp bigint NOT NULL DEFAULT 0,
  initialized_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.dominion_profiles TO authenticated;
GRANT ALL ON public.dominion_profiles TO service_role;
ALTER TABLE public.dominion_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dominion_profiles owner read" ON public.dominion_profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "dominion_profiles owner update" ON public.dominion_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dominion_profiles owner insert" ON public.dominion_profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dominion_profiles admin read" ON public.dominion_profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- dominion_buildings
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dominion_buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.dominion_building_kind NOT NULL,
  level int NOT NULL DEFAULT 1,
  slot_x int NOT NULL,
  slot_y int NOT NULL,
  last_collected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slot_x, slot_y)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dominion_buildings TO authenticated;
GRANT ALL ON public.dominion_buildings TO service_role;
ALTER TABLE public.dominion_buildings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dominion_buildings owner read" ON public.dominion_buildings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "dominion_buildings admin read" ON public.dominion_buildings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS dominion_buildings_user_idx ON public.dominion_buildings(user_id);

-- ============================================================
-- dominion_units
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dominion_units (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.dominion_unit_kind NOT NULL,
  count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);
GRANT SELECT ON public.dominion_units TO authenticated;
GRANT ALL ON public.dominion_units TO service_role;
ALTER TABLE public.dominion_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dominion_units owner read" ON public.dominion_units
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "dominion_units admin read" ON public.dominion_units
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- dominion_research
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dominion_research (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch public.dominion_research_branch NOT NULL,
  node text NOT NULL,
  level int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, branch, node)
);
GRANT SELECT ON public.dominion_research TO authenticated;
GRANT ALL ON public.dominion_research TO service_role;
ALTER TABLE public.dominion_research ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dominion_research owner read" ON public.dominion_research
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "dominion_research admin read" ON public.dominion_research
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- dominion_jobs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dominion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.dominion_job_kind NOT NULL,
  ref_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  finished boolean NOT NULL DEFAULT false,
  client_action_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_action_id)
);
GRANT SELECT ON public.dominion_jobs TO authenticated;
GRANT ALL ON public.dominion_jobs TO service_role;
ALTER TABLE public.dominion_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dominion_jobs owner read" ON public.dominion_jobs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "dominion_jobs admin read" ON public.dominion_jobs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS dominion_jobs_user_idx ON public.dominion_jobs(user_id, finished, ends_at);

-- ============================================================
-- dominion_daily_rewards (DICE grant tracking, capped/idempotent)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dominion_daily_rewards (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  kind text NOT NULL,
  dice_amount bigint NOT NULL,
  op_id text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day, kind)
);
GRANT SELECT ON public.dominion_daily_rewards TO authenticated;
GRANT ALL ON public.dominion_daily_rewards TO service_role;
ALTER TABLE public.dominion_daily_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dominion_daily_rewards owner read" ON public.dominion_daily_rewards
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "dominion_daily_rewards admin read" ON public.dominion_daily_rewards
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.dominion_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS dominion_profiles_touch ON public.dominion_profiles;
CREATE TRIGGER dominion_profiles_touch BEFORE UPDATE ON public.dominion_profiles
  FOR EACH ROW EXECUTE FUNCTION public.dominion_touch_updated_at();
