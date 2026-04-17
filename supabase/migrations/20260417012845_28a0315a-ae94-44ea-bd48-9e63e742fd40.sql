-- Restrict cup_matches SELECT to leaderboard creator or active participants
DROP POLICY IF EXISTS "Authenticated can view cup matches" ON public.cup_matches;

CREATE POLICY "Creator or participants can view cup matches"
ON public.cup_matches
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leaderboard_events le
    WHERE le.id = cup_matches.leaderboard_id
      AND le.created_by = get_my_profile_id()
  )
  OR EXISTS (
    SELECT 1 FROM public.leaderboard_participants lp
    WHERE lp.leaderboard_id = cup_matches.leaderboard_id
      AND lp.profile_id = get_my_profile_id()
      AND lp.is_active = true
  )
);