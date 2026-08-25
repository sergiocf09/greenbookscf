CREATE OR REPLACE FUNCTION public.get_handicap_trend_series(p_profile_ids uuid[], p_days integer DEFAULT 30)
RETURNS TABLE(profile_id uuid, recorded_at timestamptz, handicap numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid;
  v_start timestamptz := now() - make_interval(days => GREATEST(COALESCE(p_days, 30), 1));
BEGIN
  SELECT get_my_profile_id() INTO v_caller;
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN QUERY
  WITH allowed AS (
    SELECT v_caller AS pid
    UNION
    SELECT f.friend_profile_id FROM friendships f
      WHERE f.owner_profile_id = v_caller AND f.status = 'active'
    UNION
    SELECT rp2.profile_id FROM round_players rp1
      JOIN round_players rp2 ON rp2.round_id = rp1.round_id
      WHERE rp1.profile_id = v_caller AND rp2.profile_id IS NOT NULL
  ),
  targets AS (
    SELECT a.pid FROM allowed a
    WHERE a.pid = ANY(COALESCE(p_profile_ids, ARRAY[]::uuid[]))
  ),
  baseline AS (
    SELECT DISTINCT ON (hh.profile_id) hh.profile_id AS pid, v_start AS rec, hh.handicap AS hcp
    FROM handicap_history hh
    WHERE hh.profile_id IN (SELECT t.pid FROM targets t) AND hh.recorded_at <= v_start
    ORDER BY hh.profile_id, hh.recorded_at DESC
  ),
  window_pts AS (
    SELECT hh.profile_id AS pid, hh.recorded_at AS rec, hh.handicap AS hcp
    FROM handicap_history hh
    WHERE hh.profile_id IN (SELECT t.pid FROM targets t) AND hh.recorded_at > v_start
  )
  SELECT u.pid, u.rec, u.hcp
  FROM (SELECT * FROM baseline UNION ALL SELECT * FROM window_pts) u
  ORDER BY u.pid, u.rec;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_handicap_trend_series(uuid[], integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_handicap_trend_series(uuid[], integer) TO authenticated;