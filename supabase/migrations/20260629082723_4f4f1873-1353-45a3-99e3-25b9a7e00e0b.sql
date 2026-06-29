
-- 1) Profiles: block self-write of privileged fields via trigger
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _caller uuid := auth.uid();
BEGIN
  -- Service role / definer paths bypass
  IF _caller IS NULL THEN RETURN NEW; END IF;
  -- Staff can edit anything
  IF public.is_staff(_caller) THEN RETURN NEW; END IF;
  -- For self-updates, restrict privileged columns
  IF NEW.vip_until    IS DISTINCT FROM OLD.vip_until    THEN NEW.vip_until    := OLD.vip_until;    END IF;
  IF NEW.level        IS DISTINCT FROM OLD.level        THEN NEW.level        := OLD.level;        END IF;
  IF NEW.xp           IS DISTINCT FROM OLD.xp           THEN NEW.xp           := OLD.xp;           END IF;
  IF NEW.reputation   IS DISTINCT FROM OLD.reputation   THEN NEW.reputation   := OLD.reputation;   END IF;
  IF NEW.streak_days  IS DISTINCT FROM OLD.streak_days  THEN NEW.streak_days  := OLD.streak_days;  END IF;
  IF NEW.is_18_plus   IS DISTINCT FROM OLD.is_18_plus   THEN NEW.is_18_plus   := OLD.is_18_plus;   END IF;
  IF NEW.dob          IS DISTINCT FROM OLD.dob          THEN NEW.dob          := OLD.dob;          END IF;
  IF NEW.tag          IS DISTINCT FROM OLD.tag          THEN NEW.tag          := OLD.tag;          END IF;
  IF NEW.username     IS DISTINCT FROM OLD.username     THEN NEW.username     := OLD.username;     END IF;
  IF NEW.username_changed_at IS DISTINCT FROM OLD.username_changed_at THEN NEW.username_changed_at := OLD.username_changed_at; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileged ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileged
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_fields();

-- 2) Gallery storage: restrict reads to owner/staff for private files; public files OK
DROP POLICY IF EXISTS gallery_read_auth ON storage.objects;
CREATE POLICY gallery_read_auth ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'gallery' AND (
    EXISTS (
      SELECT 1 FROM public.gallery_items gi
      WHERE gi.media_path = storage.objects.name
        AND (gi.is_public OR gi.user_id = auth.uid())
    )
    OR (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_staff(auth.uid())
  )
);

-- 3) Marketplace bids: restrict reads to bidder/seller/staff
DROP POLICY IF EXISTS mb_read ON public.marketplace_bids;
DROP POLICY IF EXISTS "marketplace_bids select" ON public.marketplace_bids;
DROP POLICY IF EXISTS marketplace_bids_select ON public.marketplace_bids;
CREATE POLICY mb_read ON public.marketplace_bids
FOR SELECT TO authenticated
USING (
  bidder_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.marketplace_listings ml WHERE ml.id = listing_id AND ml.seller_id = auth.uid())
  OR public.is_staff(auth.uid())
);
