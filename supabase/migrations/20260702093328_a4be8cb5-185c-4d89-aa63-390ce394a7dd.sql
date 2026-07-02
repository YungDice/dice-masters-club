
-- =========================
-- Cosmetics catalog
-- =========================
CREATE TABLE IF NOT EXISTS public.cosmetics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('title','frame','banner','emote','dice_skin')),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  rarity text NOT NULL DEFAULT 'common' CHECK (rarity IN ('common','uncommon','rare','epic','legendary','unreal')),
  price_dice integer NOT NULL DEFAULT 0 CHECK (price_dice >= 0),
  vip_only boolean NOT NULL DEFAULT false,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cosmetics TO anon, authenticated;
GRANT ALL ON public.cosmetics TO service_role;
ALTER TABLE public.cosmetics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cosmetics_read_all" ON public.cosmetics FOR SELECT USING (active);

-- =========================
-- User inventory
-- =========================
CREATE TABLE IF NOT EXISTS public.user_cosmetics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cosmetic_id uuid NOT NULL REFERENCES public.cosmetics(id) ON DELETE CASCADE,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, cosmetic_id)
);
CREATE INDEX IF NOT EXISTS idx_user_cosmetics_user ON public.user_cosmetics(user_id);

GRANT SELECT, INSERT, DELETE ON public.user_cosmetics TO authenticated;
GRANT ALL ON public.user_cosmetics TO service_role;
ALTER TABLE public.user_cosmetics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uc_read_own_or_public" ON public.user_cosmetics FOR SELECT USING (true);
CREATE POLICY "uc_no_direct_write" ON public.user_cosmetics FOR INSERT WITH CHECK (false);
CREATE POLICY "uc_no_direct_delete" ON public.user_cosmetics FOR DELETE USING (false);

-- =========================
-- Equipped slots on profile
-- =========================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS equipped_title_id      uuid REFERENCES public.cosmetics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS equipped_frame_id      uuid REFERENCES public.cosmetics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS equipped_banner_id     uuid REFERENCES public.cosmetics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS equipped_dice_skin_id  uuid REFERENCES public.cosmetics(id) ON DELETE SET NULL;

-- =========================
-- Buy / equip / unequip RPCs
-- =========================
CREATE OR REPLACE FUNCTION public.buy_cosmetic_tx(_cosmetic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_c   public.cosmetics%ROWTYPE;
  v_vip boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT * INTO v_c FROM public.cosmetics WHERE id = _cosmetic_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'cosmetic not found'; END IF;

  IF v_c.vip_only THEN
    SELECT COALESCE(vip_until, 'epoch'::timestamptz) > now() INTO v_vip FROM public.profiles WHERE id = v_uid;
    IF NOT COALESCE(v_vip, false) THEN RAISE EXCEPTION 'vip only cosmetic'; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_cosmetics WHERE user_id = v_uid AND cosmetic_id = _cosmetic_id) THEN
    RAISE EXCEPTION 'already owned';
  END IF;

  IF v_c.price_dice > 0 THEN
    PERFORM public.wallet_adjust_idem(
      v_uid, -v_c.price_dice, 'cosmetic_purchase'::text,
      'cosmetic:' || _cosmetic_id::text || ':' || gen_random_uuid()::text,
      jsonb_build_object('cosmetic_id', _cosmetic_id, 'slug', v_c.slug, 'name', v_c.name)
    );
  END IF;

  INSERT INTO public.user_cosmetics(user_id, cosmetic_id) VALUES (v_uid, _cosmetic_id);
  RETURN jsonb_build_object('ok', true, 'cosmetic_id', _cosmetic_id);
