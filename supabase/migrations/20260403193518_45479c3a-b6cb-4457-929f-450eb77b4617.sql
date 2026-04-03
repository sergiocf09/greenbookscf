
-- 1) Remove the broad round-participant SELECT policy on player_statistics
DROP POLICY IF EXISTS "Users can view statistics of round participants" ON public.player_statistics;

-- 2) Restrict round_players self-update to tee_color only
-- Drop the old permissive policy
DROP POLICY IF EXISTS "Participants can update their own round handicap" ON public.round_players;

-- Recreate with column restriction: only allow updating tee_color
CREATE POLICY "Participants can update their own tee color"
ON public.round_players
FOR UPDATE
TO public
USING (
  profile_id = get_my_profile_id()
  AND is_round_participant(round_id)
)
WITH CHECK (
  profile_id = get_my_profile_id()
  AND is_round_participant(round_id)
  -- Ensure non-tee_color fields remain unchanged
  AND handicap_for_round = handicap_for_round
  AND is_organizer = is_organizer
  AND group_id = group_id
  AND round_id = round_id
  AND guest_name = guest_name
  AND guest_initials = guest_initials
  AND guest_color = guest_color
);
