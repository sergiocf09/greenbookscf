-- hole_scores: allow participants to write their own scores (previously group admins only)
DROP POLICY IF EXISTS "Group admins can insert hole scores" ON public.hole_scores;
CREATE POLICY "Participants and admins can insert hole scores"
ON public.hole_scores
FOR INSERT
TO authenticated
WITH CHECK (
  round_player_id IN (
    SELECT rp.id FROM public.round_players rp
    WHERE public.is_group_admin(rp.group_id)
       OR rp.profile_id = public.get_my_profile_id()
  )
);

DROP POLICY IF EXISTS "Group admins can update hole scores" ON public.hole_scores;
CREATE POLICY "Participants and admins can update hole scores"
ON public.hole_scores
FOR UPDATE
TO authenticated
USING (
  round_player_id IN (
    SELECT rp.id FROM public.round_players rp
    WHERE public.is_group_admin(rp.group_id)
       OR rp.profile_id = public.get_my_profile_id()
  )
)
WITH CHECK (
  round_player_id IN (
    SELECT rp.id FROM public.round_players rp
    WHERE public.is_group_admin(rp.group_id)
       OR rp.profile_id = public.get_my_profile_id()
  )
);

-- handicap_history: allow round organizer/admin to record history for that round's participants
DROP POLICY IF EXISTS "Users can insert their own handicap history" ON public.handicap_history;
CREATE POLICY "Own or round admin can insert handicap history"
ON public.handicap_history
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_own_profile(profile_id)
  OR (
    round_id IS NOT NULL
    AND public.is_round_admin(round_id)
    AND EXISTS (
      SELECT 1 FROM public.round_players rp
      WHERE rp.round_id = handicap_history.round_id
        AND rp.profile_id = handicap_history.profile_id
    )
  )
);
