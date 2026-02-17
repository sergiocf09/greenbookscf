
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

    FOR v_player_i IN SELECT value FROM jsonb_array_elements(v_players) AS t(value)
    LOOP
      FOR v_player_j IN SELECT value FROM jsonb_array_elements(v_players) AS t(value)
      LOOP
        IF (v_player_i->>'id') >= (v_player_j->>'id') THEN CONTINUE; END IF;

        v_net := public._calc_pair_net_with_overrides(v_ledger, v_bet_overrides, v_player_i->>'id', v_player_j->>'id', v_players);
        
        -- Skip pairs with zero net and no ledger entries
        IF v_net = 0 THEN
          IF NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(v_ledger) e
            WHERE (e.value->>'fromPlayerId' = v_player_i->>'id' AND e.value->>'toPlayerId' = v_player_j->>'id')
               OR (e.value->>'fromPlayerId' = v_player_j->>'id' AND e.value->>'toPlayerId' = v_player_i->>'id')
          ) THEN
            CONTINUE;
          END IF;
        END IF;

        v_profile_i := NULLIF(v_player_i->>'profileId', '')::uuid;
        v_profile_j := NULLIF(v_player_j->>'profileId', '')::uuid;
        v_is_guest_i := COALESCE((v_player_i->>'isGuest')::boolean, v_profile_i IS NULL);
        v_is_guest_j := COALESCE((v_player_j->>'isGuest')::boolean, v_profile_j IS NULL);
        v_name_i := v_player_i->>'name';
        v_name_j := v_player_j->>'name';

        -- Normalize: smaller sort key = A
        IF COALESCE(v_profile_i::text, 'guest:' || COALESCE(v_name_i,'')) <= COALESCE(v_profile_j::text, 'guest:' || COALESCE(v_name_j,'')) THEN
          v_a_profile := v_profile_i; v_b_profile := v_profile_j;
          v_a_guest := v_is_guest_i; v_b_guest := v_is_guest_j;
          v_a_name := CASE WHEN v_is_guest_i THEN v_name_i ELSE NULL END;
          v_b_name := CASE WHEN v_is_guest_j THEN v_name_j ELSE NULL END;
          v_won_a := GREATEST(v_net, 0);
          v_won_b := GREATEST(-v_net, 0);
        ELSE
          v_a_profile := v_profile_j; v_b_profile := v_profile_i;
          v_a_guest := v_is_guest_j; v_b_guest := v_is_guest_i;
          v_a_name := CASE WHEN v_is_guest_j THEN v_name_j ELSE NULL END;
          v_b_name := CASE WHEN v_is_guest_i THEN v_name_i ELSE NULL END;
          v_won_a := GREATEST(-v_net, 0);
          v_won_b := GREATEST(v_net, 0);
        END IF;

        -- Use ON CONFLICT for registered players (unique constraint on player_a_id, player_b_id)
        IF v_a_profile IS NOT NULL AND v_b_profile IS NOT NULL THEN
          INSERT INTO public.player_vs_player (
            player_a_id, player_b_id, player_a_is_guest, player_b_is_guest,
            player_a_name, player_b_name, rounds_played,
            total_won_by_a, total_won_by_b, last_round_id, last_played_at
          ) VALUES (
            v_a_profile, v_b_profile, v_a_guest, v_b_guest,
            v_a_name, v_b_name, 1,
            v_won_a, v_won_b, snap_row.round_id, now()
          )
          ON CONFLICT (player_a_id, player_b_id) DO UPDATE SET
            rounds_played = player_vs_player.rounds_played + 1,
            total_won_by_a = player_vs_player.total_won_by_a + EXCLUDED.total_won_by_a,
            total_won_by_b = player_vs_player.total_won_by_b + EXCLUDED.total_won_by_b,
            last_round_id = EXCLUDED.last_round_id,
            last_played_at = now(), updated_at = now();
        ELSE
          -- Guest players: match by name
          DECLARE
            v_existing record;
          BEGIN
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
          END;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('status', 'success', 'snapshots_processed', v_snap_count, 'old_deleted', v_deleted_count);
END;
$function$;
