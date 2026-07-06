
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS favorite_baddie_id uuid,
  ADD COLUMN IF NOT EXISTS favorite_game text,
  ADD COLUMN IF NOT EXISTS favorite_achievement_id text,
  ADD COLUMN IF NOT EXISTS win_pose_url text;
