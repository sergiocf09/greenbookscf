CREATE OR REPLACE FUNCTION public.compute_league_jornada_standings(p_leaderboard_id uuid, p_jornada_date date)
RETURNS TABLE(participant_id uuid, display_name text, score_value numeric, position_rank integer, points_earned numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_rules jsonb; v_scoring_system text; v_score_basis text; v_pts jsonb;
BEGIN
  SELECT rules_json INTO v_rules FROM public.leaderboard_events WHERE id = p_leaderboard_id;
  v_scoring_system := COALESCE(v_rules->>'scoring_system', 'strokes');
  v_score_basis    := COALESCE(v_rules->>'score_basis', 'net');
  v_pts := COALESCE(v_rules->'points_per_position', '[]'::jsonb);
  RETURN QUERY
  WITH jr AS (
    SELECT lr.round_id FROM public.leaderboard_rounds lr JOIN public.rounds r ON r.id = lr.round_id
    WHERE lr.leaderboard_id = p_leaderboard_id AND r.date = p_jornada_date AND r.status = 'completed'
  ), ps AS (
    SELECT lp.id AS pid, COALESCE(p.display_name, lp.guest_name, 'Jugador') AS dn,
      CASE v_score_basis WHEN 'gross' THEN ls.gross_vs_par::numeric WHEN 'stableford' THEN ls.stableford_total::numeric ELSE ls.net_vs_par::numeric END AS sv
    FROM public.leaderboard_participants lp
    LEFT JOIN public.profiles p ON p.id = lp.profile_id
    JOIN public.leaderboard_scores ls ON ls.participant_id = lp.id AND ls.leaderboard_id = p_leaderboard_id AND ls.round_id IN (SELECT round_id FROM jr)
    WHERE lp.leaderboard_id = p_leaderboard_id AND lp.is_active AND ls.holes_played >= 9
  ), ranked AS (
    SELECT ps.*,
      RANK() OVER (ORDER BY CASE WHEN v_score_basis='stableford' THEN -ps.sv ELSE ps.sv END)::int AS pos,
      COUNT(*) OVER (PARTITION BY ps.sv)::int AS ties
    FROM ps
  )
  SELECT r.pid, r.dn, r.sv, r.pos,
    CASE WHEN v_scoring_system = 'points' THEN
      ROUND((SELECT SUM(COALESCE((v_pts->>(g-1))::numeric, 0)) FROM generate_series(r.pos, r.pos + r.ties - 1) g) / r.ties, 2)
    ELSE NULL END
  FROM ranked r ORDER BY r.pos, r.dn;
END $function$;

CREATE OR REPLACE FUNCTION public._apply_league_jornada_points(p_leaderboard_id uuid, p_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE leaderboard_scores ls SET points_earned = j.points_earned
  FROM public.compute_league_jornada_standings(p_leaderboard_id, p_date) j, rounds r
  WHERE ls.leaderboard_id = p_leaderboard_id AND ls.participant_id = j.participant_id
    AND r.id = ls.round_id AND r.date = p_date;
END $$;
REVOKE ALL ON FUNCTION public._apply_league_jornada_points(uuid, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._recompute_league_round_scores(p_leaderboard_id uuid, p_round_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_date date;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM leaderboard_events WHERE id = p_leaderboard_id AND competition_type = 'league') THEN RETURN; END IF;
  DELETE FROM leaderboard_scores WHERE leaderboard_id = p_leaderboard_id AND round_id = p_round_id;
  SELECT date INTO v_date FROM rounds WHERE id = p_round_id;
  IF EXISTS (SELECT 1 FROM leaderboard_rounds WHERE leaderboard_id = p_leaderboard_id AND round_id = p_round_id) THEN
    INSERT INTO leaderboard_scores (leaderboard_id, participant_id, round_id, gross_total, net_total, stableford_total, gross_vs_par, net_vs_par, holes_played, computed_at)
    WITH matched AS (
      SELECT DISTINCT ON (lp.id) lp.id AS participant_id, rp.id AS rp_id,
             GREATEST(ROUND(lp.handicap_for_leaderboard), 0)::int AS hcp, r.course_id
      FROM leaderboard_participants lp
      JOIN rounds r ON r.id = p_round_id
      JOIN round_players rp ON rp.round_id = r.id AND COALESCE(rp.is_cross_only, false) = false
        AND ((lp.profile_id IS NOT NULL AND rp.profile_id = lp.profile_id)
          OR (lp.profile_id IS NULL AND rp.profile_id IS NULL AND lp.guest_name = rp.guest_name))
      WHERE lp.leaderboard_id = p_leaderboard_id AND lp.is_active
      ORDER BY lp.id, (lp.source_round_id = p_round_id) DESC NULLS LAST
    ), holes AS (
      SELECT m.participant_id, hs.strokes, ch.par,
             (m.hcp / 18) + CASE WHEN ch.stroke_index <= (m.hcp % 18) THEN 1 ELSE 0 END AS recv
      FROM matched m
      JOIN hole_scores hs ON hs.round_player_id = m.rp_id AND hs.strokes IS NOT NULL AND hs.strokes > 0
      JOIN course_holes ch ON ch.course_id = m.course_id AND ch.hole_number = hs.hole_number
    )
    SELECT p_leaderboard_id, participant_id, p_round_id, SUM(strokes), SUM(strokes - recv),
           SUM(GREATEST(0, 2 + par - (strokes - recv))), SUM(strokes - par), SUM(strokes - recv - par), COUNT(*), now()
    FROM holes GROUP BY participant_id;
  END IF;
  IF v_date IS NOT NULL THEN PERFORM public._apply_league_jornada_points(p_leaderboard_id, v_date); END IF;
END $$;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT lr.leaderboard_id, lr.round_id FROM leaderboard_rounds lr JOIN leaderboard_events e ON e.id = lr.leaderboard_id WHERE e.competition_type = 'league' LOOP
    PERFORM public._recompute_league_round_scores(r.leaderboard_id, r.round_id);
  END LOOP;
END $$;