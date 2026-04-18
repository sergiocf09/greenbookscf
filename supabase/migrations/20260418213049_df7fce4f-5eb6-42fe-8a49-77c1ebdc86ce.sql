-- 1) Update create_round (both overloads) to persist tee_color in round_players for the organizer
CREATE OR REPLACE FUNCTION public.create_round(p_course_id uuid, p_tee_color text, p_date date, p_bet_config jsonb)
RETURNS TABLE(round_id uuid, group_id uuid, round_player_id uuid, organizer_profile_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_round_id uuid;
  v_group_id uuid;
  v_round_player_id uuid;
  v_profile_id uuid;
  v_handicap numeric;
  v_tee text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT public.get_my_profile_id() INTO v_profile_id;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for current user';
  END IF;

  v_handicap := 0;
  v_tee := COALESCE(p_tee_color, 'white');

  INSERT INTO public.rounds (course_id, organizer_id, tee_color, date, status, bet_config)
  VALUES (p_course_id, v_profile_id, v_tee, COALESCE(p_date, CURRENT_DATE), 'setup', COALESCE(p_bet_config, '{}'::jsonb))
  RETURNING id INTO v_round_id;

  INSERT INTO public.round_groups (round_id, group_number)
  VALUES (v_round_id, 1)
  RETURNING id INTO v_group_id;

  INSERT INTO public.round_players (round_id, group_id, profile_id, handicap_for_round, is_organizer, tee_color)
  VALUES (v_round_id, v_group_id, v_profile_id, COALESCE(v_handicap, 0), true, v_tee)
  RETURNING id INTO v_round_player_id;

  round_id := v_round_id;
  group_id := v_group_id;
  round_player_id := v_round_player_id;
  organizer_profile_id := v_profile_id;
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_round(p_course_id uuid, p_tee_color text, p_date date, p_bet_config jsonb, p_starting_hole integer DEFAULT 1)
RETURNS TABLE(round_id uuid, group_id uuid, round_player_id uuid, organizer_profile_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_round_id uuid;
  v_group_id uuid;
  v_round_player_id uuid;
  v_profile_id uuid;
  v_handicap numeric;
  v_tee text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT public.get_my_profile_id() INTO v_profile_id;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for current user';
  END IF;

  v_handicap := 0;
  v_tee := COALESCE(p_tee_color, 'white');

  INSERT INTO public.rounds (course_id, organizer_id, tee_color, date, status, bet_config, starting_hole)
  VALUES (p_course_id, v_profile_id, v_tee, COALESCE(p_date, CURRENT_DATE), 'setup', COALESCE(p_bet_config, '{}'::jsonb), COALESCE(p_starting_hole, 1))
  RETURNING id INTO v_round_id;

  INSERT INTO public.round_groups (round_id, group_number)
  VALUES (v_round_id, 1)
  RETURNING id INTO v_group_id;

  INSERT INTO public.round_players (round_id, group_id, profile_id, handicap_for_round, is_organizer, tee_color)
  VALUES (v_round_id, v_group_id, v_profile_id, COALESCE(v_handicap, 0), true, v_tee)
  RETURNING id INTO v_round_player_id;

  round_id := v_round_id;
  group_id := v_group_id;
  round_player_id := v_round_player_id;
  organizer_profile_id := v_profile_id;
  RETURN NEXT;
END;
$function$;

-- 2) Backfill round_players.tee_color from rounds.tee_color where missing
UPDATE public.round_players rp
SET tee_color = r.tee_color
FROM public.rounds r
WHERE rp.round_id = r.id
  AND rp.tee_color IS NULL
  AND r.tee_color IS NOT NULL;

-- 3) Backfill handicap_history traceability for rows with round_id but NULL trace fields
WITH agg AS (
  SELECT
    hh.id AS hh_id,
    rp.id AS rp_id,
    rp.profile_id,
    rp.handicap_for_round,
    COALESCE(rp.tee_color, r.tee_color, 'white') AS tee,
    r.course_id,
    SUM(hs.strokes)::int AS gross_score,
    COUNT(hs.id) FILTER (WHERE hs.confirmed = true AND hs.strokes IS NOT NULL) AS confirmed_holes
  FROM public.handicap_history hh
  JOIN public.rounds r ON r.id = hh.round_id
  JOIN public.round_players rp ON rp.round_id = r.id AND rp.profile_id = hh.profile_id
  JOIN public.hole_scores hs ON hs.round_player_id = rp.id
  WHERE hh.round_id IS NOT NULL
    AND hh.tee_color IS NULL
    AND hs.confirmed = true
    AND hs.strokes IS NOT NULL
  GROUP BY hh.id, rp.id, rp.profile_id, rp.handicap_for_round, rp.tee_color, r.tee_color, r.course_id
  HAVING COUNT(hs.id) FILTER (WHERE hs.confirmed = true AND hs.strokes IS NOT NULL) >= 18
),
joined AS (
  SELECT a.*, ct.course_rating, ct.slope_rating
  FROM agg a
  LEFT JOIN public.course_tees ct ON ct.course_id = a.course_id AND ct.tee_color = a.tee
)
UPDATE public.handicap_history hh
SET
  tee_color = j.tee,
  course_rating = COALESCE(j.course_rating, 72),
  slope_rating = COALESCE(j.slope_rating, 113),
  gross_score = j.gross_score,
  -- AGS approx without per-hole NDB cap (best-effort backfill); equals gross when no cap data.
  -- We store gross as a conservative AGS for legacy rows; new rows are computed exactly in app.
  adjusted_gross_score = j.gross_score,
  differential = ROUND( ((j.gross_score - COALESCE(j.course_rating,72)) * 113.0 / COALESCE(j.slope_rating,113))::numeric, 1 )
FROM joined j
WHERE hh.id = j.hh_id;