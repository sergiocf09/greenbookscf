
-- Helper: is current profile the organizer of any round linked to this leaderboard?
CREATE OR REPLACE FUNCTION public.is_linked_round_organizer(_leaderboard_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.leaderboard_rounds lr
    JOIN public.rounds r ON r.id = lr.round_id
    WHERE lr.leaderboard_id = _leaderboard_id
      AND r.organizer_id = public.get_my_profile_id()
  )
$$;

DROP POLICY IF EXISTS "Event creator can insert participants" ON public.leaderboard_participants;
DROP POLICY IF EXISTS "Event creator can update participants" ON public.leaderboard_participants;
DROP POLICY IF EXISTS "Event creator can delete participants" ON public.leaderboard_participants;

CREATE POLICY "Creator or linked organizer can insert participants"
ON public.leaderboard_participants
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.leaderboard_events le
    WHERE le.id = leaderboard_participants.leaderboard_id
      AND le.created_by = public.get_my_profile_id()
  )
  OR public.is_linked_round_organizer(leaderboard_participants.leaderboard_id)
);

CREATE POLICY "Creator or linked organizer can update participants"
ON public.leaderboard_participants
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leaderboard_events le
    WHERE le.id = leaderboard_participants.leaderboard_id
      AND le.created_by = public.get_my_profile_id()
  )
  OR public.is_linked_round_organizer(leaderboard_participants.leaderboard_id)
);

CREATE POLICY "Creator or linked organizer can delete participants"
ON public.leaderboard_participants
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leaderboard_events le
    WHERE le.id = leaderboard_participants.leaderboard_id
      AND le.created_by = public.get_my_profile_id()
  )
  OR public.is_linked_round_organizer(leaderboard_participants.leaderboard_id)
);
