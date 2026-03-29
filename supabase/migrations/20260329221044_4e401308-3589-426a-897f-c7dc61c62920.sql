-- Fix 1: Restrict course_tees SELECT to authenticated users only
DROP POLICY IF EXISTS "Anyone can view course tees" ON public.course_tees;
CREATE POLICY "Authenticated users can view course tees"
  ON public.course_tees
  FOR SELECT
  TO authenticated
  USING (true);

-- Fix 2: Add INSERT policy for player_statistics
CREATE POLICY "Users can insert their own statistics"
  ON public.player_statistics
  FOR INSERT
  TO authenticated
  WITH CHECK (is_own_profile(profile_id));