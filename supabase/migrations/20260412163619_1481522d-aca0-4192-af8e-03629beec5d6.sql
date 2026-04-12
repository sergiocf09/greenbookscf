DROP FUNCTION IF EXISTS public.get_friends_live_rounds();

CREATE FUNCTION public.get_friends_live_rounds()
RETURNS TABLE (
  profile_id   uuid,
  display_name text,
  initials     text,
  avatar_color text,
  round_id     uuid,
  course_name  text,
  holes_played int,
  gross_vs_par int,
  birdie_holes int[],
  eagle_holes  int[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_profile_id uuid;
BEGIN
  v_my_profile_id := get_my_profile_id();
  IF v_my_profile_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    p.id                                          AS profile_id,
    p.display_name,
    p.initials,
    p.avatar_color,
    r.id                                          AS round_id,
    COALESCE(gc.name, 'Campo')                    AS course_name,
    COUNT(DISTINCT hs.hole_number)::int           AS holes_played,
    COALESCE(SUM(hs.strokes - ch.par), 0)::int   AS gross_vs_par,
    COALESCE(ARRAY_AGG(DISTINCT hs.hole_number ORDER BY hs.hole_number) FILTER (WHERE hs.strokes = ch.par - 1), '{}'::int[]) AS birdie_holes,
    COALESCE(ARRAY_AGG(DISTINCT hs.hole_number ORDER BY hs.hole_number) FILTER (WHERE hs.strokes <= ch.par - 2), '{}'::int[]) AS eagle_holes
  FROM public.friendships f
  JOIN public.profiles p
    ON p.id = f.friend_profile_id
  JOIN public.round_players rp
    ON rp.profile_id = p.id
  JOIN public.rounds r
    ON r.id = rp.round_id
   AND r.status NOT IN ('setup', 'completed')
   AND r.date = CURRENT_DATE
  LEFT JOIN public.golf_courses gc
    ON gc.id = r.course_id
  LEFT JOIN public.hole_scores hs
    ON hs.round_player_id = rp.id
   AND hs.confirmed = true
   AND hs.strokes > 0
  LEFT JOIN public.course_holes ch
    ON ch.course_id = r.course_id
   AND ch.hole_number = hs.hole_number
  WHERE f.owner_profile_id = v_my_profile_id
    AND p.id != v_my_profile_id
  GROUP BY p.id, p.display_name, p.initials, p.avatar_color, r.id, gc.name
  ORDER BY holes_played DESC, p.display_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_friends_live_rounds() TO authenticated;