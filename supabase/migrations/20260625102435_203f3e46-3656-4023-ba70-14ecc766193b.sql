
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('user','moderator','admin');
CREATE TYPE public.challenge_status AS ENUM ('draft','pending_review','approved','rejected','active','closed','archived');
CREATE TYPE public.challenge_category AS ENUM ('fitness','creativity','gaming','social','photography','video','daily','community','skill','funny','custom');
CREATE TYPE public.difficulty AS ENUM ('easy','medium','hard','extreme');
CREATE TYPE public.proof_type AS ENUM ('text','photo','gif','video','camera','live_camera','admin_review','community_vote','auto_timer');
CREATE TYPE public.proof_status AS ENUM ('pending','approved','rejected');
CREATE TYPE public.tx_type AS ENUM ('challenge_reward','game_win','game_stake','game_payout','daily_reward','streak_reward','achievement','event','referral','marketplace_sale','marketplace_purchase','admin_adjust','escrow_lock','escrow_release','refund');
CREATE TYPE public.game_kind AS ENUM ('dice','coinflip','poker','blackjack','slots','split_steal');
CREATE TYPE public.room_status AS ENUM ('waiting','active','finished','cancelled');
CREATE TYPE public.report_status AS ENUM ('open','reviewing','resolved','dismissed');
CREATE TYPE public.listing_status AS ENUM ('draft','pending_review','active','sold','removed','rejected');
CREATE TYPE public.friend_status AS ENUM ('pending','accepted','blocked');
CREATE TYPE public.notification_kind AS ENUM ('friend_request','friend_accept','challenge_invite','challenge_approved','challenge_rejected','proof_result','game_invite','game_turn','marketplace_sale','marketplace_purchase','badge_unlock','leaderboard','admin_announcement');

CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT, bio TEXT, country TEXT,
  dob DATE NOT NULL,
  is_18_plus BOOLEAN NOT NULL DEFAULT false,
  terms_accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  level INT NOT NULL DEFAULT 1, xp INT NOT NULL DEFAULT 0,
  reputation INT NOT NULL DEFAULT 0, streak_days INT NOT NULL DEFAULT 0,
  last_login_at TIMESTAMPTZ,
  privacy_activity TEXT NOT NULL DEFAULT 'friends' CHECK (privacy_activity IN ('public','friends','private')),
  privacy_profile TEXT NOT NULL DEFAULT 'public' CHECK (privacy_profile IN ('public','friends','private')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_read ON public.profiles FOR SELECT USING (true);
CREATE POLICY p_ins ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY p_upd ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY ur_own ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','moderator'))
$$;
CREATE POLICY ur_staff ON public.user_roles FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- SETTINGS
CREATE TABLE public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  notif_friend_requests BOOLEAN NOT NULL DEFAULT true,
  notif_challenges BOOLEAN NOT NULL DEFAULT true,
  notif_games BOOLEAN NOT NULL DEFAULT true,
  notif_marketplace BOOLEAN NOT NULL DEFAULT true,
  responsible_play_break_minutes INT NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY us_own ON public.user_settings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER settings_updated BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- WALLETS
CREATE TABLE public.dice_wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance BIGINT NOT NULL DEFAULT 500 CHECK (balance >= 0),
  locked BIGINT NOT NULL DEFAULT 0 CHECK (locked >= 0),
  lifetime_earned BIGINT NOT NULL DEFAULT 0,
  lifetime_spent BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dice_wallets TO authenticated;
GRANT ALL ON public.dice_wallets TO service_role;
ALTER TABLE public.dice_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY w_own ON public.dice_wallets FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY w_staff ON public.dice_wallets FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- TRANSACTIONS
CREATE TABLE public.dice_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type tx_type NOT NULL,
  amount BIGINT NOT NULL,
  balance_before BIGINT NOT NULL, balance_after BIGINT NOT NULL,
  source TEXT, ref_kind TEXT, ref_id UUID, note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tx_user ON public.dice_transactions(user_id, created_at DESC);
GRANT SELECT ON public.dice_transactions TO authenticated;
GRANT ALL ON public.dice_transactions TO service_role;
ALTER TABLE public.dice_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tx_own ON public.dice_transactions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY tx_staff ON public.dice_transactions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.wallet_adjust(_user UUID, _delta BIGINT, _type tx_type, _source TEXT, _ref_kind TEXT, _ref_id UUID, _note TEXT)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _bef BIGINT; _aft BIGINT;
BEGIN
  INSERT INTO public.dice_wallets(user_id) VALUES (_user) ON CONFLICT DO NOTHING;
  SELECT balance INTO _bef FROM public.dice_wallets WHERE user_id = _user FOR UPDATE;
  _aft := _bef + _delta;
  IF _aft < 0 THEN RAISE EXCEPTION 'Insufficient DICE balance'; END IF;
  UPDATE public.dice_wallets SET balance = _aft,
    lifetime_earned = lifetime_earned + GREATEST(_delta,0),
    lifetime_spent  = lifetime_spent  + GREATEST(-_delta,0),
    updated_at = now()
  WHERE user_id = _user;
  INSERT INTO public.dice_transactions(user_id,type,amount,balance_before,balance_after,source,ref_kind,ref_id,note)
    VALUES (_user,_type,_delta,_bef,_aft,_source,_ref_kind,_ref_id,_note);
  RETURN _aft;
END $$;
REVOKE ALL ON FUNCTION public.wallet_adjust(UUID,BIGINT,tx_type,TEXT,TEXT,UUID,TEXT) FROM PUBLIC, authenticated, anon;

-- SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uname TEXT; _dname TEXT; _dob DATE;
BEGIN
  _uname := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1) || substr(NEW.id::text,1,4));
  _dname := COALESCE(NEW.raw_user_meta_data->>'display_name', _uname);
  _dob   := COALESCE((NEW.raw_user_meta_data->>'dob')::DATE, '2000-01-01'::DATE);
  INSERT INTO public.profiles(id, username, display_name, dob, is_18_plus)
    VALUES (NEW.id, _uname, _dname, _dob, (NEW.raw_user_meta_data->>'is_18_plus')::boolean IS TRUE);
  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'user');
  INSERT INTO public.user_settings(user_id) VALUES (NEW.id);
  INSERT INTO public.dice_wallets(user_id, balance) VALUES (NEW.id, 500);
  INSERT INTO public.dice_transactions(user_id,type,amount,balance_before,balance_after,source,note)
    VALUES (NEW.id,'event',500,0,500,'welcome','Welcome bonus');
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- FRIENDSHIPS
CREATE TABLE public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status friend_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT ALL ON public.friendships TO service_role;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
CREATE POLICY f_read ON public.friendships FOR SELECT TO authenticated USING (requester_id = auth.uid() OR addressee_id = auth.uid());
CREATE POLICY f_ins ON public.friendships FOR INSERT TO authenticated WITH CHECK (requester_id = auth.uid());
CREATE POLICY f_upd ON public.friendships FOR UPDATE TO authenticated USING (addressee_id = auth.uid() OR requester_id = auth.uid());
CREATE POLICY f_del ON public.friendships FOR DELETE TO authenticated USING (requester_id = auth.uid() OR addressee_id = auth.uid());
CREATE TRIGGER friend_updated BEFORE UPDATE ON public.friendships FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- CHALLENGES
CREATE TABLE public.challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL, description TEXT NOT NULL, rules TEXT,
  category challenge_category NOT NULL,
  difficulty difficulty NOT NULL DEFAULT 'easy',
  proof_type proof_type NOT NULL DEFAULT 'photo',
  dice_reward INT NOT NULL DEFAULT 0 CHECK (dice_reward >= 0),
  xp_reward INT NOT NULL DEFAULT 0 CHECK (xp_reward >= 0),
  max_participants INT, deadline TIMESTAMPTZ,
  status challenge_status NOT NULL DEFAULT 'pending_review',
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_daily BOOLEAN NOT NULL DEFAULT false,
  cover_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chal_status ON public.challenges(status);
