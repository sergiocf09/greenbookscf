CREATE OR REPLACE FUNCTION public._recompute_league_round_scores(p_leaderboard_id uuid, p_round_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM leaderboard_events WHERE id = p_leaderboard_id AND competition_type = 'league') THEN RETURN; END IF;
  DELETE FROM leaderboard_scores WHERE leaderboard_id = p_leaderboard_id AND round_id = p_round_id;
  IF NOT EXISTS (SELECT 1 FROM leaderboard_rounds WHERE leaderboard_id = p_leaderboard_id AND round_id = p_round_id) THEN RETURN; END IF;

  INSERT INTO leaderboard_scores (leaderboard_id, participant_id, round_id, gross_total, net_total, stableford_total, gross_vs_par, net_vs_par, holes_played, computed_at)
  WITH matched AS (
    SELECT DISTINCT ON (lp.id) lp.id AS participant_id, rp.id AS rp_id,
           GREATEST(ROUND(lp.handicap_for_leaderboard), 0)::int AS hcp, r.course_id
    FROM leaderboard_participants lp
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
  SELECT p_leaderboard_id, participant_id, p_round_id,
         SUM(strokes), SUM(strokes - recv),
         SUM(GREATEST(0, 2 + par - (strokes - recv))),
         SUM(strokes - par), SUM(strokes - recv - par),
         COUNT(*), now()
  FROM holes GROUP BY participant_id;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_league_scores(p_leaderboard_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_round uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_view_leaderboard(p_leaderboard_id) THEN RAISE EXCEPTION 'not allowed'; END IF;
  FOR v_round IN SELECT round_id FROM leaderboard_rounds WHERE leaderboard_id = p_leaderboard_id LOOP
    PERFORM public._recompute_league_round_scores(p_leaderboard_id, v_round);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public._recompute_league_round_scores(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_league_scores(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_league_scores(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_league_scores_on_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._recompute_league_round_scores(NEW.leaderboard_id, NEW.round_id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS league_scores_on_link ON public.leaderboard_rounds;
CREATE TRIGGER league_scores_on_link AFTER INSERT ON public.leaderboard_rounds
FOR EACH ROW EXECUTE FUNCTION public.trg_league_scores_on_link();

CREATE OR REPLACE FUNCTION public.trg_league_scores_on_participant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_round uuid;
BEGIN
  FOR v_round IN SELECT round_id FROM leaderboard_rounds WHERE leaderboard_id = NEW.leaderboard_id LOOP
    PERFORM public._recompute_league_round_scores(NEW.leaderboard_id, v_round);
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS league_scores_on_participant ON public.leaderboard_participants;
CREATE TRIGGER league_scores_on_participant AFTER INSERT OR UPDATE OF handicap_for_leaderboard, is_active ON public.leaderboard_participants
FOR EACH ROW EXECUTE FUNCTION public.trg_league_scores_on_participant();

CREATE OR REPLACE FUNCTION public.trg_league_scores_on_round_close()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lb uuid;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM NEW.status THEN
    FOR v_lb IN SELECT leaderboard_id FROM leaderboard_rounds WHERE round_id = NEW.id LOOP
      PERFORM public._recompute_league_round_scores(v_lb, NEW.id);
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS league_scores_on_round_close ON public.rounds;
CREATE TRIGGER league_scores_on_round_close AFTER UPDATE OF status ON public.rounds
FOR EACH ROW EXECUTE FUNCTION public.trg_league_scores_on_round_close();

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT lr.leaderboard_id, lr.round_id FROM leaderboard_rounds lr JOIN leaderboard_events e ON e.id = lr.leaderboard_id WHERE e.competition_type = 'league' LOOP
    PERFORM public._recompute_league_round_scores(r.leaderboard_id, r.round_id);
  END LOOP;
END $$;