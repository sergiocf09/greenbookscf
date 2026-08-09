CREATE OR REPLACE FUNCTION public.get_player_recent_rounds(p_course_id uuid DEFAULT NULL)
 RETURNS TABLE(round_date date, course_name text, total_strokes integer, total_putts integer, vs_par integer, holes_played integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pid UUID := get_my_profile_id();
BEGIN
  IF v_pid IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    r.date,
    gc.name,
    SUM(hs.strokes)::INT,
    SUM(hs.putts)::INT,
    SUM(hs.strokes - ch.par)::INT,
    COUNT(hs.id)::INT
  FROM round_players rp
  JOIN rounds r ON r.id = rp.round_id
  JOIN golf_courses gc ON gc.id = r.course_id
  JOIN hole_scores hs ON hs.round_player_id = rp.id
  JOIN course_holes ch ON ch.course_id = r.course_id AND ch.hole_number = hs.hole_number
  WHERE rp.profile_id = v_pid
    AND r.status = 'completed'
    AND hs.strokes IS NOT NULL
    AND (p_course_id IS NULL OR r.course_id = p_course_id)
    AND (
      COALESCE((r.bet_config->>'roundHoles')::INTEGER, 18) <> 9
      OR (
        CASE
          WHEN COALESCE(r.starting_hole, 1) = 10 THEN hs.hole_number BETWEEN 10 AND 18
          ELSE hs.hole_number BETWEEN 1 AND 9
        END
      )
    )
  GROUP BY r.id, r.date, gc.name
  ORDER BY r.date DESC
  LIMIT 10;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_player_milestones(p_course_id uuid DEFAULT NULL)
 RETURNS TABLE(eagles_total integer, birdies_total integer, rounds_sub_100 integer, rounds_sub_90 integer, rounds_sub_80 integer, rounds_sub_70 integer, best_round_score integer, best_round_course text, best_round_date date, holes_in_one integer, birdie_streak_best integer, rounds_no_bogey integer, organizer_rounds integer, unique_courses integer, unique_opponents integer, total_holes integer, handicap_delta numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pid UUID := get_my_profile_id();
  v_best_streak INT := 0;
  v_round RECORD;
  v_hole RECORD;
  v_streak INT;
BEGIN
  IF v_pid IS NULL THEN RETURN; END IF;

  FOR v_round IN
    SELECT rp.id AS rp_id
    FROM round_players rp
    JOIN rounds r ON r.id = rp.round_id
    WHERE rp.profile_id = v_pid AND r.status = 'completed'
      AND (p_course_id IS NULL OR r.course_id = p_course_id)
  LOOP
    v_streak := 0;
    FOR v_hole IN
      SELECT hs.hole_number, hs.strokes, ch.par
      FROM hole_scores hs
      JOIN round_players rp ON rp.id = hs.round_player_id
      JOIN rounds r ON r.id = rp.round_id
      JOIN course_holes ch ON ch.course_id = r.course_id AND ch.hole_number = hs.hole_number
      WHERE hs.round_player_id = v_round.rp_id AND hs.strokes IS NOT NULL
      ORDER BY hs.hole_number
    LOOP
      IF v_hole.strokes = v_hole.par - 1 THEN
        v_streak := v_streak + 1;
        IF v_streak > v_best_streak THEN v_best_streak := v_streak; END IF;
      ELSE
        v_streak := 0;
      END IF;
    END LOOP;
  END LOOP;

  RETURN QUERY
  WITH base AS (
    SELECT
      hs.strokes, ch.par, r.id AS round_id, r.date AS round_date, gc.name AS course_name,
      rp.is_organizer, rp.handicap_for_round, r.course_id
    FROM round_players rp
    JOIN rounds r ON r.id = rp.round_id
    JOIN golf_courses gc ON gc.id = r.course_id
    JOIN hole_scores hs ON hs.round_player_id = rp.id
    JOIN course_holes ch ON ch.course_id = r.course_id AND ch.hole_number = hs.hole_number
    WHERE rp.profile_id = v_pid AND r.status = 'completed' AND hs.strokes IS NOT NULL
      AND (p_course_id IS NULL OR r.course_id = p_course_id)
  ),
  round_totals AS (
    SELECT
      round_id, round_date, course_name, is_organizer, handicap_for_round,
      SUM(strokes)::INT AS total_strokes,
      COUNT(*)::INT AS hole_count,
      BOOL_AND(strokes <= par + 1) AS no_double_bogey
    FROM base
    GROUP BY round_id, round_date, course_name, is_organizer, handicap_for_round
  ),
  full_rounds AS (
    SELECT * FROM round_totals WHERE hole_count >= 18
  ),
  best AS (
    SELECT total_strokes, course_name, round_date
    FROM full_rounds
    ORDER BY total_strokes ASC
    LIMIT 1
  ),
  hcp_delta AS (
    SELECT
      (SELECT handicap_for_round FROM round_totals ORDER BY round_date ASC LIMIT 1) -
      (SELECT handicap_for_round FROM round_totals ORDER BY round_date DESC LIMIT 1) AS delta
  )
  SELECT
    COUNT(*) FILTER (WHERE strokes <= par - 2)::INT,
    COUNT(*) FILTER (WHERE strokes = par - 1)::INT,
    (SELECT COUNT(*) FILTER (WHERE total_strokes < 100) FROM full_rounds)::INT,
    (SELECT COUNT(*) FILTER (WHERE total_strokes < 90) FROM full_rounds)::INT,
    (SELECT COUNT(*) FILTER (WHERE total_strokes < 80) FROM full_rounds)::INT,
    (SELECT COUNT(*) FILTER (WHERE total_strokes < 70) FROM full_rounds)::INT,
    (SELECT total_strokes FROM best),
    (SELECT course_name FROM best),
    (SELECT round_date FROM best),
    COUNT(*) FILTER (WHERE strokes = 1 AND par = 3)::INT,
    v_best_streak,
    (SELECT COUNT(*) FILTER (WHERE no_double_bogey) FROM full_rounds)::INT,
    (SELECT COUNT(*) FILTER (WHERE is_organizer) FROM round_totals)::INT,
    (SELECT COUNT(DISTINCT course_id) FROM base)::INT,
    (SELECT COUNT(DISTINCT rp2.profile_id)::INT
     FROM round_players rp2
     WHERE rp2.round_id IN (SELECT DISTINCT b.round_id FROM base b)
       AND rp2.profile_id <> v_pid AND rp2.profile_id IS NOT NULL),
    COUNT(*)::INT,
    (SELECT delta FROM hcp_delta)
  FROM base;
END;
$function$;