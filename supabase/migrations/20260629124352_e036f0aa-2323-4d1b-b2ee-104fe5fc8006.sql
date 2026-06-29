
-- Add missing enum labels (idempotent)
ALTER TYPE tx_type ADD VALUE IF NOT EXISTS 'auction_won';
ALTER TYPE tx_type ADD VALUE IF NOT EXISTS 'auction_outbid';
ALTER TYPE tx_type ADD VALUE IF NOT EXISTS 'expired';

-- Status column on bids (so we can mark outbid/won) + unique purchase
ALTER TABLE public.marketplace_bids
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
CREATE INDEX IF NOT EXISTS idx_bids_listing_status ON public.marketplace_bids(listing_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_per_listing
  ON public.marketplace_purchases(listing_id);
