CREATE OR REPLACE FUNCTION public.normalize_profile_display_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.display_name IS NOT NULL THEN
    NEW.display_name := initcap(NEW.display_name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_profile_display_name ON public.profiles;
CREATE TRIGGER trg_normalize_profile_display_name
BEFORE INSERT OR UPDATE OF display_name ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.normalize_profile_display_name();