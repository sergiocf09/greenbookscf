CREATE OR REPLACE FUNCTION public.reset_round_for_reclose(p_round_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_round_organizer(p_round_id) THEN
    RAISE EXCEPTION 'Only organizer can reset round';
  END IF;
  IF (SELECT status FROM rounds WHERE id = p_round_id) != 'completed' THEN
    RAISE EXCEPTION 'Round is not completed';
  END IF;

  -- Reverse PvP data from snapshot before deleting it
  DECLARE
    v_snapshot jsonb;
    v_ledger jsonb;
    v_entry jsonb;
    v_from_profile uuid;
    v_to_profile uuid;
    v_amount numeric;
    v_pvp_key text;
    v_pvp_decrements jsonb := '{}'::jsonb;
    v_player_a uuid;
    v_player_b uuid;
    v_existing_pvp record;
    v_players jsonb;
  BEGIN
    SELECT rs.snapshot_json INTO v_snapshot
    FROM public.round_snapshots rs
    WHERE rs.round_id = p_round_id;

    IF v_snapshot IS NOT NULL AND v_snapshot->'ledger' IS NOT NULL THEN
      v_players := COALESCE(v_snapshot->'players', '[]'::jsonb);
      v_ledger := v_snapshot->'ledger';

      FOR v_entry IN SELECT value FROM jsonb_array_elements(v_ledger) AS t(value)
      LOOP
        v_amount := NULLIF(v_entry->>'amount','')::numeric;
        IF v_amount IS NULL OR v_amount <= 0 THEN CONTINUE; END IF;

        SELECT (p->>'profileId')::uuid INTO v_from_profile
        FROM jsonb_array_elements(v_players) AS p
        WHERE p->>'id' = v_entry->>'fromPlayerId' AND p->>'profileId' IS NOT NULL
        LIMIT 1;

        SELECT (p->>'profileId')::uuid INTO v_to_profile
        FROM jsonb_array_elements(v_players) AS p
        WHERE p->>'id' = v_entry->>'toPlayerId' AND p->>'profileId' IS NOT NULL
        LIMIT 1;

        IF v_from_profile IS NOT NULL AND v_to_profile IS NOT NULL THEN
          IF v_from_profile < v_to_profile THEN
            v_pvp_key := v_from_profile::text || '||' || v_to_profile::text;
            v_pvp_decrements := jsonb_set(
              v_pvp_decrements, ARRAY[v_pvp_key],
              COALESCE(v_pvp_decrements->v_pvp_key, '{"a_won":0,"b_won":0}'::jsonb) ||
              jsonb_build_object('b_won', COALESCE((v_pvp_decrements->v_pvp_key->>'b_won')::numeric, 0) + v_amount),
              true
            );
          ELSE
            v_pvp_key := v_to_profile::text || '||' || v_from_profile::text;
            v_pvp_decrements := jsonb_set(
              v_pvp_decrements, ARRAY[v_pvp_key],
              COALESCE(v_pvp_decrements->v_pvp_key, '{"a_won":0,"b_won":0}'::jsonb) ||
              jsonb_build_object('a_won', COALESCE((v_pvp_decrements->v_pvp_key->>'a_won')::numeric, 0) + v_amount),
              true
            );
          END IF;
        END IF;
      END LOOP;

      -- Apply PvP decrements
      FOR v_pvp_key IN SELECT jsonb_object_keys(v_pvp_decrements)
      LOOP
        v_player_a := (split_part(v_pvp_key, '||', 1))::uuid;
        v_player_b := (split_part(v_pvp_key, '||', 2))::uuid;

        SELECT * INTO v_existing_pvp
        FROM public.player_vs_player
        WHERE player_a_id = v_player_a AND player_b_id = v_player_b;

        IF v_existing_pvp IS NOT NULL THEN
          UPDATE public.player_vs_player
          SET
            rounds_played = GREATEST(0, v_existing_pvp.rounds_played - 1),
            total_won_by_a = GREATEST(0, v_existing_pvp.total_won_by_a - COALESCE((v_pvp_decrements->v_pvp_key->>'a_won')::numeric, 0)),
            total_won_by_b = GREATEST(0, v_existing_pvp.total_won_by_b - COALESCE((v_pvp_decrements->v_pvp_key->>'b_won')::numeric, 0)),
            updated_at = now()
          WHERE id = v_existing_pvp.id;

          DELETE FROM public.player_vs_player
          WHERE id = v_existing_pvp.id AND rounds_played <= 0;
        END IF;
      END LOOP;
    END IF;
  END;

  -- Clear last_round_id references
  UPDATE public.player_vs_player SET last_round_id = NULL, updated_at = now()
  WHERE last_round_id = p_round_id;

  -- Clean up closure artifacts
  DELETE FROM round_snapshots WHERE round_id = p_round_id;
  DELETE FROM ledger_transactions WHERE round_id = p_round_id;
  DELETE FROM sliding_history WHERE round_id = p_round_id;
  DELETE FROM round_close_attempts WHERE round_id = p_round_id;

  -- Reset status
  UPDATE rounds SET status = 'in_progress', updated_at = now() WHERE id = p_round_id;
END;
$$;