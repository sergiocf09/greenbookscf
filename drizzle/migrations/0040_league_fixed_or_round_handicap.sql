CREATE OR REPLACE FUNCTION public._league_effective_handicap(p_rules jsonb, p_fixed numeric, p_round numeric)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT GREATEST(ROUND(CASE WHEN p_rules->>'handicap_mode' = 'per_round' THEN p_round ELSE p_fixed END), 0)::integer;
$$;
REVOKE ALL ON FUNCTION public._league_effective_handicap(jsonb,numeric,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._league_effective_handicap(jsonb,numeric,numeric) TO service_role;

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
             public._league_effective_handicap(e.rules_json, lp.handicap_for_leaderboard, rp.handicap_for_round) AS hcp, r.course_id
      FROM leaderboard_participants lp
      JOIN leaderboard_events e ON e.id = lp.leaderboard_id
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
REVOKE ALL ON FUNCTION public._recompute_league_round_scores(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._recompute_league_round_scores(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_league_handicap_mode_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_round uuid;
BEGIN
  IF NEW.competition_type = 'league' AND COALESCE(NEW.rules_json->>'handicap_mode','fixed') IS DISTINCT FROM COALESCE(OLD.rules_json->>'handicap_mode','fixed') THEN
    IF COALESCE(NEW.rules_json->>'handicap_mode','fixed') NOT IN ('fixed','per_round') THEN RAISE EXCEPTION 'invalid league handicap mode'; END IF;
    FOR v_round IN SELECT round_id FROM public.leaderboard_rounds WHERE leaderboard_id = NEW.id LOOP
      PERFORM public._recompute_league_round_scores(NEW.id, v_round);
    END LOOP;
    INSERT INTO public.leaderboard_audit_log(leaderboard_id,actor_profile_id,action,details)
    VALUES(NEW.id, public.get_my_profile_id(), 'standings_recalculated', jsonb_build_object('reason','handicap_mode_changed','handicap_mode',NEW.rules_json->>'handicap_mode'));
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.trg_league_handicap_mode_changed() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER league_handicap_mode_changed AFTER UPDATE OF rules_json ON public.leaderboard_events FOR EACH ROW EXECUTE FUNCTION public.trg_league_handicap_mode_changed();

CREATE OR REPLACE FUNCTION public.get_league_round_handicaps(p_leaderboard_id uuid,p_round_id uuid)
RETURNS TABLE(round_player_id uuid,profile_id uuid,display_name text,round_handicap numeric,fixed_handicap numeric,effective_handicap integer,handicap_mode text,is_member boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event public.leaderboard_events; v_me uuid; v_own_round boolean;
BEGIN
  v_me := public.get_my_profile_id();
  SELECT * INTO v_event FROM public.leaderboard_events WHERE id=p_leaderboard_id;
  IF v_me IS NULL OR v_event.created_by IS DISTINCT FROM v_me OR v_event.competition_type IS DISTINCT FROM 'league' THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT r.organizer_id=v_me OR EXISTS(SELECT 1 FROM public.round_players rp WHERE rp.round_id=r.id AND rp.profile_id=v_me AND NOT rp.is_cross_only) INTO v_own_round FROM public.rounds r WHERE r.id=p_round_id;
  IF NOT COALESCE(v_own_round,false) AND NOT EXISTS (
    SELECT 1 FROM public.rounds r JOIN public.round_players rp ON rp.round_id=r.id AND NOT rp.is_cross_only
    JOIN public.leaderboard_participants lp ON lp.leaderboard_id=p_leaderboard_id AND lp.is_active AND lp.profile_id=rp.profile_id
    WHERE r.id=p_round_id AND r.date>=v_event.start_date AND (v_event.end_date IS NULL OR r.date<=v_event.end_date) AND r.status IN ('in_progress','completed')
  ) THEN RAISE EXCEPTION 'not allowed'; END IF;
  RETURN QUERY SELECT rp.id,rp.profile_id,COALESCE(p.display_name,rp.guest_name,'Jugador'),rp.handicap_for_round,lp.handicap_for_leaderboard,
    public._league_effective_handicap(v_event.rules_json,COALESCE(lp.handicap_for_leaderboard,rp.handicap_for_round),rp.handicap_for_round),
    COALESCE(v_event.rules_json->>'handicap_mode','fixed'),lp.id IS NOT NULL
  FROM public.round_players rp LEFT JOIN public.profiles p ON p.id=rp.profile_id
  LEFT JOIN public.leaderboard_participants lp ON lp.leaderboard_id=p_leaderboard_id AND lp.is_active AND ((rp.profile_id IS NOT NULL AND lp.profile_id=rp.profile_id) OR (rp.profile_id IS NULL AND lp.profile_id IS NULL AND lp.guest_name=rp.guest_name))
  WHERE rp.round_id=p_round_id AND NOT rp.is_cross_only AND (COALESCE(v_own_round,false) OR lp.id IS NOT NULL)
  ORDER BY COALESCE(p.display_name,rp.guest_name,'Jugador'),rp.id;
END $$;
REVOKE ALL ON FUNCTION public.get_league_round_handicaps(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_league_round_handicaps(uuid,uuid) TO authenticated, service_role;