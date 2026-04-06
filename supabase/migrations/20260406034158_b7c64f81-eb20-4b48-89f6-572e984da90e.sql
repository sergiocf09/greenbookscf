
CREATE OR REPLACE FUNCTION public.get_money_ranking_handicap_stats(
  p_ranking_id uuid,
  p_period text DEFAULT 'all',
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE(
  profile_id uuid,
  display_name text,
  initials text,
  avatar_color text,
  current_handicap numeric,
  avg_gross_score numeric,
  best_gross_score integer,
  rounds_played bigint,
  handicap_trend numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid;
  v_date_from timestamptz;
  v_date_to   timestamptz;
BEGIN
  SELECT get_my_profile_id() INTO v_caller;
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

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
    SELECT rp.profile_id AS pid, SUM(hs.strokes) AS gross_total, r.date AS rdate,
           ROW_NUMBER() OVER (PARTITION BY rp.profile_id ORDER BY r.date DESC, r.id DESC) AS rn
    FROM round_players rp
    JOIN rounds r ON r.id = rp.round_id AND r.status = 'completed'
    JOIN hole_scores hs ON hs.round_player_id = rp.id AND hs.strokes IS NOT NULL
    WHERE rp.profile_id IN (SELECT mb.pid FROM members mb)
      AND (v_date_from IS NULL OR r.date >= v_date_from::date)
      AND (v_date_to IS NULL OR r.date <= v_date_to::date)
    GROUP BY rp.profile_id, r.id, r.date
    HAVING COUNT(hs.id) = 18
  ),
  score_stats AS (
    SELECT gs.pid, ROUND(AVG(gs.gross_total)::numeric, 1) AS avg_gs, MIN(gs.gross_total)::integer AS best_gs
    FROM gross_scores gs WHERE gs.rn <= 20 GROUP BY gs.pid
  ),
  latest_hcp AS (
    SELECT DISTINCT ON (hh.profile_id) hh.profile_id AS pid, hh.handicap
    FROM handicap_history hh
    WHERE hh.profile_id IN (SELECT mb.pid FROM members mb)
    ORDER BY hh.profile_id, hh.recorded_at DESC
  ),
  old_hcp AS (
    SELECT DISTINCT ON (hh.profile_id) hh.profile_id AS pid, hh.handicap
    FROM handicap_history hh
    WHERE hh.profile_id IN (SELECT mb.pid FROM members mb)
      AND hh.recorded_at <= now() - interval '30 days'
    ORDER BY hh.profile_id, hh.recorded_at DESC
  )
  SELECT
    p.id,
    p.display_name,
    p.initials,
    p.avatar_color,
    p.current_handicap,
    ss.avg_gs,
    ss.best_gs,
    COALESCE(rc.cnt, 0),
    CASE WHEN oh.handicap IS NOT NULL THEN ROUND((lh.handicap - oh.handicap)::numeric, 1) ELSE NULL END
  FROM members mb
  JOIN profiles p ON p.id = mb.pid
  LEFT JOIN round_counts rc ON rc.pid = mb.pid
  LEFT JOIN score_stats ss ON ss.pid = mb.pid
  LEFT JOIN latest_hcp lh ON lh.pid = mb.pid
  LEFT JOIN old_hcp oh ON oh.pid = mb.pid
  ORDER BY p.current_handicap ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_friend_handicap_ranking_stats()
RETURNS TABLE(
  profile_id uuid,
  display_name text,
  initials text,
  avatar_color text,
  current_handicap numeric,
  avg_gross_score numeric,
  best_gross_score integer,
  rounds_played bigint,
  handicap_trend numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid;
BEGIN
  SELECT get_my_profile_id() INTO v_caller;
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN QUERY
  WITH friend_ids AS (
    SELECT f.friend_profile_id AS pid FROM friendships f WHERE f.owner_profile_id = v_caller AND f.status = 'accepted'
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
           ROW_NUMBER() OVER (PARTITION BY rp.profile_id ORDER BY r.date DESC, r.id DESC) AS rn
    FROM round_players rp
    JOIN rounds r ON r.id = rp.round_id AND r.status = 'completed'
    JOIN hole_scores hs ON hs.round_player_id = rp.id AND hs.strokes IS NOT NULL
    WHERE rp.profile_id IN (SELECT fi.pid FROM friend_ids fi)
    GROUP BY rp.profile_id, r.id, r.date
    HAVING COUNT(hs.id) = 18
  ),
  score_stats AS (
    SELECT gs.pid, ROUND(AVG(gs.gross_total)::numeric, 1) AS avg_gs, MIN(gs.gross_total)::integer AS best_gs
    FROM gross_scores gs WHERE gs.rn <= 20 GROUP BY gs.pid
  ),
  latest_hcp AS (
    SELECT DISTINCT ON (hh.profile_id) hh.profile_id AS pid, hh.handicap
    FROM handicap_history hh WHERE hh.profile_id IN (SELECT fi.pid FROM friend_ids fi)
    ORDER BY hh.profile_id, hh.recorded_at DESC
  ),
  old_hcp AS (
    SELECT DISTINCT ON (hh.profile_id) hh.profile_id AS pid, hh.handicap
    FROM handicap_history hh
    WHERE hh.profile_id IN (SELECT fi.pid FROM friend_ids fi)
      AND hh.recorded_at <= now() - interval '30 days'
    ORDER BY hh.profile_id, hh.recorded_at DESC
  )
  SELECT p.id, p.display_name, p.initials, p.avatar_color, p.current_handicap,
         ss.avg_gs, ss.best_gs, COALESCE(rc.cnt, 0),
         CASE WHEN oh.handicap IS NOT NULL THEN ROUND((lh.handicap - oh.handicap)::numeric, 1) ELSE NULL END
  FROM friend_ids fi
  JOIN profiles p ON p.id = fi.pid
  LEFT JOIN round_counts rc ON rc.pid = fi.pid
  LEFT JOIN score_stats ss ON ss.pid = fi.pid
  LEFT JOIN latest_hcp lh ON lh.pid = fi.pid
  LEFT JOIN old_hcp oh ON oh.pid = fi.pid
  ORDER BY p.current_handicap ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_round_handicap_ranking_stats(p_round_id uuid)
RETURNS TABLE(
  profile_id uuid,
  display_name text,
  initials text,
  avatar_color text,
  current_handicap numeric,
  avg_gross_score numeric,
  best_gross_score integer,
  rounds_played bigint,
  handicap_trend numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid;
BEGIN
  SELECT get_my_profile_id() INTO v_caller;
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN QUERY
  WITH round_pids AS (
    SELECT DISTINCT rp.profile_id AS pid FROM round_players rp WHERE rp.round_id = p_round_id AND rp.profile_id IS NOT NULL
  ),
  round_counts AS (
    SELECT rp.profile_id AS pid, COUNT(DISTINCT r.id) AS cnt
    FROM round_players rp
    JOIN rounds r ON r.id = rp.round_id AND r.status = 'completed'
    WHERE rp.profile_id IN (SELECT rpi.pid FROM round_pids rpi)
    GROUP BY rp.profile_id
  ),
  gross_scores AS (
    SELECT rp.profile_id AS pid, SUM(hs.strokes) AS gross_total,
           ROW_NUMBER() OVER (PARTITION BY rp.profile_id ORDER BY r.date DESC, r.id DESC) AS rn
    FROM round_players rp
    JOIN rounds r ON r.id = rp.round_id AND r.status = 'completed'
    JOIN hole_scores hs ON hs.round_player_id = rp.id AND hs.strokes IS NOT NULL
    WHERE rp.profile_id IN (SELECT rpi.pid FROM round_pids rpi)
    GROUP BY rp.profile_id, r.id, r.date
    HAVING COUNT(hs.id) = 18
  ),
  score_stats AS (
    SELECT gs.pid, ROUND(AVG(gs.gross_total)::numeric, 1) AS avg_gs, MIN(gs.gross_total)::integer AS best_gs
    FROM gross_scores gs WHERE gs.rn <= 20 GROUP BY gs.pid
  ),
  latest_hcp AS (
    SELECT DISTINCT ON (hh.profile_id) hh.profile_id AS pid, hh.handicap
    FROM handicap_history hh WHERE hh.profile_id IN (SELECT rpi.pid FROM round_pids rpi)
    ORDER BY hh.profile_id, hh.recorded_at DESC
  ),
  old_hcp AS (
    SELECT DISTINCT ON (hh.profile_id) hh.profile_id AS pid, hh.handicap
    FROM handicap_history hh
    WHERE hh.profile_id IN (SELECT rpi.pid FROM round_pids rpi)
      AND hh.recorded_at <= now() - interval '30 days'
    ORDER BY hh.profile_id, hh.recorded_at DESC
  )
  SELECT p.id, p.display_name, p.initials, p.avatar_color, p.current_handicap,
         ss.avg_gs, ss.best_gs, COALESCE(rc.cnt, 0),
         CASE WHEN oh.handicap IS NOT NULL THEN ROUND((lh.handicap - oh.handicap)::numeric, 1) ELSE NULL END
  FROM round_pids rpi
  JOIN profiles p ON p.id = rpi.pid
  LEFT JOIN round_counts rc ON rc.pid = rpi.pid
  LEFT JOIN score_stats ss ON ss.pid = rpi.pid
  LEFT JOIN latest_hcp lh ON lh.pid = rpi.pid
  LEFT JOIN old_hcp oh ON oh.pid = rpi.pid
  ORDER BY p.current_handicap ASC;
END;
$$;
