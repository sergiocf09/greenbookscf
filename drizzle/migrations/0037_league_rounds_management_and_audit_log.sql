CREATE TABLE public.leaderboard_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leaderboard_id uuid NOT NULL REFERENCES public.leaderboard_events(id) ON DELETE CASCADE,
  actor_profile_id uuid REFERENCES public.profiles(id),
  action text NOT NULL CHECK (action IN (
    'round_linked',
    'round_unlinked',
    'standings_recalculated',
    'league_reopened',
    'league_closed'
  )),
  round_id uuid,
  round_date date,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_leaderboard_audit_log_lb_created
  ON public.leaderboard_audit_log (leaderboard_id, created_at DESC);

GRANT SELECT ON public.leaderboard_audit_log TO authenticated;
GRANT ALL ON public.leaderboard_audit_log TO service_role;

ALTER TABLE public.leaderboard_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view leaderboard audit log"
  ON public.leaderboard_audit_log
  FOR SELECT
  TO authenticated
  USING (public.can_view_leaderboard(leaderboard_id));

CREATE OR REPLACE FUNCTION public.unlink_league_round(
  p_leaderboard_id uuid,
  p_round_id uuid,
  p_reason text DEFAULT NULL
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
  v_round_date date;
  v_scores_removed integer;
  v_reason text;
BEGIN
  v_profile_id := public.get_my_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT created_by, competition_type
    INTO v_created_by, v_competition_type
    FROM public.leaderboard_events
   WHERE id = p_leaderboard_id;

  IF v_created_by IS DISTINCT FROM v_profile_id
     OR v_competition_type IS DISTINCT FROM 'league' THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.leaderboard_rounds
     WHERE leaderboard_id = p_leaderboard_id
       AND round_id = p_round_id
  ) THEN
    RAISE EXCEPTION 'round not linked';
  END IF;

  SELECT date INTO v_round_date
    FROM public.rounds
   WHERE id = p_round_id;

  SELECT COUNT(*)::integer INTO v_scores_removed
    FROM public.leaderboard_scores
   WHERE leaderboard_id = p_leaderboard_id
     AND round_id = p_round_id;

  DELETE FROM public.leaderboard_rounds
   WHERE leaderboard_id = p_leaderboard_id
     AND round_id = p_round_id;

  PERFORM public._recompute_league_round_scores(p_leaderboard_id, p_round_id);

  v_reason := NULLIF(BTRIM(COALESCE(p_reason, '')), '');

  INSERT INTO public.leaderboard_audit_log (
    leaderboard_id,
    actor_profile_id,
    action,
    round_id,
    round_date,
    details
  )
  VALUES (
    p_leaderboard_id,
    v_profile_id,
    'round_unlinked',
    p_round_id,
    v_round_date,
    jsonb_build_object(
      'reason', v_reason,
      'scores_removed', v_scores_removed
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.unlink_league_round(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlink_league_round(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.recalculate_league(p_leaderboard_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_created_by uuid;
  v_competition_type text;
  v_round_id uuid;
  v_rounds_count integer := 0;
BEGIN
  v_profile_id := public.get_my_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT created_by, competition_type
    INTO v_created_by, v_competition_type
    FROM public.leaderboard_events
   WHERE id = p_leaderboard_id;

  IF v_created_by IS DISTINCT FROM v_profile_id
     OR v_competition_type IS DISTINCT FROM 'league' THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  DELETE FROM public.leaderboard_scores ls
   WHERE ls.leaderboard_id = p_leaderboard_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.leaderboard_rounds lr
        WHERE lr.leaderboard_id = p_leaderboard_id
          AND lr.round_id = ls.round_id
     );

  FOR v_round_id IN
    SELECT round_id
      FROM public.leaderboard_rounds
     WHERE leaderboard_id = p_leaderboard_id
  LOOP
    PERFORM public._recompute_league_round_scores(p_leaderboard_id, v_round_id);
    v_rounds_count := v_rounds_count + 1;
  END LOOP;

  INSERT INTO public.leaderboard_audit_log (
    leaderboard_id,
    actor_profile_id,
    action,
    details
  )
  VALUES (
    p_leaderboard_id,
    v_profile_id,
    'standings_recalculated',
    jsonb_build_object('rounds_count', v_rounds_count)
  );

  RETURN v_rounds_count;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_league(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_league(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_league_audit_on_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round_date date;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.leaderboard_events
     WHERE id = NEW.leaderboard_id
       AND competition_type = 'league'
  ) THEN
    SELECT date INTO v_round_date
      FROM public.rounds
     WHERE id = NEW.round_id;

    INSERT INTO public.leaderboard_audit_log (
      leaderboard_id,
      actor_profile_id,
      action,
      round_id,
      round_date,
      details
    )
    VALUES (
      NEW.leaderboard_id,
      NEW.added_by,
      'round_linked',
      NEW.round_id,
      v_round_date,
      '{}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_league_audit_on_link() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trg_league_audit_on_link() TO authenticated;

DROP TRIGGER IF EXISTS league_audit_on_link ON public.leaderboard_rounds;
CREATE TRIGGER league_audit_on_link
  AFTER INSERT ON public.leaderboard_rounds
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_league_audit_on_link();

CREATE OR REPLACE FUNCTION public.close_leaderboard(p_leaderboard_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_profile_id uuid;
BEGIN
  v_profile_id := public.get_my_profile_id();
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.leaderboard_events
    SET status = 'completed', updated_at = now()
    WHERE id = p_leaderboard_id AND created_by = v_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found or not authorized'; END IF;

  INSERT INTO public.leaderboard_audit_log (
    leaderboard_id,
    actor_profile_id,
    action,
    details
  )
  VALUES (
    p_leaderboard_id,
    v_profile_id,
    'league_closed',
    '{}'::jsonb
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.close_leaderboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_leaderboard(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reopen_leaderboard(p_leaderboard_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_profile_id uuid;
BEGIN
  v_profile_id := public.get_my_profile_id();
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.leaderboard_events
    SET status = 'active', updated_at = now()
    WHERE id = p_leaderboard_id AND created_by = v_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found or not authorized'; END IF;

  INSERT INTO public.leaderboard_audit_log (
    leaderboard_id,
    actor_profile_id,
    action,
    details
  )
  VALUES (
    p_leaderboard_id,
    v_profile_id,
    'league_reopened',
    '{}'::jsonb
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_leaderboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_leaderboard(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_league_linked_rounds(p_leaderboard_id uuid)
RETURNS TABLE (
  round_id uuid,
  date date,
  status text,
  course_name text,
  organizer_name text,
  linked_by_name text,
  linked_at timestamptz,
  players_total integer,
  players_counted integer,
  counts_in_standings boolean,
  reason_not_counted text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_view_leaderboard(p_leaderboard_id) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      lr.round_id,
      r.date,
      r.status::text AS status,
      COALESCE(gc.name, '') AS course_name,
      COALESCE(org_p.display_name, '') AS organizer_name,
      COALESCE(add_p.display_name, '') AS linked_by_name,
      lr.added_at AS linked_at,
      (
        SELECT COUNT(DISTINCT lp.id)::integer
          FROM public.leaderboard_participants lp
          JOIN public.round_players rp
            ON rp.round_id = lr.round_id
           AND COALESCE(rp.is_cross_only, false) = false
           AND (
             (lp.profile_id IS NOT NULL AND rp.profile_id = lp.profile_id)
             OR (lp.profile_id IS NULL AND rp.profile_id IS NULL AND lp.guest_name = rp.guest_name)
           )
         WHERE lp.leaderboard_id = p_leaderboard_id
           AND lp.is_active = true
      ) AS players_total,
      (
        SELECT COUNT(DISTINCT ls.participant_id)::integer
          FROM public.leaderboard_scores ls
          JOIN public.leaderboard_participants lp
            ON lp.id = ls.participant_id
           AND lp.leaderboard_id = p_leaderboard_id
           AND lp.is_active = true
         WHERE ls.leaderboard_id = p_leaderboard_id
           AND ls.round_id = lr.round_id
           AND ls.holes_played >= 9
      ) AS players_counted
    FROM public.leaderboard_rounds lr
    JOIN public.rounds r ON r.id = lr.round_id
    LEFT JOIN public.golf_courses gc ON gc.id = r.course_id
    LEFT JOIN public.profiles org_p ON org_p.id = r.organizer_id
    LEFT JOIN public.profiles add_p ON add_p.id = lr.added_by
    WHERE lr.leaderboard_id = p_leaderboard_id
  )
  SELECT
    b.round_id,
    b.date,
    b.status,
    b.course_name,
    b.organizer_name,
    b.linked_by_name,
    b.linked_at,
    b.players_total,
    b.players_counted,
    (b.status = 'completed' AND b.players_counted > 0) AS counts_in_standings,
    CASE
      WHEN b.status = 'completed' AND b.players_counted > 0 THEN NULL
      WHEN b.status <> 'completed' THEN 'round_not_completed'
      WHEN b.players_total = 0 THEN 'no_participant_matched'
      ELSE 'no_player_with_9_holes'
    END AS reason_not_counted
  FROM base b
  ORDER BY b.date DESC, b.linked_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_league_linked_rounds(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_league_linked_rounds(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_league_audit_log(
  p_leaderboard_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  leaderboard_id uuid,
  actor_profile_id uuid,
  actor_name text,
  action text,
  round_id uuid,
  round_date date,
  details jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_view_leaderboard(p_leaderboard_id) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.leaderboard_id,
    l.actor_profile_id,
    COALESCE(p.display_name, '') AS actor_name,
    l.action,
    l.round_id,
    l.round_date,
    l.details,
    l.created_at
  FROM public.leaderboard_audit_log l
  LEFT JOIN public.profiles p ON p.id = l.actor_profile_id
  WHERE l.leaderboard_id = p_leaderboard_id
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT GREATEST(COALESCE(p_limit, 20), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_league_audit_log(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_league_audit_log(uuid, integer, integer) TO authenticated;