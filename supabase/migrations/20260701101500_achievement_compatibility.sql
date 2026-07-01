-- The project already has public.achievements + public.user_achievements.
-- Reuse that canonical FK target while retaining achievement_definitions for Club-specific UI metadata.
ALTER TABLE public.user_achievements
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

INSERT INTO public.achievements(id, name, description, icon, dice_reward, xp_reward)
VALUES
  ('first_win', 'First Blood', 'Win your first game.', 'swords', 250, 0),
  ('case_breaker', 'Case Breaker', 'Open 10 Baddie Cases.', 'package', 500, 0),
  ('collector_10', 'Collector', 'Own 10 Baddies at once.', 'sparkles', 750, 0),
  ('prestige_1', 'Shiny Business', 'Create your first Prestige Baddie.', 'gem', 1000, 0),
  ('crew_player', 'Crew Player', 'Join or create a Crew.', 'users', 400, 0),
  ('high_roller', 'High Roller', 'Play a game with a 5,000+ DICE stake.', 'crown', 800, 0)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  dice_reward = EXCLUDED.dice_reward,
  xp_reward = EXCLUDED.xp_reward;

-- Keep Club-owned achievement rows private while preserving the public profile
-- route's separate, explicit achievement display behavior.
DROP POLICY IF EXISTS achievements_read_own ON public.user_achievements;
CREATE POLICY achievements_read_own ON public.user_achievements
  FOR SELECT TO authenticated USING (user_id = auth.uid());
