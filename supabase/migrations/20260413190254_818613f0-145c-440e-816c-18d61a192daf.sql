
-- ═══════════════════════════════════════════
-- FUNCIÓN 1: get_player_stats
-- ═══════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_player_stats(p_course_id UUID DEFAULT NULL)
RETURNS TABLE(
  rounds_played           INT,
  holes_played            INT,
  courses_played          INT,
  opponents_played        INT,
  avg_gross_score         NUMERIC,
  best_gross_score        INT,
  worst_gross_score       INT,
  avg_score_vs_par        NUMERIC,
  eagles_count            INT,
  birdies_count           INT,
  pars_count              INT,
  bogeys_count            INT,
  doubles_count           INT,
  worse_count             INT,
  avg_putts_per_round     NUMERIC,
  avg_putts_per_gir       NUMERIC,
  pct_one_putt            NUMERIC,
  pct_three_putt_plus     NUMERIC,
  gir_pct                 NUMERIC,
  gir_pct_par3            NUMERIC,
  gir_pct_par4            NUMERIC,
  gir_pct_par5            NUMERIC,
  scrambling_pct          NUMERIC,
  avg_vs_par_par3         NUMERIC,
  avg_vs_par_par4         NUMERIC,
  avg_vs_par_par5         NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid UUID := get_my_profile_id();
BEGIN
  IF v_pid IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      hs.strokes,
      hs.putts,
      ch.par,
      r.id AS round_id,
      r.course_id,
      CASE WHEN (hs.strokes - hs.putts) <= (ch.par - 2) THEN true ELSE false END AS is_gir,
      CASE
        WHEN hs.strokes <= ch.par - 2 THEN 'eagle'
        WHEN hs.strokes = ch.par - 1 THEN 'birdie'
        WHEN hs.strokes = ch.par THEN 'par'
        WHEN hs.strokes = ch.par + 1 THEN 'bogey'
        WHEN hs.strokes = ch.par + 2 THEN 'double'
        ELSE 'worse'
      END AS score_cat
    FROM round_players rp
    JOIN rounds r ON r.id = rp.round_id
    JOIN hole_scores hs ON hs.round_player_id = rp.id
    JOIN course_holes ch ON ch.course_id = r.course_id AND ch.hole_number = hs.hole_number
    WHERE rp.profile_id = v_pid
      AND r.status = 'completed'
      AND hs.strokes IS NOT NULL
      AND hs.putts IS NOT NULL
      AND (p_course_id IS NULL OR r.course_id = p_course_id)
  ),
  round_totals AS (
    SELECT
      b.round_id,
      SUM(b.strokes)::INT AS total_strokes,
      SUM(b.par)::INT AS total_par,
      SUM(b.putts)::INT AS total_putts,
      COUNT(*)::INT AS hole_count
    FROM base b
    GROUP BY b.round_id
  ),
  full_rounds AS (
    SELECT * FROM round_totals WHERE hole_count >= 18
  ),
  hole_agg AS (
    SELECT
      COUNT(*)::INT AS total_holes,
      COUNT(*) FILTER (WHERE score_cat = 'eagle')::INT AS v_eagles,
      COUNT(*) FILTER (WHERE score_cat = 'birdie')::INT AS v_birdies,
      COUNT(*) FILTER (WHERE score_cat = 'par')::INT AS v_pars,
      COUNT(*) FILTER (WHERE score_cat = 'bogey')::INT AS v_bogeys,
      COUNT(*) FILTER (WHERE score_cat = 'double')::INT AS v_doubles,
      COUNT(*) FILTER (WHERE score_cat = 'worse')::INT AS v_worse,
      -- GIR
      ROUND(100.0 * COUNT(*) FILTER (WHERE is_gir) / NULLIF(COUNT(*), 0), 1) AS v_gir_pct,
      ROUND(100.0 * COUNT(*) FILTER (WHERE is_gir AND par = 3) / NULLIF(COUNT(*) FILTER (WHERE par = 3), 0), 1) AS v_gir_pct_par3,
      ROUND(100.0 * COUNT(*) FILTER (WHERE is_gir AND par = 4) / NULLIF(COUNT(*) FILTER (WHERE par = 4), 0), 1) AS v_gir_pct_par4,
      ROUND(100.0 * COUNT(*) FILTER (WHERE is_gir AND par = 5) / NULLIF(COUNT(*) FILTER (WHERE par = 5), 0), 1) AS v_gir_pct_par5,
      -- Putts
      ROUND(AVG(putts) FILTER (WHERE is_gir), 2) AS v_avg_putts_gir,
      ROUND(100.0 * COUNT(*) FILTER (WHERE putts = 1) / NULLIF(COUNT(*), 0), 1) AS v_pct_one_putt,
      ROUND(100.0 * COUNT(*) FILTER (WHERE putts >= 3) / NULLIF(COUNT(*), 0), 1) AS v_pct_three_putt,
      -- Scrambling
      ROUND(100.0 * COUNT(*) FILTER (WHERE NOT is_gir AND strokes <= par) / NULLIF(COUNT(*) FILTER (WHERE NOT is_gir), 0), 1) AS v_scrambling,
      -- Avg vs par by par type
      ROUND(AVG(strokes - par) FILTER (WHERE par = 3), 2) AS v_avg_vs_par3,
      ROUND(AVG(strokes - par) FILTER (WHERE par = 4), 2) AS v_avg_vs_par4,
      ROUND(AVG(strokes - par) FILTER (WHERE par = 5), 2) AS v_avg_vs_par5
    FROM base
  )
  SELECT
    (SELECT COUNT(DISTINCT round_id) FROM base)::INT,
    (SELECT total_holes FROM hole_agg),
    (SELECT COUNT(DISTINCT course_id) FROM base)::INT,
    (SELECT COUNT(DISTINCT rp2.profile_id)::INT
     FROM round_players rp2
     WHERE rp2.round_id IN (SELECT DISTINCT b2.round_id FROM base b2)
       AND rp2.profile_id <> v_pid
       AND rp2.profile_id IS NOT NULL),
    (SELECT ROUND(AVG(total_strokes), 1) FROM full_rounds),
    (SELECT MIN(total_strokes) FROM full_rounds),
    (SELECT MAX(total_strokes) FROM full_rounds),
    (SELECT ROUND(AVG(total_strokes - total_par), 1) FROM full_rounds),
    ha.v_eagles,
    ha.v_birdies,
    ha.v_pars,
    ha.v_bogeys,
    ha.v_doubles,
    ha.v_worse,
    (SELECT ROUND(AVG(total_putts), 1) FROM full_rounds),
    ha.v_avg_putts_gir,
    ha.v_pct_one_putt,
    ha.v_pct_three_putt,
    ha.v_gir_pct,
    ha.v_gir_pct_par3,
    ha.v_gir_pct_par4,
    ha.v_gir_pct_par5,
    ha.v_scrambling,
    ha.v_avg_vs_par3,
    ha.v_avg_vs_par4,
    ha.v_avg_vs_par5
  FROM hole_agg ha;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_stats(UUID) TO authenticated;

