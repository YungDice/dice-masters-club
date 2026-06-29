
-- Discord-style user tags
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tag text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_tag_unique ON public.profiles (upper(tag)) WHERE tag IS NOT NULL;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_tag_format;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_tag_format CHECK (tag IS NULL OR tag ~ '^[A-Z0-9]{2,6}$');

-- Marketplace: auction + tag listings
ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS sale_type text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS auction_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS min_bid bigint,
  ADD COLUMN IF NOT EXISTS current_bid bigint,
  ADD COLUMN IF NOT EXISTS current_bidder_id uuid,
  ADD COLUMN IF NOT EXISTS tag_value text,
  ADD COLUMN IF NOT EXISTS winner_id uuid;
ALTER TABLE public.marketplace_listings DROP CONSTRAINT IF EXISTS mkt_sale_type_chk;
ALTER TABLE public.marketplace_listings ADD CONSTRAINT mkt_sale_type_chk CHECK (sale_type IN ('fixed','auction'));

-- Bids table
CREATE TABLE IF NOT EXISTS public.marketplace_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  bidder_id uuid NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.marketplace_bids TO authenticated;
GRANT ALL ON public.marketplace_bids TO service_role;
ALTER TABLE public.marketplace_bids ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bids_read ON public.marketplace_bids;
DROP POLICY IF EXISTS bids_insert_self ON public.marketplace_bids;
CREATE POLICY bids_read ON public.marketplace_bids FOR SELECT TO authenticated USING (true);
CREATE POLICY bids_insert_self ON public.marketplace_bids FOR INSERT TO authenticated WITH CHECK (bidder_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_bids_listing ON public.marketplace_bids(listing_id, created_at DESC);
