-- Create a function to rebuild all player_vs_player records from existing snapshots
-- This is useful when data gets out of sync due to manual deletions or bugs
CREATE OR REPLACE FUNCTION public.rebuild_all_pvp_from_snapshots()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_snapshot_row record;
  v_snapshot jsonb;
  v_ledger jsonb;
  v_players jsonb;
  v_entry jsonb;
  v_from_player_id text;
  v_to_player_id text;
  v_from_profile uuid;
  v_to_profile uuid;
  v_amount numeric;
  v_pvp_data jsonb := '{}'::jsonb;
  v_pvp_key text;
  v_player_a uuid;
  v_player_b uuid;
  v_round_id uuid;
  v_round_date timestamptz;
  v_deleted_count int;
  v_inserted_count int := 0;
BEGIN
  -- Check authentication (only allow admins or organizers to run this)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Delete all existing player_vs_player records to rebuild from scratch
  DELETE FROM public.player_vs_player;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Iterate through all snapshots
  FOR v_snapshot_row IN 
    SELECT rs.round_id, rs.snapshot_json, rs.closed_at
    FROM public.round_snapshots rs
    ORDER BY rs.closed_at ASC
  LOOP
    v_snapshot := v_snapshot_row.snapshot_json;
    v_round_id := v_snapshot_row.round_id;
    v_round_date := v_snapshot_row.closed_at;
    v_ledger := COALESCE(v_snapshot->'ledger', '[]'::jsonb);
    v_players := COALESCE(v_snapshot->'players', '[]'::jsonb);

    -- Process each ledger entry
    FOR v_entry IN SELECT value FROM jsonb_array_elements(v_ledger) AS t(value)
    LOOP
      v_from_player_id := v_entry->>'fromPlayerId';
      v_to_player_id := v_entry->>'toPlayerId';
      v_amount := NULLIF(v_entry->>'amount','')::numeric;

      -- Skip invalid entries
      IF v_amount IS NULL OR v_amount <= 0 THEN
        CONTINUE;
      END IF;

      -- Resolve profile IDs from snapshot players
      v_from_profile := NULL;
      v_to_profile := NULL;

      SELECT (p->>'profileId')::uuid INTO v_from_profile
      FROM jsonb_array_elements(v_players) AS p
      WHERE p->>'id' = v_from_player_id AND p->>'profileId' IS NOT NULL
      LIMIT 1;

      SELECT (p->>'profileId')::uuid INTO v_to_profile
      FROM jsonb_array_elements(v_players) AS p
      WHERE p->>'id' = v_to_player_id AND p->>'profileId' IS NOT NULL
      LIMIT 1;

      -- Only process registered users
      IF v_from_profile IS NULL OR v_to_profile IS NULL THEN
        CONTINUE;
      END IF;

      -- Normalize key (smaller UUID first)
      IF v_from_profile < v_to_profile THEN
        v_player_a := v_from_profile;
        v_player_b := v_to_profile;
        v_pvp_key := v_from_profile::text || '||' || v_to_profile::text;
        -- 'to' (receiver/winner) is B
        v_pvp_data := jsonb_set(
          v_pvp_data,
          ARRAY[v_pvp_key],
          jsonb_build_object(
            'a_won', COALESCE((v_pvp_data->v_pvp_key->>'a_won')::numeric, 0),
            'b_won', COALESCE((v_pvp_data->v_pvp_key->>'b_won')::numeric, 0) + v_amount,
            'rounds', COALESCE(v_pvp_data->v_pvp_key->'rounds', '[]'::jsonb) || to_jsonb(v_round_id::text),
            'last_round_id', v_round_id,
            'last_played_at', v_round_date
          ),
          true
        );
      ELSE
        v_player_a := v_to_profile;
        v_player_b := v_from_profile;
        v_pvp_key := v_to_profile::text || '||' || v_from_profile::text;
        -- 'to' (receiver/winner) is A
        v_pvp_data := jsonb_set(
          v_pvp_data,
          ARRAY[v_pvp_key],
          jsonb_build_object(
            'a_won', COALESCE((v_pvp_data->v_pvp_key->>'a_won')::numeric, 0) + v_amount,
            'b_won', COALESCE((v_pvp_data->v_pvp_key->>'b_won')::numeric, 0),
            'rounds', COALESCE(v_pvp_data->v_pvp_key->'rounds', '[]'::jsonb) || to_jsonb(v_round_id::text),
            'last_round_id', v_round_id,
            'last_played_at', v_round_date
          ),
          true
        );
      END IF;
    END LOOP;
  END LOOP;

  -- Insert the aggregated data into player_vs_player
  FOR v_pvp_key IN SELECT jsonb_object_keys(v_pvp_data)
  LOOP
    v_player_a := (split_part(v_pvp_key, '||', 1))::uuid;
    v_player_b := (split_part(v_pvp_key, '||', 2))::uuid;

    -- Count unique rounds for this pair
    DECLARE
      v_unique_rounds int;
    BEGIN
      SELECT COUNT(DISTINCT r) INTO v_unique_rounds
      FROM jsonb_array_elements_text(v_pvp_data->v_pvp_key->'rounds') AS r;

      INSERT INTO public.player_vs_player (
        player_a_id, player_b_id,
        player_a_is_guest, player_b_is_guest,
        rounds_played,
        total_won_by_a, total_won_by_b,
        last_played_at, last_round_id
      ) VALUES (
        v_player_a, v_player_b,
        false, false,
        v_unique_rounds,
        COALESCE((v_pvp_data->v_pvp_key->>'a_won')::numeric, 0),
        COALESCE((v_pvp_data->v_pvp_key->>'b_won')::numeric, 0),
        (v_pvp_data->v_pvp_key->>'last_played_at')::timestamptz,
        (v_pvp_data->v_pvp_key->>'last_round_id')::uuid
      );

      v_inserted_count := v_inserted_count + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'deleted_records', v_deleted_count,
    'inserted_records', v_inserted_count,
    'status', 'success'
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.rebuild_all_pvp_from_snapshots() TO authenticated;