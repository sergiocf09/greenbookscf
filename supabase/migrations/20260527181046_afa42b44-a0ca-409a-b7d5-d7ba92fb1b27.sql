
-- leaderboard_events: allow linked round organizers to update
DROP POLICY IF EXISTS "Creator can update leaderboard events" ON public.leaderboard_events;
CREATE POLICY "Creator or linked organizer can update leaderboard events"
ON public.leaderboard_events
FOR UPDATE
TO authenticated
USING (
  created_by = public.get_my_profile_id()
  OR public.is_linked_round_organizer(id)
)
WITH CHECK (
  created_by = public.get_my_profile_id()
  OR public.is_linked_round_organizer(id)
);

-- cup_teams: allow linked round organizers to insert/update/delete
DROP POLICY IF EXISTS "Creator can manage cup teams insert" ON public.cup_teams;
DROP POLICY IF EXISTS "Creator can manage cup teams update" ON public.cup_teams;
DROP POLICY IF EXISTS "Creator can manage cup teams delete" ON public.cup_teams;

CREATE POLICY "Creator or linked organizer can insert cup teams"
ON public.cup_teams
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.leaderboard_events le
    WHERE le.id = cup_teams.leaderboard_id
      AND (le.created_by = public.get_my_profile_id()
           OR public.is_linked_round_organizer(le.id))
  )
);

CREATE POLICY "Creator or linked organizer can update cup teams"
ON public.cup_teams
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leaderboard_events le
    WHERE le.id = cup_teams.leaderboard_id
      AND (le.created_by = public.get_my_profile_id()
           OR public.is_linked_round_organizer(le.id))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.leaderboard_events le
    WHERE le.id = cup_teams.leaderboard_id
      AND (le.created_by = public.get_my_profile_id()
           OR public.is_linked_round_organizer(le.id))
  )
);

CREATE POLICY "Creator or linked organizer can delete cup teams"
ON public.cup_teams
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leaderboard_events le
    WHERE le.id = cup_teams.leaderboard_id
      AND (le.created_by = public.get_my_profile_id()
           OR public.is_linked_round_organizer(le.id))
  )
);
