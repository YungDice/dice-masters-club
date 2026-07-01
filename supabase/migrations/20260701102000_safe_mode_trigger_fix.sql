CREATE OR REPLACE FUNCTION public.guard_protected_baddie()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_protected
     AND COALESCE(current_setting('app.allow_protected_baddie', true), '') <> '1' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Protected Baddies cannot be removed. Disable Safe Mode first.';
    END IF;
    IF NEW.listing_id IS DISTINCT FROM OLD.listing_id AND NEW.listing_id IS NOT NULL THEN
      RAISE EXCEPTION 'Protected Baddies cannot be listed. Disable Safe Mode first.';
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Protected Baddies cannot be traded. Disable Safe Mode first.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;
