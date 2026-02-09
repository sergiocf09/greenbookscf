
-- Update rebuild_all_pvp to use ledger_transactions instead of snapshot ledger
CREATE OR REPLACE FUNCTION public.rebuild_all_pvp_from_snapshots()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted_count int;
  v_inserted_count int := 0;
  v_pvp_row RECORD;
BEGIN
  -- Delete all existing player_vs_player records
  DELETE FROM public.player_vs_player;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Rebuild from ledger_transactions (the complete source of truth)
  -- grouped by normalized pair + round
  FOR v_pvp_row IN
    WITH pair_round_totals AS (
      SELECT
        LEAST(lt.from_profile_id, lt.to_profile_id) as player_a_id,
        GREATEST(lt.from_profile_id, lt.to_profile_id) as player_b_id,
        lt.round_id,
        r.date as round_date,
        SUM(CASE WHEN lt.to_profile_id = LEAST(lt.from_profile_id, lt.to_profile_id) THEN lt.amount ELSE 0 END) as a_won,
        SUM(CASE WHEN lt.to_profile_id = GREATEST(lt.from_profile_id, lt.to_profile_id) THEN lt.amount ELSE 0 END) as b_won
      FROM ledger_transactions lt
      JOIN rounds r ON r.id = lt.round_id
      WHERE r.status = 'completed'
      GROUP BY LEAST(lt.from_profile_id, lt.to_profile_id), 
               GREATEST(lt.from_profile_id, lt.to_profile_id),
               lt.round_id, r.date
    ),
    pair_totals AS (
      SELECT
        player_a_id,
        player_b_id,
        SUM(a_won) as total_won_by_a,
        SUM(b_won) as total_won_by_b,
        COUNT(DISTINCT round_id) as rounds_played,
        MAX(round_date) as last_played_at,
        (ARRAY_AGG(round_id ORDER BY round_date DESC))[1] as last_round_id
      FROM pair_round_totals
      GROUP BY player_a_id, player_b_id
    )
    SELECT * FROM pair_totals
  LOOP
    INSERT INTO public.player_vs_player (
      player_a_id, player_b_id,
      player_a_is_guest, player_b_is_guest,
      rounds_played,
      total_won_by_a, total_won_by_b,
      last_played_at, last_round_id
    ) VALUES (
      v_pvp_row.player_a_id, v_pvp_row.player_b_id,
      false, false,
      v_pvp_row.rounds_played,
      v_pvp_row.total_won_by_a, v_pvp_row.total_won_by_b,
      v_pvp_row.last_played_at, v_pvp_row.last_round_id
    );
    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'deleted', v_deleted_count,
    'inserted', v_inserted_count,
    'status', 'success'
  );
END;
$function$;
