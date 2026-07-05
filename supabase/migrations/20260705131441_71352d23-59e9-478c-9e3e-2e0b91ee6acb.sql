
DROP VIEW IF EXISTS public.user_game_stats;

CREATE OR REPLACE FUNCTION public.grant_achievement(_user_id uuid, _achievement_id text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _ach record; _rows int;
BEGIN
  IF _user_id IS NULL OR _achievement_id IS NULL THEN RETURN false; END IF;
  SELECT * INTO _ach FROM public.achievements WHERE id = _achievement_id;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO public.user_achievements (user_id, achievement_id)
  VALUES (_user_id, _achievement_id) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS _rows = ROW_COUNT;
  IF _rows = 0 THEN RETURN false; END IF;

  IF COALESCE(_ach.dice_reward, 0) > 0 THEN
    PERFORM public.wallet_adjust_idem(
      _user_id, _ach.dice_reward::bigint, 'event'::tx_type,
      'achievement', 'achievement', NULL::uuid,
      'Achievement: ' || _ach.name,
      'achievement:' || _ach.id || ':' || _user_id::text
    );
  END IF;

  IF COALESCE(_ach.xp_reward, 0) > 0 THEN
    UPDATE public.profiles SET xp = COALESCE(xp,0) + _ach.xp_reward WHERE id = _user_id;
  END IF;

  BEGIN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (_user_id, 'badge_unlock', 'Achievement Unlocked', _ach.name, '/profile');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    INSERT INTO public.activity_feed (user_id, kind, title, body, payload)
    VALUES (_user_id, 'achievement', 'Achievement Unlocked', _ach.name,
            jsonb_build_object('achievement_id', _ach.id, 'name', _ach.name, 'icon', _ach.icon));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_ach_game_results()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_cf_wins int;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.outcome = 'win' THEN PERFORM public.grant_achievement(NEW.user_id, 'first_blood'); END IF;
  IF COALESCE(NEW.wagered, 0) >= 1000 THEN PERFORM public.grant_achievement(NEW.user_id, 'high_roller'); END IF;
  IF NEW.kind::text = 'coinflip' AND NEW.outcome = 'win' THEN
    SELECT COUNT(*) INTO v_cf_wins FROM public.game_results
      WHERE user_id = NEW.user_id AND kind::text = 'coinflip' AND outcome = 'win';
    IF v_cf_wins >= 10 THEN PERFORM public.grant_achievement(NEW.user_id, 'coinflip_champ'); END IF;
  END IF;
  IF NEW.kind::text = 'poker' THEN PERFORM public.grant_achievement(NEW.user_id, 'poker_starter'); END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_ach_user_baddies()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_rarity text; v_count int;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO v_count FROM public.user_baddies WHERE user_id = NEW.user_id;
  IF v_count >= 100 THEN PERFORM public.grant_achievement(NEW.user_id, 'cases_100'); END IF;
  SELECT rarity INTO v_rarity FROM public.baddie_templates WHERE id = NEW.template_id;
  IF v_rarity IN ('legendary','unreal','elias') THEN PERFORM public.grant_achievement(NEW.user_id, 'legendary_hunter'); END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS ach_on_user_baddies ON public.user_baddies;
CREATE TRIGGER ach_on_user_baddies AFTER INSERT ON public.user_baddies
FOR EACH ROW EXECUTE FUNCTION public.tg_ach_user_baddies();

CREATE OR REPLACE FUNCTION public.tg_ach_user_streaks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.current_streak >= 7  THEN PERFORM public.grant_achievement(NEW.user_id, 'streak_7');  END IF;
  IF NEW.current_streak >= 30 THEN PERFORM public.grant_achievement(NEW.user_id, 'streak_30'); END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS ach_on_user_streaks ON public.user_streaks;
CREATE TRIGGER ach_on_user_streaks AFTER INSERT OR UPDATE OF current_streak ON public.user_streaks
FOR EACH ROW EXECUTE FUNCTION public.tg_ach_user_streaks();

CREATE OR REPLACE FUNCTION public.tg_ach_upgrades()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_count int;
BEGIN
  IF NEW.user_id IS NULL OR NEW.success IS NOT TRUE THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO v_count FROM public.baddie_upgrades WHERE user_id = NEW.user_id AND success IS TRUE;
  IF v_count >= 10 THEN PERFORM public.grant_achievement(NEW.user_id, 'upgrades_10'); END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS ach_on_upgrades ON public.baddie_upgrades;
CREATE TRIGGER ach_on_upgrades AFTER INSERT ON public.baddie_upgrades
FOR EACH ROW EXECUTE FUNCTION public.tg_ach_upgrades();

CREATE OR REPLACE FUNCTION public.tg_ach_friendships()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_cnt_r int; v_cnt_a int;
BEGIN
  IF NEW.status::text <> 'accepted' THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO v_cnt_r FROM public.friendships
    WHERE status::text = 'accepted' AND (requester_id = NEW.requester_id OR addressee_id = NEW.requester_id);
  IF v_cnt_r >= 5 THEN PERFORM public.grant_achievement(NEW.requester_id, 'social_player'); END IF;
  SELECT COUNT(*) INTO v_cnt_a FROM public.friendships
    WHERE status::text = 'accepted' AND (requester_id = NEW.addressee_id OR addressee_id = NEW.addressee_id);
  IF v_cnt_a >= 5 THEN PERFORM public.grant_achievement(NEW.addressee_id, 'social_player'); END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS ach_on_friendships ON public.friendships;
CREATE TRIGGER ach_on_friendships AFTER INSERT OR UPDATE OF status ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.tg_ach_friendships();

CREATE OR REPLACE FUNCTION public.tg_ach_marketplace_seller()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.seller_id IS NULL THEN RETURN NEW; END IF;
  PERFORM public.grant_achievement(NEW.seller_id, 'marketplace_seller');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS ach_on_marketplace_purchase ON public.marketplace_purchases;
CREATE TRIGGER ach_on_marketplace_purchase AFTER INSERT ON public.marketplace_purchases
FOR EACH ROW EXECUTE FUNCTION public.tg_ach_marketplace_seller();

CREATE OR REPLACE FUNCTION public.evaluate_user_achievements(_uid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_wins int; v_cf_wins int; v_max_wager bigint;
  v_baddies int; v_has_legend int; v_ups int;
  v_friends int; v_sales int; v_max_bal bigint; v_streak int;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  SELECT COUNT(*) FILTER (WHERE outcome = 'win'),
         COUNT(*) FILTER (WHERE outcome = 'win' AND kind::text = 'coinflip'),
         COALESCE(MAX(wagered), 0)
    INTO v_wins, v_cf_wins, v_max_wager
  FROM public.game_results WHERE user_id = _uid;
  IF v_wins > 0 THEN PERFORM public.grant_achievement(_uid, 'first_blood'); END IF;
  IF v_max_wager >= 1000 THEN PERFORM public.grant_achievement(_uid, 'high_roller'); END IF;
  IF v_cf_wins >= 10 THEN PERFORM public.grant_achievement(_uid, 'coinflip_champ'); END IF;
  IF EXISTS (SELECT 1 FROM public.game_results WHERE user_id = _uid AND kind::text = 'poker') THEN
    PERFORM public.grant_achievement(_uid, 'poker_starter');
  END IF;
  SELECT COUNT(*) INTO v_baddies FROM public.user_baddies WHERE user_id = _uid;
  IF v_baddies >= 100 THEN PERFORM public.grant_achievement(_uid, 'cases_100'); END IF;
  SELECT COUNT(*) INTO v_has_legend
    FROM public.user_baddies ub JOIN public.baddie_templates bt ON bt.id = ub.template_id
    WHERE ub.user_id = _uid AND bt.rarity IN ('legendary','unreal','elias');
  IF v_has_legend > 0 THEN PERFORM public.grant_achievement(_uid, 'legendary_hunter'); END IF;
  SELECT COUNT(*) INTO v_ups FROM public.baddie_upgrades WHERE user_id = _uid AND success IS TRUE;
  IF v_ups >= 10 THEN PERFORM public.grant_achievement(_uid, 'upgrades_10'); END IF;
  SELECT COUNT(*) INTO v_friends FROM public.friendships
    WHERE status::text = 'accepted' AND (requester_id = _uid OR addressee_id = _uid);
  IF v_friends >= 5 THEN PERFORM public.grant_achievement(_uid, 'social_player'); END IF;
  SELECT COUNT(*) INTO v_sales FROM public.marketplace_purchases WHERE seller_id = _uid;
  IF v_sales > 0 THEN PERFORM public.grant_achievement(_uid, 'marketplace_seller'); END IF;
  SELECT COALESCE(MAX(balance_after), 0) INTO v_max_bal FROM public.dice_transactions WHERE user_id = _uid;
  IF v_max_bal >= 1000000 THEN PERFORM public.grant_achievement(_uid, 'millionaire'); END IF;
  SELECT COALESCE(GREATEST(current_streak, best_streak), 0) INTO v_streak FROM public.user_streaks WHERE user_id = _uid;
  IF v_streak >= 7 THEN PERFORM public.grant_achievement(_uid, 'streak_7'); END IF;
  IF v_streak >= 30 THEN PERFORM public.grant_achievement(_uid, 'streak_30'); END IF;
END;
$function$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.profiles LOOP
    PERFORM public.evaluate_user_achievements(r.id);
  END LOOP;
END $$;

CREATE VIEW public.user_game_stats AS
SELECT
  p.id AS user_id,
  COALESCE(g.games_played, 0)::bigint AS games_played,
  COALESCE(g.wins, 0)::bigint         AS wins,
  COALESCE(g.losses, 0)::bigint       AS losses,
  COALESCE(g.draws, 0)::bigint        AS draws,
  COALESCE(g.wagered, 0)::bigint      AS wagered,
  COALESCE(g.payout, 0)::bigint       AS payout,
  COALESCE(g.net, 0)::bigint          AS net,
  CASE WHEN COALESCE(g.losses,0) = 0
       THEN COALESCE(g.wins,0)::numeric
       ELSE ROUND(COALESCE(g.wins,0)::numeric / g.losses::numeric, 3)
  END AS win_loss_ratio,
  (COALESCE(g.wins,0) * GREATEST(
      CASE WHEN COALESCE(g.losses,0) = 0
           THEN GREATEST(COALESCE(g.wins,0), 1)::numeric
           ELSE COALESCE(g.wins,0)::numeric / g.losses::numeric
      END, 0.3))::numeric(12,2) AS rank_score
FROM public.profiles p
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS games_played,
         COUNT(*) FILTER (WHERE outcome = 'win')  AS wins,
         COUNT(*) FILTER (WHERE outcome = 'loss') AS losses,
         COUNT(*) FILTER (WHERE outcome NOT IN ('win','loss')) AS draws,
         SUM(wagered) AS wagered, SUM(payout) AS payout, SUM(delta) AS net
    FROM public.game_results WHERE user_id = p.id
) g ON true;

GRANT SELECT ON public.user_game_stats TO authenticated, anon;
