
-- Function to rebuild sliding_history from existing snapshots
-- This calculates match play results and sliding adjustments for rounds that are missing sliding data
CREATE OR REPLACE FUNCTION public.rebuild_sliding_history_from_snapshot(p_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_snapshot jsonb;
  v_players jsonb;
  v_scores jsonb;
  v_bilateral_handicaps jsonb;
  v_bet_config jsonb;
  v_pressures_enabled boolean;
  v_player_a record;
  v_player_b record;
  v_handicap_entry jsonb;
  v_strokes_a_gives_b int;
  v_scores_a jsonb;
  v_scores_b jsonb;
  v_hole int;
  v_net_a int;
  v_net_b int;
  v_front_wins_a int := 0;
  v_front_wins_b int := 0;
  v_back_wins_a int := 0;
  v_back_wins_b int := 0;
  v_total_wins_a int := 0;
  v_total_wins_b int := 0;
  v_front_winner text;
  v_back_winner text;
  v_match_winner text;
  v_carry_front boolean;
  v_strokes_next int;
  v_inserted_count int := 0;
  v_course_holes jsonb;
  v_stroke_index int;
  v_strokes_per_hole_a int[];
  v_strokes_per_hole_b int[];
  v_profile_a_id uuid;
  v_profile_b_id uuid;
BEGIN
  -- Check if sliding_history already exists for this round
  IF EXISTS (SELECT 1 FROM public.sliding_history WHERE round_id = p_round_id) THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'sliding_history already exists');
  END IF;

  -- Get snapshot
  SELECT rs.snapshot_json INTO v_snapshot
  FROM public.round_snapshots rs
  WHERE rs.round_id = p_round_id;

  IF v_snapshot IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'snapshot not found');
  END IF;

  v_players := COALESCE(v_snapshot->'players', '[]'::jsonb);
  v_scores := COALESCE(v_snapshot->'scores', '{}'::jsonb);
  v_bilateral_handicaps := COALESCE(v_snapshot->'bilateralHandicaps', '[]'::jsonb);
  v_bet_config := COALESCE(v_snapshot->'betConfig', '{}'::jsonb);
  v_pressures_enabled := COALESCE((v_bet_config->'pressures'->>'enabled')::boolean, false);

  -- If pressures not enabled, no sliding to calculate
  IF NOT v_pressures_enabled THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'pressures not enabled');
  END IF;

  -- Get course holes for stroke index
  SELECT jsonb_agg(jsonb_build_object('number', ch.hole_number, 'strokeIndex', ch.stroke_index))
  INTO v_course_holes
  FROM public.course_holes ch
  JOIN public.rounds r ON r.course_id = ch.course_id
  WHERE r.id = p_round_id;

  IF v_course_holes IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'course holes not found');
  END IF;

  -- Process each pair in bilateral handicaps
  FOR v_handicap_entry IN SELECT value FROM jsonb_array_elements(v_bilateral_handicaps)
  LOOP
    -- Get player IDs and strokes
    DECLARE
      v_player_a_id text := v_handicap_entry->>'playerAId';
      v_player_b_id text := v_handicap_entry->>'playerBId';
    BEGIN
      v_strokes_a_gives_b := COALESCE((v_handicap_entry->>'strokesGivenByA')::int, 0);
      
      -- Get profile IDs from players
      SELECT (p->>'profileId')::uuid INTO v_profile_a_id
      FROM jsonb_array_elements(v_players) p
      WHERE p->>'id' = v_player_a_id
      LIMIT 1;

      SELECT (p->>'profileId')::uuid INTO v_profile_b_id
      FROM jsonb_array_elements(v_players) p
      WHERE p->>'id' = v_player_b_id
      LIMIT 1;

      -- Skip if either is a guest (no profileId)
      IF v_profile_a_id IS NULL OR v_profile_b_id IS NULL THEN
        CONTINUE;
      END IF;

      -- Get scores for each player
      v_scores_a := v_scores->v_player_a_id;
      v_scores_b := v_scores->v_player_b_id;

      IF v_scores_a IS NULL OR v_scores_b IS NULL THEN
        CONTINUE;
      END IF;

      -- Reset counters
      v_front_wins_a := 0;
      v_front_wins_b := 0;
      v_back_wins_a := 0;
      v_back_wins_b := 0;

      -- Calculate net scores per hole and determine winners
      FOR v_hole IN 1..18
      LOOP
        DECLARE
          v_score_a jsonb;
          v_score_b jsonb;
          v_strokes_a int;
          v_strokes_b int;
          v_strokes_received_a int := 0;
          v_strokes_received_b int := 0;
          v_hole_stroke_index int;
          v_abs_strokes int;
        BEGIN
          -- Find the score entries for this hole
          SELECT s INTO v_score_a 
          FROM jsonb_array_elements(v_scores_a) s 
          WHERE (s->>'holeNumber')::int = v_hole 
          LIMIT 1;

          SELECT s INTO v_score_b 
          FROM jsonb_array_elements(v_scores_b) s 
          WHERE (s->>'holeNumber')::int = v_hole 
          LIMIT 1;

          IF v_score_a IS NULL OR v_score_b IS NULL THEN
            CONTINUE;
          END IF;

          v_strokes_a := COALESCE((v_score_a->>'strokes')::int, 0);
          v_strokes_b := COALESCE((v_score_b->>'strokes')::int, 0);

          IF v_strokes_a = 0 OR v_strokes_b = 0 THEN
            CONTINUE;
          END IF;

          -- Get stroke index for this hole
          SELECT (h->>'strokeIndex')::int INTO v_hole_stroke_index
          FROM jsonb_array_elements(v_course_holes) h
          WHERE (h->>'number')::int = v_hole
          LIMIT 1;

          -- Calculate strokes received based on bilateral handicap
          v_abs_strokes := ABS(v_strokes_a_gives_b);
          IF v_strokes_a_gives_b > 0 THEN
            -- B receives strokes
            IF v_hole_stroke_index <= v_abs_strokes THEN
              v_strokes_received_b := 1;
            END IF;
            IF v_abs_strokes > 18 AND v_hole_stroke_index <= (v_abs_strokes - 18) THEN
              v_strokes_received_b := v_strokes_received_b + 1;
            END IF;
          ELSIF v_strokes_a_gives_b < 0 THEN
            -- A receives strokes
            IF v_hole_stroke_index <= v_abs_strokes THEN
              v_strokes_received_a := 1;
            END IF;
            IF v_abs_strokes > 18 AND v_hole_stroke_index <= (v_abs_strokes - 18) THEN
              v_strokes_received_a := v_strokes_received_a + 1;
            END IF;
          END IF;

          v_net_a := v_strokes_a - v_strokes_received_a;
          v_net_b := v_strokes_b - v_strokes_received_b;

          -- Determine hole winner
          IF v_hole <= 9 THEN
            IF v_net_a < v_net_b THEN
              v_front_wins_a := v_front_wins_a + 1;
            ELSIF v_net_b < v_net_a THEN
              v_front_wins_b := v_front_wins_b + 1;
            END IF;
          ELSE
            IF v_net_a < v_net_b THEN
              v_back_wins_a := v_back_wins_a + 1;
            ELSIF v_net_b < v_net_a THEN
              v_back_wins_b := v_back_wins_b + 1;
            END IF;
          END IF;
        END;
      END LOOP;

      -- Calculate segment winners
      v_total_wins_a := v_front_wins_a + v_back_wins_a;
      v_total_wins_b := v_front_wins_b + v_back_wins_b;

      IF v_front_wins_a > v_front_wins_b THEN
        v_front_winner := 'A';
      ELSIF v_front_wins_b > v_front_wins_a THEN
        v_front_winner := 'B';
      ELSE
        v_front_winner := 'tie';
      END IF;

      IF v_back_wins_a > v_back_wins_b THEN
        v_back_winner := 'A';
      ELSIF v_back_wins_b > v_back_wins_a THEN
        v_back_winner := 'B';
      ELSE
        v_back_winner := 'tie';
      END IF;

      IF v_total_wins_a > v_total_wins_b THEN
        v_match_winner := 'A';
      ELSIF v_total_wins_b > v_total_wins_a THEN
        v_match_winner := 'B';
      ELSE
        v_match_winner := 'tie';
      END IF;

      -- Carry if front is tied
      v_carry_front := (v_front_winner = 'tie');

      -- Calculate next strokes
      v_strokes_next := v_strokes_a_gives_b;
      IF NOT v_carry_front THEN
        IF v_match_winner = 'A' THEN
          v_strokes_next := v_strokes_a_gives_b + 1;
        ELSIF v_match_winner = 'B' THEN
          v_strokes_next := v_strokes_a_gives_b - 1;
        END IF;
      END IF;

      -- Normalize profile ordering (smaller UUID first)
      IF v_profile_a_id > v_profile_b_id THEN
        -- Swap everything
        INSERT INTO public.sliding_history (
          round_id, player_a_profile_id, player_b_profile_id,
          strokes_a_gives_b_used, front_main_winner, back_main_winner,
          match_total_winner, carry_front_main, strokes_a_gives_b_next
        ) VALUES (
          p_round_id, v_profile_b_id, v_profile_a_id,
          -v_strokes_a_gives_b,
          CASE v_front_winner WHEN 'A' THEN 'B' WHEN 'B' THEN 'A' ELSE 'tie' END,
          CASE v_back_winner WHEN 'A' THEN 'B' WHEN 'B' THEN 'A' ELSE 'tie' END,
          CASE v_match_winner WHEN 'A' THEN 'B' WHEN 'B' THEN 'A' ELSE 'tie' END,
          v_carry_front,
          -v_strokes_next
        );
      ELSE
        INSERT INTO public.sliding_history (
          round_id, player_a_profile_id, player_b_profile_id,
          strokes_a_gives_b_used, front_main_winner, back_main_winner,
          match_total_winner, carry_front_main, strokes_a_gives_b_next
        ) VALUES (
          p_round_id, v_profile_a_id, v_profile_b_id,
          v_strokes_a_gives_b, v_front_winner, v_back_winner,
          v_match_winner, v_carry_front, v_strokes_next
        );
      END IF;

      v_inserted_count := v_inserted_count + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'success',
    'inserted_sliding_entries', v_inserted_count
  );
END;
$$;

-- Function to rebuild sliding for ALL rounds missing sliding_history
CREATE OR REPLACE FUNCTION public.rebuild_all_missing_sliding_history()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_round record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
BEGIN
  -- Find all completed rounds with snapshots but no sliding_history
  FOR v_round IN
    SELECT r.id, r.date
    FROM public.rounds r
    JOIN public.round_snapshots rs ON rs.round_id = r.id
    WHERE r.status = 'completed'
      AND NOT EXISTS (
        SELECT 1 FROM public.sliding_history sh WHERE sh.round_id = r.id
      )
    ORDER BY r.date
  LOOP
    v_result := public.rebuild_sliding_history_from_snapshot(v_round.id);
    v_results := v_results || jsonb_build_object(
      'round_id', v_round.id,
      'date', v_round.date,
      'result', v_result
    );
  END LOOP;

  RETURN jsonb_build_object(
    'rounds_processed', jsonb_array_length(v_results),
    'details', v_results
  );
END;
$$;
