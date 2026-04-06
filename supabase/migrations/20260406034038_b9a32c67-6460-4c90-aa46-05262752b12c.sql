
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

  -- Determine date range
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
    SELECT m.profile_id AS pid
    FROM money_ranking_members m
    WHERE m.ranking_id = p_ranking_id
  ),
  -- Count completed rounds per member in the period
  round_counts AS (
    SELECT rp.profile_id AS pid, COUNT(DISTINCT r.id) AS cnt
    FROM round_players rp
    JOIN rounds r ON r.id = rp.round_id AND r.status = 'completed'
    WHERE rp.profile_id IN (SELECT pid FROM members)
      AND (v_date_from IS NULL OR r.date >= v_date_from::date)
      AND (v_date_to IS NULL OR r.date <= v_date_to::date)
    GROUP BY rp.profile_id
  ),
  -- Compute gross scores from hole_scores (18-hole rounds only), last 20
  gross_scores AS (
    SELECT rp.profile_id AS pid, SUM(hs.strokes) AS gross_total, r.date,
           ROW_NUMBER() OVER (PARTITION BY rp.profile_id ORDER BY r.date DESC, r.id DESC) AS rn
    FROM round_players rp
    JOIN rounds r ON r.id = rp.round_id AND r.status = 'completed'
    JOIN hole_scores hs ON hs.round_player_id = rp.id AND hs.strokes IS NOT NULL
    WHERE rp.profile_id IN (SELECT pid FROM members)
      AND (v_date_from IS NULL OR r.date >= v_date_from::date)
      AND (v_date_to IS NULL OR r.date <= v_date_to::date)
    GROUP BY rp.profile_id, r.id, r.date
    HAVING COUNT(hs.id) = 18
  ),
  score_stats AS (
    SELECT pid,
           ROUND(AVG(gross_total)::numeric, 1) AS avg_gs,
           MIN(gross_total)::integer AS best_gs
    FROM gross_scores
    WHERE rn <= 20
    GROUP BY pid
  ),
  -- Handicap trend: difference between current and 30 days ago
  trend AS (
    SELECT h1.profile_id AS pid,
           ROUND((h1.handicap - h2.handicap)::numeric, 1) AS trend_val
    FROM (
      SELECT DISTINCT ON (profile_id) profile_id, handicap
      FROM handicap_history
      WHERE profile_id IN (SELECT pid FROM members)
      ORDER BY profile_id, recorded_at DESC
    ) h1
    LEFT JOIN LATERAL (
      SELECT handicap FROM handicap_history
      WHERE profile_id = h1.profile_id AND recorded_at <= now() - interval '30 days'
      ORDER BY recorded_at DESC LIMIT 1
    ) h2 ON TRUE
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
    t.trend_val
  FROM members mb
  JOIN profiles p ON p.id = mb.pid
  LEFT JOIN round_counts rc ON rc.pid = mb.pid
  LEFT JOIN score_stats ss ON ss.pid = mb.pid
  LEFT JOIN trend t ON t.pid = mb.pid
  ORDER BY p.current_handicap ASC;
END;
$$;

-- Fix get_friend_handicap_ranking_stats to use hole_scores
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
    SELECT friend_profile_id AS pid FROM friendships WHERE owner_profile_id = v_caller AND status = 'accepted'
    UNION SELECT v_caller
  ),
  round_counts AS (
    SELECT rp.profile_id AS pid, COUNT(DISTINCT r.id) AS cnt
    FROM round_players rp
    JOIN rounds r ON r.id = rp.round_id AND r.status = 'completed'
    WHERE rp.profile_id IN (SELECT pid FROM friend_ids)
    GROUP BY rp.profile_id
  ),
  gross_scores AS (
    SELECT rp.profile_id AS pid, SUM(hs.strokes) AS gross_total, r.date,
           ROW_NUMBER() OVER (PARTITION BY rp.profile_id ORDER BY r.date DESC, r.id DESC) AS rn
    FROM round_players rp
    JOIN rounds r ON r.id = rp.round_id AND r.status = 'completed'
    JOIN hole_scores hs ON hs.round_player_id = rp.id AND hs.strokes IS NOT NULL
    WHERE rp.profile_id IN (SELECT pid FROM friend_ids)
    GROUP BY rp.profile_id, r.id, r.date
    HAVING COUNT(hs.id) = 18
  ),
  score_stats AS (
    SELECT pid,
           ROUND(AVG(gross_total)::numeric, 1) AS avg_gs,
           MIN(gross_total)::integer AS best_gs
    FROM gross_scores WHERE rn <= 20
    GROUP BY pid
  ),
  trend AS (
    SELECT h1.profile_id AS pid,
           ROUND((h1.handicap - h2.handicap)::numeric, 1) AS trend_val
    FROM (
      SELECT DISTINCT ON (profile_id) profile_id, handicap
      FROM handicap_history WHERE profile_id IN (SELECT pid FROM friend_ids)
      ORDER BY profile_id, recorded_at DESC
    ) h1
    LEFT JOIN LATERAL (
      SELECT handicap FROM handicap_history
      WHERE profile_id = h1.profile_id AND recorded_at <= now() - interval '30 days'
      ORDER BY recorded_at DESC LIMIT 1
    ) h2 ON TRUE
  )
  SELECT p.id, p.display_name, p.initials, p.avatar_color, p.current_handicap,
         ss.avg_gs, ss.best_gs, COALESCE(rc.cnt, 0), t.trend_val
  FROM friend_ids fi
  JOIN profiles p ON p.id = fi.pid
  LEFT JOIN round_counts rc ON rc.pid = fi.pid
  LEFT JOIN score_stats ss ON ss.pid = fi.pid
  LEFT JOIN trend t ON t.pid = fi.pid
  ORDER BY p.current_handicap ASC;
