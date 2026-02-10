
-- Temporary function to rebuild financials without auth checks (one-time use)
CREATE OR REPLACE FUNCTION public.temp_rebuild_all_round_financials()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_round_id uuid;
  v_snapshot jsonb;
  v_players jsonb;
  v_ledger jsonb;
  v_entry jsonb;
  v_from_player_id text;
  v_to_player_id text;
  v_amount numeric;
  v_bet_type text;
  v_segment text;
  v_hole_number int;
  v_description text;
  v_from_profile uuid;
  v_to_profile uuid;
  v_processed_count int := 0;
  v_pvp_key text;
  v_pvp_updates jsonb;
  v_player_a uuid;
  v_player_b uuid;
  v_existing_pvp record;
BEGIN
  -- Process each completed round that has a snapshot but no ledger_transactions
  FOR v_round_id IN
    SELECT rs.round_id
    FROM round_snapshots rs
    JOIN rounds r ON r.id = rs.round_id
    WHERE r.status = 'completed'
      AND NOT EXISTS (SELECT 1 FROM ledger_transactions lt WHERE lt.round_id = rs.round_id)
    ORDER BY r.date
  LOOP
    SELECT rs.snapshot_json INTO v_snapshot
    FROM round_snapshots rs WHERE rs.round_id = v_round_id;

    IF v_snapshot IS NULL THEN CONTINUE; END IF;

    v_players := COALESCE(v_snapshot->'players', '[]'::jsonb);
    v_ledger := COALESCE(v_snapshot->'ledger', '[]'::jsonb);
    v_pvp_updates := '{}'::jsonb;

    FOR v_entry IN SELECT value FROM jsonb_array_elements(v_ledger) AS t(value)
    LOOP
      v_from_player_id := v_entry->>'fromPlayerId';
      v_to_player_id := v_entry->>'toPlayerId';
      v_amount := NULLIF(v_entry->>'amount','')::numeric;
      v_bet_type := v_entry->>'betType';
      v_segment := COALESCE(v_entry->>'segment','total');
      v_hole_number := NULLIF(v_entry->>'holeNumber','')::int;
      v_description := NULLIF(v_entry->>'description','');

      IF v_amount IS NULL OR v_amount <= 0 THEN CONTINUE; END IF;

      -- Resolve profile IDs from snapshot players
      v_from_profile := NULL;
      v_to_profile := NULL;

      SELECT (p->>'profileId')::uuid INTO v_from_profile
      FROM jsonb_array_elements(v_players) AS p
      WHERE p->>'id' = v_from_player_id AND p->>'profileId' IS NOT NULL AND p->>'profileId' != ''
      LIMIT 1;

      SELECT (p->>'profileId')::uuid INTO v_to_profile
      FROM jsonb_array_elements(v_players) AS p
      WHERE p->>'id' = v_to_player_id AND p->>'profileId' IS NOT NULL AND p->>'profileId' != ''
      LIMIT 1;

      -- Insert ledger transaction (only for registered players)
      IF v_from_profile IS NOT NULL AND v_to_profile IS NOT NULL THEN
        BEGIN
          INSERT INTO ledger_transactions(
            round_id, from_profile_id, to_profile_id, amount, bet_type, segment, hole_number, description
          ) VALUES (
            v_round_id, v_from_profile, v_to_profile, v_amount, v_bet_type::bet_type, v_segment, v_hole_number, v_description
          );
        EXCEPTION WHEN invalid_text_representation THEN
          -- Skip entries with invalid bet_type enum values
          NULL;
        END;
      END IF;

      -- Aggregate PvP updates
      IF v_from_profile IS NOT NULL AND v_to_profile IS NOT NULL THEN
        IF v_from_profile < v_to_profile THEN
          v_pvp_key := v_from_profile::text || '||' || v_to_profile::text;
          v_pvp_updates := jsonb_set(
            v_pvp_updates,
            ARRAY[v_pvp_key],
            COALESCE(v_pvp_updates->v_pvp_key, '{"a_won":0,"b_won":0}'::jsonb) ||
            jsonb_build_object('b_won', COALESCE((v_pvp_updates->v_pvp_key->>'b_won')::numeric, 0) + v_amount),
            true
          );
        ELSE
          v_pvp_key := v_to_profile::text || '||' || v_from_profile::text;
          v_pvp_updates := jsonb_set(
            v_pvp_updates,
            ARRAY[v_pvp_key],
            COALESCE(v_pvp_updates->v_pvp_key, '{"a_won":0,"b_won":0}'::jsonb) ||
            jsonb_build_object('a_won', COALESCE((v_pvp_updates->v_pvp_key->>'a_won')::numeric, 0) + v_amount),
            true
          );
        END IF;
      END IF;
    END LOOP;

    -- Apply PvP updates using UPSERT
    FOR v_pvp_key IN SELECT jsonb_object_keys(v_pvp_updates)
    LOOP
      v_player_a := (split_part(v_pvp_key, '||', 1))::uuid;
      v_player_b := (split_part(v_pvp_key, '||', 2))::uuid;

      INSERT INTO player_vs_player (
        player_a_id, player_b_id, player_a_is_guest, player_b_is_guest,
        rounds_played, total_won_by_a, total_won_by_b,
        last_played_at, last_round_id
      )
      VALUES (
        v_player_a, v_player_b, false, false,
        1,
        COALESCE((v_pvp_updates->v_pvp_key->>'a_won')::numeric, 0),
        COALESCE((v_pvp_updates->v_pvp_key->>'b_won')::numeric, 0),
        now(), v_round_id
      )
      ON CONFLICT (player_a_id, player_b_id)
      DO UPDATE SET
        rounds_played = player_vs_player.rounds_played + 1,
        total_won_by_a = player_vs_player.total_won_by_a + EXCLUDED.total_won_by_a,
        total_won_by_b = player_vs_player.total_won_by_b + EXCLUDED.total_won_by_b,
        last_played_at = now(),
        last_round_id = v_round_id,
        updated_at = now();
    END LOOP;

    v_processed_count := v_processed_count + 1;
  END LOOP;

  RETURN jsonb_build_object('processed_rounds', v_processed_count, 'status', 'success');
END;
$function$;

-- Execute it immediately
SELECT temp_rebuild_all_round_financials();

-- Drop it - one-time use only
DROP FUNCTION IF EXISTS public.temp_rebuild_all_round_financials();
