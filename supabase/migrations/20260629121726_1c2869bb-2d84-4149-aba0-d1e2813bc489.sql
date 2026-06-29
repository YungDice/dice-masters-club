
-- 1) Enum extensions (must be in their own statement, executed before use)
ALTER TYPE public.tx_type ADD VALUE IF NOT EXISTS 'fee';
ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'auction_outbid';
ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'auction_won';
ALTER TYPE public.listing_status ADD VALUE IF NOT EXISTS 'expired';

-- 2) Private game state — never readable from client
CREATE TABLE IF NOT EXISTS public.game_private_state (
  room_id    uuid PRIMARY KEY REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  state      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.game_private_state TO service_role;
ALTER TABLE public.game_private_state ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated/anon -> no client read/write.

-- 3) Lock down direct user writes to game_rooms (only service_role via server fns)
DROP POLICY IF EXISTS "gr_ins" ON public.game_rooms;
DROP POLICY IF EXISTS "gr_upd" ON public.game_rooms;

-- 4) Tighten proof self-update: status must stay 'pending' on both sides
DROP POLICY IF EXISTS "pf_upd_own" ON public.challenge_proofs;
CREATE POLICY "pf_upd_own" ON public.challenge_proofs
  FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()) AND (status = 'pending'::proof_status))
  WITH CHECK ((user_id = auth.uid()) AND (status = 'pending'::proof_status));

-- 5) Idempotency key on dice_transactions
ALTER TABLE public.dice_transactions
  ADD COLUMN IF NOT EXISTS operation_id text;
CREATE UNIQUE INDEX IF NOT EXISTS dice_tx_operation_id_uniq
  ON public.dice_transactions(operation_id) WHERE operation_id IS NOT NULL;

