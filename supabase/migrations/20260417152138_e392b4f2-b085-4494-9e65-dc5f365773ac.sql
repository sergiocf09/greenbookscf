CREATE OR REPLACE FUNCTION public.get_friends_live_rounds()
RETURNS TABLE(profile_id uuid, display_name text, initials text, avatar_color text, round_id uuid, course_name text, holes_played integer, gross_vs_par integer, birdie_holes integer[], eagle_holes integer[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_my_profile_id uuid;
BEGIN
  v_my_profile_id := get_my_profile_id();
  IF v_my_profile_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH visible_players AS (
    -- Amigos jugando hoy en cualquier ronda activa
    SELECT DISTINCT rp.id AS round_player_id, rp.profile_id, rp.round_id
    FROM public.friendships f
    JOIN public.round_players rp ON rp.profile_id = f.friend_profile_id
    JOIN public.rounds r ON r.id = rp.round_id
    WHERE f.owner_profile_id = v_my_profile_id
      AND r.status NOT IN ('completed')
      AND r.date = CURRENT_DATE
      AND rp.profile_id IS NOT NULL
      AND rp.profile_id != v_my_profile_id

    UNION

    -- Co-jugadores de las rondas activas en las que YO participo
    SELECT DISTINCT rp_other.id AS round_player_id, rp_other.profile_id, rp_other.round_id
    FROM public.round_players rp_me
    JOIN public.rounds r ON r.id = rp_me.round_id
    JOIN public.round_players rp_other ON rp_other.round_id = r.id
    WHERE rp_me.profile_id = v_my_profile_id
      AND r.status NOT IN ('completed')
      AND r.date = CURRENT_DATE
      AND rp_other.profile_id IS NOT NULL
      AND rp_other.profile_id != v_my_profile_id
  )
  SELECT
    p.id                                          AS profile_id,
    p.display_name,
    p.initials,
    p.avatar_color,
    r.id                                          AS round_id,
    COALESCE(gc.name, 'Campo')                    AS course_name,
    COUNT(DISTINCT hs.hole_number)::int           AS holes_played,
    COALESCE(SUM(hs.strokes - ch.par), 0)::int    AS gross_vs_par,
    COALESCE(ARRAY_AGG(DISTINCT hs.hole_number ORDER BY hs.hole_number) FILTER (WHERE hs.strokes = ch.par - 1), '{}'::int[]) AS birdie_holes,
    COALESCE(ARRAY_AGG(DISTINCT hs.hole_number ORDER BY hs.hole_number) FILTER (WHERE hs.strokes <= ch.par - 2), '{}'::int[]) AS eagle_holes
  FROM visible_players vp
  JOIN public.profiles p ON p.id = vp.profile_id
  JOIN public.rounds r ON r.id = vp.round_id
  LEFT JOIN public.golf_courses gc ON gc.id = r.course_id
  LEFT JOIN public.hole_scores hs
    ON hs.round_player_id = vp.round_player_id
   AND hs.confirmed = true
   AND hs.strokes > 0
  LEFT JOIN public.course_holes ch
    ON ch.course_id = r.course_id
   AND ch.hole_number = hs.hole_number
  GROUP BY p.id, p.display_name, p.initials, p.avatar_color, r.id, gc.name
  ORDER BY holes_played DESC, p.display_name;
END;
$function$;