GRANT SELECT, INSERT, UPDATE ON public.challenges TO authenticated;
GRANT SELECT ON public.challenges TO anon;
GRANT ALL ON public.challenges TO service_role;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY c_read ON public.challenges FOR SELECT USING (status IN ('approved','active','closed') OR creator_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY c_ins ON public.challenges FOR INSERT TO authenticated WITH CHECK (creator_id = auth.uid());
CREATE POLICY c_upd_own ON public.challenges FOR UPDATE TO authenticated USING (creator_id = auth.uid() AND status IN ('draft','pending_review','rejected')) WITH CHECK (creator_id = auth.uid());
CREATE POLICY c_upd_staff ON public.challenges FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE TRIGGER chal_updated BEFORE UPDATE ON public.challenges FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.challenge_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(challenge_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.challenge_participants TO authenticated;
GRANT ALL ON public.challenge_participants TO service_role;
ALTER TABLE public.challenge_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY cp_read ON public.challenge_participants FOR SELECT USING (true);
CREATE POLICY cp_ins ON public.challenge_participants FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY cp_del ON public.challenge_participants FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.challenge_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text_response TEXT, media_url TEXT, media_kind TEXT, caption TEXT,
  status proof_status NOT NULL DEFAULT 'pending',
  reviewer_id UUID REFERENCES auth.users(id), reviewer_notes TEXT, reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.challenge_proofs TO authenticated;
GRANT ALL ON public.challenge_proofs TO service_role;
ALTER TABLE public.challenge_proofs ENABLE ROW LEVEL SECURITY;
CREATE POLICY pf_read ON public.challenge_proofs FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()) OR status = 'approved');
CREATE POLICY pf_ins ON public.challenge_proofs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY pf_upd_own ON public.challenge_proofs FOR UPDATE TO authenticated USING (user_id = auth.uid() AND status = 'pending') WITH CHECK (user_id = auth.uid());
CREATE POLICY pf_upd_staff ON public.challenge_proofs FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY pf_del ON public.challenge_proofs FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER proof_updated BEFORE UPDATE ON public.challenge_proofs FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.challenge_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.challenge_comments TO authenticated;
GRANT ALL ON public.challenge_comments TO service_role;
ALTER TABLE public.challenge_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY cc_read ON public.challenge_comments FOR SELECT USING (true);
CREATE POLICY cc_ins ON public.challenge_comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY cc_del ON public.challenge_comments FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE TABLE public.challenge_likes (
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (challenge_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.challenge_likes TO authenticated;
GRANT ALL ON public.challenge_likes TO service_role;
ALTER TABLE public.challenge_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY cl_read ON public.challenge_likes FOR SELECT USING (true);
CREATE POLICY cl_ins ON public.challenge_likes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY cl_del ON public.challenge_likes FOR DELETE TO authenticated USING (user_id = auth.uid());

-- GAMES (create players BEFORE rooms policy that references it)
CREATE TABLE public.game_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind game_kind NOT NULL,
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stake BIGINT NOT NULL DEFAULT 0 CHECK (stake >= 0),
  max_players INT NOT NULL DEFAULT 2,
  is_private BOOLEAN NOT NULL DEFAULT false,
  invite_code TEXT UNIQUE,
  status room_status NOT NULL DEFAULT 'waiting',
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  winner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX idx_room_status ON public.game_rooms(kind,status);
GRANT SELECT, INSERT, UPDATE ON public.game_rooms TO authenticated;
GRANT ALL ON public.game_rooms TO service_role;
ALTER TABLE public.game_rooms ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.game_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seat INT NOT NULL DEFAULT 0,
  staked BIGINT NOT NULL DEFAULT 0,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(room_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_players TO authenticated;
GRANT ALL ON public.game_players TO service_role;
ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY gp_read ON public.game_players FOR SELECT USING (true);
CREATE POLICY gp_ins ON public.game_players FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY gr_read ON public.game_rooms FOR SELECT USING (
  NOT is_private OR host_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.game_players WHERE room_id = game_rooms.id AND user_id = auth.uid())
);
CREATE POLICY gr_ins ON public.game_rooms FOR INSERT TO authenticated WITH CHECK (host_id = auth.uid());
CREATE POLICY gr_upd ON public.game_rooms FOR UPDATE TO authenticated USING (host_id = auth.uid());
CREATE TRIGGER room_updated BEFORE UPDATE ON public.game_rooms FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.game_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind game_kind NOT NULL,
  delta BIGINT NOT NULL,
  outcome TEXT, details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gr_user ON public.game_results(user_id, created_at DESC);
GRANT SELECT ON public.game_results TO authenticated;
GRANT ALL ON public.game_results TO service_role;
ALTER TABLE public.game_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY grs_read ON public.game_results FOR SELECT USING (true);

CREATE TABLE public.game_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.game_invites TO authenticated;
GRANT ALL ON public.game_invites TO service_role;
ALTER TABLE public.game_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY gi_read ON public.game_invites FOR SELECT TO authenticated USING (inviter_id = auth.uid() OR invitee_id = auth.uid());
CREATE POLICY gi_ins ON public.game_invites FOR INSERT TO authenticated WITH CHECK (inviter_id = auth.uid());
CREATE POLICY gi_upd ON public.game_invites FOR UPDATE TO authenticated USING (invitee_id = auth.uid());

-- MARKETPLACE
CREATE TABLE public.marketplace_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT NOT NULL,
  category TEXT NOT NULL,
  price BIGINT NOT NULL CHECK (price >= 0),
  preview_url TEXT, file_url TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  license_notes TEXT,
  ownership_confirmed BOOLEAN NOT NULL DEFAULT false,
  status listing_status NOT NULL DEFAULT 'pending_review',
  sales_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.marketplace_listings TO authenticated;
GRANT SELECT ON public.marketplace_listings TO anon;
GRANT ALL ON public.marketplace_listings TO service_role;
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ml_read ON public.marketplace_listings FOR SELECT USING (status = 'active' OR seller_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY ml_ins ON public.marketplace_listings FOR INSERT TO authenticated WITH CHECK (seller_id = auth.uid() AND ownership_confirmed = true);
CREATE POLICY ml_upd ON public.marketplace_listings FOR UPDATE TO authenticated USING ((seller_id = auth.uid() AND status IN ('draft','pending_review','rejected')) OR public.is_staff(auth.uid()));
CREATE TRIGGER list_updated BEFORE UPDATE ON public.marketplace_listings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.marketplace_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.marketplace_purchases TO authenticated;
GRANT ALL ON public.marketplace_purchases TO service_role;
ALTER TABLE public.marketplace_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY mp_read ON public.marketplace_purchases FOR SELECT TO authenticated USING (buyer_id = auth.uid() OR seller_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE TABLE public.marketplace_favorites (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);
GRANT SELECT, INSERT, DELETE ON public.marketplace_favorites TO authenticated;
GRANT ALL ON public.marketplace_favorites TO service_role;
ALTER TABLE public.marketplace_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY mf_own ON public.marketplace_favorites FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind notification_kind NOT NULL,
  title TEXT NOT NULL, body TEXT, link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user ON public.notifications(user_id, created_at DESC);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY n_own ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY n_upd ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY n_del ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ACHIEVEMENTS
CREATE TABLE public.achievements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL, description TEXT NOT NULL, icon TEXT,
  dice_reward INT NOT NULL DEFAULT 0, xp_reward INT NOT NULL DEFAULT 0
);
GRANT SELECT ON public.achievements TO authenticated, anon;
GRANT ALL ON public.achievements TO service_role;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY a_read ON public.achievements FOR SELECT USING (true);

CREATE TABLE public.user_achievements (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, achievement_id)
);
GRANT SELECT ON public.user_achievements TO authenticated, anon;
GRANT ALL ON public.user_achievements TO service_role;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY ua_read ON public.user_achievements FOR SELECT USING (true);

-- REPORTS / MOD / ANN / FEED / AUDIT
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL, target_id UUID NOT NULL,
  reason TEXT NOT NULL, details TEXT,
  status report_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY r_ins ON public.reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
CREATE POLICY r_read ON public.reports FOR SELECT TO authenticated USING (reporter_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY r_upd ON public.reports FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

CREATE TABLE public.moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_kind TEXT NOT NULL, target_id UUID NOT NULL,
  reason TEXT, metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.moderation_actions TO authenticated;
GRANT ALL ON public.moderation_actions TO service_role;
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ma_read ON public.moderation_actions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY ma_ins ON public.moderation_actions FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()) AND moderator_id = auth.uid());

CREATE TABLE public.admin_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, body TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_announcements TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.admin_announcements TO authenticated;
GRANT ALL ON public.admin_announcements TO service_role;
ALTER TABLE public.admin_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY an_read ON public.admin_announcements FOR SELECT USING (true);
CREATE POLICY an_ins ON public.admin_announcements FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY an_upd ON public.admin_announcements FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY an_del ON public.admin_announcements FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT, link TEXT,
  visibility TEXT NOT NULL DEFAULT 'friends' CHECK (visibility IN ('public','friends','private')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_feed_user ON public.activity_feed(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.activity_feed TO authenticated;
GRANT ALL ON public.activity_feed TO service_role;
ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;
CREATE POLICY af_read ON public.activity_feed FOR SELECT USING (
  visibility = 'public' OR user_id = auth.uid()
  OR (visibility = 'friends' AND EXISTS (
    SELECT 1 FROM public.friendships f WHERE f.status='accepted'
      AND ((f.requester_id = auth.uid() AND f.addressee_id = activity_feed.user_id)
        OR (f.addressee_id = auth.uid() AND f.requester_id = activity_feed.user_id))
  ))
);
CREATE POLICY af_ins ON public.activity_feed FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, entity TEXT, entity_id UUID, metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY al_read ON public.audit_logs FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_results;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_feed;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
ALTER PUBLICATION supabase_realtime ADD TABLE public.challenge_proofs;

-- STORAGE POLICIES (private buckets)
-- avatars: anyone can read, owner can write under their userId folder
CREATE POLICY "avatars read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "avatars write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars del" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
-- proof-media: owner read+write, staff read; others can read approved via signed URL only
CREATE POLICY "proof read own" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'proof-media' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_staff(auth.uid())));
CREATE POLICY "proof write own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'proof-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "proof update own" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'proof-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "proof del own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'proof-media' AND (storage.foldername(name))[1] = auth.uid()::text);
-- marketplace: public read, owner write
CREATE POLICY "mkt read" ON storage.objects FOR SELECT USING (bucket_id = 'marketplace');
CREATE POLICY "mkt write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'marketplace' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "mkt update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'marketplace' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "mkt del" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'marketplace' AND (storage.foldername(name))[1] = auth.uid()::text);

