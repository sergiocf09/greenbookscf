
-- 1. Restrict course_tees SELECT to courses visible to requester
DROP POLICY IF EXISTS "Authenticated users can view course tees" ON public.course_tees;
CREATE POLICY "Users can view tees of visible courses"
ON public.course_tees
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.golf_courses gc
    WHERE gc.id = course_tees.course_id
      AND (
        gc.is_manual = false
        OR gc.created_by_profile_id = get_my_profile_id()
        OR EXISTS (
          SELECT 1 FROM public.course_visibility cv
          WHERE cv.course_id = gc.id AND cv.profile_id = get_my_profile_id()
        )
      )
  )
);

-- 2. Restrict course_holes SELECT similarly
DROP POLICY IF EXISTS "Authenticated users can view course holes" ON public.course_holes;
CREATE POLICY "Users can view holes of visible courses"
ON public.course_holes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.golf_courses gc
    WHERE gc.id = course_holes.course_id
      AND (
        gc.is_manual = false
        OR gc.created_by_profile_id = get_my_profile_id()
        OR EXISTS (
          SELECT 1 FROM public.course_visibility cv
          WHERE cv.course_id = gc.id AND cv.profile_id = get_my_profile_id()
        )
      )
  )
);

-- 3. Restrict ghost profile creation to authenticated round organizers
DROP POLICY IF EXISTS "Anyone can create ghost profiles" ON public.profiles;
CREATE POLICY "Authenticated organizers can create ghost profiles"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  is_ghost = true
  AND user_id IS NULL
  AND get_my_profile_id() IS NOT NULL
);
