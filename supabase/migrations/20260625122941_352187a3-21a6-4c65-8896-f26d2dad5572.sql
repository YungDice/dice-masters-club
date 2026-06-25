
-- VIP status on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vip_until TIMESTAMPTZ;

-- Chat messages can include media (VIP only at app layer)
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS media_kind TEXT;

-- Allow body to be empty when there's media
ALTER TABLE public.chat_messages ALTER COLUMN body DROP NOT NULL;

-- Level-up purchase / VIP purchase server fns will operate via admin client.
-- No new tables needed.
