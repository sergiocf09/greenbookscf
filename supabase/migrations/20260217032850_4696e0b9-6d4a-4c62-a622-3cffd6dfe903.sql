
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
  v_deleted_count int;
  v_snap_count int := 0;
  v_player_i jsonb;
  v_player_j jsonb;
  v_profile_i uuid;
  v_profile_j uuid;
  v_is_guest_i boolean;
  v_is_guest_j boolean;
  v_name_i text;
  v_name_j text;
  v_net numeric;
  v_existing record;
  v_a_profile uuid;
  v_b_profile uuid;
  v_a_guest boolean;
  v_b_guest boolean;
  v_a_name text;
  v_b_name text;
  v_won_a numeric;
  v_won_b numeric;
BEGIN
  DELETE FROM public.player_vs_player;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  FOR snap_row IN SELECT rs.round_id, rs.snapshot_json FROM public.round_snapshots rs
  LOOP
    snap := snap_row.snapshot_json;
    v_players := COALESCE(snap->'players', '[]'::jsonb);
    v_ledger := COALESCE(snap->'ledger', '[]'::jsonb);
    v_bet_overrides := COALESCE(snap->'betConfig'->'betOverrides', '[]'::jsonb);
    v_snap_count := v_snap_count + 1;

    -- For each ordered pair (i < j by snapshot player id), calculate net with overrides
    FOR v_player_i IN SELECT value FROM jsonb_array_elements(v_players) AS t(value)
    LOOP
      FOR v_player_j IN SELECT value FROM jsonb_array_elements(v_players) AS t(value)
      LOOP
        IF (v_player_i->>'id') >= (v_player_j->>'id') THEN CONTINUE; END IF;

        -- Calculate override-filtered net for player_i vs player_j
        v_net := public._calc_pair_net_with_overrides(v_ledger, v_bet_overrides, v_player_i->>'id', v_player_j->>'id', v_players);
        
        -- Skip pairs with zero interaction
        IF v_net = 0 THEN
          -- Check if they have ANY ledger entries between them
          IF NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(v_ledger) e
            WHERE (e.value->>'fromPlayerId' = v_player_i->>'id' AND e.value->>'toPlayerId' = v_player_j->>'id')
               OR (e.value->>'fromPlayerId' = v_player_j->>'id' AND e.value->>'toPlayerId' = v_player_i->>'id')
          ) THEN
            CONTINUE;
          END IF;
        END IF;

        -- Resolve profiles
        v_profile_i := NULLIF(v_player_i->>'profileId', '')::uuid;
        v_profile_j := NULLIF(v_player_j->>'profileId', '')::uuid;
        v_is_guest_i := COALESCE((v_player_i->>'isGuest')::boolean, v_profile_i IS NULL);
        v_is_guest_j := COALESCE((v_player_j->>'isGuest')::boolean, v_profile_j IS NULL);
        v_name_i := v_player_i->>'name';
        v_name_j := v_player_j->>'name';

        -- Normalize ordering (profile-based)
        IF COALESCE(v_profile_i::text, 'guest:' || COALESCE(v_name_i,'')) <= COALESCE(v_profile_j::text, 'guest:' || COALESCE(v_name_j,'')) THEN
          v_a_profile := v_profile_i; v_b_profile := v_profile_j;
          v_a_guest := v_is_guest_i; v_b_guest := v_is_guest_j;
          v_a_name := CASE WHEN v_is_guest_i THEN v_name_i ELSE NULL END;
          v_b_name := CASE WHEN v_is_guest_j THEN v_name_j ELSE NULL END;
          -- v_net is from perspective of i: positive = i won from j
          -- In our ordering, i = A, so A won
          v_won_a := GREATEST(v_net, 0);
          v_won_b := GREATEST(-v_net, 0);
        ELSE
          v_a_profile := v_profile_j; v_b_profile := v_profile_i;
          v_a_guest := v_is_guest_j; v_b_guest := v_is_guest_i;
          v_a_name := CASE WHEN v_is_guest_j THEN v_name_j ELSE NULL END;
          v_b_name := CASE WHEN v_is_guest_i THEN v_name_i ELSE NULL END;
          -- i = B in this ordering
          v_won_a := GREATEST(-v_net, 0);
          v_won_b := GREATEST(v_net, 0);
        END IF;

        -- Upsert
        SELECT * INTO v_existing FROM public.player_vs_player
        WHERE COALESCE(player_a_id::text, '') = COALESCE(v_a_profile::text, '')
          AND COALESCE(player_b_id::text, '') = COALESCE(v_b_profile::text, '')
          AND player_a_is_guest = v_a_guest AND player_b_is_guest = v_b_guest
          AND COALESCE(player_a_name, '') = COALESCE(v_a_name, '')
          AND COALESCE(player_b_name, '') = COALESCE(v_b_name, '');

        IF v_existing IS NOT NULL THEN
          UPDATE public.player_vs_player SET
            rounds_played = v_existing.rounds_played + 1,
            total_won_by_a = v_existing.total_won_by_a + v_won_a,
            total_won_by_b = v_existing.total_won_by_b + v_won_b,
            last_round_id = snap_row.round_id,
            last_played_at = now(), updated_at = now()
          WHERE id = v_existing.id;
        ELSE
          INSERT INTO public.player_vs_player (
            player_a_id, player_b_id, player_a_is_guest, player_b_is_guest,
            player_a_name, player_b_name, rounds_played,
            total_won_by_a, total_won_by_b, last_round_id, last_played_at
          ) VALUES (
            v_a_profile, v_b_profile, v_a_guest, v_b_guest,
            v_a_name, v_b_name, 1,
            v_won_a, v_won_b, snap_row.round_id, now()
          );
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('status', 'success', 'snapshots_processed', v_snap_count, 'old_deleted', v_deleted_count);
END;
$function$;

