-- Fix 1: Restrict wolf_hole_state policies to authenticated users only (no anonymous access)
DROP POLICY IF EXISTS "Participants can view wolf state" ON public.wolf_hole_state;
CREATE POLICY "Participants can view wolf state" ON public.wolf_hole_state FOR SELECT
  TO authenticated
  USING (is_round_participant(round_id) OR is_round_organizer(round_id));

DROP POLICY IF EXISTS "Organizer can manage wolf state" ON public.wolf_hole_state;

DROP POLICY IF EXISTS "Organizer can delete wolf state" ON public.wolf_hole_state;
CREATE POLICY "Organizer can delete wolf state" ON public.wolf_hole_state FOR DELETE
  TO authenticated
  USING (is_round_organizer(round_id));

DROP POLICY IF EXISTS "Organizer can update wolf state" ON public.wolf_hole_state;
CREATE POLICY "Organizer can update wolf state" ON public.wolf_hole_state FOR UPDATE
  TO authenticated
  USING (is_round_organizer(round_id));

DROP POLICY IF EXISTS "Organizer can insert wolf state" ON public.wolf_hole_state;
CREATE POLICY "Organizer can insert wolf state" ON public.wolf_hole_state FOR INSERT
  TO authenticated
  WITH CHECK (is_round_organizer(round_id));

-- Fix 2: Hide stripe_session_id from client reads on subscriptions table
-- Create a restrictive SELECT policy that excludes sensitive columns via a view
-- Since we can't do column-level RLS, create a secure view and revoke direct table access

-- First check current subscriptions policies and replace SELECT to use a function
-- Actually, the simplest fix: remove stripe_session_id from being queryable by 
-- revoking SELECT on that column for anon and authenticated roles
REVOKE SELECT (stripe_session_id) ON public.subscriptions FROM anon, authenticated;
