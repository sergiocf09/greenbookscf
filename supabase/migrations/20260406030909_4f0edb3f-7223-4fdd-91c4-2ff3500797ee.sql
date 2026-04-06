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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_profile_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_my_profile_id := public.get_my_profile_id();

  RETURN QUERY
  WITH target_profiles AS (
    SELECT v_my_profile_id AS profile_id
    UNION
    SELECT f.friend_profile_id
    FROM public.friendships f
    WHERE f.owner_profile_id = v_my_profile_id
      AND f.status = 'active'
  ),
  latest_scores AS (
    SELECT
      hh.profile_id,
      hh.handicap,
      hh.gross_score,
      hh.recorded_at,
      row_number() OVER (PARTITION BY hh.profile_id ORDER BY hh.recorded_at DESC) AS rn
    FROM public.handicap_history hh
    JOIN target_profiles tp ON tp.profile_id = hh.profile_id
    WHERE hh.gross_score IS NOT NULL
  ),
  score_stats AS (
    SELECT
      ls.profile_id,
      round(avg(ls.gross_score)::numeric, 1) AS avg_gross_score,
      min(ls.gross_score) AS best_gross_score
    FROM latest_scores ls
    WHERE ls.rn <= 20
    GROUP BY ls.profile_id
  ),
  round_stats AS (
    SELECT
      rp.profile_id,
      count(DISTINCT rp.round_id)::bigint AS rounds_played
    FROM public.round_players rp
    JOIN public.rounds r ON r.id = rp.round_id
    JOIN target_profiles tp ON tp.profile_id = rp.profile_id
    WHERE rp.profile_id IS NOT NULL
      AND r.status = 'completed'
    GROUP BY rp.profile_id
  ),
  trend_stats AS (
    SELECT
      p.id AS profile_id,
      (
        SELECT round((p.current_handicap - hh.handicap)::numeric, 1)
        FROM public.handicap_history hh
        WHERE hh.profile_id = p.id
          AND hh.recorded_at <= now() - interval '30 days'
        ORDER BY hh.recorded_at DESC
        LIMIT 1
      ) AS handicap_trend
    FROM public.profiles p
    JOIN target_profiles tp ON tp.profile_id = p.id
  )
  SELECT
    p.id AS profile_id,
    p.display_name,
    p.initials,
    p.avatar_color,
    p.current_handicap,
    ss.avg_gross_score,
    ss.best_gross_score,
    COALESCE(rs.rounds_played, 0) AS rounds_played,
    ts.handicap_trend
  FROM target_profiles tp
  JOIN public.profiles p ON p.id = tp.profile_id
  LEFT JOIN score_stats ss ON ss.profile_id = p.id
  LEFT JOIN round_stats rs ON rs.profile_id = p.id
  LEFT JOIN trend_stats ts ON ts.profile_id = p.id
  ORDER BY p.current_handicap ASC, p.display_name ASC;
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (public.is_round_participant(p_round_id) OR public.is_round_organizer(p_round_id)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH target_profiles AS (
    SELECT DISTINCT rp.profile_id
    FROM public.round_players rp
    WHERE rp.round_id = p_round_id
      AND rp.profile_id IS NOT NULL
  ),
  latest_scores AS (
    SELECT
      hh.profile_id,
      hh.handicap,
      hh.gross_score,
      hh.recorded_at,
      row_number() OVER (PARTITION BY hh.profile_id ORDER BY hh.recorded_at DESC) AS rn
    FROM public.handicap_history hh
    JOIN target_profiles tp ON tp.profile_id = hh.profile_id
    WHERE hh.gross_score IS NOT NULL
  ),
  score_stats AS (
    SELECT
      ls.profile_id,
      round(avg(ls.gross_score)::numeric, 1) AS avg_gross_score,
      min(ls.gross_score) AS best_gross_score
    FROM latest_scores ls
    WHERE ls.rn <= 20
    GROUP BY ls.profile_id
  ),
  round_stats AS (
    SELECT
      rp.profile_id,
      count(DISTINCT rp.round_id)::bigint AS rounds_played
    FROM public.round_players rp
    JOIN public.rounds r ON r.id = rp.round_id
    JOIN target_profiles tp ON tp.profile_id = rp.profile_id
    WHERE rp.profile_id IS NOT NULL
      AND r.status = 'completed'
    GROUP BY rp.profile_id
  ),
  trend_stats AS (
    SELECT
      p.id AS profile_id,
      (
        SELECT round((p.current_handicap - hh.handicap)::numeric, 1)
        FROM public.handicap_history hh
        WHERE hh.profile_id = p.id
          AND hh.recorded_at <= now() - interval '30 days'
        ORDER BY hh.recorded_at DESC
        LIMIT 1
      ) AS handicap_trend
    FROM public.profiles p
    JOIN target_profiles tp ON tp.profile_id = p.id
  )
  SELECT
    p.id AS profile_id,
    p.display_name,
    p.initials,
    p.avatar_color,
    p.current_handicap,
    ss.avg_gross_score,
    ss.best_gross_score,
    COALESCE(rs.rounds_played, 0) AS rounds_played,
    ts.handicap_trend
  FROM target_profiles tp
  JOIN public.profiles p ON p.id = tp.profile_id
  LEFT JOIN score_stats ss ON ss.profile_id = p.id
  LEFT JOIN round_stats rs ON rs.profile_id = p.id
  LEFT JOIN trend_stats ts ON ts.profile_id = p.id
  ORDER BY p.current_handicap ASC, p.display_name ASC;
END;
$$;

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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_profile_id uuid;
  v_date_from timestamptz;
  v_date_to timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_my_profile_id := public.get_my_profile_id();

  IF NOT EXISTS (
    SELECT 1
    FROM public.money_rankings mr
    WHERE mr.id = p_ranking_id
      AND (
        mr.creator_id = v_my_profile_id
        OR EXISTS (
          SELECT 1
          FROM public.money_ranking_members mrm
          WHERE mrm.ranking_id = mr.id
            AND mrm.profile_id = v_my_profile_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_period = 'year' THEN
    v_date_from := date_trunc('year', now());
    v_date_to := now();
  ELSIF p_period = 'custom' AND p_date_from IS NOT NULL THEN
    v_date_from := p_date_from;
    v_date_to := COALESCE(p_date_to, now());
  ELSE
    v_date_from := '1970-01-01'::timestamptz;
    v_date_to := now();
  END IF;

  RETURN QUERY
  WITH target_profiles AS (
    SELECT DISTINCT mrm.profile_id
    FROM public.money_ranking_members mrm
    WHERE mrm.ranking_id = p_ranking_id
  ),
  latest_scores AS (
    SELECT
      hh.profile_id,
      hh.handicap,
      hh.gross_score,
      hh.recorded_at,
      row_number() OVER (PARTITION BY hh.profile_id ORDER BY hh.recorded_at DESC) AS rn
    FROM public.handicap_history hh
    JOIN target_profiles tp ON tp.profile_id = hh.profile_id
    WHERE hh.gross_score IS NOT NULL
  ),
  score_stats AS (
    SELECT
      ls.profile_id,
      round(avg(ls.gross_score)::numeric, 1) AS avg_gross_score,
      min(ls.gross_score) AS best_gross_score
    FROM latest_scores ls
    WHERE ls.rn <= 20
    GROUP BY ls.profile_id
  ),
  round_stats AS (
    SELECT
      rp.profile_id,
      count(DISTINCT rp.round_id)::bigint AS rounds_played
    FROM public.round_players rp
    JOIN public.rounds r ON r.id = rp.round_id
    JOIN target_profiles tp ON tp.profile_id = rp.profile_id
    WHERE rp.profile_id IS NOT NULL
      AND r.status = 'completed'
      AND r.date >= v_date_from::date
      AND r.date <= v_date_to::date
    GROUP BY rp.profile_id
  ),
  trend_stats AS (
    SELECT
      p.id AS profile_id,
      (
        SELECT round((p.current_handicap - hh.handicap)::numeric, 1)
        FROM public.handicap_history hh
        WHERE hh.profile_id = p.id
          AND hh.recorded_at <= now() - interval '30 days'
        ORDER BY hh.recorded_at DESC
        LIMIT 1
      ) AS handicap_trend
    FROM public.profiles p
    JOIN target_profiles tp ON tp.profile_id = p.id
  )
  SELECT
    p.id AS profile_id,
    p.display_name,
    p.initials,
    p.avatar_color,
    p.current_handicap,
    ss.avg_gross_score,
    ss.best_gross_score,
    COALESCE(rs.rounds_played, 0) AS rounds_played,
    ts.handicap_trend
  FROM target_profiles tp
  JOIN public.profiles p ON p.id = tp.profile_id
  LEFT JOIN score_stats ss ON ss.profile_id = p.id
  LEFT JOIN round_stats rs ON rs.profile_id = p.id
  LEFT JOIN trend_stats ts ON ts.profile_id = p.id
  ORDER BY p.current_handicap ASC, p.display_name ASC;
END;
$$;