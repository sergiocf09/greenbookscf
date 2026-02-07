-- Create a function to safely delete a round and update all related financial data
CREATE OR REPLACE FUNCTION public.delete_round_with_financials(p_round_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
BEGIN
  -- Check authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Only organizer can delete a round
  IF NOT public.is_round_organizer(p_round_id) THEN
    RAISE EXCEPTION 'Only organizer can delete round';
  END IF;

  -- Check if round exists
  IF NOT EXISTS (SELECT 1 FROM public.rounds WHERE id = p_round_id) THEN
    RAISE EXCEPTION 'Round not found';
  END IF;

  -- Get the snapshot to reverse financial data (if exists)
  SELECT rs.snapshot_json INTO v_snapshot
  FROM public.round_snapshots rs
  WHERE rs.round_id = p_round_id;

  -- If we have a snapshot with ledger, reverse the player_vs_player entries
  IF v_snapshot IS NOT NULL AND v_snapshot->'ledger' IS NOT NULL THEN
    v_ledger := v_snapshot->'ledger';

    -- Build decrements per player pair from ledger
    FOR v_entry IN SELECT value FROM jsonb_array_elements(v_ledger) AS t(value)
    LOOP
      -- Get profile IDs from snapshot ledger (these are stored as profileIds, not playerIds)
      v_from_profile := NULL;
      v_to_profile := NULL;
      v_amount := NULLIF(v_entry->>'amount','')::numeric;

      -- Try to get profile IDs from the snapshot players
      DECLARE
        v_from_player_id text := v_entry->>'fromPlayerId';
        v_to_player_id text := v_entry->>'toPlayerId';
        v_players jsonb := COALESCE(v_snapshot->'players', '[]'::jsonb);
      BEGIN
        SELECT (p->>'profileId')::uuid INTO v_from_profile
        FROM jsonb_array_elements(v_players) AS p
        WHERE p->>'id' = v_from_player_id AND p->>'profileId' IS NOT NULL
        LIMIT 1;

        SELECT (p->>'profileId')::uuid INTO v_to_profile
        FROM jsonb_array_elements(v_players) AS p
        WHERE p->>'id' = v_to_player_id AND p->>'profileId' IS NOT NULL
        LIMIT 1;
      END;

      -- Only process if both are registered users and amount is valid
      IF v_from_profile IS NOT NULL AND v_to_profile IS NOT NULL AND v_amount IS NOT NULL AND v_amount > 0 THEN
        -- Normalize key (smaller UUID first) using '||' separator
        IF v_from_profile < v_to_profile THEN
          v_player_a := v_from_profile;
          v_player_b := v_to_profile;
          v_pvp_key := v_from_profile::text || '||' || v_to_profile::text;
          -- 'to' (receiver) is B, so B won this amount
          v_pvp_decrements := jsonb_set(
            v_pvp_decrements,
            ARRAY[v_pvp_key],
            COALESCE(v_pvp_decrements->v_pvp_key, '{"a_won":0,"b_won":0}'::jsonb) ||
            jsonb_build_object('b_won', COALESCE((v_pvp_decrements->v_pvp_key->>'b_won')::numeric, 0) + v_amount),
            true
          );
        ELSE
          v_player_a := v_to_profile;
          v_player_b := v_from_profile;
          v_pvp_key := v_to_profile::text || '||' || v_from_profile::text;
          -- 'to' (receiver) is A, so A won this amount
          v_pvp_decrements := jsonb_set(
            v_pvp_decrements,
            ARRAY[v_pvp_key],
            COALESCE(v_pvp_decrements->v_pvp_key, '{"a_won":0,"b_won":0}'::jsonb) ||
            jsonb_build_object('a_won', COALESCE((v_pvp_decrements->v_pvp_key->>'a_won')::numeric, 0) + v_amount),
            true
          );
        END IF;
      END IF;
    END LOOP;

    -- Apply decrements to player_vs_player
    FOR v_pvp_key IN SELECT jsonb_object_keys(v_pvp_decrements)
    LOOP
      v_player_a := (split_part(v_pvp_key, '||', 1))::uuid;
      v_player_b := (split_part(v_pvp_key, '||', 2))::uuid;

      SELECT * INTO v_existing_pvp
      FROM public.player_vs_player
      WHERE player_a_id = v_player_a AND player_b_id = v_player_b;

      IF v_existing_pvp IS NOT NULL THEN
        -- Decrement the totals and rounds_played
        UPDATE public.player_vs_player
        SET
          rounds_played = GREATEST(0, v_existing_pvp.rounds_played - 1),
          total_won_by_a = GREATEST(0, v_existing_pvp.total_won_by_a - COALESCE((v_pvp_decrements->v_pvp_key->>'a_won')::numeric, 0)),
          total_won_by_b = GREATEST(0, v_existing_pvp.total_won_by_b - COALESCE((v_pvp_decrements->v_pvp_key->>'b_won')::numeric, 0)),
          updated_at = now(),
          -- Clear last_round_id if it was this round
          last_round_id = CASE 
            WHEN last_round_id = p_round_id THEN NULL 
            ELSE last_round_id 
          END
        WHERE id = v_existing_pvp.id;

        -- If rounds_played becomes 0, delete the record
        DELETE FROM public.player_vs_player 
        WHERE id = v_existing_pvp.id AND rounds_played <= 0;
      END IF;
    END LOOP;
  END IF;

  -- Delete ledger_transactions for this round
  DELETE FROM public.ledger_transactions WHERE round_id = p_round_id;

  -- Delete round_snapshots for this round
  DELETE FROM public.round_snapshots WHERE round_id = p_round_id;

  -- Delete sliding_history for this round
  DELETE FROM public.sliding_history WHERE round_id = p_round_id;

  -- Delete round_close_attempts for this round
  DELETE FROM public.round_close_attempts WHERE round_id = p_round_id;

  -- Delete hole_markers (through hole_scores)
  DELETE FROM public.hole_markers 
  WHERE hole_score_id IN (
    SELECT hs.id FROM public.hole_scores hs
    JOIN public.round_players rp ON rp.id = hs.round_player_id
    WHERE rp.round_id = p_round_id
  );

  -- Delete hole_scores for this round
  DELETE FROM public.hole_scores 
  WHERE round_player_id IN (
    SELECT id FROM public.round_players WHERE round_id = p_round_id
  );

  -- Delete bilateral_bets for this round
  DELETE FROM public.bilateral_bets WHERE round_id = p_round_id;

  -- Delete team_bets for this round
  DELETE FROM public.team_bets WHERE round_id = p_round_id;

  -- Delete round_handicaps for this round
  DELETE FROM public.round_handicaps WHERE round_id = p_round_id;

  -- Delete round_players for this round
  DELETE FROM public.round_players WHERE round_id = p_round_id;

  -- Delete round_groups for this round
  DELETE FROM public.round_groups WHERE round_id = p_round_id;

  -- Finally delete the round itself
  DELETE FROM public.rounds WHERE id = p_round_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.delete_round_with_financials(uuid) TO authenticated;