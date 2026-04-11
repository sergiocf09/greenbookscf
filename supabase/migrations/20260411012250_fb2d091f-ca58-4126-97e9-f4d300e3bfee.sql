-- Replace permissive policy with creator-or-participant filter
DROP POLICY IF EXISTS "Authenticated can view leaderboard events" ON public.leaderboard_events;

CREATE POLICY "Users can view own or joined leaderboard events"
ON public.leaderboard_events
FOR SELECT
TO authenticated
USING (
  created_by = get_my_profile_id()
  OR
  EXISTS (
    SELECT 1 FROM public.leaderboard_participants lp
    WHERE lp.leaderboard_id = leaderboard_events.id
      AND lp.profile_id = get_my_profile_id()
      AND lp.is_active = true
  )
);