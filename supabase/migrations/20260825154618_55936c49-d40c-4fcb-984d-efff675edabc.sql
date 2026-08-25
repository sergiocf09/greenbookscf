-- Explicit, ownership-scoped write rules for golf_courses (previously implicit deny)
DROP POLICY IF EXISTS "Owners can update their manual courses" ON public.golf_courses;
CREATE POLICY "Owners can update their manual courses"
ON public.golf_courses
FOR UPDATE
TO authenticated
USING (is_manual = true AND created_by_profile_id = public.get_my_profile_id())
WITH CHECK (is_manual = true AND created_by_profile_id = public.get_my_profile_id());

DROP POLICY IF EXISTS "Owners can delete their manual courses" ON public.golf_courses;
CREATE POLICY "Owners can delete their manual courses"
ON public.golf_courses
FOR DELETE
TO authenticated
USING (is_manual = true AND created_by_profile_id = public.get_my_profile_id());

-- Reinforce: block any change of ownership/official flags on golf_courses
CREATE OR REPLACE FUNCTION public.prevent_golf_course_ownership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.is_manual IS DISTINCT FROM OLD.is_manual
     OR NEW.created_by_profile_id IS DISTINCT FROM OLD.created_by_profile_id
     OR NEW.source IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION 'Not allowed to modify course ownership or source fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_golf_course_ownership_change_trg ON public.golf_courses;
CREATE TRIGGER prevent_golf_course_ownership_change_trg
BEFORE UPDATE ON public.golf_courses
FOR EACH ROW EXECUTE FUNCTION public.prevent_golf_course_ownership_change();

GRANT UPDATE, DELETE ON public.golf_courses TO authenticated;