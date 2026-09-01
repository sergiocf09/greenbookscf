CREATE OR REPLACE FUNCTION public.get_cup_match_result(p_match_id uuid)
 RETURNS TABLE(holes_played integer, holes_remaining integer, side_a_holes_won integer, side_b_holes_won integer, current_standing text, result_type text, match_closed boolean, hole_breakdown jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_match       RECORD;
  v_rp_a1       UUID; v_rp_a2 UUID;
  v_rp_b1       UUID; v_rp_b2 UUID;
  v_played      INT := 0;
  v_a_wins      INT := 0;
  v_b_wins      INT := 0;
  v_hole        RECORD;
  v_net_a       NUMERIC; v_net_b NUMERIC;
  v_remaining   INT; v_diff INT;
  v_closed      BOOLEAN := false;
  v_rtype       TEXT := 'in_progress';
  v_standing    TEXT;
  v_breakdown   JSONB := '[]'::JSONB;
  v_running_a_up INT := 0;
  v_hole_winner TEXT;
  v_decided     BOOLEAN := false;
  v_decided_diff INT := 0;
  v_decided_remaining INT := 0;
BEGIN
  SELECT * INTO v_match FROM public.cup_matches WHERE id = p_match_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_match.result_override AND v_match.result_type IS NOT NULL THEN
    RETURN QUERY SELECT
      18, 0,
      CASE WHEN v_match.result_type = 'a_wins' THEN 1 ELSE 0 END,
      CASE WHEN v_match.result_type = 'b_wins' THEN 1 ELSE 0 END,
      COALESCE(v_match.result_detail, v_match.result_type),
      v_match.result_type, true, '[]'::JSONB;
    RETURN;
  END IF;

  IF v_match.round_id IS NULL THEN
    RETURN QUERY SELECT 0,18,0,0,'Pendiente'::TEXT,'pending'::TEXT,false,'[]'::JSONB;
    RETURN;
  END IF;

  SELECT rp.id INTO v_rp_a1
    FROM round_players rp
    JOIN leaderboard_participants lp ON lp.id = v_match.player_a1_id
   WHERE rp.round_id = v_match.round_id
     AND (
       (lp.profile_id IS NOT NULL AND rp.profile_id = lp.profile_id)
       OR (lp.profile_id IS NULL AND rp.guest_name IS NOT NULL AND lp.guest_name IS NOT NULL
           AND lower(btrim(rp.guest_name)) = lower(btrim(lp.guest_name)))
     )
   LIMIT 1;

  SELECT rp.id INTO v_rp_b1
    FROM round_players rp
    JOIN leaderboard_participants lp ON lp.id = v_match.player_b1_id
   WHERE rp.round_id = v_match.round_id
     AND (
       (lp.profile_id IS NOT NULL AND rp.profile_id = lp.profile_id)
       OR (lp.profile_id IS NULL AND rp.guest_name IS NOT NULL AND lp.guest_name IS NOT NULL
           AND lower(btrim(rp.guest_name)) = lower(btrim(lp.guest_name)))
     )
   LIMIT 1;

  IF v_match.player_a2_id IS NOT NULL THEN
    SELECT rp.id INTO v_rp_a2
      FROM round_players rp
      JOIN leaderboard_participants lp ON lp.id = v_match.player_a2_id
     WHERE rp.round_id = v_match.round_id
       AND (
         (lp.profile_id IS NOT NULL AND rp.profile_id = lp.profile_id)
         OR (lp.profile_id IS NULL AND rp.guest_name IS NOT NULL AND lp.guest_name IS NOT NULL
             AND lower(btrim(rp.guest_name)) = lower(btrim(lp.guest_name)))
       )
     LIMIT 1;
  END IF;

  IF v_match.player_b2_id IS NOT NULL THEN
    SELECT rp.id INTO v_rp_b2
      FROM round_players rp
      JOIN leaderboard_participants lp ON lp.id = v_match.player_b2_id
     WHERE rp.round_id = v_match.round_id
       AND (
         (lp.profile_id IS NOT NULL AND rp.profile_id = lp.profile_id)
         OR (lp.profile_id IS NULL AND rp.guest_name IS NOT NULL AND lp.guest_name IS NOT NULL
             AND lower(btrim(rp.guest_name)) = lower(btrim(lp.guest_name)))
       )
     LIMIT 1;
  END IF;

  IF v_rp_a1 IS NULL OR v_rp_b1 IS NULL THEN
    RETURN QUERY SELECT 0,18,0,0,'Sin scores'::TEXT,'pending'::TEXT,false,'[]'::JSONB;
    RETURN;
  END IF;

  FOR v_hole IN
    SELECT ch.hole_number, ch.par, ch.stroke_index
    FROM course_holes ch
    JOIN rounds r ON r.course_id = ch.course_id AND r.id = v_match.round_id
    ORDER BY ch.hole_number
  LOOP
    DECLARE
      v_gross_a1 INT; v_gross_a2 INT := 99;
      v_gross_b1 INT; v_gross_b2 INT := 99;
    BEGIN
      -- Only CONFIRMED holes count: the cup scoreboard must mirror exactly what
      -- each group has confirmed live (unconfirming a hole removes it again).
      SELECT strokes INTO v_gross_a1 FROM hole_scores
        WHERE round_player_id = v_rp_a1 AND hole_number = v_hole.hole_number
          AND strokes IS NOT NULL AND confirmed = true LIMIT 1;
      SELECT strokes INTO v_gross_b1 FROM hole_scores
        WHERE round_player_id = v_rp_b1 AND hole_number = v_hole.hole_number
          AND strokes IS NOT NULL AND confirmed = true LIMIT 1;

      IF v_rp_a2 IS NOT NULL THEN
        SELECT strokes INTO v_gross_a2 FROM hole_scores
          WHERE round_player_id = v_rp_a2 AND hole_number = v_hole.hole_number
            AND strokes IS NOT NULL AND confirmed = true LIMIT 1;
        v_gross_a2 := COALESCE(v_gross_a2, 99);
      END IF;
      IF v_rp_b2 IS NOT NULL THEN
        SELECT strokes INTO v_gross_b2 FROM hole_scores
          WHERE round_player_id = v_rp_b2 AND hole_number = v_hole.hole_number
            AND strokes IS NOT NULL AND confirmed = true LIMIT 1;
        v_gross_b2 := COALESCE(v_gross_b2, 99);
      END IF;

      IF v_gross_a1 IS NULL OR v_gross_b1 IS NULL THEN CONTINUE; END IF;

      v_net_a := LEAST(COALESCE(v_gross_a1,99), v_gross_a2);
      v_net_b := LEAST(COALESCE(v_gross_b1,99), v_gross_b2);

      IF v_match.strokes_advantage > 0 THEN
        IF v_match.advantage_side = 'a'
           AND v_hole.stroke_index <= v_match.strokes_advantage THEN
          v_net_a := v_net_a - 1;
        ELSIF v_match.advantage_side = 'b'
           AND v_hole.stroke_index <= v_match.strokes_advantage THEN
          v_net_b := v_net_b - 1;
        END IF;
      END IF;

      v_played := v_played + 1;
      IF v_net_a < v_net_b THEN
        v_a_wins := v_a_wins + 1;
        v_running_a_up := v_running_a_up + 1;
        v_hole_winner := 'a';
      ELSIF v_net_b < v_net_a THEN
        v_b_wins := v_b_wins + 1;
        v_running_a_up := v_running_a_up - 1;
        v_hole_winner := 'b';
      ELSE
        v_hole_winner := 'halved';
      END IF;

      v_breakdown := v_breakdown || jsonb_build_object(
        'hole', v_hole.hole_number,
        'side_a_net', v_net_a,
        'side_b_net', v_net_b,
        'hole_winner', v_hole_winner,
        'running_a_up', v_running_a_up
      );

      IF ABS(v_a_wins - v_b_wins) > (18 - v_played) THEN
        v_decided := true;
        v_decided_diff := v_a_wins - v_b_wins;
        v_decided_remaining := 18 - v_played;
        EXIT;
      END IF;
    END;
  END LOOP;

  IF v_played = 0 THEN
    RETURN QUERY SELECT 0,18,0,0,'Sin scores'::TEXT,'pending'::TEXT,false,'[]'::JSONB;
    RETURN;
  END IF;

  IF v_decided THEN
    v_closed := true;
    v_remaining := v_decided_remaining;
    v_diff := v_decided_diff;
    IF v_diff > 0 THEN
      v_rtype := 'a_wins';
      v_standing := CASE WHEN v_remaining > 0
        THEN 'A ' || v_diff || '&' || v_remaining
        ELSE 'A 1UP' END;
    ELSE
      v_rtype := 'b_wins';
      v_standing := CASE WHEN v_remaining > 0
        THEN 'B ' || ABS(v_diff) || '&' || v_remaining
        ELSE 'B 1UP' END;
    END IF;
  ELSE
    v_remaining := 18 - v_played;
    v_diff := v_a_wins - v_b_wins;
    IF v_played = 18 THEN
      v_closed := true;
      IF v_diff > 0 THEN
        v_rtype := 'a_wins'; v_standing := 'A ' || v_diff || 'UP';
      ELSIF v_diff < 0 THEN
        v_rtype := 'b_wins'; v_standing := 'B ' || ABS(v_diff) || 'UP';
      ELSE
        v_rtype := 'halved'; v_standing := 'AS';
      END IF;
    ELSE
      v_rtype := 'in_progress';
      IF v_diff > 0 THEN v_standing := 'A ' || v_diff || 'UP';
      ELSIF v_diff < 0 THEN v_standing := 'B ' || ABS(v_diff) || 'UP';
      ELSE v_standing := 'AS';
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT v_played, v_remaining, v_a_wins, v_b_wins,
    v_standing, v_rtype, v_closed, v_breakdown;
END;
$function$;