-- Helper function: Calculate net amount for player_a vs player_b from ledger with override filtering
CREATE OR REPLACE FUNCTION public._calc_pair_net_with_overrides(
  p_ledger jsonb,
  p_overrides jsonb,
  p_player_a_id text,
  p_player_b_id text,
  p_players jsonb
) RETURNS numeric
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_entry jsonb;
  v_amount numeric;
  v_bet_type text;
  v_cat text;
  v_grouped jsonb := '{}'::jsonb;
  v_cat_key text;
  v_cat_amount numeric;
  v_cat_label text;
  v_ov jsonb;
  v_total numeric := 0;
  v_carrito_types text[] := ARRAY['Carritos Front', 'Carritos Back', 'Carritos Total'];
BEGIN
  -- Build category-grouped amounts for this pair
  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_ledger) AS t(value)
  LOOP
    v_amount := COALESCE(NULLIF(v_entry->>'amount','')::numeric, 0);
    IF v_amount <= 0 THEN CONTINUE; END IF;
    
    v_bet_type := COALESCE(v_entry->>'betType', '');
    IF v_bet_type = ANY(v_carrito_types) OR v_bet_type = 'Presiones Parejas' THEN CONTINUE; END IF;

    v_cat := CASE
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

    -- A wins (to = A)
    IF v_entry->>'toPlayerId' = p_player_a_id AND v_entry->>'fromPlayerId' = p_player_b_id THEN
      v_grouped := jsonb_set(v_grouped, ARRAY[v_cat], to_jsonb(COALESCE((v_grouped->>v_cat)::numeric, 0) + v_amount), true);
    -- B wins (to = B)
    ELSIF v_entry->>'toPlayerId' = p_player_b_id AND v_entry->>'fromPlayerId' = p_player_a_id THEN
      v_grouped := jsonb_set(v_grouped, ARRAY[v_cat], to_jsonb(COALESCE((v_grouped->>v_cat)::numeric, 0) - v_amount), true);
    END IF;
  END LOOP;

  -- Apply overrides per category
  FOR v_cat_key IN SELECT jsonb_object_keys(v_grouped)
  LOOP
    v_cat_amount := (v_grouped->>v_cat_key)::numeric;
    
    v_cat_label := CASE v_cat_key
      WHEN 'medal' THEN 'Medal' WHEN 'pressures' THEN 'Presiones' WHEN 'skins' THEN 'Skins'
      WHEN 'caros' THEN 'Caros' WHEN 'oyeses' THEN 'Oyes' WHEN 'units' THEN 'Unidades'
      WHEN 'manchas' THEN 'Manchas' WHEN 'culebras' THEN 'Culebras' WHEN 'pinguinos' THEN 'Pingüinos'
      WHEN 'rayas' THEN 'Rayas' WHEN 'medalGeneral' THEN 'Medal General' WHEN 'coneja' THEN 'Coneja'
      WHEN 'putts' THEN 'Putts' WHEN 'sideBets' THEN 'Side Bet' WHEN 'stableford' THEN 'Stableford'
      WHEN 'zoologico' THEN 'Zoológico' ELSE v_cat_key
    END;

    -- Check if this category is disabled for this pair
    DECLARE
      v_disabled boolean := false;
      prof_a text;
      prof_b text;
    BEGIN
      SELECT p->>'profileId' INTO prof_a FROM jsonb_array_elements(p_players) p WHERE p->>'id' = p_player_a_id LIMIT 1;
      SELECT p->>'profileId' INTO prof_b FROM jsonb_array_elements(p_players) p WHERE p->>'id' = p_player_b_id LIMIT 1;

      FOR v_ov IN SELECT value FROM jsonb_array_elements(p_overrides) AS t(value)
      LOOP
        IF COALESCE(v_ov->>'betType', '') != v_cat_label AND COALESCE(v_ov->>'betType', '') != v_cat_key THEN CONTINUE; END IF;
        
        DECLARE
          ov_a text := COALESCE(v_ov->>'playerAId', '');
          ov_b text := COALESCE(v_ov->>'playerBId', '');
          m_a_a boolean := (ov_a = p_player_a_id OR (prof_a IS NOT NULL AND ov_a = prof_a));
          m_a_b boolean := (ov_a = p_player_b_id OR (prof_b IS NOT NULL AND ov_a = prof_b));
          m_b_a boolean := (ov_b = p_player_a_id OR (prof_a IS NOT NULL AND ov_b = prof_a));
          m_b_b boolean := (ov_b = p_player_b_id OR (prof_b IS NOT NULL AND ov_b = prof_b));
        BEGIN
          IF (m_a_a AND m_b_b) OR (m_a_b AND m_b_a) THEN
            IF COALESCE((v_ov->>'enabled')::boolean, true) = false THEN
              v_disabled := true;
              EXIT;
            END IF;
          END IF;
        END;
      END LOOP;

      IF NOT v_disabled THEN
        v_total := v_total + v_cat_amount;
      END IF;
    END;
  END LOOP;

  RETURN v_total;
END;
$$;
