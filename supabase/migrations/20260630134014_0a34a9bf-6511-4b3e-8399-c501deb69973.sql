
ALTER TABLE public.activity_feed ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.activity_feed ALTER COLUMN title DROP NOT NULL;
