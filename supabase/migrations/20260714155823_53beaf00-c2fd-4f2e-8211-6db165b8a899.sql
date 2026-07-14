-- Restore bypass paths on privileged-field protection triggers.
-- Without these, SECURITY DEFINER RPCs and service_role writes are silently reverted.

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _bypass TEXT;
  _caller UUID;
BEGIN
  -- Server-side bypass: SECURITY DEFINER RPCs set this GUC before privileged UPDATE.
  BEGIN
    _bypass := current_setting('app.bypass_profile_protect', true);
  EXCEPTION WHEN OTHERS THEN
    _bypass := NULL;
  END;
  IF _bypass = '1' THEN RETURN NEW; END IF;

  _caller := auth.uid();
  -- Service role / trigger context (no JWT): allow.
  IF _caller IS NULL THEN RETURN NEW; END IF;
  -- Staff: allow.
  IF public.is_staff(_caller) THEN RETURN NEW; END IF;

  IF NEW.vip_until    IS DISTINCT FROM OLD.vip_until    THEN NEW.vip_until    := OLD.vip_until;    END IF;
  IF NEW.level        IS DISTINCT FROM OLD.level        THEN NEW.level        := OLD.level;        END IF;
  IF NEW.xp           IS DISTINCT FROM OLD.xp           THEN NEW.xp           := OLD.xp;           END IF;
  IF NEW.tag          IS DISTINCT FROM OLD.tag          THEN NEW.tag          := OLD.tag;          END IF;
  IF NEW.reputation   IS DISTINCT FROM OLD.reputation   THEN NEW.reputation   := OLD.reputation;   END IF;
  IF NEW.streak_days  IS DISTINCT FROM OLD.streak_days  THEN NEW.streak_days  := OLD.streak_days;  END IF;
  IF NEW.username     IS DISTINCT FROM OLD.username     THEN NEW.username     := OLD.username;     END IF;
  IF NEW.username_changed_at IS DISTINCT FROM OLD.username_changed_at THEN NEW.username_changed_at := OLD.username_changed_at; END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.protect_dominion_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _bypass TEXT;
  _caller UUID;
BEGIN
  BEGIN
    _bypass := current_setting('app.bypass_dominion_protect', true);
  EXCEPTION WHEN OTHERS THEN
    _bypass := NULL;
  END;
  IF _bypass = '1' THEN RETURN NEW; END IF;

  _caller := auth.uid();
  IF _caller IS NULL THEN RETURN NEW; END IF;
  IF public.is_staff(_caller) THEN RETURN NEW; END IF;

  IF NEW.power           IS DISTINCT FROM OLD.power           THEN NEW.power           := OLD.power;           END IF;
  IF NEW.scrap           IS DISTINCT FROM OLD.scrap           THEN NEW.scrap           := OLD.scrap;           END IF;
  IF NEW.roll_credits    IS DISTINCT FROM OLD.roll_credits    THEN NEW.roll_credits    := OLD.roll_credits;    END IF;
  IF NEW.command_energy  IS DISTINCT FROM OLD.command_energy  THEN NEW.command_energy  := OLD.command_energy;  END IF;
  IF NEW.xp              IS DISTINCT FROM OLD.xp              THEN NEW.xp              := OLD.xp;              END IF;
  IF NEW.hq_level        IS DISTINCT FROM OLD.hq_level        THEN NEW.hq_level        := OLD.hq_level;        END IF;
  IF NEW.user_id         IS DISTINCT FROM OLD.user_id         THEN NEW.user_id         := OLD.user_id;         END IF;
  RETURN NEW;
END $function$;