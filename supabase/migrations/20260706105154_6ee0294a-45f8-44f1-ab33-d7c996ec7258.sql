
-- Sector types
DO $$ BEGIN
  CREATE TYPE public.dominion_sector_kind AS ENUM ('neutral','dice_vault','fortified','event');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- World sectors (public read, seeded)
CREATE TABLE IF NOT EXISTS public.dominion_sectors (
  id int PRIMARY KEY,
  name text NOT NULL,
  kind public.dominion_sector_kind NOT NULL,
  x int NOT NULL,
  y int NOT NULL,
  strength int NOT NULL,
  reward_scrap int NOT NULL DEFAULT 0,
  reward_power int NOT NULL DEFAULT 0,
  reward_roll_credits int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dominion_sectors TO anon, authenticated;
GRANT ALL ON public.dominion_sectors TO service_role;
ALTER TABLE public.dominion_sectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dominion_sectors public read" ON public.dominion_sectors
  FOR SELECT TO anon, authenticated USING (true);

-- Battles
CREATE TABLE IF NOT EXISTS public.dominion_battles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sector_id int NOT NULL REFERENCES public.dominion_sectors(id),
  units_sent jsonb NOT NULL,
  survivors jsonb NOT NULL,
  outcome text NOT NULL,
  attack_power int NOT NULL,
  defense_power int NOT NULL,
  rewards jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_action_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_action_id)
);
GRANT SELECT ON public.dominion_battles TO authenticated;
GRANT ALL ON public.dominion_battles TO service_role;
ALTER TABLE public.dominion_battles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dominion_battles owner read" ON public.dominion_battles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "dominion_battles admin read" ON public.dominion_battles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS dominion_battles_user_idx ON public.dominion_battles(user_id, created_at DESC);

-- Seed 16 sectors (idempotent)
INSERT INTO public.dominion_sectors (id, name, kind, x, y, strength, reward_scrap, reward_power, reward_roll_credits) VALUES
  (1,  'Rusted Alley',    'neutral',   0, 0,    20,  400,  200,  120),
  (2,  'Broken Signal',   'neutral',   1, 0,    35,  550,  300,  180),
  (3,  'Emerald Docks',   'neutral',   2, 0,    55,  700,  450,  260),
  (4,  'Neon Junction',   'fortified', 3, 0,   120, 1200,  900,  600),
  (5,  'Scrap Foundry',   'neutral',   0, 1,    45,  650,  350,  220),
  (6,  'Dice Vault I',    'dice_vault',1, 1,    90,  400,  400, 1200),
  (7,  'Voltway',         'neutral',   2, 1,    70,  500,  700,  320),
  (8,  'Golden Overpass', 'fortified', 3, 1,   160, 1400, 1100,  850),
  (9,  'Ember Court',     'event',     0, 2,    80,  900,  600,  500),
  (10, 'Twin Cores',      'neutral',   1, 2,    75,  550,  850,  340),
  (11, 'Dice Vault II',   'dice_vault',2, 2,   140,  600,  600, 2000),
  (12, 'Skyline Barricade','fortified',3, 2,   220, 1800, 1400, 1200),
  (13, 'Rolling Plaza',   'neutral',   0, 3,    60,  700,  400,  280),
  (14, 'The Fold',        'event',     1, 3,   110, 1100,  900,  700),
  (15, 'Prism Yards',     'neutral',   2, 3,    95,  850,  650,  440),
  (16, 'Crown Reactor',   'fortified', 3, 3,   300, 2400, 2000, 1800)
ON CONFLICT (id) DO NOTHING;
