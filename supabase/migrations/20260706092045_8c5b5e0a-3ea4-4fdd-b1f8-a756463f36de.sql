-- Remove profile banners from the Cosmetics system.
-- Existing user-uploaded profiles.banner_url values are preserved.

UPDATE public.profiles SET equipped_banner_id = NULL WHERE equipped_banner_id IS NOT NULL;

DELETE FROM public.user_cosmetics
WHERE cosmetic_id IN (SELECT id FROM public.cosmetics WHERE kind = 'banner');

DELETE FROM public.cosmetic_submissions WHERE kind = 'banner';

DELETE FROM public.cosmetics WHERE kind = 'banner';