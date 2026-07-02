
-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.crew_role AS ENUM ('owner','officer','member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.crew_join_status AS ENUM ('pending','accepted','rejected','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ TABLES ============
CREATE TABLE IF NOT EXISTS public.crews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  tag TEXT NOT NULL UNIQUE,
  description TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  owner_id UUID NOT NULL,
  member_count INT NOT NULL DEFAULT 1,
  max_members INT NOT NULL DEFAULT 30,
  level INT NOT NULL DEFAULT 1,
  xp BIGINT NOT NULL DEFAULT 0,
  weekly_score BIGINT NOT NULL DEFAULT 0,
  total_score BIGINT NOT NULL DEFAULT 0,
  is_open BOOLEAN NOT NULL DEFAULT true,
  min_level INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crews_name_len CHECK (char_length(name) BETWEEN 3 AND 30),
  CONSTRAINT crews_tag_len CHECK (char_length(tag) BETWEEN 2 AND 5),
  CONSTRAINT crews_tag_fmt CHECK (tag ~ '^[A-Z0-9]+$')
);
GRANT SELECT ON public.crews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crews TO authenticated;
GRANT ALL ON public.crews TO service_role;
ALTER TABLE public.crews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crews_public_read" ON public.crews FOR SELECT USING (true);
CREATE POLICY "crews_owner_update" ON public.crews FOR UPDATE
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS crews_weekly_score_idx ON public.crews (weekly_score DESC);
CREATE INDEX IF NOT EXISTS crews_total_score_idx ON public.crews (total_score DESC);

CREATE TABLE IF NOT EXISTS public.crew_members (
  crew_id UUID NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role crew_role NOT NULL DEFAULT 'member',
  contribution_weekly BIGINT NOT NULL DEFAULT 0,
  contribution_total BIGINT NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (crew_id, user_id),
  UNIQUE (user_id)  -- each user in at most one crew
);
GRANT SELECT ON public.crew_members TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crew_members TO authenticated;
GRANT ALL ON public.crew_members TO service_role;
ALTER TABLE public.crew_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crew_members_public_read" ON public.crew_members FOR SELECT USING (true);
CREATE INDEX IF NOT EXISTS crew_members_crew_idx ON public.crew_members (crew_id);

CREATE TABLE IF NOT EXISTS public.crew_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id UUID NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status crew_join_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crew_join_requests TO authenticated;
GRANT ALL ON public.crew_join_requests TO service_role;
ALTER TABLE public.crew_join_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crew_join_own_read" ON public.crew_join_requests FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.crew_members m
                WHERE m.crew_id = crew_join_requests.crew_id
                  AND m.user_id = auth.uid()
                  AND m.role IN ('owner','officer'))
  );