END;
$$;
REVOKE ALL ON FUNCTION public.buy_cosmetic_tx(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_cosmetic_tx(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.equip_cosmetic_tx(_cosmetic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_c   public.cosmetics%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT * INTO v_c FROM public.cosmetics WHERE id = _cosmetic_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'cosmetic not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_cosmetics WHERE user_id = v_uid AND cosmetic_id = _cosmetic_id) THEN
    RAISE EXCEPTION 'not owned';
  END IF;

  IF v_c.kind = 'title' THEN
    UPDATE public.profiles SET equipped_title_id = _cosmetic_id WHERE id = v_uid;
  ELSIF v_c.kind = 'frame' THEN
    UPDATE public.profiles SET equipped_frame_id = _cosmetic_id WHERE id = v_uid;
  ELSIF v_c.kind = 'banner' THEN
    UPDATE public.profiles SET equipped_banner_id = _cosmetic_id WHERE id = v_uid;
  ELSIF v_c.kind = 'dice_skin' THEN
    UPDATE public.profiles SET equipped_dice_skin_id = _cosmetic_id WHERE id = v_uid;
  ELSE
    RAISE EXCEPTION 'kind % is not equippable', v_c.kind;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.equip_cosmetic_tx(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equip_cosmetic_tx(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.unequip_cosmetic_tx(_kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _kind = 'title' THEN
    UPDATE public.profiles SET equipped_title_id = NULL WHERE id = v_uid;
  ELSIF _kind = 'frame' THEN
    UPDATE public.profiles SET equipped_frame_id = NULL WHERE id = v_uid;
  ELSIF _kind = 'banner' THEN
    UPDATE public.profiles SET equipped_banner_id = NULL WHERE id = v_uid;
  ELSIF _kind = 'dice_skin' THEN
    UPDATE public.profiles SET equipped_dice_skin_id = NULL WHERE id = v_uid;
  ELSE
    RAISE EXCEPTION 'invalid kind';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.unequip_cosmetic_tx(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unequip_cosmetic_tx(text) TO authenticated;

-- =========================
-- Seed catalog
-- =========================
INSERT INTO public.cosmetics (kind, slug, name, rarity, price_dice, vip_only, meta) VALUES
  -- Titles
  ('title','title_case_addict','Case Addict','rare',5000,false, jsonb_build_object('text','Case Addict','color','#f472b6')),
  ('title','title_unreal_hunter','Unreal Hunter','epic',15000,false, jsonb_build_object('text','Unreal Hunter','color','#a78bfa')),
  ('title','title_millionaire','Millionaire','legendary',50000,false, jsonb_build_object('text','Millionaire','color','#fbbf24')),
  ('title','title_high_roller','High Roller','rare',7500,false, jsonb_build_object('text','High Roller','color','#22d3ee')),
  ('title','title_dice_master','Dice Master','epic',20000,false, jsonb_build_object('text','Dice Master','color','#f87171')),
  ('title','title_vip_legend','VIP Legend','legendary',0,true, jsonb_build_object('text','VIP Legend','color','#fde047')),
  -- Frames
  ('frame','frame_bronze','Bronze Ring','common',2000,false, jsonb_build_object('ring','ring-2 ring-amber-700','glow','shadow-[0_0_10px_-2px_rgba(180,83,9,0.6)]')),
  ('frame','frame_silver','Silver Halo','uncommon',6000,false, jsonb_build_object('ring','ring-2 ring-slate-300','glow','shadow-[0_0_14px_-2px_rgba(203,213,225,0.7)]')),
  ('frame','frame_gold','Gold Crown','rare',15000,false, jsonb_build_object('ring','ring-2 ring-amber-300','glow','shadow-[0_0_18px_-2px_rgba(252,211,77,0.8)]')),
  ('frame','frame_neon','Neon Circuit','epic',30000,false, jsonb_build_object('ring','ring-2 ring-cyan-300','glow','shadow-[0_0_22px_-2px_rgba(103,232,249,0.9)]')),
  ('frame','frame_prestige','Prestige Aura','legendary',75000,false, jsonb_build_object('ring','ring-[3px] ring-fuchsia-400','glow','shadow-[0_0_28px_-2px_rgba(232,121,249,1)]')),
  ('frame','frame_diamond','Diamond Elite','unreal',0,true, jsonb_build_object('ring','ring-[3px] ring-cyan-200','glow','shadow-[0_0_36px_-2px_rgba(165,243,252,1)]')),
  -- Banners (CSS gradients)
  ('banner','banner_neon_night','Neon Night','uncommon',4000,false, jsonb_build_object('gradient','linear-gradient(135deg,#0f172a 0%,#3b0764 50%,#831843 100%)')),
  ('banner','banner_sunset','Sunset Strip','rare',10000,false, jsonb_build_object('gradient','linear-gradient(135deg,#7c2d12 0%,#dc2626 50%,#f59e0b 100%)')),
  ('banner','banner_matrix','Matrix Rain','epic',25000,false, jsonb_build_object('gradient','linear-gradient(135deg,#020617 0%,#064e3b 50%,#10b981 100%)')),
  ('banner','banner_royal','Royal Velvet','legendary',60000,false, jsonb_build_object('gradient','linear-gradient(135deg,#1e1b4b 0%,#6b21a8 50%,#fde047 100%)')),
  ('banner','banner_vip_aurora','VIP Aurora','unreal',0,true, jsonb_build_object('gradient','linear-gradient(135deg,#083344 0%,#a21caf 33%,#f97316 66%,#fde047 100%)')),
  -- Chat emotes (code -> emoji or unicode symbol)
  ('emote','emote_fire','Fire','common',500,false, jsonb_build_object('code',':fire:','emoji','🔥')),
  ('emote','emote_dice','Dice','common',500,false, jsonb_build_object('code',':dice:','emoji','🎲')),
  ('emote','emote_crown','Crown','uncommon',2000,false, jsonb_build_object('code',':crown:','emoji','👑')),
  ('emote','emote_money','Money','uncommon',2000,false, jsonb_build_object('code',':money:','emoji','💰')),
  ('emote','emote_skull','Skull','rare',5000,false, jsonb_build_object('code',':skull:','emoji','💀')),
  ('emote','emote_rocket','Rocket','rare',5000,false, jsonb_build_object('code',':rocket:','emoji','🚀')),
  ('emote','emote_gem','Gem','epic',12000,false, jsonb_build_object('code',':gem:','emoji','💎')),
  -- Dice skins
  ('dice_skin','skin_classic_red','Classic Red','common',1500,false, jsonb_build_object('color','#ef4444','pip','#ffffff')),
  ('dice_skin','skin_neon_cyan','Neon Cyan','uncommon',5000,false, jsonb_build_object('color','#06b6d4','pip','#0f172a')),
  ('dice_skin','skin_gold','Solid Gold','rare',12000,false, jsonb_build_object('color','#fbbf24','pip','#78350f')),
  ('dice_skin','skin_obsidian','Obsidian','epic',25000,false, jsonb_build_object('color','#020617','pip','#f472b6')),
  ('dice_skin','skin_prestige','Prestige Rainbow','legendary',65000,false, jsonb_build_object('color','linear-gradient(135deg,#f472b6,#a78bfa,#22d3ee)','pip','#ffffff'))
ON CONFLICT (slug) DO NOTHING;
