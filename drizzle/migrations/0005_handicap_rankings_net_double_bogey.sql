CREATE OR REPLACE FUNCTION public._adjusted_gross_score(p_round_player_id uuid, p_course_id uuid, p_handicap numeric)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  -- WHS Net Double Bogey: each hole capped at par + 2 + strokes received.
  -- Strokes allocated like calculateStrokesPerHole in the app:
  -- ceil(total/2) to holes 1-9 and floor(total/2) to holes 10-18 by stroke index.
  WITH t AS (
    SELECT GREATEST(ROUND(COALESCE(p_handicap, 0)), 0)::int AS total
  ),
  holes AS (
    SELECT ch.hole_number, ch.par,
           ROW_NUMBER() OVER (PARTITION BY (ch.hole_number <= 9) ORDER BY ch.stroke_index, ch.hole_number) AS k,
           (ch.hole_number <= 9) AS is_front
    FROM course_holes ch
    WHERE ch.course_id = p_course_id AND ch.hole_number BETWEEN 1 AND 18
  ),
  alloc AS (
    SELECT h.hole_number, h.par, h.k,
           CASE WHEN h.is_front THEN LEAST(CEIL(t.total / 2.0)::int, 18)
                ELSE LEAST(FLOOR(t.total / 2.0)::int, 18) END AS n
    FROM holes h CROSS JOIN t
  )
  SELECT CASE WHEN (SELECT COUNT(*) FROM holes) < 18 THEN NULL ELSE (
    SELECT SUM(LEAST(hs.strokes,
             a.par + 2
             + CASE WHEN a.k <= a.n THEN 1 ELSE 0 END
             + CASE WHEN a.k <= a.n - 9 THEN 1 ELSE 0 END))::int
    FROM hole_scores hs
    JOIN alloc a ON a.hole_number = hs.hole_number
    WHERE hs.round_player_id = p_round_player_id
      AND hs.strokes IS NOT NULL AND hs.confirmed = true
  ) END
$$;

