DROP POLICY IF EXISTS profiles_select_policy ON public.profiles;

CREATE POLICY profiles_select_policy ON public.profiles
FOR SELECT
USING (
  -- Own profile
  ((user_id = auth.uid()) AND (is_ghost = false))
  -- Co-participant in a round (real profiles)
  OR ((is_ghost = false) AND EXISTS (
    SELECT 1 FROM public.round_players rp_target
    WHERE rp_target.profile_id = profiles.id
      AND rp_target.profile_id IS NOT NULL
      AND public.is_round_participant(rp_target.round_id)
  ))
  -- Ghost profiles used in shared rounds
  OR ((is_ghost = true) AND (user_id IS NULL) AND EXISTS (
    SELECT 1 FROM public.round_players rp_ghost
    WHERE rp_ghost.profile_id = profiles.id
      AND public.is_round_participant(rp_ghost.round_id)
  ))
  -- Co-participant in a leaderboard / cup (real profiles)
  -- Use get_my_profile_id() to avoid recursion into the profiles table
  OR ((is_ghost = false) AND EXISTS (
    SELECT 1
    FROM public.leaderboard_participants lp_target
    JOIN public.leaderboard_participants lp_me
      ON lp_me.leaderboard_id = lp_target.leaderboard_id
    WHERE lp_target.profile_id = profiles.id
      AND lp_me.profile_id = public.get_my_profile_id()
  ))
);