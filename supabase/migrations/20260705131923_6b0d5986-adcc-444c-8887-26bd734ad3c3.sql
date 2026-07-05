
-- 1) Allow friends to see each other's tradeable baddies (needed for the Trades UI)
DROP POLICY IF EXISTS user_baddies_friend_read ON public.user_baddies;
CREATE POLICY user_baddies_friend_read ON public.user_baddies
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.requester_id = auth.uid() AND f.addressee_id = user_baddies.user_id)
          OR (f.addressee_id = auth.uid() AND f.requester_id = user_baddies.user_id)
        )
    )
  );

-- 2) Cosmetic submissions (user-created cosmetics, 25k DICE per submission, admin review)
CREATE TABLE IF NOT EXISTS public.cosmetic_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('title','frame','banner','emote','dice_skin')),
  name text NOT NULL,
  rarity text NOT NULL DEFAULT 'rare' CHECK (rarity IN ('common','uncommon','rare','epic','legendary','unreal')),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  price_dice integer NOT NULL DEFAULT 0 CHECK (price_dice >= 0),
  fee_paid integer NOT NULL DEFAULT 25000 CHECK (fee_paid >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewer_id uuid REFERENCES auth.users(id),
  review_notes text,
  cosmetic_id uuid REFERENCES public.cosmetics(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
GRANT SELECT, INSERT ON public.cosmetic_submissions TO authenticated;
GRANT ALL ON public.cosmetic_submissions TO service_role;
ALTER TABLE public.cosmetic_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cs_read_own ON public.cosmetic_submissions;
CREATE POLICY cs_read_own ON public.cosmetic_submissions FOR SELECT
  TO authenticated USING (submitter_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
DROP POLICY IF EXISTS cs_no_direct_insert ON public.cosmetic_submissions;
CREATE POLICY cs_no_direct_insert ON public.cosmetic_submissions FOR INSERT
  TO authenticated WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_cs_status ON public.cosmetic_submissions(status, created_at);

-- 3) Submit RPC — charges 25k DICE via wallet, creates pending row
CREATE OR REPLACE FUNCTION public.submit_cosmetic(
  _kind text, _name text, _rarity text, _meta jsonb, _price_dice integer
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _fee constant integer := 25000;
  _sub_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _kind NOT IN ('title','frame','banner','emote','dice_skin') THEN RAISE EXCEPTION 'invalid kind'; END IF;
  IF length(coalesce(_name,'')) < 2 THEN RAISE EXCEPTION 'name too short'; END IF;
  IF _price_dice < 0 OR _price_dice > 1000000 THEN RAISE EXCEPTION 'invalid price'; END IF;

  -- charge the submission fee
  PERFORM public.wallet_adjust_idem(
    _uid, (-_fee)::bigint, 'spend'::tx_type,
    'cosmetic_submission', 'cosmetic_submission', NULL::uuid,
    'Cosmetic submission fee',
    'cs_fee:' || _uid::text || ':' || gen_random_uuid()::text
  );

  INSERT INTO public.cosmetic_submissions(submitter_id, kind, name, rarity, meta, price_dice, fee_paid, status)
  VALUES (_uid, _kind, _name, coalesce(_rarity,'rare'), coalesce(_meta,'{}'::jsonb), _price_dice, _fee, 'pending')
  RETURNING id INTO _sub_id;

  RETURN _sub_id;
END $$;

GRANT EXECUTE ON FUNCTION public.submit_cosmetic(text,text,text,jsonb,integer) TO authenticated;

-- 4) Review RPC — admin/mod approve or reject a submission
CREATE OR REPLACE FUNCTION public.review_cosmetic_submission(
  _submission_id uuid, _approve boolean, _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.cosmetic_submissions%ROWTYPE;
  _slug text;
  _new_id uuid;
BEGIN
  IF _uid IS NULL OR NOT (public.has_role(_uid,'admin') OR public.has_role(_uid,'moderator')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT * INTO _row FROM public.cosmetic_submissions WHERE id = _submission_id FOR UPDATE;
  IF NOT FOUND OR _row.status <> 'pending' THEN RAISE EXCEPTION 'not pending'; END IF;

  IF _approve THEN
    _slug := 'user_' || substr(_row.submitter_id::text,1,8) || '_' || lower(regexp_replace(_row.name,'[^a-zA-Z0-9]+','_','g')) || '_' || substr(_submission_id::text,1,6);
    INSERT INTO public.cosmetics(kind, slug, name, rarity, price_dice, vip_only, meta, active)
    VALUES (_row.kind, _slug, _row.name, _row.rarity, _row.price_dice, false, _row.meta, true)
    RETURNING id INTO _new_id;

    UPDATE public.cosmetic_submissions
      SET status = 'approved', reviewer_id = _uid, review_notes = _notes, cosmetic_id = _new_id, reviewed_at = now()
      WHERE id = _submission_id;

    -- Auto-grant to the submitter
    INSERT INTO public.user_cosmetics(user_id, cosmetic_id)
      VALUES (_row.submitter_id, _new_id) ON CONFLICT DO NOTHING;

    RETURN _new_id;
  ELSE
    -- Refund the submission fee on rejection
    PERFORM public.wallet_adjust_idem(
      _row.submitter_id, _row.fee_paid::bigint, 'event'::tx_type,
      'cosmetic_submission_refund', 'cosmetic_submission', _submission_id,
      'Cosmetic submission refund',
      'cs_refund:' || _submission_id::text
    );
    UPDATE public.cosmetic_submissions
      SET status = 'rejected', reviewer_id = _uid, review_notes = _notes, reviewed_at = now()
      WHERE id = _submission_id;
    RETURN NULL;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.review_cosmetic_submission(uuid,boolean,text) TO authenticated;
