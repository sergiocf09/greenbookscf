
CREATE OR REPLACE FUNCTION public.rebuild_all_pvp_from_snapshots()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  snap_row RECORD;
  snap jsonb;
  v_players jsonb;
  v_ledger jsonb;
  v_bet_overrides jsonb;
  v_entry jsonb;
  v_player_a_snap jsonb;
  v_player_b_snap jsonb;
  v_from_profile_id uuid;
  v_to_profile_id uuid;
  v_from_is_guest boolean;
  v_to_is_guest boolean;
  v_from_name text;
  v_to_name text;
  v_amount numeric;
  v_bet_type text;
  v_category_key text;
  v_category_label text;
  -- Accumulator: pair_key -> { grouped categories -> amount }
  -- We need two passes: first group by category per pair per round,
  -- then check overrides per category, then sum per pair across rounds.
  v_round_pair_nets jsonb;  -- per round: pair_key -> net
  v_pair_key text;
  v_override jsonb;
  v_override_enabled boolean;
  -- Final accumulator
  v_final jsonb := '{}'::jsonb;
  v_existing record;
  v_a_key text;
  v_b_key text;
  v_a_uuid uuid;
  v_b_uuid uuid;
  v_a_is_guest boolean;
  v_b_is_guest boolean;
  v_a_name text;
  v_b_name text;
  v_net numeric;
  v_won_a numeric;
  v_won_b numeric;
  v_round_count int;
  v_deleted_count int;
  v_upserted_count int := 0;
  v_snap_count int := 0;
  -- Category grouping per pair per round
  v_pair_categories jsonb;
  v_cat_key text;
  v_cat_amount numeric;
  v_carrito_types text[] := ARRAY['Carritos Front', 'Carritos Back', 'Carritos Total'];
