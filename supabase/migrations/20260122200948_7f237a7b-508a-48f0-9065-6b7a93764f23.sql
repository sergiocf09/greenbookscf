-- Allow a participant to update their own handicap_for_round (and only their own row)
-- so each user can auto-populate their USGA handicap when joining/starting a round.
CREATE POLICY "Participants can update their own round handicap"
ON public.round_players
FOR UPDATE
USING (
  profile_id = public.get_my_profile_id()
  AND public.is_round_participant(round_id)
)
WITH CHECK (
  profile_id = public.get_my_profile_id()
  AND public.is_round_participant(round_id)
);
