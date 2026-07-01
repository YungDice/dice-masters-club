-- Recovery migration for databases where the original large Club migration was
-- only partially applied. Every statement is idempotent and recreates the
-- Base, Crew, and Risk Room RPCs reported missing by PostgREST.

ALTER TABLE public.user_baddies
  ADD COLUMN IF NOT EXISTS is_protected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prestige smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trait text,
  ADD COLUMN IF NOT EXISTS variant text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS base_slot smallint;

ALTER TABLE public.user_baddies
  DROP CONSTRAINT IF EXISTS user_baddies_base_slot_check;
ALTER TABLE public.user_baddies
  ADD CONSTRAINT user_baddies_base_slot_check
  CHECK (base_slot IS NULL OR base_slot BETWEEN 1 AND 10);
CREATE UNIQUE INDEX IF NOT EXISTS user_baddies_base_slot_uniq
  ON public.user_baddies(user_id, base_slot) WHERE base_slot IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.crews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 3 AND 24),
  tag text NOT NULL UNIQUE CHECK (tag ~ '^[A-Z0-9]{2,5}$'),
  invite_code text NOT NULL UNIQUE,
  leader_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_dice bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.crew_members (
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('leader','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (crew_id, user_id),
  UNIQUE (user_id)
);
CREATE TABLE IF NOT EXISTS public.crew_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount bigint NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.risk_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stake bigint NOT NULL CHECK (stake BETWEEN 100 AND 100000),
  multiplier numeric(6,2) NOT NULL,
  won boolean NOT NULL,
  payout bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_baddie_base_slot_tx(_baddie_id uuid, _slot smallint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _slot IS NOT NULL AND (_slot < 1 OR _slot > 10) THEN
    RAISE EXCEPTION 'Base slot must be between 1 and 10';
  END IF;
  IF _slot IS NOT NULL THEN
    UPDATE public.user_baddies
      SET base_slot = NULL
      WHERE user_id = v_user AND base_slot = _slot AND id <> _baddie_id;
  END IF;
  UPDATE public.user_baddies
    SET base_slot = _slot
    WHERE id = _baddie_id AND user_id = v_user AND listing_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Baddie not found or listed'; END IF;
  RETURN jsonb_build_object('ok', true, 'slot', _slot);
END $$;

CREATE OR REPLACE FUNCTION public.create_crew_tx(_name text, _tag text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_crew uuid; v_code text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.crew_members WHERE user_id = v_user) THEN
    RAISE EXCEPTION 'Leave your current Crew first';
  END IF;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  INSERT INTO public.crews(name, tag, invite_code, leader_id)
    VALUES (trim(_name), upper(trim(_tag)), v_code, v_user)
    RETURNING id INTO v_crew;
  INSERT INTO public.crew_members(crew_id, user_id, role)
    VALUES (v_crew, v_user, 'leader');
  RETURN jsonb_build_object('ok', true, 'crew_id', v_crew, 'invite_code', v_code);
END $$;

CREATE OR REPLACE FUNCTION public.play_risk_room_tx(_stake bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_won boolean;
  v_multiplier numeric := 2.20;
  v_payout bigint;
  v_run_id uuid;
  v_operation text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _stake < 100 OR _stake > 100000 THEN
    RAISE EXCEPTION 'Stake must be between 100 and 100,000 DICE';
  END IF;
  v_operation := 'risk_room:' || v_user::text || ':' || gen_random_uuid()::text;
  PERFORM public.wallet_adjust_idem(
    v_user, -_stake, 'event'::public.tx_type,
    'risk_room', 'risk', NULL, 'Risk Room entry', v_operation || ':stake'
  );
  v_won := random() < 0.42;
  v_payout := CASE WHEN v_won THEN floor(_stake * v_multiplier)::bigint ELSE 0 END;
  IF v_payout > 0 THEN
    PERFORM public.wallet_adjust_idem(
      v_user, v_payout, 'event'::public.tx_type,
      'risk_room', 'risk', NULL, 'Risk Room reward', v_operation || ':payout'
    );
  END IF;
  INSERT INTO public.risk_runs(user_id, stake, multiplier, won, payout)
    VALUES (v_user, _stake, v_multiplier, v_won, v_payout)
    RETURNING id INTO v_run_id;
  RETURN jsonb_build_object(
    'ok', true, 'run_id', v_run_id, 'won', v_won,
    'payout', v_payout, 'multiplier', v_multiplier
  );
END $$;

GRANT SELECT ON public.crews, public.crew_members, public.crew_contributions, public.risk_runs TO authenticated;
GRANT ALL ON public.crews, public.crew_members, public.crew_contributions, public.risk_runs TO service_role;
ALTER TABLE public.crews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crews_read ON public.crews;
CREATE POLICY crews_read ON public.crews FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS crew_members_read ON public.crew_members;
CREATE POLICY crew_members_read ON public.crew_members FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS crew_contributions_read ON public.crew_contributions;
CREATE POLICY crew_contributions_read ON public.crew_contributions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS risk_runs_read_own ON public.risk_runs;
CREATE POLICY risk_runs_read_own ON public.risk_runs FOR SELECT TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON FUNCTION public.set_baddie_base_slot_tx(uuid, smallint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_crew_tx(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.play_risk_room_tx(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_baddie_base_slot_tx(uuid, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_crew_tx(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.play_risk_room_tx(bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';
