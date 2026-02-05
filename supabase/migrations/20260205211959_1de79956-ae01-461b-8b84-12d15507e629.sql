-- Fix 1: Update golf_courses RLS policy to require authentication
-- Drop the existing permissive policy
DROP POLICY IF EXISTS "Anyone can view golf courses" ON public.golf_courses;

-- Create new policy requiring authentication
CREATE POLICY "Authenticated users can view golf courses"
ON public.golf_courses
FOR SELECT
TO authenticated
USING (true);

-- Fix 2: Update course_holes RLS policy to require authentication (related to courses)
DROP POLICY IF EXISTS "Anyone can view course holes" ON public.course_holes;

CREATE POLICY "Authenticated users can view course holes"
ON public.course_holes
FOR SELECT
TO authenticated
USING (true);

-- Fix 3: Update search_profiles function to only search by display_name (remove email search)
-- This prevents email enumeration attacks
CREATE OR REPLACE FUNCTION public.search_profiles(p_query text)
 RETURNS TABLE(id uuid, display_name text, initials text, avatar_color text, current_handicap numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_my_profile_id UUID;
  v_search_pattern TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_my_profile_id := get_my_profile_id();
  v_search_pattern := '%' || LOWER(TRIM(p_query)) || '%';

  -- Only search by display_name to prevent email enumeration
  RETURN QUERY
  SELECT 
    p.id,
    p.display_name,
    p.initials,
    p.avatar_color,
    p.current_handicap
  FROM public.profiles p
  WHERE p.id != v_my_profile_id
    AND LOWER(p.display_name) LIKE v_search_pattern
  ORDER BY p.display_name
  LIMIT 20;
END;
$function$;