ALTER TABLE public.leaderboard_audit_log
  DROP CONSTRAINT IF EXISTS leaderboard_audit_log_action_check;

ALTER TABLE public.leaderboard_audit_log
  ADD CONSTRAINT leaderboard_audit_log_action_check CHECK (
    action IN (
      'round_linked',
      'round_unlinked',
      'standings_recalculated',
      'league_reopened',
      'league_closed',
      'league_rule_changed'
    )
  );

CREATE OR REPLACE FUNCTION public.get_league_link_candidates(
  p_leaderboard_id uuid,
  p_min_players integer DEFAULT NULL,
  p_include_in_progress boolean DEFAULT false,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  round_id uuid,
  date date,
  status text,
  course_name text,
  organizer_name text,
  league_players_matched integer,
  matched_names text[],
  guests_in_round integer,
  players_total integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_created_by uuid;
  v_competition_type text;
  v_start_date date;
  v_end_date date;
  v_rules_json jsonb;
  v_min_players integer;
  v_limit integer;
  v_offset integer;
  v_search text;
BEGIN
  v_profile_id := public.get_my_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT created_by, competition_type, start_date, end_date, rules_json
    INTO v_created_by, v_competition_type, v_start_date, v_end_date, v_rules_json
    FROM public.leaderboard_events
   WHERE id = p_leaderboard_id;

  IF v_created_by IS DISTINCT FROM v_profile_id
     OR v_competition_type IS DISTINCT FROM 'league' THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  v_min_players := GREATEST(
    1,
    COALESCE(
      p_min_players,
      CASE
        WHEN COALESCE(v_rules_json->>'min_players_per_round', '') ~ '^\d+$'
          THEN (v_rules_json->>'min_players_per_round')::integer
        ELSE NULL
      END,
      2
    )
  );

  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
  v_offset := GREATEST(0, COALESCE(p_offset, 0));
  v_search := NULLIF(BTRIM(COALESCE(p_search, '')), '');

  RETURN QUERY
  SELECT
    r.id AS round_id,
    r.date,
    r.status::text AS status,
    COALESCE(gc.name, '')::text AS course_name,
    COALESCE(org_p.display_name, '')::text AS organizer_name,
    matched.matched_count AS league_players_matched,
    matched.matched_names,
    (
      SELECT COUNT(*)::integer
        FROM public.round_players rp_g
        LEFT JOIN public.profiles gp ON gp.id = rp_g.profile_id
       WHERE rp_g.round_id = r.id
         AND COALESCE(rp_g.is_cross_only, false) = false
         AND (
           rp_g.profile_id IS NULL
           OR (
             COALESCE(gp.is_ghost, false) = true
             AND NOT EXISTS (
               SELECT 1
                 FROM public.leaderboard_participants lp_g
                WHERE lp_g.leaderboard_id = p_leaderboard_id
                  AND lp_g.is_active = true
                  AND lp_g.profile_id = rp_g.profile_id
             )
           )
         )
    ) AS guests_in_round,
    (
      SELECT COUNT(*)::integer
        FROM public.round_players rp_t
       WHERE rp_t.round_id = r.id
         AND COALESCE(rp_t.is_cross_only, false) = false
    ) AS players_total
  FROM public.rounds r
  LEFT JOIN public.golf_courses gc ON gc.id = r.course_id
  LEFT JOIN public.profiles org_p ON org_p.id = r.organizer_id
  CROSS JOIN LATERAL (
    SELECT
      COUNT(*)::integer AS matched_count,
      COALESCE(ARRAY_AGG(m.display_name ORDER BY m.display_name), ARRAY[]::text[]) AS matched_names
    FROM (
      SELECT DISTINCT ON (lp.profile_id)
        lp.profile_id,
        COALESCE(mp.display_name, '')::text AS display_name
      FROM public.round_players rp
      JOIN public.leaderboard_participants lp
        ON lp.leaderboard_id = p_leaderboard_id
       AND lp.is_active = true
       AND lp.profile_id IS NOT NULL
       AND lp.profile_id = rp.profile_id
      LEFT JOIN public.profiles mp ON mp.id = lp.profile_id
      WHERE rp.round_id = r.id
        AND COALESCE(rp.is_cross_only, false) = false
      ORDER BY lp.profile_id
    ) m
  ) matched
  WHERE NOT EXISTS (
      SELECT 1
        FROM public.leaderboard_rounds lr
       WHERE lr.leaderboard_id = p_leaderboard_id
         AND lr.round_id = r.id
    )
    AND (
      r.status = 'completed'
      OR (COALESCE(p_include_in_progress, false) = true AND r.status = 'in_progress')
    )
    AND r.date >= v_start_date
    AND (v_end_date IS NULL OR r.date <= v_end_date)
    AND matched.matched_count >= v_min_players
    AND r.organizer_id IS DISTINCT FROM v_profile_id
    AND NOT EXISTS (
      SELECT 1
        FROM public.round_players rp_self
       WHERE rp_self.round_id = r.id
         AND rp_self.profile_id = v_profile_id
    )
    AND (
      v_search IS NULL
      OR COALESCE(gc.name, '') ILIKE '%' || v_search || '%'
      OR COALESCE(org_p.display_name, '') ILIKE '%' || v_search || '%'
    )
  ORDER BY r.date DESC, r.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_league_link_candidates(uuid, integer, boolean, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_league_link_candidates(uuid, integer, boolean, text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.link_league_candidate_round(
  p_leaderboard_id uuid,
  p_round_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_created_by uuid;
  v_competition_type text;
  v_lb_status text;
  v_start_date date;
  v_end_date date;
  v_round_date date;
  v_round_status text;
BEGIN
  v_profile_id := public.get_my_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT created_by, competition_type, status, start_date, end_date
    INTO v_created_by, v_competition_type, v_lb_status, v_start_date, v_end_date
    FROM public.leaderboard_events
   WHERE id = p_leaderboard_id;

  IF v_created_by IS DISTINCT FROM v_profile_id
     OR v_competition_type IS DISTINCT FROM 'league' THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF v_lb_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'league is closed';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.leaderboard_rounds
     WHERE leaderboard_id = p_leaderboard_id
       AND round_id = p_round_id
  ) THEN
    RAISE EXCEPTION 'round already linked';
  END IF;

  SELECT r.date, r.status::text
    INTO v_round_date, v_round_status
    FROM public.rounds r
   WHERE r.id = p_round_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'round not found';
  END IF;

  IF v_round_status NOT IN ('completed', 'in_progress') THEN
    RAISE EXCEPTION 'round status not eligible';
  END IF;

  IF v_round_date < v_start_date
     OR (v_end_date IS NOT NULL AND v_round_date > v_end_date) THEN
    RAISE EXCEPTION 'round outside league date range';
  END IF;

  INSERT INTO public.leaderboard_rounds (leaderboard_id, round_id, added_by)
  VALUES (p_leaderboard_id, p_round_id, v_profile_id);
END;
$$;

REVOKE ALL ON FUNCTION public.link_league_candidate_round(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_league_candidate_round(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_league_min_players(
  p_leaderboard_id uuid,
  p_min_players integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_created_by uuid;
  v_competition_type text;
  v_rules_json jsonb;
  v_old_val integer;
BEGIN
  v_profile_id := public.get_my_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT created_by, competition_type, rules_json
    INTO v_created_by, v_competition_type, v_rules_json
    FROM public.leaderboard_events
   WHERE id = p_leaderboard_id;

  IF v_created_by IS DISTINCT FROM v_profile_id
     OR v_competition_type IS DISTINCT FROM 'league' THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF p_min_players IS NULL OR p_min_players < 1 OR p_min_players > 12 THEN
    RAISE EXCEPTION 'min_players must be between 1 and 12';
  END IF;

  v_old_val := CASE
    WHEN COALESCE(v_rules_json->>'min_players_per_round', '') ~ '^\d+$'
      THEN (v_rules_json->>'min_players_per_round')::integer
    ELSE 2
  END;

  UPDATE public.leaderboard_events
     SET rules_json = jsonb_set(
           COALESCE(rules_json, '{}'::jsonb),
           '{min_players_per_round}',
           to_jsonb(p_min_players),
           true
         ),
         updated_at = now()
   WHERE id = p_leaderboard_id;

  INSERT INTO public.leaderboard_audit_log (
    leaderboard_id,
    actor_profile_id,
    action,
    details
  )
  VALUES (
    p_leaderboard_id,
    v_profile_id,
    'league_rule_changed',
    jsonb_build_object(
      'key', 'min_players_per_round',
      'old', v_old_val,
      'new', p_min_players
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_league_min_players(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_league_min_players(uuid, integer) TO authenticated;