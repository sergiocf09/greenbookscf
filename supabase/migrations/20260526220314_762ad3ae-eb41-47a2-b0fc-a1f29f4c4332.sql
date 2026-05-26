-- Allow users to view profiles of other participants in the same leaderboard (Teams Cup, etc.)
-- so names/initials/avatar render instead of falling back to "Jugador / ??".
DROP POLICY IF EXISTS profiles_select_policy ON public.profiles;

CREATE POLICY profiles_select_policy ON public.profiles
FOR SELECT
USING (
  ((user_id = auth.uid()) AND (is_ghost = false))
  OR (
    (is_ghost = false) AND EXISTS (
      SELECT 1 FROM public.round_players rp_target
      WHERE rp_target.profile_id = profiles.id
        AND rp_target.profile_id IS NOT NULL
        AND public.is_round_participant(rp_target.round_id)
    )
  )
  OR (
    (is_ghost = true) AND (user_id IS NULL) AND EXISTS (
      SELECT 1 FROM public.round_players rp_ghost
      WHERE rp_ghost.profile_id = profiles.id
        AND public.is_round_participant(rp_ghost.round_id)
    )
  )
  OR (
    -- NEW: Fellow participants in any leaderboard (Teams Cup / multi-day / etc.)
    (is_ghost = false) AND EXISTS (
      SELECT 1
      FROM public.leaderboard_participants lp_target
      JOIN public.leaderboard_participants lp_me
        ON lp_me.leaderboard_id = lp_target.leaderboard_id
      WHERE lp_target.profile_id = profiles.id
        AND lp_me.profile_id = auth.uid()
    )
  )
);