DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;

CREATE POLICY "profiles_select_policy"
ON public.profiles
FOR SELECT
TO public
USING (
  ((user_id = auth.uid()) AND (is_ghost = false))
  OR (
    (is_ghost = false)
    AND EXISTS (
      SELECT 1
      FROM public.round_players rp_target
      WHERE rp_target.profile_id = profiles.id
        AND rp_target.profile_id IS NOT NULL
        AND public.is_round_participant(rp_target.round_id)
    )
  )
  OR ((is_ghost = true) AND (user_id IS NULL))
);