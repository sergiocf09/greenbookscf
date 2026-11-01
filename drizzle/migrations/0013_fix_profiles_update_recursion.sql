CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'service_role' THEN RETURN NEW; END IF;
  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
     OR NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at
     OR NEW.is_founder IS DISTINCT FROM OLD.is_founder
     OR NEW.is_ghost IS DISTINCT FROM OLD.is_ghost
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Not allowed to modify protected profile fields';
  END IF;
  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    NEW.display_name := regexp_replace(btrim(coalesce(NEW.display_name,'')), '\s+', ' ', 'g');
    IF char_length(NEW.display_name) < 2 OR char_length(NEW.display_name) > 100
       OR NEW.display_name ~ '[<>"''[:cntrl:]]' THEN
      RAISE EXCEPTION 'Invalid display name';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());