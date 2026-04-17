CREATE OR REPLACE FUNCTION public.delete_round_with_financials(p_round_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Clear player_vs_player.last_round_id references
  UPDATE public.player_vs_player
  SET last_round_id = NULL, updated_at = now()
  WHERE last_round_id = p_round_id;

  -- NEW: Clean up leaderboard references that depend on this round
  -- 1) Detach any cup_matches that reference this round (keep match, reset to pending)
  UPDATE public.cup_matches
  SET round_id = NULL,
      status = 'pending',
      result_type = NULL,
      result_detail = NULL,
      result_override = false,
      updated_at = now()
  WHERE round_id = p_round_id;

  -- 2) Delete leaderboard_scores tied to this round
  DELETE FROM public.leaderboard_scores WHERE round_id = p_round_id;

  -- 3) Delete leaderboard_rounds links for this round
  DELETE FROM public.leaderboard_rounds WHERE round_id = p_round_id;

  -- 4) Delete leaderboard_participants imported FROM this round (source_round_id)
  DELETE FROM public.leaderboard_participants WHERE source_round_id = p_round_id;

  -- 5) Clear handicap_history.round_id references (preserve history rows)
  UPDATE public.handicap_history
  SET round_id = NULL
  WHERE round_id = p_round_id;

  -- Get the snapshot to reverse financial data (if exists)
  SELECT rs.snapshot_json INTO v_snapshot
  FROM public.round_snapshots rs
  WHERE rs.round_id = p_round_id;

  IF v_snapshot IS NOT NULL AND v_snapshot->'ledger' IS NOT NULL THEN
    v_ledger := v_snapshot->'ledger';

    FOR v_entry IN SELECT value FROM jsonb_array_elements(v_ledger) AS t(value)
    LOOP
      v_from_profile := NULL;
      v_to_profile := NULL;
      v_amount := NULLIF(v_entry->>'amount','')::numeric;

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

      IF v_from_profile IS NULL OR v_to_profile IS NULL OR v_amount IS NULL OR v_amount = 0 THEN
        CONTINUE;
      END IF;

      IF v_from_profile < v_to_profile THEN
        v_player_a := v_from_profile;
        v_player_b := v_to_profile;
      ELSE
        v_player_a := v_to_profile;
        v_player_b := v_from_profile;
      END IF;

      v_pvp_key := v_player_a::text || '|' || v_player_b::text;

      DECLARE
        v_curr jsonb := COALESCE(v_pvp_decrements->v_pvp_key, jsonb_build_object('a', v_player_a, 'b', v_player_b, 'won_by_a', 0, 'won_by_b', 0, 'rounds', 0));
        v_won_by_a numeric := COALESCE((v_curr->>'won_by_a')::numeric, 0);
        v_won_by_b numeric := COALESCE((v_curr->>'won_by_b')::numeric, 0);
        v_rounds int := COALESCE((v_curr->>'rounds')::int, 0);
      BEGIN
        IF v_from_profile = v_player_a THEN
          v_won_by_b := v_won_by_b + v_amount;
        ELSE
          v_won_by_a := v_won_by_a + v_amount;
        END IF;
        v_rounds := 1;
        v_pvp_decrements := v_pvp_decrements || jsonb_build_object(v_pvp_key, jsonb_build_object('a', v_player_a, 'b', v_player_b, 'won_by_a', v_won_by_a, 'won_by_b', v_won_by_b, 'rounds', v_rounds));
      END;
    END LOOP;

    FOR v_pvp_key, v_entry IN SELECT key, value FROM jsonb_each(v_pvp_decrements)
    LOOP
      v_player_a := (v_entry->>'a')::uuid;
      v_player_b := (v_entry->>'b')::uuid;

      SELECT * INTO v_existing_pvp
      FROM public.player_vs_player
      WHERE player_a_id = v_player_a AND player_b_id = v_player_b
      LIMIT 1;

      IF FOUND THEN
        UPDATE public.player_vs_player
        SET total_won_by_a = GREATEST(0, total_won_by_a - COALESCE((v_entry->>'won_by_a')::numeric, 0)),
            total_won_by_b = GREATEST(0, total_won_by_b - COALESCE((v_entry->>'won_by_b')::numeric, 0)),
            rounds_played = GREATEST(0, rounds_played - COALESCE((v_entry->>'rounds')::int, 0)),
            updated_at = now()
        WHERE id = v_existing_pvp.id;
      END IF;
    END LOOP;
  END IF;

  -- Finally delete the round (cascades hole_scores, round_players, configs, snapshot, etc.)
  DELETE FROM public.rounds WHERE id = p_round_id;
END;
$function$;