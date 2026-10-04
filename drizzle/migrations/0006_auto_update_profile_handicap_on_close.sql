CREATE OR REPLACE FUNCTION public.compute_profile_handicap_index(p_profile_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH gs AS (
    SELECT rp.id AS rpid, r.course_id, COALESCE(rp.tee_color, r.tee_color, 'white') AS tee,
           public._adjusted_gross_score(rp.id, r.course_id, rp.handicap_for_round) AS adj,
           r.date, r.id AS rid
    FROM round_players rp
    JOIN rounds r ON r.id = rp.round_id AND r.status = 'completed'
      AND COALESCE(r.bet_config->>'roundHoles', '18') <> '9'
    JOIN hole_scores hs ON hs.round_player_id = rp.id AND hs.strokes IS NOT NULL AND hs.confirmed = true
    WHERE rp.profile_id = p_profile_id
    GROUP BY rp.id, r.course_id, rp.tee_color, r.tee_color, rp.handicap_for_round, r.date, r.id
    HAVING COUNT(hs.id) = 18
    ORDER BY r.date DESC, r.id DESC
    LIMIT 20
  )
  SELECT public._calc_handicap_index(ARRAY_AGG(d ORDER BY d)) FROM (
    SELECT ROUND(((gs.adj - COALESCE(ct.course_rating, 72)) * 113.0 / COALESCE(ct.slope_rating, 113))::numeric, 1) AS d
    FROM gs LEFT JOIN course_tees ct ON ct.course_id = gs.course_id AND ct.tee_color = gs.tee
    WHERE gs.adj IS NOT NULL
  ) x
$$;
REVOKE ALL ON FUNCTION public.compute_profile_handicap_index(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_profile_handicap_index(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_fn_update_profile_handicaps_on_close()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_pid uuid; v_idx numeric;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    FOR v_pid IN SELECT DISTINCT rp.profile_id FROM round_players rp
                 JOIN profiles p ON p.id = rp.profile_id AND NOT p.is_ghost
                 WHERE rp.round_id = NEW.id AND rp.profile_id IS NOT NULL LOOP
      v_idx := public.compute_profile_handicap_index(v_pid);
      IF v_idx IS NOT NULL THEN
        UPDATE profiles SET current_handicap = v_idx, updated_at = now() WHERE id = v_pid;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_update_profile_handicaps_on_close ON public.rounds;
CREATE TRIGGER trg_update_profile_handicaps_on_close
AFTER UPDATE OF status ON public.rounds
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_update_profile_handicaps_on_close();