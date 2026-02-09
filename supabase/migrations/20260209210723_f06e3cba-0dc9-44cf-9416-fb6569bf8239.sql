
CREATE OR REPLACE FUNCTION public.rebuild_snapshot_balances_from_ledger()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  snap_row RECORD;
  snap jsonb;
  player_elem jsonb;
  rival_elem jsonb;
  new_balances jsonb;
  player_balance jsonb;
  vs_balances_arr jsonb;
  vs_entry jsonb;
  net_amount numeric;
  total_net numeric;
  won_sum numeric;
  lost_sum numeric;
  p_profile_id text;
  r_profile_id text;
  orig_sliding jsonb;
  orig_gross numeric;
  patched_count int := 0;
BEGIN
  FOR snap_row IN 
    SELECT rs.id, rs.round_id, rs.snapshot_json FROM round_snapshots rs
  LOOP
    snap := snap_row.snapshot_json;
    new_balances := '[]'::jsonb;
    
    FOR player_elem IN SELECT * FROM jsonb_array_elements(snap->'players')
    LOOP
      p_profile_id := player_elem->>'profileId';
      total_net := 0;
      vs_balances_arr := '[]'::jsonb;
      
      FOR rival_elem IN SELECT * FROM jsonb_array_elements(snap->'players')
      LOOP
        IF rival_elem->>'id' = player_elem->>'id' THEN CONTINUE; END IF;
        
        r_profile_id := rival_elem->>'profileId';
        
        IF p_profile_id IS NULL OR r_profile_id IS NULL THEN
          -- Guest: keep original vsBalance
          SELECT vb INTO vs_entry
          FROM (
            SELECT jsonb_array_elements(b->'vsBalances') as vb
            FROM jsonb_array_elements(snap->'balances') as b
            WHERE b->>'playerId' = player_elem->>'id'
          ) sub
          WHERE sub.vb->>'rivalId' = rival_elem->>'id';
          
          IF vs_entry IS NOT NULL THEN
            vs_balances_arr := vs_balances_arr || jsonb_build_array(vs_entry);
            total_net := total_net + COALESCE((vs_entry->>'netAmount')::numeric, 0);
          END IF;
          CONTINUE;
        END IF;
        
        -- Calculate net from ledger_transactions
        SELECT COALESCE(SUM(amount), 0) INTO won_sum
        FROM ledger_transactions
        WHERE round_id = snap_row.round_id
          AND to_profile_id = p_profile_id
          AND from_profile_id = r_profile_id;
          
        SELECT COALESCE(SUM(amount), 0) INTO lost_sum
        FROM ledger_transactions
        WHERE round_id = snap_row.round_id
          AND from_profile_id = p_profile_id
          AND to_profile_id = r_profile_id;
        
        net_amount := won_sum - lost_sum;
        total_net := total_net + net_amount;
        
        -- Build vs entry
        vs_entry := jsonb_build_object(
          'rivalId', rival_elem->>'id',
          'rivalName', COALESCE(rival_elem->>'name', 'Unknown'),
          'netAmount', net_amount
        );
        
        -- Preserve slidingStrokes from original snapshot
        SELECT sub.vb->'slidingStrokes' INTO orig_sliding
        FROM (
          SELECT jsonb_array_elements(b->'vsBalances') as vb
          FROM jsonb_array_elements(snap->'balances') as b
          WHERE b->>'playerId' = player_elem->>'id'
        ) sub
        WHERE sub.vb->>'rivalId' = rival_elem->>'id';
        
        IF orig_sliding IS NOT NULL AND orig_sliding != 'null'::jsonb THEN
          vs_entry := vs_entry || jsonb_build_object('slidingStrokes', orig_sliding);
        END IF;
        
        vs_balances_arr := vs_balances_arr || jsonb_build_array(vs_entry);
      END LOOP;
      
      -- Preserve totalGross
      SELECT COALESCE((b->>'totalGross')::numeric, 0) INTO orig_gross
      FROM jsonb_array_elements(snap->'balances') as b
      WHERE b->>'playerId' = player_elem->>'id';
      
      player_balance := jsonb_build_object(
        'playerId', player_elem->>'id',
        'playerName', COALESCE(player_elem->>'name', 'Unknown'),
        'totalGross', COALESCE(orig_gross, 0),
        'totalNet', total_net,
        'vsBalances', vs_balances_arr
      );
      
      new_balances := new_balances || jsonb_build_array(player_balance);
    END LOOP;
    
    UPDATE round_snapshots 
    SET snapshot_json = jsonb_set(snap, '{balances}', new_balances)
    WHERE id = snap_row.id;
    
    patched_count := patched_count + 1;
  END LOOP;
  
  -- Rebuild PvP from corrected snapshots
  PERFORM rebuild_all_pvp_from_snapshots();
  
  RETURN jsonb_build_object('patched_snapshots', patched_count, 'status', 'success');
END;
$$;