CREATE UNIQUE INDEX IF NOT EXISTS crew_join_unique_pending
  ON public.crew_join_requests (crew_id, user_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.crew_donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id UUID NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.crew_donations TO anon;
GRANT SELECT, INSERT ON public.crew_donations TO authenticated;
GRANT ALL ON public.crew_donations TO service_role;
ALTER TABLE public.crew_donations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crew_donations_public_read" ON public.crew_donations FOR SELECT USING (true);
CREATE INDEX IF NOT EXISTS crew_donations_crew_idx ON public.crew_donations (crew_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.crew_weekly_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  crew_id UUID NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  crew_name TEXT NOT NULL,
  crew_tag TEXT NOT NULL,
  score BIGINT NOT NULL,
  rank INT NOT NULL,
  reward_dice BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(week_start, crew_id)
);
GRANT SELECT ON public.crew_weekly_rankings TO anon, authenticated;
GRANT ALL ON public.crew_weekly_rankings TO service_role;
ALTER TABLE public.crew_weekly_rankings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crew_weekly_public_read" ON public.crew_weekly_rankings FOR SELECT USING (true);
CREATE INDEX IF NOT EXISTS crew_weekly_week_idx ON public.crew_weekly_rankings (week_start DESC, rank ASC);

-- ============ TRIGGERS ============
CREATE TRIGGER crews_updated_at BEFORE UPDATE ON public.crews
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.is_crew_officer(_user UUID, _crew UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.crew_members
    WHERE user_id = _user AND crew_id = _crew AND role IN ('owner','officer'));
$$;

-- ============ RPCS ============

-- CREATE CREW ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_crew_tx(
  _name TEXT, _tag TEXT, _description TEXT, _is_open BOOLEAN, _min_level INT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_lvl INT;
  v_cost BIGINT := 5000;
  v_id UUID;
  v_name TEXT := trim(_name);
  v_tag TEXT := upper(trim(_tag));
  v_op TEXT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF char_length(v_name) < 3 OR char_length(v_name) > 30 THEN RAISE EXCEPTION 'Name must be 3-30 chars'; END IF;
  IF v_tag !~ '^[A-Z0-9]{2,5}$' THEN RAISE EXCEPTION 'Tag must be 2-5 uppercase letters/numbers'; END IF;
  IF EXISTS (SELECT 1 FROM public.crew_members WHERE user_id = v_user) THEN
    RAISE EXCEPTION 'Leave your current crew first';
  END IF;
  SELECT level INTO v_lvl FROM public.profiles WHERE id = v_user;
  IF COALESCE(v_lvl, 1) < 5 THEN RAISE EXCEPTION 'Reach level 5 before founding a crew'; END IF;
  IF EXISTS (SELECT 1 FROM public.crews WHERE lower(name) = lower(v_name)) THEN
    RAISE EXCEPTION 'Name already taken';
  END IF;
  IF EXISTS (SELECT 1 FROM public.crews WHERE tag = v_tag) THEN
    RAISE EXCEPTION 'Tag already taken';
  END IF;

  v_op := 'crew_create:' || v_user::text || ':' || floor(extract(epoch from now()))::text;
  PERFORM public.wallet_adjust_idem(v_user, -v_cost, 'event'::tx_type,
    'crew_create', 'crew', NULL, 'Founded crew ' || v_name, v_op);

  INSERT INTO public.crews(name, tag, description, owner_id, is_open, min_level)
    VALUES (v_name, v_tag, NULLIF(trim(_description),''), v_user,
            COALESCE(_is_open, true), GREATEST(1, COALESCE(_min_level,1)))
    RETURNING id INTO v_id;

  INSERT INTO public.crew_members(crew_id, user_id, role) VALUES (v_id, v_user, 'owner');

  INSERT INTO public.activity_feed(user_id, kind, payload)
    VALUES (v_user, 'crew_founded', jsonb_build_object('crew_id', v_id, 'name', v_name, 'tag', v_tag));

  RETURN jsonb_build_object('ok', true, 'crew_id', v_id);
END $$;

-- JOIN / REQUEST TO JOIN ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_crew_tx(_crew_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_c public.crews;
  v_lvl INT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_c FROM public.crews WHERE id = _crew_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Crew not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.crew_members WHERE user_id = v_user) THEN
    RAISE EXCEPTION 'You are already in a crew';
  END IF;
  SELECT level INTO v_lvl FROM public.profiles WHERE id = v_user;
  IF COALESCE(v_lvl,1) < v_c.min_level THEN
    RAISE EXCEPTION 'Requires level %', v_c.min_level;
  END IF;
  IF v_c.member_count >= v_c.max_members THEN RAISE EXCEPTION 'Crew is full'; END IF;

  IF v_c.is_open THEN
    INSERT INTO public.crew_members(crew_id, user_id, role) VALUES (v_c.id, v_user, 'member');
    UPDATE public.crews SET member_count = member_count + 1 WHERE id = v_c.id;
    INSERT INTO public.activity_feed(user_id, kind, payload)
      VALUES (v_user, 'crew_joined', jsonb_build_object('crew_id', v_c.id, 'name', v_c.name));
    RETURN jsonb_build_object('ok', true, 'joined', true);
  ELSE
    INSERT INTO public.crew_join_requests(crew_id, user_id) VALUES (v_c.id, v_user)
      ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('ok', true, 'joined', false, 'requested', true);
  END IF;
END $$;

-- RESPOND TO JOIN REQUEST ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_crew_join_tx(_request_id UUID, _accept BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_req public.crew_join_requests;
  v_c public.crews;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_req FROM public.crew_join_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pending' THEN RAISE EXCEPTION 'Request unavailable'; END IF;
  IF NOT public.is_crew_officer(v_user, v_req.crew_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  IF NOT _accept THEN
    UPDATE public.crew_join_requests SET status='rejected', resolved_at=now() WHERE id = _request_id;
    INSERT INTO public.notifications(user_id, kind, title, body, link)
      VALUES (v_req.user_id, 'event', 'Crew request declined', 'Your crew join request was declined.', '/crews');
    RETURN jsonb_build_object('ok', true, 'accepted', false);
  END IF;

  SELECT * INTO v_c FROM public.crews WHERE id = v_req.crew_id FOR UPDATE;
  IF v_c.member_count >= v_c.max_members THEN RAISE EXCEPTION 'Crew is full'; END IF;
  IF EXISTS (SELECT 1 FROM public.crew_members WHERE user_id = v_req.user_id) THEN
    UPDATE public.crew_join_requests SET status='rejected', resolved_at=now() WHERE id = _request_id;
    RAISE EXCEPTION 'User is already in a crew';
  END IF;

  INSERT INTO public.crew_members(crew_id, user_id, role) VALUES (v_c.id, v_req.user_id, 'member');
  UPDATE public.crews SET member_count = member_count + 1 WHERE id = v_c.id;
  UPDATE public.crew_join_requests SET status='accepted', resolved_at=now() WHERE id = _request_id;
  INSERT INTO public.notifications(user_id, kind, title, body, link)
    VALUES (v_req.user_id, 'event', 'Welcome to ' || v_c.name, 'Your crew request was accepted.', '/crews/' || v_c.id::text);
  INSERT INTO public.activity_feed(user_id, kind, payload)
    VALUES (v_req.user_id, 'crew_joined', jsonb_build_object('crew_id', v_c.id, 'name', v_c.name));
  RETURN jsonb_build_object('ok', true, 'accepted', true);
END $$;

-- LEAVE / DISBAND -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_crew_tx()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_m public.crew_members;
  v_c public.crews;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_m FROM public.crew_members WHERE user_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'You are not in a crew'; END IF;
  SELECT * INTO v_c FROM public.crews WHERE id = v_m.crew_id FOR UPDATE;

  IF v_m.role = 'owner' THEN
    -- Disband whole crew
    DELETE FROM public.crews WHERE id = v_c.id;
    RETURN jsonb_build_object('ok', true, 'disbanded', true);
  END IF;

  DELETE FROM public.crew_members WHERE crew_id = v_m.crew_id AND user_id = v_user;
  UPDATE public.crews SET member_count = GREATEST(member_count - 1, 0) WHERE id = v_m.crew_id;
  RETURN jsonb_build_object('ok', true, 'left', true);
END $$;

-- KICK / PROMOTE ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kick_crew_member_tx(_target UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_actor public.crew_members;
  v_target public.crew_members;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_actor FROM public.crew_members WHERE user_id = v_user;
  IF NOT FOUND OR v_actor.role NOT IN ('owner','officer') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO v_target FROM public.crew_members WHERE user_id = _target AND crew_id = v_actor.crew_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_target.role = 'owner' THEN RAISE EXCEPTION 'Cannot kick the owner'; END IF;
  IF v_target.role = 'officer' AND v_actor.role <> 'owner' THEN RAISE EXCEPTION 'Only the owner can kick an officer'; END IF;

  DELETE FROM public.crew_members WHERE crew_id = v_actor.crew_id AND user_id = _target;
  UPDATE public.crews SET member_count = GREATEST(member_count - 1, 0) WHERE id = v_actor.crew_id;
  INSERT INTO public.notifications(user_id, kind, title, body, link)
    VALUES (_target, 'event', 'Removed from crew', 'You were removed from your crew.', '/crews');
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.set_crew_role_tx(_target UUID, _role crew_role)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_actor public.crew_members;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _role = 'owner' THEN RAISE EXCEPTION 'Ownership transfer not supported here'; END IF;
  SELECT * INTO v_actor FROM public.crew_members WHERE user_id = v_user;
  IF NOT FOUND OR v_actor.role <> 'owner' THEN RAISE EXCEPTION 'Only the owner can change roles'; END IF;
  UPDATE public.crew_members SET role = _role WHERE crew_id = v_actor.crew_id AND user_id = _target;
  RETURN jsonb_build_object('ok', true);
END $$;

-- DONATE --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.donate_to_crew_tx(_amount BIGINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_m public.crew_members;
  v_op TEXT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount IS NULL OR _amount < 100 OR _amount > 1000000 THEN
    RAISE EXCEPTION 'Donation must be 100-1,000,000 DICE';
  END IF;
  SELECT * INTO v_m FROM public.crew_members WHERE user_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Join a crew before donating'; END IF;

  v_op := 'crew_donate:' || v_user::text || ':' || floor(extract(epoch from now()))::text || ':' || _amount::text;
  PERFORM public.wallet_adjust_idem(v_user, -_amount, 'event'::tx_type,
    'crew_donate', 'crew', v_m.crew_id, 'Crew donation', v_op);

  INSERT INTO public.crew_donations(crew_id, user_id, amount) VALUES (v_m.crew_id, v_user, _amount);
  UPDATE public.crew_members
     SET contribution_weekly = contribution_weekly + _amount,
         contribution_total  = contribution_total  + _amount
   WHERE crew_id = v_m.crew_id AND user_id = v_user;
  UPDATE public.crews
     SET weekly_score = weekly_score + _amount,
         total_score  = total_score  + _amount,
         xp = xp + _amount,
         level = GREATEST(level, 1 + floor(ln(GREATEST(xp + _amount, 1)) / ln(2))::int)
   WHERE id = v_m.crew_id;

  RETURN jsonb_build_object('ok', true, 'amount', _amount);
END $$;

-- WEEKLY RANKINGS -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_weekly_crew_rankings()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_week DATE := date_trunc('week', (now() AT TIME ZONE 'UTC') - INTERVAL '1 day')::date;
  v_row RECORD;
  v_rank INT := 0;
  v_reward BIGINT;
  v_pot BIGINT[] := ARRAY[100000, 50000, 25000, 10000, 5000];
  v_winners JSONB := '[]'::jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM public.crew_weekly_rankings WHERE week_start = v_week) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_finalized');
  END IF;

  FOR v_row IN
    SELECT c.id, c.name, c.tag, c.weekly_score, c.owner_id
      FROM public.crews c
     WHERE c.weekly_score > 0
     ORDER BY c.weekly_score DESC
     LIMIT 25
  LOOP
    v_rank := v_rank + 1;
    v_reward := COALESCE(v_pot[v_rank], 0);
    INSERT INTO public.crew_weekly_rankings(week_start, crew_id, crew_name, crew_tag, score, rank, reward_dice)
      VALUES (v_week, v_row.id, v_row.name, v_row.tag, v_row.weekly_score, v_rank, v_reward);
    IF v_reward > 0 THEN
      -- Split reward to all members proportional to weekly contribution (min 1 DICE each)
      PERFORM public.wallet_adjust_idem(m.user_id,
        GREATEST(1, (v_reward * m.contribution_weekly) / NULLIF(v_row.weekly_score,0))::bigint,
        'event'::tx_type, 'crew_weekly', 'crew', v_row.id,
        'Weekly crew reward #' || v_rank::text,
        'crewwk:' || v_week::text || ':' || v_row.id::text || ':' || m.user_id::text)
      FROM public.crew_members m
      WHERE m.crew_id = v_row.id AND m.contribution_weekly > 0;

      INSERT INTO public.notifications(user_id, kind, title, body, link)
        SELECT m.user_id, 'event', 'Crew rank #' || v_rank,
               'Your crew finished #' || v_rank || ' this week!', '/crews/' || v_row.id::text
          FROM public.crew_members m WHERE m.crew_id = v_row.id;
    END IF;
    v_winners := v_winners || jsonb_build_object('rank', v_rank, 'crew_id', v_row.id, 'score', v_row.weekly_score);
  END LOOP;

  UPDATE public.crews SET weekly_score = 0;
  UPDATE public.crew_members SET contribution_weekly = 0;
  RETURN jsonb_build_object('ok', true, 'week', v_week, 'winners', v_winners);
END $$;

-- CRON: every Monday 00:05 UTC ---------------------------------------------
DO $$ BEGIN
  PERFORM cron.unschedule('finalize-crew-weekly');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('finalize-crew-weekly', '5 0 * * 1',
  $$ SELECT public.finalize_weekly_crew_rankings(); $$);