-- ═══════════════════════════════════════════
-- FUNCIÓN 2: get_player_milestones
-- ═══════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_player_milestones()
RETURNS TABLE(
  eagles_total        INT,
  birdies_total       INT,
  rounds_sub_100      INT,
  rounds_sub_90       INT,
  rounds_sub_80       INT,
  rounds_sub_70       INT,
  best_round_score    INT,
  best_round_course   TEXT,
  best_round_date     DATE,
  holes_in_one        INT,
  birdie_streak_best  INT,
  rounds_no_bogey     INT,
  organizer_rounds    INT,
  unique_courses      INT,
  unique_opponents    INT,
  total_holes         INT,
  handicap_delta      NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid UUID := get_my_profile_id();
  v_best_streak INT := 0;
  v_round RECORD;
  v_hole RECORD;
  v_streak INT;
BEGIN
  IF v_pid IS NULL THEN RETURN; END IF;

  -- Birdie streak calculation
  FOR v_round IN
    SELECT rp.id AS rp_id
    FROM round_players rp
    JOIN rounds r ON r.id = rp.round_id
    WHERE rp.profile_id = v_pid AND r.status = 'completed'
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
  ),
  round_totals AS (
    SELECT
      round_id, round_date, course_name, is_organizer, handicap_for_round,
      SUM(strokes)::INT AS total_strokes,
      COUNT(*)::INT AS hole_count,
      BOOL_AND(strokes <= par) AS no_bogey
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
    (SELECT COUNT(*) FILTER (WHERE no_bogey) FROM full_rounds)::INT,
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
$$;

GRANT EXECUTE ON FUNCTION public.get_player_milestones() TO authenticated;

-- ═══════════════════════════════════════════
-- FUNCIÓN 3: get_player_score_by_hole
-- ═══════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_player_score_by_hole(p_course_id UUID)
RETURNS TABLE(
  hole_number   INT,
  par           INT,
  avg_strokes   NUMERIC,
  avg_vs_par    NUMERIC,
  rounds_count  INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid UUID := get_my_profile_id();
BEGIN
  IF v_pid IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    ch.hole_number::INT,
    ch.par::INT,
    ROUND(AVG(hs.strokes), 1),
    ROUND(AVG(hs.strokes - ch.par), 1),
    COUNT(*)::INT
  FROM hole_scores hs
  JOIN round_players rp ON rp.id = hs.round_player_id
  JOIN rounds r ON r.id = rp.round_id
  JOIN course_holes ch ON ch.course_id = r.course_id AND ch.hole_number = hs.hole_number
  WHERE rp.profile_id = v_pid
    AND r.course_id = p_course_id
    AND r.status = 'completed'
    AND hs.strokes IS NOT NULL
  GROUP BY ch.hole_number, ch.par
  ORDER BY ch.hole_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_score_by_hole(UUID) TO authenticated;

-- ═══════════════════════════════════════════
-- FUNCIÓN 4: get_player_courses_summary
-- ═══════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_player_courses_summary()
RETURNS TABLE(
  course_id     UUID,
  course_name   TEXT,
  rounds_played INT,
  avg_score     NUMERIC,
  best_score    INT,
  last_played   DATE
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid UUID := get_my_profile_id();
BEGIN
  IF v_pid IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH round_scores AS (
    SELECT
      r.course_id,
      gc.name,
      r.date AS round_date,
      SUM(hs.strokes)::INT AS total_strokes,
      COUNT(hs.id)::INT AS hole_count
    FROM round_players rp
    JOIN rounds r ON r.id = rp.round_id
    JOIN golf_courses gc ON gc.id = r.course_id
    JOIN hole_scores hs ON hs.round_player_id = rp.id
    WHERE rp.profile_id = v_pid AND r.status = 'completed' AND hs.strokes IS NOT NULL
    GROUP BY r.id, r.course_id, gc.name, r.date
  )
  SELECT
    rs.course_id,
    rs.name,
    COUNT(*)::INT,
    ROUND(AVG(rs.total_strokes) FILTER (WHERE rs.hole_count >= 18), 1),
    MIN(rs.total_strokes) FILTER (WHERE rs.hole_count >= 18),
    MAX(rs.round_date)
  FROM round_scores rs
  GROUP BY rs.course_id, rs.name
  ORDER BY MAX(rs.round_date) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_courses_summary() TO authenticated;

-- ═══════════════════════════════════════════
-- FUNCIÓN 5: get_player_recent_rounds
-- ═══════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_player_recent_rounds()
RETURNS TABLE(
  round_date    DATE,
  course_name   TEXT,
  total_strokes INT,
  total_putts   INT,
  vs_par        INT,
  holes_played  INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  GROUP BY r.id, r.date, gc.name
  ORDER BY r.date DESC
  LIMIT 10;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_recent_rounds() TO authenticated;
