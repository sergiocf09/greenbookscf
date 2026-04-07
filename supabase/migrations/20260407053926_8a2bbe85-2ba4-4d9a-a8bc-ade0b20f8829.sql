
-- 1. Fix guest_sessions SELECT: restrict to round organizer + participants
DROP POLICY IF EXISTS "Anyone can view guest sessions" ON public.guest_sessions;

CREATE POLICY "Round participants can view guest sessions"
ON public.guest_sessions
FOR SELECT
TO anon, authenticated
USING (
  is_round_organizer(round_id)
  OR is_round_participant(round_id)
);

-- 2. Fix profiles SELECT: restrict ghost profile visibility to round participants
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;

CREATE POLICY "profiles_select_policy"
ON public.profiles
FOR SELECT
TO public
USING (
  -- Own non-ghost profile
  ((user_id = auth.uid()) AND (is_ghost = false))
  OR
  -- Non-ghost profiles of round co-participants
  ((is_ghost = false) AND (EXISTS (
    SELECT 1 FROM round_players rp_target
    WHERE rp_target.profile_id = profiles.id
      AND rp_target.profile_id IS NOT NULL
      AND is_round_participant(rp_target.round_id)
  )))
  OR
  -- Ghost profiles: only visible to participants of the same round
  ((is_ghost = true) AND (user_id IS NULL) AND (EXISTS (
    SELECT 1 FROM round_players rp_ghost
    WHERE rp_ghost.profile_id = profiles.id
      AND is_round_participant(rp_ghost.round_id)
  )))
);
