DROP POLICY IF EXISTS profiles_select_policy ON public.profiles;

CREATE POLICY profiles_select_policy ON public.profiles
FOR SELECT
USING (
  -- Own profile
  ((user_id = auth.uid()) AND (is_ghost = false))
  -- Co-participant in a round (real profiles)
  OR ((is_ghost = false) AND EXISTS (
    SELECT 1 FROM round_players rp_target
    WHERE rp_target.profile_id = profiles.id
      AND rp_target.profile_id IS NOT NULL
      AND is_round_participant(rp_target.round_id)
  ))
  -- Ghost profiles used in shared rounds
  OR ((is_ghost = true) AND (user_id IS NULL) AND EXISTS (
    SELECT 1 FROM round_players rp_ghost
    WHERE rp_ghost.profile_id = profiles.id
      AND is_round_participant(rp_ghost.round_id)
  ))
  -- Co-participant in a leaderboard / cup (real profiles)
  OR ((is_ghost = false) AND EXISTS (
    SELECT 1
    FROM leaderboard_participants lp_target
    JOIN leaderboard_participants lp_me
      ON lp_me.leaderboard_id = lp_target.leaderboard_id
    JOIN profiles me
      ON me.id = lp_me.profile_id
    WHERE lp_target.profile_id = profiles.id
      AND me.user_id = auth.uid()
  ))
);