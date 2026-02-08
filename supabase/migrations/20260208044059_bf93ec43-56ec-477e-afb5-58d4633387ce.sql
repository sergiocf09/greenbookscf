-- Fix RLS policy for sliding_current to allow organizer to insert for all round pairs
-- The current policy only allows inserting pairs where the user is involved

-- Drop existing insert policy
DROP POLICY IF EXISTS "Users can insert their own sliding current" ON public.sliding_current;

-- Create new insert policy that allows:
-- 1. Users to insert their own pairs (for backwards compatibility)
-- 2. Round organizers to insert pairs for any participants in their rounds
CREATE POLICY "Users and organizers can insert sliding current" 
ON public.sliding_current 
FOR INSERT 
WITH CHECK (
  -- User is part of the pair
  (player_a_profile_id = get_my_profile_id() OR player_b_profile_id = get_my_profile_id())
  OR
  -- User is organizer of a round where both players participated
  EXISTS (
    SELECT 1 
    FROM round_players rp1
    JOIN round_players rp2 ON rp2.round_id = rp1.round_id
    JOIN rounds r ON r.id = rp1.round_id
    WHERE r.organizer_id = get_my_profile_id()
      AND rp1.profile_id = sliding_current.player_a_profile_id
      AND rp2.profile_id = sliding_current.player_b_profile_id
  )
);

-- Also fix update policy to allow organizer updates
DROP POLICY IF EXISTS "Users can update their own sliding current" ON public.sliding_current;

CREATE POLICY "Users and organizers can update sliding current" 
ON public.sliding_current 
FOR UPDATE 
USING (
  -- User is part of the pair
  (player_a_profile_id = get_my_profile_id() OR player_b_profile_id = get_my_profile_id())
  OR
  -- User is organizer of a round where both players participated
  EXISTS (
    SELECT 1 
    FROM round_players rp1
    JOIN round_players rp2 ON rp2.round_id = rp1.round_id
    JOIN rounds r ON r.id = rp1.round_id
    WHERE r.organizer_id = get_my_profile_id()
      AND rp1.profile_id = sliding_current.player_a_profile_id
      AND rp2.profile_id = sliding_current.player_b_profile_id
  )
);