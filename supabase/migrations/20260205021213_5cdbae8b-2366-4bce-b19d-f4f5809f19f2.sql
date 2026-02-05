-- Allow round participants to view sliding_current for ALL logged-in player pairs in their rounds
-- This is needed so that all players can see sliding suggestions for all pairs, not just their own

-- First, drop the existing SELECT policies
DROP POLICY IF EXISTS "Users can view their own sliding current" ON public.sliding_current;

-- Create new policy: users can view their own sliding records OR sliding records for players in rounds they participate in
CREATE POLICY "Users can view sliding for round participants" 
ON public.sliding_current 
FOR SELECT 
USING (
  -- Own sliding records
  (player_a_profile_id = get_my_profile_id() OR player_b_profile_id = get_my_profile_id())
  OR
  -- Sliding records for players in rounds where user is a participant
  (
    EXISTS (
      SELECT 1 
      FROM public.round_players rp1
      JOIN public.round_players rp2 ON rp2.round_id = rp1.round_id
      WHERE rp1.profile_id = get_my_profile_id()
        AND (rp2.profile_id = sliding_current.player_a_profile_id OR rp2.profile_id = sliding_current.player_b_profile_id)
    )
  )
);