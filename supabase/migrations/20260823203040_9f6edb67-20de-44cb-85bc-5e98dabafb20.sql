CREATE OR REPLACE FUNCTION public.get_money_ranking_balances(p_ranking_id uuid, p_period text DEFAULT 'all'::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(profile_id uuid, display_name text, initials text, avatar_color text, net_balance numeric, rounds_played bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid;
  v_date_from timestamptz;
  v_date_to timestamptz;
BEGIN
  SELECT get_my_profile_id() INTO v_caller;
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.money_rankings mr WHERE mr.id = p_ranking_id AND mr.creator_id = v_caller)
     AND NOT EXISTS (SELECT 1 FROM public.money_ranking_members m WHERE m.ranking_id = p_ranking_id AND m.profile_id = v_caller) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_period = 'year' THEN
    v_date_from := date_trunc('year', now());
    v_date_to := now();
  ELSIF p_period = 'custom' AND p_date_from IS NOT NULL THEN
    v_date_from := p_date_from;
    v_date_to := coalesce(p_date_to, now());
  ELSE
    v_date_from := '1970-01-01'::timestamptz;
    v_date_to := now();
  END IF;

  RETURN QUERY
  WITH members AS (
    SELECT mrm.profile_id AS pid
    FROM public.money_ranking_members mrm
    WHERE mrm.ranking_id = p_ranking_id
  ),
  qualifying_rounds AS (
    SELECT lt.round_id
    FROM public.ledger_transactions lt
    WHERE lt.from_profile_id IN (SELECT pid FROM members)
      AND lt.to_profile_id IN (SELECT pid FROM members)
      AND lt.created_at >= v_date_from
      AND lt.created_at <= v_date_to
    GROUP BY lt.round_id
    HAVING count(DISTINCT lt.from_profile_id) + count(DISTINCT lt.to_profile_id) >= 2
  ),
  valid_transactions AS (
    SELECT lt.from_profile_id, lt.to_profile_id, lt.amount, lt.round_id
    FROM public.ledger_transactions lt
    WHERE lt.round_id IN (SELECT round_id FROM qualifying_rounds)
      AND lt.from_profile_id IN (SELECT pid FROM members)
      AND lt.to_profile_id IN (SELECT pid FROM members)
  ),
  member_balances AS (
    SELECT
      t.pid2 AS mb_profile_id,
      coalesce(sum(t.cobrado), 0) - coalesce(sum(t.pagado), 0) AS mb_net_balance,
      count(DISTINCT t.rid) AS mb_rounds_played
    FROM (
      SELECT vt.to_profile_id AS pid2, vt.amount AS cobrado, 0::numeric AS pagado, vt.round_id AS rid
      FROM valid_transactions vt
      UNION ALL
      SELECT vt.from_profile_id AS pid2, 0::numeric AS cobrado, vt.amount AS pagado, vt.round_id AS rid
      FROM valid_transactions vt
    ) t
    GROUP BY t.pid2
  )
  SELECT
    m.pid AS profile_id,
    p.display_name,
    p.initials,
    p.avatar_color,
    coalesce(mb.mb_net_balance, 0) AS net_balance,
    coalesce(mb.mb_rounds_played, 0)::bigint AS rounds_played
  FROM members m
  JOIN public.profiles p ON p.id = m.pid
  LEFT JOIN member_balances mb ON mb.mb_profile_id = m.pid
  ORDER BY coalesce(mb.mb_net_balance, 0) DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_money_ranking_bilateral(p_ranking_id uuid, p_profile_id uuid, p_period text DEFAULT 'all'::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(rival_profile_id uuid, display_name text, initials text, avatar_color text, net_balance numeric, rounds_together bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid;
  v_date_from timestamptz;
  v_date_to timestamptz;
BEGIN
  SELECT get_my_profile_id() INTO v_caller;
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.money_rankings mr WHERE mr.id = p_ranking_id AND mr.creator_id = v_caller)
     AND NOT EXISTS (SELECT 1 FROM public.money_ranking_members m WHERE m.ranking_id = p_ranking_id AND m.profile_id = v_caller) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_period = 'year' THEN
    v_date_from := date_trunc('year', now());
    v_date_to := now();
  ELSIF p_period = 'custom' AND p_date_from IS NOT NULL THEN
    v_date_from := p_date_from;
    v_date_to := coalesce(p_date_to, now());
  ELSE
    v_date_from := '1970-01-01'::timestamptz;
    v_date_to := now();
  END IF;

  RETURN QUERY
  WITH members AS (
    SELECT mrm.profile_id AS pid
    FROM public.money_ranking_members mrm
    WHERE mrm.ranking_id = p_ranking_id
  ),
  qualifying_rounds AS (
    SELECT lt.round_id
    FROM public.ledger_transactions lt
    WHERE lt.from_profile_id IN (SELECT pid FROM members)
      AND lt.to_profile_id IN (SELECT pid FROM members)
      AND lt.created_at >= v_date_from
      AND lt.created_at <= v_date_to
    GROUP BY lt.round_id
    HAVING count(DISTINCT lt.from_profile_id) + count(DISTINCT lt.to_profile_id) >= 2
  ),
  bilateral AS (
    SELECT
      CASE WHEN lt.from_profile_id = p_profile_id THEN lt.to_profile_id ELSE lt.from_profile_id END AS rival_id,
      CASE WHEN lt.from_profile_id = p_profile_id THEN -lt.amount ELSE lt.amount END AS net_amt,
      lt.round_id
    FROM public.ledger_transactions lt
    WHERE lt.round_id IN (SELECT round_id FROM qualifying_rounds)
      AND (lt.from_profile_id = p_profile_id OR lt.to_profile_id = p_profile_id)
      AND lt.from_profile_id IN (SELECT pid FROM members)
      AND lt.to_profile_id IN (SELECT pid FROM members)
  )
  SELECT
    b.rival_id AS rival_profile_id,
    p.display_name,
    p.initials,
    p.avatar_color,
    sum(b.net_amt) AS net_balance,
    count(DISTINCT b.round_id) AS rounds_together
  FROM bilateral b
  JOIN public.profiles p ON p.id = b.rival_id
  GROUP BY b.rival_id, p.display_name, p.initials, p.avatar_color
  ORDER BY sum(b.net_amt) DESC;
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
           ROW_NUMBER() OVER (PARTITION BY rp.profile_id ORDER BY r.date DESC, r.id DESC) AS rn
    FROM round_players rp
    JOIN rounds r ON r.id = rp.round_id AND r.status = 'completed'
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
    SELECT gs.pid, gs.rn, gs.gross_total, gs.course_id,
           COALESCE(gs.player_tee, gs.round_tee, 'white') AS tee_used,
           ct.course_rating, ct.slope_rating,
           ROUND(((gs.gross_total - COALESCE(ct.course_rating, 72)) * 113.0 / COALESCE(ct.slope_rating, 113))::numeric, 1) AS diff
    FROM gross_scores gs
    LEFT JOIN course_tees ct ON ct.course_id = gs.course_id 
      AND ct.tee_color = COALESCE(gs.player_tee, gs.round_tee, 'white')
    WHERE gs.rn <= 20
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
           ROW_NUMBER() OVER (PARTITION BY rp.profile_id ORDER BY r.date DESC, r.id DESC) AS rn
    FROM round_players rp
    JOIN rounds r ON r.id = rp.round_id AND r.status = 'completed'
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
           ROUND(((gs.gross_total - COALESCE(ct.course_rating, 72)) * 113.0 / COALESCE(ct.slope_rating, 113))::numeric, 1) AS diff
    FROM gross_scores gs
    LEFT JOIN course_tees ct ON ct.course_id = gs.course_id 
      AND ct.tee_color = COALESCE(gs.player_tee, gs.round_tee, 'white')
    WHERE gs.rn <= 20
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