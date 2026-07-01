ALTER TABLE public.user_achievements ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
