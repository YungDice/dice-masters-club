-- Tighten security definer executables and storage read policies

-- 1) Revoke public/anon EXECUTE on trigger-only SECURITY DEFINER function
REVOKE ALL ON FUNCTION public.enforce_report_rate_limit() FROM PUBLIC, anon, authenticated;

-- 2) Replace substring-based storage read policies with exact-suffix path matches
DROP POLICY IF EXISTS "avatars read" ON storage.objects;
CREATE POLICY "avatars read" ON storage.objects
FOR SELECT
USING (
  bucket_id = 'avatars'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.avatar_url IS NOT NULL
        AND p.avatar_url LIKE '%/avatars/' || objects.name
    )
  )
);

DROP POLICY IF EXISTS "mkt read" ON storage.objects;
CREATE POLICY "mkt read" ON storage.objects
FOR SELECT
USING (
  bucket_id = 'marketplace'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.marketplace_listings ml
      WHERE ml.status = 'active'::listing_status
        AND (
          ml.preview_url LIKE '%/marketplace/' || objects.name
          OR ml.file_url LIKE '%/marketplace/' || objects.name
        )
    )
  )
);