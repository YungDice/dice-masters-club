
-- 1) marketplace_bids: drop the overly permissive duplicate SELECT policy
DROP POLICY IF EXISTS bids_read ON public.marketplace_bids;

-- 2) profiles: revoke direct column writes for server-controlled fields
REVOKE UPDATE (vip_until, level, xp, tag, reputation, streak_days, banner_url, is_18_plus, dob, username, username_changed_at) ON public.profiles FROM authenticated;

-- 3) SECURITY DEFINER functions: restrict EXECUTE on privileged ones
REVOKE EXECUTE ON FUNCTION public.wallet_adjust(uuid, bigint, tx_type, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_stale_data() FROM PUBLIC, anon, authenticated;

-- 4) storage.objects: tighten avatar reads
DROP POLICY IF EXISTS "avatars read" ON storage.objects;
CREATE POLICY "avatars read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'avatars' AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.avatar_url IS NOT NULL
        AND p.avatar_url LIKE '%' || name
    )
  )
);

-- 5) storage.objects: tighten marketplace reads to owner or files of active listings
DROP POLICY IF EXISTS "mkt read" ON storage.objects;
CREATE POLICY "mkt read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'marketplace' AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.marketplace_listings ml
      WHERE ml.status = 'active'
        AND (ml.preview_url LIKE '%' || name OR ml.file_url LIKE '%' || name)
    )
  )
);
