
-- ════════════════════════════════════════════════════════════
-- Fix get_player_recent_rounds: respect 9H segment
-- ════════════════════════════════════════════════════════════
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
$$;

GRANT EXECUTE ON FUNCTION public.get_player_recent_rounds() TO authenticated;

-- ════════════════════════════════════════════════════════════
-- Fix get_player_stats: respect 9H segment in base CTE
-- Full-round aggregates (avg/best/worst gross, avg vs par, avg putts/round)
-- still require >= 18 holes, so 9H rounds are excluded from those.
-- Per-hole aggregates (eagles, birdies, GIR, putts %, scrambling, vs par by par)
-- now use only the played segment for 9H rounds.
-- ════════════════════════════════════════════════════════════
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
      COALESCE((r.bet_config->>'roundHoles')::INTEGER, 18) AS round_holes_cfg,
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
      AND (
        COALESCE((r.bet_config->>'roundHoles')::INTEGER, 18) <> 9
        OR (
          CASE
            WHEN COALESCE(r.starting_hole, 1) = 10 THEN hs.hole_number BETWEEN 10 AND 18
            ELSE hs.hole_number BETWEEN 1 AND 9
          END
        )
      )
  ),
  round_totals AS (
    SELECT
      b.round_id,
      MAX(b.round_holes_cfg) AS round_holes_cfg,
      SUM(b.strokes)::INT AS total_strokes,
      SUM(b.par)::INT AS total_par,
      SUM(b.putts)::INT AS total_putts,
      COUNT(*)::INT AS hole_count
    FROM base b
    GROUP BY b.round_id
  ),
  full_rounds AS (
    SELECT * FROM round_totals
    WHERE round_holes_cfg <> 9 AND hole_count >= 18
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
      ROUND(100.0 * COUNT(*) FILTER (WHERE is_gir) / NULLIF(COUNT(*), 0), 1) AS v_gir_pct,
      ROUND(100.0 * COUNT(*) FILTER (WHERE is_gir AND par = 3) / NULLIF(COUNT(*) FILTER (WHERE par = 3), 0), 1) AS v_gir_pct_par3,
      ROUND(100.0 * COUNT(*) FILTER (WHERE is_gir AND par = 4) / NULLIF(COUNT(*) FILTER (WHERE par = 4), 0), 1) AS v_gir_pct_par4,
      ROUND(100.0 * COUNT(*) FILTER (WHERE is_gir AND par = 5) / NULLIF(COUNT(*) FILTER (WHERE par = 5), 0), 1) AS v_gir_pct_par5,
      ROUND(AVG(putts) FILTER (WHERE is_gir), 2) AS v_avg_putts_gir,
      ROUND(100.0 * COUNT(*) FILTER (WHERE putts = 1) / NULLIF(COUNT(*), 0), 1) AS v_pct_one_putt,
      ROUND(100.0 * COUNT(*) FILTER (WHERE putts >= 3) / NULLIF(COUNT(*), 0), 1) AS v_pct_three_putt,
      ROUND(100.0 * COUNT(*) FILTER (WHERE NOT is_gir AND strokes <= par) / NULLIF(COUNT(*) FILTER (WHERE NOT is_gir), 0), 1) AS v_scrambling,
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
