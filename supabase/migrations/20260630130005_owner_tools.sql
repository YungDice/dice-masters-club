-- PostgreSQL requires a new enum value to be committed before later migrations
-- can safely reference it.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';
