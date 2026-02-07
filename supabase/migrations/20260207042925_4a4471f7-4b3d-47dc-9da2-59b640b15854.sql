
-- Function to rebuild snapshots with bilateral handicaps from round_handicaps table
CREATE OR REPLACE FUNCTION public.rebuild_snapshot_bilateral_handicaps()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_snapshot_row record;
  v_snapshot jsonb;
  v_players jsonb;
  v_bilateral_handicaps jsonb;
  v_handicap_row record;
  v_player_a_id text;
  v_player_b_id text;
  v_updated_count int := 0;
BEGIN
  -- Iterate through all snapshots that don't have bilateralHandicaps or have empty array
  FOR v_snapshot_row IN 
    SELECT rs.id, rs.round_id, rs.snapshot_json
    FROM public.round_snapshots rs
    WHERE rs.snapshot_json->'bilateralHandicaps' IS NULL 
       OR jsonb_array_length(COALESCE(rs.snapshot_json->'bilateralHandicaps', '[]'::jsonb)) = 0
  LOOP
    v_snapshot := v_snapshot_row.snapshot_json;
    v_players := COALESCE(v_snapshot->'players', '[]'::jsonb);
    v_bilateral_handicaps := '[]'::jsonb;

    -- Get all round_handicaps for this round
    FOR v_handicap_row IN
      SELECT 
        rh.strokes_given_by_a,
        rp_a.id as player_a_round_player_id,
        rp_a.profile_id as player_a_profile_id,
        rp_b.id as player_b_round_player_id,
        rp_b.profile_id as player_b_profile_id
      FROM public.round_handicaps rh
      JOIN public.round_players rp_a ON rp_a.id = rh.player_a_id
      JOIN public.round_players rp_b ON rp_b.id = rh.player_b_id
      WHERE rh.round_id = v_snapshot_row.round_id
    LOOP
      -- Find player IDs from snapshot (using round_player_id which matches the snapshot's player.id)
      v_player_a_id := NULL;
      v_player_b_id := NULL;

      -- In snapshots, player.id is the round_player_id
      -- We need to find the matching player in the snapshot
      SELECT p->>'id' INTO v_player_a_id
      FROM jsonb_array_elements(v_players) AS p
      WHERE p->>'id' = v_handicap_row.player_a_round_player_id::text
      LIMIT 1;

      SELECT p->>'id' INTO v_player_b_id
      FROM jsonb_array_elements(v_players) AS p
      WHERE p->>'id' = v_handicap_row.player_b_round_player_id::text
      LIMIT 1;

      -- If not found by round_player_id, try by profile_id
      IF v_player_a_id IS NULL AND v_handicap_row.player_a_profile_id IS NOT NULL THEN
        SELECT p->>'id' INTO v_player_a_id
        FROM jsonb_array_elements(v_players) AS p
        WHERE p->>'profileId' = v_handicap_row.player_a_profile_id::text
        LIMIT 1;
      END IF;

      IF v_player_b_id IS NULL AND v_handicap_row.player_b_profile_id IS NOT NULL THEN
        SELECT p->>'id' INTO v_player_b_id
        FROM jsonb_array_elements(v_players) AS p
        WHERE p->>'profileId' = v_handicap_row.player_b_profile_id::text
        LIMIT 1;
      END IF;

      -- Add to bilateral handicaps if both players found
      IF v_player_a_id IS NOT NULL AND v_player_b_id IS NOT NULL THEN
        v_bilateral_handicaps := v_bilateral_handicaps || jsonb_build_object(
          'playerAId', v_player_a_id,
          'playerBId', v_player_b_id,
          'strokesGivenByA', v_handicap_row.strokes_given_by_a
        );
      END IF;
    END LOOP;

    -- Update the snapshot if we found any handicaps
    IF jsonb_array_length(v_bilateral_handicaps) > 0 THEN
      UPDATE public.round_snapshots
      SET snapshot_json = jsonb_set(v_snapshot, '{bilateralHandicaps}', v_bilateral_handicaps)
      WHERE id = v_snapshot_row.id;
      
      v_updated_count := v_updated_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'updated_snapshots', v_updated_count,
    'status', 'success'
  );
END;
$$;