-- SEED ACHIEVEMENTS
INSERT INTO public.achievements(id,name,description,icon,dice_reward,xp_reward) VALUES
('first_challenge','First Challenge','Complete your first challenge','trophy',50,20),
('pushup_pro','Push-Up Pro','Complete a push-up challenge','dumbbell',75,25),
('poker_starter','Poker Starter','Play your first hand of poker','spade',50,20),
('coinflip_champ','Coin Flip Champion','Win 10 coin flips','coins',100,50),
('marketplace_seller','Marketplace Seller','Sell your first item','store',75,30),
('social_player','Social Player','Add 5 friends','users',50,25),
('streak_7','7-Day Streak','Log in 7 days in a row','flame',100,40),
('streak_30','30-Day Streak','Log in 30 days in a row','flame',500,200),
('high_roller','High Roller','Stake 1000+ DICE in one game','gem',150,75),
('top10','Top 10 Leaderboard','Reach the weekly top 10','crown',300,150),
('verified_creator','Verified Creator','Get 5 challenges approved','badge-check',200,100);

-- SEED FEATURED CHALLENGES
INSERT INTO public.challenges(title,description,rules,category,difficulty,proof_type,dice_reward,xp_reward,status,is_featured,is_daily,tags) VALUES
('Do 10 Push-Ups','Record yourself doing 10 clean push-ups.','Full range of motion. Chest near the floor. No knees.','fitness','easy','video',75,30,'active',true,true,ARRAY['fitness','daily']),
('Photo of Something Blue','Take a creative photo of something blue.','One photo, no heavy filters.','photography','easy','photo',40,15,'active',true,false,ARRAY['photo','creative']),
('10-Second Funny Dance','Record a 10-second dance. Keep it light and fun.','Be safe. Keep it PG.','creativity','easy','video',60,25,'active',true,false,ARRAY['dance','fun']),
('60-Second Plank','Hold a plank for at least 60 seconds.','Keep a straight back. Show a timer or count out loud.','fitness','medium','video',120,60,'active',true,false,ARRAY['fitness']),
('Show a Card Trick','Perform any safe card trick on camera.','One take preferred.','skill','medium','video',90,40,'active',true,false,ARRAY['skill','magic']);
