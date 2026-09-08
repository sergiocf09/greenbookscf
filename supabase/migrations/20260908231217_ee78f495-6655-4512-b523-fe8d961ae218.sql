-- 1. cross_bet_invitations: authenticated-only read, writes server-side (definer RPCs) only
DROP POLICY IF EXISTS "Participants can view their cross invitations" ON public.cross_bet_invitations;
CREATE POLICY "Participants can view their cross invitations"
ON public.cross_bet_invitations
FOR SELECT
TO authenticated
USING (initiator_profile_id = public.get_my_profile_id() OR target_profile_id = public.get_my_profile_id());

REVOKE INSERT, UPDATE, DELETE ON public.cross_bet_invitations FROM authenticated, anon;
REVOKE SELECT ON public.cross_bet_invitations FROM anon;
GRANT SELECT ON public.cross_bet_invitations TO authenticated;
GRANT ALL ON public.cross_bet_invitations TO service_role;

-- 2. round_cross_bets: same treatment
DROP POLICY IF EXISTS "Participants can view cross bets for their rounds" ON public.round_cross_bets;
CREATE POLICY "Participants can view cross bets for their rounds"
ON public.round_cross_bets
FOR SELECT
TO authenticated
USING (
  initiator_profile_id = public.get_my_profile_id()
  OR target_profile_id = public.get_my_profile_id()
  OR public.is_round_participant(round_id)
);

REVOKE INSERT, UPDATE, DELETE ON public.round_cross_bets FROM authenticated, anon;
REVOKE SELECT ON public.round_cross_bets FROM anon;
GRANT SELECT ON public.round_cross_bets TO authenticated;
GRANT ALL ON public.round_cross_bets TO service_role;

-- 3. golf_courses: restrict reference data to authenticated users only
DROP POLICY IF EXISTS "Users can view official and visible manual courses" ON public.golf_courses;
CREATE POLICY "Users can view official and visible manual courses"
ON public.golf_courses
FOR SELECT
TO authenticated
USING (
  is_manual = false
  OR created_by_profile_id = public.get_my_profile_id()
  OR EXISTS (
    SELECT 1 FROM public.course_visibility cv
    WHERE cv.course_id = golf_courses.id AND cv.profile_id = public.get_my_profile_id()
  )
);

DROP POLICY IF EXISTS "Users can insert manual courses" ON public.golf_courses;
CREATE POLICY "Users can insert manual courses"
ON public.golf_courses
FOR INSERT
TO authenticated
WITH CHECK (is_manual = true AND created_by_profile_id = public.get_my_profile_id());

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.golf_courses FROM anon;

-- 4. leaderboard_events: align SELECT with UPDATE (linked round organizers can view)
DROP POLICY IF EXISTS "Users can view own and participating leaderboards" ON public.leaderboard_events;
CREATE POLICY "Users can view own and participating leaderboards"
ON public.leaderboard_events
FOR SELECT
TO authenticated
USING (
  created_by = public.get_my_profile_id()
  OR public.is_linked_round_organizer(id)
  OR EXISTS (
    SELECT 1 FROM public.leaderboard_participants lp
    WHERE lp.leaderboard_id = leaderboard_events.id
      AND lp.profile_id = public.get_my_profile_id()
      AND lp.is_active = true
  )
);