END;
$$;

-- Fix get_round_handicap_ranking_stats to use hole_scores
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
    WHERE rp.profile_id IN (SELECT pid FROM round_pids)
    GROUP BY rp.profile_id
  ),
  gross_scores AS (
    SELECT rp.profile_id AS pid, SUM(hs.strokes) AS gross_total, r.date,
           ROW_NUMBER() OVER (PARTITION BY rp.profile_id ORDER BY r.date DESC, r.id DESC) AS rn
    FROM round_players rp
    JOIN rounds r ON r.id = rp.round_id AND r.status = 'completed'
    JOIN hole_scores hs ON hs.round_player_id = rp.id AND hs.strokes IS NOT NULL
    WHERE rp.profile_id IN (SELECT pid FROM round_pids)
    GROUP BY rp.profile_id, r.id, r.date
    HAVING COUNT(hs.id) = 18
  ),
  score_stats AS (
    SELECT pid, ROUND(AVG(gross_total)::numeric, 1) AS avg_gs, MIN(gross_total)::integer AS best_gs
    FROM gross_scores WHERE rn <= 20 GROUP BY pid
  ),
  trend AS (
    SELECT h1.profile_id AS pid, ROUND((h1.handicap - h2.handicap)::numeric, 1) AS trend_val
    FROM (
      SELECT DISTINCT ON (profile_id) profile_id, handicap
      FROM handicap_history WHERE profile_id IN (SELECT pid FROM round_pids)
      ORDER BY profile_id, recorded_at DESC
    ) h1
    LEFT JOIN LATERAL (
      SELECT handicap FROM handicap_history
      WHERE profile_id = h1.profile_id AND recorded_at <= now() - interval '30 days'
      ORDER BY recorded_at DESC LIMIT 1
    ) h2 ON TRUE
  )
  SELECT p.id, p.display_name, p.initials, p.avatar_color, p.current_handicap,
         ss.avg_gs, ss.best_gs, COALESCE(rc.cnt, 0), t.trend_val
  FROM round_pids rpi
  JOIN profiles p ON p.id = rpi.pid
  LEFT JOIN round_counts rc ON rc.pid = rpi.pid
  LEFT JOIN score_stats ss ON ss.pid = rpi.pid
  LEFT JOIN trend t ON t.pid = rpi.pid
  ORDER BY p.current_handicap ASC;
END;
$$;
