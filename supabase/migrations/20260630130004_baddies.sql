-- DICE Baddies: capacity is 2 normally and 4 with active VIP.
-- Income is calculated and credited only inside a locked server transaction.

CREATE TABLE IF NOT EXISTS public.baddies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  rarity text NOT NULL CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  income_per_hour integer NOT NULL CHECK (income_per_hour > 0),
  last_collected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS baddies_user_created_idx ON public.baddies(user_id, created_at);
GRANT SELECT ON public.baddies TO authenticated;
GRANT ALL ON public.baddies TO service_role;
ALTER TABLE public.baddies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS baddies_own_read ON public.baddies;
CREATE POLICY baddies_own_read ON public.baddies FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP TRIGGER IF EXISTS baddies_updated_at ON public.baddies;
CREATE TRIGGER baddies_updated_at BEFORE UPDATE ON public.baddies
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.create_baddie_tx(
  _user uuid, _name text, _rarity text, _income_per_hour integer
) RETURNS public.baddies
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _cap integer; _count integer; _row public.baddies;
BEGIN
  PERFORM 1 FROM public.profiles WHERE id = _user FOR UPDATE;
  SELECT CASE WHEN COALESCE(vip_until > now(), false) THEN 4 ELSE 2 END
    INTO _cap FROM public.profiles WHERE id = _user;
  SELECT count(*) INTO _count FROM public.baddies WHERE user_id = _user;
  IF _count >= _cap THEN RAISE EXCEPTION 'Your Baddie Base is full (% slots)', _cap; END IF;
  IF _rarity NOT IN ('common','rare','epic','legendary') OR _income_per_hour NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Invalid Baddie';
  END IF;
  INSERT INTO public.baddies(user_id, name, rarity, income_per_hour)
    VALUES (_user, _name, _rarity, _income_per_hour)
    RETURNING * INTO _row;
  RETURN _row;
END $$;

CREATE OR REPLACE FUNCTION public.collect_baddie_income_tx(_user uuid, _baddie_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _b public.baddies; _seconds bigint; _amount bigint; _op text;
BEGIN
  SELECT * INTO _b FROM public.baddies
    WHERE id = _baddie_id AND user_id = _user
    FOR UPDATE;
  IF _b.id IS NULL THEN RAISE EXCEPTION 'Baddie not found'; END IF;

  -- Cap banked time at 48 hours so no inactive account can generate unlimited currency.
  _seconds := LEAST(GREATEST(0, EXTRACT(EPOCH FROM (now() - _b.last_collected_at))::bigint), 172800);
  _amount := floor((_b.income_per_hour::numeric * _seconds::numeric) / 3600)::bigint;
  IF _amount <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'amount', 0, 'last_collected_at', _b.last_collected_at);
  END IF;

  _op := 'baddie-collect:' || _b.id::text || ':' || EXTRACT(EPOCH FROM _b.last_collected_at)::bigint::text;
  PERFORM public.wallet_adjust_idem(
    _user, _amount, 'event'::public.tx_type,
    'baddie_income', 'baddie', _b.id,
    'Collected income from ' || _b.name, _op
  );
  UPDATE public.baddies SET last_collected_at = now() WHERE id = _b.id;
  RETURN jsonb_build_object('ok', true, 'amount', _amount, 'last_collected_at', now());
END $$;

REVOKE ALL ON FUNCTION public.create_baddie_tx(uuid,text,text,integer) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.collect_baddie_income_tx(uuid,uuid) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_baddie_tx(uuid,text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.collect_baddie_income_tx(uuid,uuid) TO service_role;