BEGIN
  -- Clear all existing PvP records
  DELETE FROM public.player_vs_player;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Process each snapshot
  FOR snap_row IN SELECT rs.round_id, rs.snapshot_json FROM public.round_snapshots rs
  LOOP
    snap := snap_row.snapshot_json;
    v_players := COALESCE(snap->'players', '[]'::jsonb);
    v_ledger := COALESCE(snap->'ledger', '[]'::jsonb);
    v_bet_overrides := COALESCE(snap->'betConfig'->'betOverrides', '[]'::jsonb);
    v_snap_count := v_snap_count + 1;

    -- For each pair of players in this round, group ledger entries by category,
    -- then filter out overridden categories, then compute net.
    -- We iterate ledger entries and build per-pair category sums.
    v_pair_categories := '{}'::jsonb;

    FOR v_entry IN SELECT value FROM jsonb_array_elements(v_ledger) AS t(value)
    LOOP
      v_amount := COALESCE(NULLIF(v_entry->>'amount','')::numeric, 0);
      IF v_amount <= 0 THEN CONTINUE; END IF;

      v_bet_type := COALESCE(v_entry->>'betType', '');
      
      -- Skip carritos and team pressures (same as BetDashboard)
      IF v_bet_type = ANY(v_carrito_types) OR v_bet_type = 'Presiones Parejas' THEN
        CONTINUE;
      END IF;

      -- Get category key
      v_category_key := CASE
        WHEN v_bet_type LIKE 'Medal%' AND v_bet_type != 'Medal General' THEN 'medal'
        WHEN v_bet_type LIKE 'Presiones%' AND v_bet_type != 'Presiones Parejas' THEN 'pressures'
        WHEN v_bet_type LIKE 'Skins%' THEN 'skins'
        WHEN v_bet_type LIKE 'Rayas%' THEN 'rayas'
        WHEN v_bet_type = 'Putts' OR v_bet_type LIKE 'Putts%' THEN 'putts'
        WHEN v_bet_type LIKE '%Pingüino%' OR v_bet_type = 'Pingüinos' THEN 'pinguinos'
        WHEN v_bet_type LIKE 'Zoológico%' THEN 'zoologico'
        WHEN v_bet_type = 'Caros' THEN 'caros'
        WHEN v_bet_type = 'Oyes' THEN 'oyeses'
        WHEN v_bet_type = 'Unidades' THEN 'units'
        WHEN v_bet_type = 'Manchas' THEN 'manchas'
        WHEN v_bet_type = 'Culebras' THEN 'culebras'
        WHEN v_bet_type = 'Coneja' THEN 'coneja'
        WHEN v_bet_type = 'Medal General' THEN 'medalGeneral'
        WHEN v_bet_type = 'Side Bet' THEN 'sideBets'
        WHEN v_bet_type = 'Stableford' THEN 'stableford'
        ELSE v_bet_type
      END;

      -- Build directional pair key: from->to with category
      -- We store winner (to) getting +amount, loser (from) getting -amount
      DECLARE
        from_id text := v_entry->>'fromPlayerId';
        to_id text := v_entry->>'toPlayerId';
        -- Normalize pair: always smaller ID first
        norm_a text;
        norm_b text;
        direction int; -- 1 = to is norm_b (B wins), -1 = to is norm_a (A wins)
        pair_cat_key text;
        current_val numeric;
      BEGIN
        IF from_id < to_id THEN
          norm_a := from_id;
          norm_b := to_id;
          direction := 1; -- B (to) wins
        ELSE
          norm_a := to_id;
          norm_b := from_id;
          direction := -1; -- A (to) wins
        END IF;

        pair_cat_key := norm_a || '|' || norm_b || '|' || v_category_key;
        current_val := COALESCE((v_pair_categories->>pair_cat_key)::numeric, 0);
        -- Positive means B won, negative means A won
        v_pair_categories := jsonb_set(v_pair_categories, ARRAY[pair_cat_key], to_jsonb(current_val + direction * v_amount), true);
      END;
    END LOOP;

    -- Now for each pair+category, check overrides and accumulate into final
    FOR v_cat_key IN SELECT jsonb_object_keys(v_pair_categories)
    LOOP
      v_cat_amount := (v_pair_categories->>v_cat_key)::numeric;
      IF v_cat_amount = 0 THEN CONTINUE; END IF;

      DECLARE
        parts text[] := string_to_array(v_cat_key, '|');
        p_a_id text := parts[1];
        p_b_id text := parts[2];
        cat text := parts[3];
        cat_label text;
        is_disabled boolean := false;
        ov jsonb;
        ov_type text;
        ov_pair_match boolean;
      BEGIN
        -- Get category label for override matching
        cat_label := CASE cat
          WHEN 'medal' THEN 'Medal'
          WHEN 'pressures' THEN 'Presiones'
          WHEN 'skins' THEN 'Skins'
          WHEN 'caros' THEN 'Caros'
          WHEN 'oyeses' THEN 'Oyes'
          WHEN 'units' THEN 'Unidades'
          WHEN 'manchas' THEN 'Manchas'
          WHEN 'culebras' THEN 'Culebras'
          WHEN 'pinguinos' THEN 'Pingüinos'
          WHEN 'rayas' THEN 'Rayas'
          WHEN 'medalGeneral' THEN 'Medal General'
          WHEN 'coneja' THEN 'Coneja'
          WHEN 'putts' THEN 'Putts'
          WHEN 'sideBets' THEN 'Side Bet'
          WHEN 'stableford' THEN 'Stableford'
          WHEN 'zoologico' THEN 'Zoológico'
          ELSE cat
        END;

        -- Check overrides
        FOR ov IN SELECT value FROM jsonb_array_elements(v_bet_overrides) AS t(value)
        LOOP
          ov_type := COALESCE(ov->>'betType', '');
          IF ov_type != cat_label AND ov_type != cat THEN CONTINUE; END IF;

          -- Check pair match (using snapshot player IDs and profileIds)
          DECLARE
            ov_a text := COALESCE(ov->>'playerAId', '');
            ov_b text := COALESCE(ov->>'playerBId', '');
            -- Get profileIds for p_a and p_b from snapshot players
            prof_a text;
            prof_b text;
            match_a_pa boolean;
            match_a_pb boolean;
            match_b_pa boolean;
            match_b_pb boolean;
          BEGIN
            SELECT p->>'profileId' INTO prof_a FROM jsonb_array_elements(v_players) p WHERE p->>'id' = p_a_id LIMIT 1;
            SELECT p->>'profileId' INTO prof_b FROM jsonb_array_elements(v_players) p WHERE p->>'id' = p_b_id LIMIT 1;

            match_a_pa := (ov_a = p_a_id OR (prof_a IS NOT NULL AND ov_a = prof_a));
            match_a_pb := (ov_a = p_b_id OR (prof_b IS NOT NULL AND ov_a = prof_b));
            match_b_pa := (ov_b = p_a_id OR (prof_a IS NOT NULL AND ov_b = prof_a));
            match_b_pb := (ov_b = p_b_id OR (prof_b IS NOT NULL AND ov_b = prof_b));

            ov_pair_match := (match_a_pa AND match_b_pb) OR (match_a_pb AND match_b_pa);
          END;

          IF ov_pair_match AND COALESCE((ov->>'enabled')::boolean, true) = false THEN
            is_disabled := true;
            EXIT;
          END IF;
        END LOOP;

        IF is_disabled THEN CONTINUE; END IF;

        -- Accumulate into final pair totals
        -- v_cat_amount positive = B won, negative = A won
        v_pair_key := p_a_id || '|' || p_b_id;

        DECLARE
          cur_a numeric := COALESCE((v_final->v_pair_key->>'won_a')::numeric, 0);
          cur_b numeric := COALESCE((v_final->v_pair_key->>'won_b')::numeric, 0);
          cur_rounds int := COALESCE((v_final->v_pair_key->>'rounds')::int, 0);
          round_id text := snap_row.round_id::text;
          existing_rounds text := COALESCE(v_final->v_pair_key->>'round_ids', '');
          new_a numeric;
          new_b numeric;
        BEGIN
          IF v_cat_amount > 0 THEN
            new_b := cur_b + v_cat_amount;
            new_a := cur_a;
          ELSE
            new_a := cur_a + ABS(v_cat_amount);
            new_b := cur_b;
          END IF;

          -- Track unique rounds
          IF existing_rounds NOT LIKE '%' || round_id || '%' THEN
            IF existing_rounds = '' THEN
              existing_rounds := round_id;
            ELSE
              existing_rounds := existing_rounds || ',' || round_id;
            END IF;
          END IF;

          v_final := jsonb_set(v_final, ARRAY[v_pair_key], jsonb_build_object(
            'won_a', new_a,
            'won_b', new_b,
            'rounds', existing_rounds,
            'last_round', round_id,
            'last_date', snap->'date'
          ), true);
        END;
      END;
    END LOOP;
  END LOOP;

  -- Insert final PvP records
  FOR v_pair_key IN SELECT jsonb_object_keys(v_final)
  LOOP
    DECLARE
      parts text[] := string_to_array(v_pair_key, '|');
      snap_a_id text := parts[1];
      snap_b_id text := parts[2];
      a_profile uuid := NULL;
      b_profile uuid := NULL;
      a_guest boolean := true;
      b_guest boolean := true;
      a_name_val text := NULL;
      b_name_val text := NULL;
      pair_data jsonb := v_final->v_pair_key;
      round_ids_str text := pair_data->>'rounds';
      round_count_val int;
      last_round uuid := (pair_data->>'last_round')::uuid;
    BEGIN
      -- Count unique rounds
      round_count_val := array_length(string_to_array(round_ids_str, ','), 1);

      -- Resolve profile info from any snapshot that has these players
      -- We look through all snapshots to find profile info
      FOR snap_row IN SELECT rs.snapshot_json FROM public.round_snapshots rs LIMIT 100
      LOOP
        IF a_profile IS NULL THEN
          SELECT (p->>'profileId')::uuid, COALESCE((p->>'isGuest')::boolean, true), p->>'name'
          INTO a_profile, a_guest, a_name_val
          FROM jsonb_array_elements(snap_row.snapshot_json->'players') p
          WHERE p->>'id' = snap_a_id
          LIMIT 1;
        END IF;
        IF b_profile IS NULL THEN
          SELECT (p->>'profileId')::uuid, COALESCE((p->>'isGuest')::boolean, true), p->>'name'
          INTO b_profile, b_guest, b_name_val
          FROM jsonb_array_elements(snap_row.snapshot_json->'players') p
          WHERE p->>'id' = snap_b_id
          LIMIT 1;
        END IF;
        IF a_profile IS NOT NULL OR NOT a_guest THEN
          IF b_profile IS NOT NULL OR NOT b_guest THEN
            EXIT;
          END IF;
        END IF;
      END LOOP;

      -- Normalize ordering: registered profiles first, then by UUID/name
      DECLARE
        final_a_id uuid;
        final_b_id uuid;
        final_a_guest boolean;
        final_b_guest boolean;
        final_a_name text;
        final_b_name text;
        final_won_a numeric;
        final_won_b numeric;
        a_sort text := COALESCE(a_profile::text, 'guest:' || COALESCE(a_name_val, ''));
        b_sort text := COALESCE(b_profile::text, 'guest:' || COALESCE(b_name_val, ''));
      BEGIN
        IF a_sort <= b_sort THEN
          final_a_id := a_profile;
          final_b_id := b_profile;
          final_a_guest := a_guest;
          final_b_guest := b_guest;
          final_a_name := CASE WHEN a_guest THEN a_name_val ELSE NULL END;
          final_b_name := CASE WHEN b_guest THEN b_name_val ELSE NULL END;
          final_won_a := COALESCE((pair_data->>'won_a')::numeric, 0);
          final_won_b := COALESCE((pair_data->>'won_b')::numeric, 0);
        ELSE
          final_a_id := b_profile;
          final_b_id := a_profile;
          final_a_guest := b_guest;
          final_b_guest := a_guest;
          final_a_name := CASE WHEN b_guest THEN b_name_val ELSE NULL END;
          final_b_name := CASE WHEN a_guest THEN a_name_val ELSE NULL END;
          final_won_a := COALESCE((pair_data->>'won_b')::numeric, 0);
          final_won_b := COALESCE((pair_data->>'won_a')::numeric, 0);
        END IF;

        -- Check for existing record with same profile pair
        SELECT * INTO v_existing
        FROM public.player_vs_player
        WHERE COALESCE(player_a_id::text, '') = COALESCE(final_a_id::text, '')
          AND COALESCE(player_b_id::text, '') = COALESCE(final_b_id::text, '')
          AND player_a_is_guest = final_a_guest
          AND player_b_is_guest = final_b_guest
          AND COALESCE(player_a_name, '') = COALESCE(final_a_name, '')
          AND COALESCE(player_b_name, '') = COALESCE(final_b_name, '');

        IF v_existing IS NOT NULL THEN
          UPDATE public.player_vs_player SET
            rounds_played = v_existing.rounds_played + round_count_val,
            total_won_by_a = v_existing.total_won_by_a + final_won_a,
            total_won_by_b = v_existing.total_won_by_b + final_won_b,
            last_round_id = last_round,
            last_played_at = now(),
            updated_at = now()
          WHERE id = v_existing.id;
        ELSE
          INSERT INTO public.player_vs_player (
            player_a_id, player_b_id,
            player_a_is_guest, player_b_is_guest,
            player_a_name, player_b_name,
            rounds_played, total_won_by_a, total_won_by_b,
            last_round_id, last_played_at
          ) VALUES (
            final_a_id, final_b_id,
            final_a_guest, final_b_guest,
            final_a_name, final_b_name,
            round_count_val, final_won_a, final_won_b,
            last_round, now()
          );
        END IF;
        v_upserted_count := v_upserted_count + 1;
      END;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'success',
    'snapshots_processed', v_snap_count,
    'pairs_upserted', v_upserted_count,
    'old_records_deleted', v_deleted_count
  );
END;
$function$;
