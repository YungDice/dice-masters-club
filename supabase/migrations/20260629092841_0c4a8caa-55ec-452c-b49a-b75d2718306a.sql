ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banner_url TEXT;

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL THEN RETURN NEW; END IF;
  IF public.is_staff(_caller) THEN RETURN NEW; END IF;
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
  -- banner_url: VIP-only field. Revert non-VIP changes.
  IF NEW.banner_url IS DISTINCT FROM OLD.banner_url AND NOT public.is_vip(_caller) THEN
    NEW.banner_url := OLD.banner_url;
  END IF;
  RETURN NEW;
END $function$;