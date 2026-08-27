DROP POLICY IF EXISTS "Participants and admins can insert hole scores" ON public.hole_scores;
DROP POLICY IF EXISTS "Participants and admins can update hole scores" ON public.hole_scores;

CREATE POLICY "Group admins can insert hole scores"
ON public.hole_scores
FOR INSERT
TO authenticated
WITH CHECK (
  round_player_id IN (
    SELECT rp.id
    FROM public.round_players rp
    WHERE public.is_group_admin(rp.group_id)
  )
);

CREATE POLICY "Group admins can update hole scores"
ON public.hole_scores
FOR UPDATE
TO authenticated
USING (
  round_player_id IN (
    SELECT rp.id
    FROM public.round_players rp
    WHERE public.is_group_admin(rp.group_id)
  )
)
WITH CHECK (
  round_player_id IN (
    SELECT rp.id
    FROM public.round_players rp
    WHERE public.is_group_admin(rp.group_id)
  )
);