-- 6) Idempotent atomic wallet adjust
CREATE OR REPLACE FUNCTION public.wallet_adjust_idem(
  _user uuid, _delta bigint, _type tx_type, _source text,
  _ref_kind text, _ref_id uuid, _note text, _op_id text
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _bef bigint; _aft bigint;
BEGIN
  IF _op_id IS NOT NULL THEN
    SELECT balance_after INTO _aft FROM public.dice_transactions
      WHERE operation_id = _op_id LIMIT 1;
    IF FOUND THEN RETURN _aft; END IF;
  END IF;
  INSERT INTO public.dice_wallets(user_id) VALUES (_user) ON CONFLICT DO NOTHING;
  SELECT balance INTO _bef FROM public.dice_wallets WHERE user_id = _user FOR UPDATE;
  _aft := _bef + _delta;
  IF _aft < 0 THEN RAISE EXCEPTION 'Insufficient DICE balance'; END IF;
  UPDATE public.dice_wallets SET balance = _aft,
    lifetime_earned = lifetime_earned + GREATEST(_delta, 0),
    lifetime_spent  = lifetime_spent  + GREATEST(-_delta, 0),
    updated_at = now()
  WHERE user_id = _user;
  INSERT INTO public.dice_transactions(user_id, type, amount, balance_before, balance_after, source, ref_kind, ref_id, note, operation_id)
    VALUES (_user, _type, _delta, _bef, _aft, _source, _ref_kind, _ref_id, _note, _op_id);
  RETURN _aft;
END $$;
REVOKE ALL ON FUNCTION public.wallet_adjust_idem(uuid,bigint,tx_type,text,text,uuid,text,text) FROM PUBLIC, anon, authenticated;

-- 7) Atomic daily claim — one row per (user, day)
CREATE OR REPLACE FUNCTION public.claim_daily_tx(_uid uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _op text;
BEGIN
  _op := 'daily:' || _uid::text || ':' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
  IF EXISTS (SELECT 1 FROM public.dice_transactions WHERE operation_id = _op) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;
  PERFORM public.wallet_adjust_idem(_uid, 100, 'daily_reward'::tx_type, 'daily', NULL, NULL, 'Daily login reward', _op);
  RETURN jsonb_build_object('ok', true, 'reward', 100);
END $$;
REVOKE ALL ON FUNCTION public.claim_daily_tx(uuid) FROM PUBLIC, anon, authenticated;

-- 8) Atomic proof review with single-row UPDATE WHERE status='pending'
CREATE OR REPLACE FUNCTION public.review_proof_tx(_proof_id uuid, _reviewer uuid, _approve boolean, _notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _proof public.challenge_proofs; _chal public.challenges;
        _new_xp bigint; _old_lvl int; _new_lvl int; _dice_bonus bigint := 0;
BEGIN
  IF NOT public.is_staff(_reviewer) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.challenge_proofs
    SET status = (CASE WHEN _approve THEN 'approved' ELSE 'rejected' END)::proof_status,
        reviewer_id = _reviewer,
        reviewer_notes = _notes,
        reviewed_at = now()
    WHERE id = _proof_id AND status = 'pending'::proof_status
    RETURNING * INTO _proof;
  IF _proof.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_reviewed');
  END IF;
  IF _approve THEN
    SELECT * INTO _chal FROM public.challenges WHERE id = _proof.challenge_id;
    IF COALESCE(_chal.dice_reward, 0) > 0 THEN
      PERFORM public.wallet_adjust_idem(_proof.user_id, _chal.dice_reward, 'challenge_reward'::tx_type,
        'challenge', 'challenge', _chal.id, _chal.title, 'proof_reward:' || _proof_id::text);
    END IF;
    IF COALESCE(_chal.xp_reward, 0) > 0 THEN
      SELECT xp, level INTO _new_xp, _old_lvl FROM public.profiles WHERE id = _proof.user_id FOR UPDATE;
      _new_xp := COALESCE(_new_xp, 0) + _chal.xp_reward;
      _new_lvl := 1;
      WHILE 100 * (_new_lvl + 1) * (_new_lvl + 1) <= _new_xp LOOP _new_lvl := _new_lvl + 1; END LOOP;
      UPDATE public.profiles SET xp = _new_xp, level = _new_lvl WHERE id = _proof.user_id;
      IF _new_lvl > COALESCE(_old_lvl, 1) THEN
        _dice_bonus := 500 * (_new_lvl - COALESCE(_old_lvl, 1));
        PERFORM public.wallet_adjust_idem(_proof.user_id, _dice_bonus, 'event'::tx_type,
          'level_up', NULL, NULL, 'Level up via challenge', 'proof_lvl:' || _proof_id::text);
      END IF;
    END IF;
    INSERT INTO public.challenge_participants(challenge_id, user_id, completed)
      VALUES (_proof.challenge_id, _proof.user_id, true)
      ON CONFLICT (challenge_id, user_id) DO UPDATE SET completed = true;
  END IF;
  RETURN jsonb_build_object('ok', true, 'approved', _approve, 'dice_bonus', _dice_bonus, 'user_id', _proof.user_id, 'challenge_id', _proof.challenge_id);
END $$;
REVOKE ALL ON FUNCTION public.review_proof_tx(uuid,uuid,boolean,text) FROM PUBLIC, anon, authenticated;

-- 9) Private profile data (dob, age verification) split out
CREATE TABLE IF NOT EXISTS public.profile_private (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  dob               date NOT NULL,
  is_18_plus        boolean NOT NULL DEFAULT false,
  terms_accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profile_private TO authenticated;
GRANT ALL    ON public.profile_private TO service_role;
ALTER TABLE public.profile_private ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pp_own_read"   ON public.profile_private;
DROP POLICY IF EXISTS "pp_staff_read" ON public.profile_private;
CREATE POLICY "pp_own_read"   ON public.profile_private FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "pp_staff_read" ON public.profile_private FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
-- No INSERT/UPDATE policy -> only service_role writes; server fn enforces 18+ check.

-- Backfill private data from profiles
INSERT INTO public.profile_private(user_id, dob, is_18_plus, terms_accepted_at)
  SELECT id, dob, is_18_plus, terms_accepted_at FROM public.profiles
  ON CONFLICT (user_id) DO NOTHING;

-- Hide private columns on profiles from all non-service roles
REVOKE SELECT (dob, is_18_plus, terms_accepted_at) ON public.profiles FROM authenticated;
REVOKE SELECT (dob, is_18_plus, terms_accepted_at) ON public.profiles FROM anon;
-- service_role keeps full access by default.

-- 10) Keep handle_new_user writing both tables
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uname TEXT; _dname TEXT; _dob DATE; _claimed_18 BOOLEAN;
BEGIN
  _uname := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1) || substr(NEW.id::text,1,4));
  _dname := COALESCE(NEW.raw_user_meta_data->>'display_name', _uname);
  _dob   := COALESCE((NEW.raw_user_meta_data->>'dob')::DATE, NULL);
  _claimed_18 := (NEW.raw_user_meta_data->>'is_18_plus')::boolean IS TRUE;
  IF _dob IS NOT NULL AND _dob > (CURRENT_DATE - INTERVAL '18 years') THEN
    RAISE EXCEPTION 'You must be at least 18 years old to use DICE';
  END IF;
  IF _dob IS NULL THEN
    _dob := DATE '1900-01-01';
    _claimed_18 := FALSE;
  END IF;
  INSERT INTO public.profiles(id, username, display_name, dob, is_18_plus)
    VALUES (NEW.id, _uname, _dname, _dob, _claimed_18);
  INSERT INTO public.profile_private(user_id, dob, is_18_plus)
    VALUES (NEW.id, _dob, _claimed_18)
    ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'user');
  INSERT INTO public.user_settings(user_id) VALUES (NEW.id);
  INSERT INTO public.dice_wallets(user_id, balance) VALUES (NEW.id, 500);
  INSERT INTO public.dice_transactions(user_id,type,amount,balance_before,balance_after,source,note)
    VALUES (NEW.id,'event',500,0,500,'welcome','Welcome bonus');
  RETURN NEW;
END $$;
