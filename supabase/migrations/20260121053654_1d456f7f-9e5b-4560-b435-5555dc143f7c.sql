-- Fix infinite recursion in profiles RLS policy
-- The issue is that "Users can view profiles of round participants" joins back to profiles

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view profiles of round participants" ON public.profiles;

-- Recreate it without the circular reference - use get_my_profile_id() function instead
CREATE POLICY "Users can view profiles of round participants" 
ON public.profiles 
FOR SELECT 
USING (
  id IN (
    SELECT rp.profile_id
    FROM round_players rp
    WHERE rp.round_id IN (
      SELECT rp2.round_id
      FROM round_players rp2
      WHERE rp2.profile_id = get_my_profile_id()
    )
  )
);