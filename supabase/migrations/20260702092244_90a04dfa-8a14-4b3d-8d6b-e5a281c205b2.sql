
-- Add new achievements
INSERT INTO public.achievements (id, name, description, icon, dice_reward, xp_reward) VALUES
  ('first_blood', 'First Blood', 'Win your very first game', 'swords', 100, 50),
  ('cases_100', '100 Cases Opened', 'Open 100 Baddie Cases', 'package', 500, 200),
  ('legendary_hunter', 'Legendary Hunter', 'Unbox a Legendary or higher Baddie', 'sparkles', 750, 250),
  ('upgrades_10', '10 Upgrades Won', 'Win 10 Baddie Upgrades', 'trending-up', 500, 200),
  ('millionaire', 'Millionaire', 'Hold 1,000,000 DICE at once', 'gem', 2500, 500)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  dice_reward = EXCLUDED.dice_reward,
  xp_reward = EXCLUDED.xp_reward;

-- Idempotent grant helper: awards DICE + XP once, inserts activity + notification
CREATE OR REPLACE FUNCTION public.grant_achievement(_user_id uuid, _achievement_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ach record;
  _inserted boolean := false;
BEGIN
  IF _user_id IS NULL OR _achievement_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO _ach FROM public.achievements WHERE id = _achievement_id;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO public.user_achievements (user_id, achievement_id)
  VALUES (_user_id, _achievement_id)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS _inserted = ROW_COUNT;
  IF _inserted = 0 OR (SELECT ROW_COUNT FROM (SELECT 1) x) IS NULL THEN
    NULL;
  END IF;

  -- ROW_COUNT check the right way
  IF NOT EXISTS (
    SELECT 1 FROM public.user_achievements
    WHERE user_id = _user_id AND achievement_id = _achievement_id
      AND unlocked_at < now() - interval '1 second'
  ) THEN
    -- Just unlocked (or already existed within the last second — safe): grant rewards only if this was a fresh insert
    IF EXISTS (
      SELECT 1 FROM public.user_achievements
      WHERE user_id = _user_id AND achievement_id = _achievement_id
        AND unlocked_at >= now() - interval '2 seconds'
    ) AND _inserted THEN
      IF COALESCE(_ach.dice_reward, 0) > 0 THEN
        PERFORM public.wallet_adjust_idem(
          _user_id,
          _ach.dice_reward,
          'achievement:' || _ach.id || ':' || _user_id::text,
          'achievement',
          jsonb_build_object('achievement_id', _ach.id, 'name', _ach.name)
        );
      END IF;

      IF COALESCE(_ach.xp_reward, 0) > 0 THEN
        UPDATE public.profiles SET xp = COALESCE(xp,0) + _ach.xp_reward WHERE id = _user_id;
      END IF;

      INSERT INTO public.notifications (user_id, kind, title, body, data)
      VALUES (_user_id, 'achievement', 'Achievement Unlocked', _ach.name, jsonb_build_object('achievement_id', _ach.id))
      ON CONFLICT DO NOTHING;

      INSERT INTO public.activity_feed (user_id, kind, title, body, payload)
      VALUES (_user_id, 'achievement', 'Achievement Unlocked', _ach.name, jsonb_build_object('achievement_id', _ach.id, 'name', _ach.name, 'icon', _ach.icon));
    END IF;
  END IF;

  RETURN _inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_achievement(uuid, text) FROM PUBLIC, anon, authenticated;

-- Trigger: First Blood on first win + achievements from wins
CREATE OR REPLACE FUNCTION public.tg_ach_game_results()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.outcome = 'win' THEN
    PERFORM public.grant_achievement(NEW.user_id, 'first_blood');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ach_on_game_result ON public.game_results;
CREATE TRIGGER ach_on_game_result
AFTER INSERT ON public.game_results
FOR EACH ROW EXECUTE FUNCTION public.tg_ach_game_results();

-- Trigger: Case-opened counters and Legendary Hunter
CREATE OR REPLACE FUNCTION public.tg_ach_user_baddies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rarity text;
  _count int;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  SELECT rarity INTO _rarity FROM public.baddie_templates WHERE id = NEW.template_id;

  IF _rarity IN ('legendary','unreal','elias') THEN
    PERFORM public.grant_achievement(NEW.user_id, 'legendary_hunter');
  END IF;

  SELECT COUNT(*) INTO _count FROM public.user_baddies WHERE user_id = NEW.user_id;
  IF _count >= 100 THEN
    PERFORM public.grant_achievement(NEW.user_id, 'cases_100');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ach_on_user_baddie ON public.user_baddies;
CREATE TRIGGER ach_on_user_baddie
AFTER INSERT ON public.user_baddies
FOR EACH ROW EXECUTE FUNCTION public.tg_ach_user_baddies();

-- Trigger: Upgrade wins
CREATE OR REPLACE FUNCTION public.tg_ach_baddie_upgrades()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wins int;
BEGIN
  IF NEW.user_id IS NULL OR NEW.success IS NOT TRUE THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO _wins FROM public.baddie_upgrades WHERE user_id = NEW.user_id AND success = true;
  IF _wins >= 10 THEN
    PERFORM public.grant_achievement(NEW.user_id, 'upgrades_10');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ach_on_upgrade ON public.baddie_upgrades;
CREATE TRIGGER ach_on_upgrade
AFTER INSERT ON public.baddie_upgrades
FOR EACH ROW EXECUTE FUNCTION public.tg_ach_baddie_upgrades();

-- Trigger: Millionaire on wallet balance
CREATE OR REPLACE FUNCTION public.tg_ach_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.balance >= 1000000 THEN
    PERFORM public.grant_achievement(NEW.user_id, 'millionaire');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ach_on_wallet ON public.dice_wallets;
CREATE TRIGGER ach_on_wallet
AFTER INSERT OR UPDATE OF balance ON public.dice_wallets
FOR EACH ROW EXECUTE FUNCTION public.tg_ach_wallet();
