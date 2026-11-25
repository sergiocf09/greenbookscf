CREATE OR REPLACE FUNCTION public.get_leaderboard_linked_rounds_meta(p_leaderboard_id uuid)
RETURNS TABLE (
  round_id uuid,
  round_date date,
  course_id uuid,
  course_name text,
  expected_holes integer,
  holes jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_view_leaderboard(p_leaderboard_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    lr.round_id,
    r.date AS round_date,
    r.course_id,
    COALESCE(gc.name, 'Campo') AS course_name,
    CASE
      WHEN (r.bet_config->>'roundHoles') = '9' THEN 9
      ELSE 18
    END AS expected_holes,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'hole_number', ch.hole_number,
            'par', ch.par,
            'stroke_index', ch.stroke_index
          )
          ORDER BY ch.hole_number
        )
        FROM public.course_holes ch
        WHERE ch.course_id = r.course_id
      ),
      '[]'::jsonb
    ) AS holes
  FROM public.leaderboard_rounds lr
  JOIN public.rounds r ON r.id = lr.round_id
  LEFT JOIN public.golf_courses gc ON gc.id = r.course_id
  WHERE lr.leaderboard_id = p_leaderboard_id
  ORDER BY r.date ASC, lr.added_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard_linked_rounds_meta(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_linked_rounds_meta(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_linked_rounds_meta(uuid) TO service_role;