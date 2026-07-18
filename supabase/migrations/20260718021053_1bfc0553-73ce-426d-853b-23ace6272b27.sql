
ALTER TABLE public.leaderboard_scores
  ADD COLUMN IF NOT EXISTS points_earned numeric(8,2);

CREATE OR REPLACE FUNCTION public.compute_league_jornada_standings(
  p_leaderboard_id uuid,
  p_jornada_date date
)
RETURNS TABLE (
  participant_id uuid,
  display_name text,
  score_value numeric,
  position_rank integer,
  points_earned numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rules jsonb;
  v_scoring_system text;
  v_score_basis text;
  v_points_per_position jsonb;
BEGIN
  SELECT rules_json INTO v_rules
  FROM public.leaderboard_events
  WHERE id = p_leaderboard_id;

  v_scoring_system := COALESCE(v_rules->>'scoring_system', 'strokes');
  v_score_basis    := COALESCE(v_rules->>'score_basis', 'net');
  v_points_per_position := COALESCE(v_rules->'points_per_position', '[]'::jsonb);

  RETURN QUERY
  WITH jornada_rounds AS (
    SELECT lr.round_id, r.date
    FROM public.leaderboard_rounds lr
    JOIN public.rounds r ON r.id = lr.round_id
    WHERE lr.leaderboard_id = p_leaderboard_id
      AND r.date = p_jornada_date
      AND r.status = 'completed'
  ),
  participant_scores AS (
    SELECT
      lp.id AS participant_id,
      COALESCE(p.display_name, lp.guest_name, 'Jugador') AS display_name,
      CASE v_score_basis
        WHEN 'gross'      THEN ls.gross_vs_par::numeric
        WHEN 'stableford' THEN ls.stableford_total::numeric
        ELSE                   ls.net_vs_par::numeric
      END AS score_value,
      ls.holes_played
    FROM public.leaderboard_participants lp
    LEFT JOIN public.profiles p ON p.id = lp.profile_id
    JOIN public.leaderboard_scores ls
      ON ls.participant_id = lp.id
      AND ls.round_id IN (SELECT round_id FROM jornada_rounds)
      AND ls.leaderboard_id = p_leaderboard_id
    WHERE lp.leaderboard_id = p_leaderboard_id
      AND lp.is_active = true
      AND ls.holes_played >= 9
  ),
  ranked AS (
    SELECT
      ps.*,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE WHEN v_score_basis = 'stableford' THEN ps.score_value * -1 ELSE ps.score_value END ASC
      )::integer AS pos
    FROM participant_scores ps
  )
  SELECT
    r.participant_id,
    r.display_name,
    r.score_value,
    r.pos,
    CASE
      WHEN v_scoring_system = 'points' THEN
        COALESCE((v_points_per_position->>(r.pos - 1))::numeric, 0)
      ELSE NULL
    END AS points_earned
  FROM ranked r
  ORDER BY r.pos;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_league_jornada_standings(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_league_accumulated_standings(
  p_leaderboard_id uuid
)
RETURNS TABLE (
  participant_id uuid,
  display_name text,
  initials text,
  avatar_color text,
  jornadas_jugadas integer,
  score_acumulado numeric,
  score_cuenta numeric,
  points_acumulados numeric,
  points_cuenta numeric,
  position_rank integer,
  qualifies boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rules jsonb;
  v_scoring_system text;
  v_score_basis text;
  v_aggregation text;
  v_best_n integer;
  v_min_rounds integer;
  v_points_per_position jsonb;
BEGIN
  SELECT rules_json INTO v_rules
  FROM public.leaderboard_events
  WHERE id = p_leaderboard_id;

  v_scoring_system      := COALESCE(v_rules->>'scoring_system', 'strokes');
  v_score_basis         := COALESCE(v_rules->>'score_basis', 'net');
  v_aggregation         := COALESCE(v_rules->>'aggregation', 'sum');
  v_best_n              := COALESCE((v_rules->>'best_n')::integer, NULL);
  v_min_rounds          := COALESCE((v_rules->>'min_rounds_to_qualify')::integer, 0);
  v_points_per_position := COALESCE(v_rules->'points_per_position', '[]'::jsonb);

  RETURN QUERY
  WITH participant_round_scores AS (
    SELECT
      lp.id AS participant_id,
      COALESCE(p.display_name, lp.guest_name, 'Jugador') AS display_name,
      COALESCE(p.initials, lp.guest_initials, '??') AS initials,
      COALESCE(p.avatar_color, lp.guest_color, '#3B82F6') AS avatar_color,
      ls.round_id,
      ls.points_earned,
      CASE v_score_basis
        WHEN 'gross'      THEN ls.gross_vs_par::numeric
        WHEN 'stableford' THEN ls.stableford_total::numeric
        ELSE                   ls.net_vs_par::numeric
      END AS round_score,
      ls.holes_played
    FROM public.leaderboard_participants lp
    LEFT JOIN public.profiles p ON p.id = lp.profile_id
    JOIN public.leaderboard_scores ls
      ON ls.participant_id = lp.id
      AND ls.leaderboard_id = p_leaderboard_id
    JOIN public.rounds r ON r.id = ls.round_id
    WHERE lp.leaderboard_id = p_leaderboard_id
      AND lp.is_active = true
      AND ls.holes_played >= 9
      AND r.status = 'completed'
  ),
  aggregated AS (
    SELECT
      prs.participant_id,
      prs.display_name,
      prs.initials,
      prs.avatar_color,
      COUNT(*)::integer AS jornadas_jugadas,
      SUM(prs.round_score) AS score_total,
      AVG(prs.round_score) AS score_avg,
      SUM(prs.points_earned) AS points_total,
      CASE
        WHEN v_best_n IS NOT NULL AND v_score_basis != 'stableford' THEN
          (SELECT SUM(s) FROM (
            SELECT prs2.round_score AS s
            FROM participant_round_scores prs2
            WHERE prs2.participant_id = prs.participant_id
            ORDER BY prs2.round_score ASC
            LIMIT v_best_n
          ) sub)
        WHEN v_best_n IS NOT NULL AND v_score_basis = 'stableford' THEN
          (SELECT SUM(s) FROM (
            SELECT prs2.round_score AS s
            FROM participant_round_scores prs2
            WHERE prs2.participant_id = prs.participant_id
            ORDER BY prs2.round_score DESC
            LIMIT v_best_n
          ) sub)
        WHEN v_best_n IS NOT NULL AND v_scoring_system = 'points' THEN
          (SELECT SUM(s) FROM (
            SELECT prs2.points_earned AS s
            FROM participant_round_scores prs2
            WHERE prs2.participant_id = prs.participant_id
            ORDER BY prs2.points_earned DESC NULLS LAST
            LIMIT v_best_n
          ) sub)
        ELSE NULL
      END AS best_n_value,
      CASE
        WHEN v_best_n IS NOT NULL AND v_scoring_system = 'points' THEN
          (SELECT SUM(s) FROM (
            SELECT prs2.points_earned AS s
            FROM participant_round_scores prs2
            WHERE prs2.participant_id = prs.participant_id
            ORDER BY prs2.points_earned DESC NULLS LAST
            LIMIT v_best_n
          ) sub)
        ELSE NULL
      END AS best_n_points
    FROM participant_round_scores prs
    GROUP BY prs.participant_id, prs.display_name, prs.initials, prs.avatar_color
  ),
  final AS (
    SELECT
      a.*,
      a.score_total AS score_acum,
      CASE v_aggregation
        WHEN 'best_n'   THEN COALESCE(a.best_n_value, a.score_total)
        WHEN 'average'  THEN a.score_avg
        ELSE                 a.score_total
      END AS score_cta,
      COALESCE(a.points_total, 0) AS pts_acum,
      CASE v_aggregation
        WHEN 'best_n' THEN COALESCE(a.best_n_points, a.points_total, 0)
        ELSE               COALESCE(a.points_total, 0)
      END AS pts_cta,
      a.jornadas_jugadas >= v_min_rounds AS qualifies
    FROM aggregated a
  )
  SELECT
    f.participant_id,
    f.display_name,
    f.initials,
    f.avatar_color,
    f.jornadas_jugadas,
    ROUND(f.score_acum::numeric, 1) AS score_acumulado,
    ROUND(f.score_cta::numeric, 1)  AS score_cuenta,
    ROUND(f.pts_acum::numeric, 1)   AS points_acumulados,
    ROUND(f.pts_cta::numeric, 1)    AS points_cuenta,
    ROW_NUMBER() OVER (
      ORDER BY
        CASE WHEN NOT f.qualifies THEN 2 ELSE 1 END,
        CASE
          WHEN v_scoring_system = 'points' THEN f.pts_cta * -1
          WHEN v_score_basis = 'stableford' THEN f.score_cta * -1
          ELSE f.score_cta
        END ASC NULLS LAST
    )::integer AS position_rank,
    f.qualifies
  FROM final f
  ORDER BY position_rank;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_league_accumulated_standings(uuid) TO authenticated;