REVOKE ALL ON FUNCTION public._adjusted_gross_score(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_friend_handicap_ranking_stats()
 RETURNS TABLE(profile_id uuid, display_name text, initials text, avatar_color text, current_handicap numeric, avg_gross_score numeric, best_gross_score integer, rounds_played bigint, handicap_trend numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid;
BEGIN
  SELECT get_my_profile_id() INTO v_caller;
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN QUERY
  WITH friend_ids AS (
    SELECT f.friend_profile_id AS pid FROM friendships f WHERE f.owner_profile_id = v_caller AND f.status = 'active'
    UNION SELECT v_caller
  ),
  round_counts AS (
    SELECT rp.profile_id AS pid, COUNT(DISTINCT r.id) AS cnt
    FROM round_players rp
    JOIN rounds r ON r.id = rp.round_id AND r.status = 'completed'
    WHERE rp.profile_id IN (SELECT fi.pid FROM friend_ids fi)
    GROUP BY rp.profile_id
  ),
  gross_scores AS (
    SELECT rp.profile_id AS pid, SUM(hs.strokes) AS gross_total,
           r.id AS rid, r.date AS rdate,
           rp.id AS rpid, rp.tee_color AS player_tee, r.tee_color AS round_tee, r.course_id,
           rp.handicap_for_round,
           public._adjusted_gross_score(rp.id, r.course_id, rp.handicap_for_round) AS adj_total,
           ROW_NUMBER() OVER (PARTITION BY rp.profile_id ORDER BY r.date DESC, r.id DESC) AS rn
    FROM round_players rp
    JOIN rounds r ON r.id = rp.round_id AND r.status = 'completed'
      AND COALESCE(r.bet_config->>'roundHoles', '18') <> '9'
    JOIN hole_scores hs ON hs.round_player_id = rp.id AND hs.strokes IS NOT NULL AND hs.confirmed = true
    WHERE rp.profile_id IN (SELECT fi.pid FROM friend_ids fi)
    GROUP BY rp.profile_id, r.id, r.date, rp.id, rp.tee_color, r.tee_color, r.course_id, rp.handicap_for_round
    HAVING COUNT(hs.id) = 18
  ),
  score_stats AS (
    SELECT gs.pid, ROUND(AVG(gs.gross_total)::numeric, 1) AS avg_gs, MIN(gs.gross_total)::integer AS best_gs
    FROM gross_scores gs WHERE gs.rn <= 20 GROUP BY gs.pid
  ),
  round_diffs AS (
    SELECT gs.pid,
           ROUND(((gs.adj_total - COALESCE(ct.course_rating, 72)) * 113.0 / COALESCE(ct.slope_rating, 113))::numeric, 1) AS diff
    FROM gross_scores gs
    LEFT JOIN course_tees ct ON ct.course_id = gs.course_id
      AND ct.tee_color = COALESCE(gs.player_tee, gs.round_tee, 'white')
    WHERE gs.rn <= 20 AND gs.adj_total IS NOT NULL
  ),
  live_hcp AS (
    SELECT rd.pid, public._calc_handicap_index(ARRAY_AGG(rd.diff ORDER BY rd.diff)) AS hcp_index
    FROM round_diffs rd GROUP BY rd.pid
  ),
  old_hcp AS (
    SELECT DISTINCT ON (hh.profile_id) hh.profile_id AS pid, hh.handicap
    FROM handicap_history hh
    WHERE hh.profile_id IN (SELECT fi.pid FROM friend_ids fi)
      AND hh.recorded_at <= now() - interval '30 days'
    ORDER BY hh.profile_id, hh.recorded_at DESC
  )
  SELECT p.id, p.display_name, p.initials, p.avatar_color,
         COALESCE(lh.hcp_index, p.current_handicap) AS current_handicap,
         ss.avg_gs, ss.best_gs, COALESCE(rc.cnt, 0),
         CASE WHEN oh.handicap IS NOT NULL AND lh.hcp_index IS NOT NULL
              THEN ROUND((lh.hcp_index - oh.handicap)::numeric, 1) ELSE NULL END
  FROM friend_ids fi
  JOIN profiles p ON p.id = fi.pid
  LEFT JOIN round_counts rc ON rc.pid = fi.pid
  LEFT JOIN score_stats ss ON ss.pid = fi.pid
  LEFT JOIN live_hcp lh ON lh.pid = fi.pid
  LEFT JOIN old_hcp oh ON oh.pid = fi.pid
  ORDER BY COALESCE(lh.hcp_index, p.current_handicap) ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_round_handicap_ranking_stats(p_round_id uuid)
 RETURNS TABLE(profile_id uuid, display_name text, initials text, avatar_color text, current_handicap numeric, avg_gross_score numeric, best_gross_score integer, rounds_played bigint, handicap_trend numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_round_participant(p_round_id) OR public.is_round_organizer(p_round_id)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH round_profile_ids AS (
    SELECT DISTINCT rp.profile_id AS pid
    FROM round_players rp WHERE rp.round_id = p_round_id AND rp.profile_id IS NOT NULL
  ),
  round_counts AS (
    SELECT rp.profile_id AS pid, COUNT(DISTINCT r.id) AS cnt
    FROM round_players rp
    JOIN rounds r ON r.id = rp.round_id AND r.status = 'completed'
    WHERE rp.profile_id IN (SELECT rpi.pid FROM round_profile_ids rpi)
    GROUP BY rp.profile_id
  ),
  gross_scores AS (
    SELECT rp.profile_id AS pid, SUM(hs.strokes) AS gross_total,
           r.id AS rid, r.date AS rdate,
           rp.id AS rpid, rp.tee_color AS player_tee, r.tee_color AS round_tee, r.course_id,
           rp.handicap_for_round,
           public._adjusted_gross_score(rp.id, r.course_id, rp.handicap_for_round) AS adj_total,
           ROW_NUMBER() OVER (PARTITION BY rp.profile_id ORDER BY r.date DESC, r.id DESC) AS rn
    FROM round_players rp
    JOIN rounds r ON r.id = rp.round_id AND r.status = 'completed'
      AND COALESCE(r.bet_config->>'roundHoles', '18') <> '9'
    JOIN hole_scores hs ON hs.round_player_id = rp.id AND hs.strokes IS NOT NULL AND hs.confirmed = true
    WHERE rp.profile_id IN (SELECT rpi.pid FROM round_profile_ids rpi)
    GROUP BY rp.profile_id, r.id, r.date, rp.id, rp.tee_color, r.tee_color, r.course_id, rp.handicap_for_round
    HAVING COUNT(hs.id) = 18
  ),
  score_stats AS (
    SELECT gs.pid, ROUND(AVG(gs.gross_total)::numeric, 1) AS avg_gs, MIN(gs.gross_total)::integer AS best_gs
    FROM gross_scores gs WHERE gs.rn <= 20 GROUP BY gs.pid
  ),
  round_diffs AS (
    SELECT gs.pid,
           ROUND(((gs.adj_total - COALESCE(ct.course_rating, 72)) * 113.0 / COALESCE(ct.slope_rating, 113))::numeric, 1) AS diff
    FROM gross_scores gs
    LEFT JOIN course_tees ct ON ct.course_id = gs.course_id
      AND ct.tee_color = COALESCE(gs.player_tee, gs.round_tee, 'white')
    WHERE gs.rn <= 20 AND gs.adj_total IS NOT NULL
  ),
  live_hcp AS (
    SELECT rd.pid, public._calc_handicap_index(ARRAY_AGG(rd.diff ORDER BY rd.diff)) AS hcp_index
    FROM round_diffs rd GROUP BY rd.pid
  ),
  old_hcp AS (
    SELECT DISTINCT ON (hh.profile_id) hh.profile_id AS pid, hh.handicap
    FROM handicap_history hh
    WHERE hh.profile_id IN (SELECT rpi.pid FROM round_profile_ids rpi)
      AND hh.recorded_at <= now() - interval '30 days'
    ORDER BY hh.profile_id, hh.recorded_at DESC
  )
  SELECT p.id, p.display_name, p.initials, p.avatar_color,
         COALESCE(lh.hcp_index, p.current_handicap) AS current_handicap,
         ss.avg_gs, ss.best_gs, COALESCE(rc.cnt, 0),
         CASE WHEN oh.handicap IS NOT NULL AND lh.hcp_index IS NOT NULL
              THEN ROUND((lh.hcp_index - oh.handicap)::numeric, 1) ELSE NULL END
  FROM round_profile_ids rpi
  JOIN profiles p ON p.id = rpi.pid
  LEFT JOIN round_counts rc ON rc.pid = rpi.pid
  LEFT JOIN score_stats ss ON ss.pid = rpi.pid
  LEFT JOIN live_hcp lh ON lh.pid = rpi.pid
  LEFT JOIN old_hcp oh ON oh.pid = rpi.pid
  ORDER BY COALESCE(lh.hcp_index, p.current_handicap) ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_money_ranking_handicap_stats(p_ranking_id uuid, p_period text DEFAULT 'all'::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(profile_id uuid, display_name text, initials text, avatar_color text, current_handicap numeric, avg_gross_score numeric, best_gross_score integer, rounds_played bigint, handicap_trend numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid;
  v_date_from timestamptz;
  v_date_to   timestamptz;
BEGIN
  SELECT get_my_profile_id() INTO v_caller;
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.money_rankings mr WHERE mr.id = p_ranking_id AND mr.creator_id = v_caller)
     AND NOT EXISTS (SELECT 1 FROM public.money_ranking_members m WHERE m.ranking_id = p_ranking_id AND m.profile_id = v_caller) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_period = 'year' THEN
    v_date_from := date_trunc('year', now());
    v_date_to   := now();
  ELSIF p_period = 'custom' AND p_date_from IS NOT NULL THEN
    v_date_from := p_date_from;
    v_date_to   := COALESCE(p_date_to, now());
  ELSE
    v_date_from := NULL;
    v_date_to   := NULL;
  END IF;

  RETURN QUERY
  WITH members AS (
    SELECT m.profile_id AS pid FROM money_ranking_members m WHERE m.ranking_id = p_ranking_id
  ),
  round_counts AS (
    SELECT rp.profile_id AS pid, COUNT(DISTINCT r.id) AS cnt
    FROM round_players rp
    JOIN rounds r ON r.id = rp.round_id AND r.status = 'completed'
    WHERE rp.profile_id IN (SELECT mb.pid FROM members mb)
      AND (v_date_from IS NULL OR r.date >= v_date_from::date)
      AND (v_date_to IS NULL OR r.date <= v_date_to::date)
    GROUP BY rp.profile_id
  ),
  gross_scores AS (
    SELECT rp.profile_id AS pid, SUM(hs.strokes) AS gross_total,
           r.id AS rid, r.date AS rdate,
           rp.id AS rpid, rp.tee_color AS player_tee, r.tee_color AS round_tee, r.course_id,
           rp.handicap_for_round,
           public._adjusted_gross_score(rp.id, r.course_id, rp.handicap_for_round) AS adj_total,
           ROW_NUMBER() OVER (PARTITION BY rp.profile_id ORDER BY r.date DESC, r.id DESC) AS rn
    FROM round_players rp
    JOIN rounds r ON r.id = rp.round_id AND r.status = 'completed'
      AND COALESCE(r.bet_config->>'roundHoles', '18') <> '9'
    JOIN hole_scores hs ON hs.round_player_id = rp.id AND hs.strokes IS NOT NULL AND hs.confirmed = true
    WHERE rp.profile_id IN (SELECT mb.pid FROM members mb)
    GROUP BY rp.profile_id, r.id, r.date, rp.id, rp.tee_color, r.tee_color, r.course_id, rp.handicap_for_round
    HAVING COUNT(hs.id) = 18
  ),
  score_stats AS (
    SELECT gs.pid, ROUND(AVG(gs.gross_total)::numeric, 1) AS avg_gs, MIN(gs.gross_total)::integer AS best_gs
    FROM gross_scores gs WHERE gs.rn <= 20 GROUP BY gs.pid
  ),
  round_diffs AS (
    SELECT gs.pid,
           ROUND(((gs.adj_total - COALESCE(ct.course_rating, 72)) * 113.0 / COALESCE(ct.slope_rating, 113))::numeric, 1) AS diff
    FROM gross_scores gs
    LEFT JOIN course_tees ct ON ct.course_id = gs.course_id
      AND ct.tee_color = COALESCE(gs.player_tee, gs.round_tee, 'white')
    WHERE gs.rn <= 20 AND gs.adj_total IS NOT NULL
  ),
  live_hcp AS (
    SELECT rd.pid, public._calc_handicap_index(ARRAY_AGG(rd.diff ORDER BY rd.diff)) AS hcp_index
    FROM round_diffs rd GROUP BY rd.pid
  ),
  old_hcp AS (
    SELECT DISTINCT ON (hh.profile_id) hh.profile_id AS pid, hh.handicap
    FROM handicap_history hh
    WHERE hh.profile_id IN (SELECT mb.pid FROM members mb)
      AND hh.recorded_at <= now() - interval '30 days'
    ORDER BY hh.profile_id, hh.recorded_at DESC
  )
  SELECT
    p.id, p.display_name, p.initials, p.avatar_color,
    COALESCE(lh.hcp_index, p.current_handicap) AS current_handicap,
    ss.avg_gs, ss.best_gs, COALESCE(rc.cnt, 0),
    CASE WHEN oh.handicap IS NOT NULL AND lh.hcp_index IS NOT NULL
         THEN ROUND((lh.hcp_index - oh.handicap)::numeric, 1) ELSE NULL END
  FROM members mb
  JOIN profiles p ON p.id = mb.pid
  LEFT JOIN round_counts rc ON rc.pid = mb.pid
  LEFT JOIN score_stats ss ON ss.pid = mb.pid
  LEFT JOIN live_hcp lh ON lh.pid = mb.pid
  LEFT JOIN old_hcp oh ON oh.pid = mb.pid
  ORDER BY COALESCE(lh.hcp_index, p.current_handicap) ASC;
END;
$function$;