
-- Function to rebuild snapshot balances from ledger_transactions
-- This patches the vsBalances.netAmount in each snapshot using the complete ledger_transactions data
CREATE OR REPLACE FUNCTION public.rebuild_snapshot_balances_from_ledger()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  snap_row RECORD;
  snap jsonb;
  player_rec RECORD;
  players jsonb;
  new_balances jsonb;
  player_balance jsonb;
  vs_balances jsonb;
  rival_rec RECORD;
  vs_entry jsonb;
  net_amount numeric;
  total_net numeric;
  won_sum numeric;
  lost_sum numeric;
  player_profile_id text;
  rival_profile_id text;
  patched_count int := 0;
BEGIN
  FOR snap_row IN 
    SELECT rs.id, rs.round_id, rs.snapshot_json 
    FROM round_snapshots rs
  LOOP
    snap := snap_row.snapshot_json;
    players := snap->'players';
    new_balances := '[]'::jsonb;
    
    -- For each player in the snapshot
    FOR player_rec IN SELECT * FROM jsonb_array_elements(players) AS p
    LOOP
      player_profile_id := player_rec.p->>'profileId';
      total_net := 0;
      vs_balances := '[]'::jsonb;
      
      -- For each rival
      FOR rival_rec IN SELECT * FROM jsonb_array_elements(players) AS r
        WHERE r->>'id' != player_rec.p->>'id'
      LOOP
        rival_profile_id := rival_rec.r->>'profileId';
        
        -- Skip if either is a guest (no profile_id)
        IF player_profile_id IS NULL OR rival_profile_id IS NULL THEN
          -- Keep existing vsBalance from snapshot for guests
          SELECT vb INTO vs_entry
          FROM (
            SELECT jsonb_array_elements(b->'vsBalances') as vb
            FROM jsonb_array_elements(snap->'balances') as b
            WHERE b->>'playerId' = player_rec.p->>'id'
          ) sub
          WHERE vb->>'rivalId' = rival_rec.r->>'id';
          
          IF vs_entry IS NOT NULL THEN
            vs_balances := vs_balances || jsonb_build_array(vs_entry);
            total_net := total_net + COALESCE((vs_entry->>'netAmount')::numeric, 0);
          END IF;
          CONTINUE;
        END IF;
        
        -- Calculate net from ledger_transactions
        SELECT COALESCE(SUM(amount), 0) INTO won_sum
        FROM ledger_transactions
        WHERE round_id = snap_row.round_id
          AND to_profile_id = player_profile_id
          AND from_profile_id = rival_profile_id;
          
        SELECT COALESCE(SUM(amount), 0) INTO lost_sum
        FROM ledger_transactions
        WHERE round_id = snap_row.round_id
          AND from_profile_id = player_profile_id
          AND to_profile_id = rival_profile_id;
        
        net_amount := won_sum - lost_sum;
        total_net := total_net + net_amount;
        
        -- Build vs entry, preserving slidingStrokes from existing snapshot
        vs_entry := jsonb_build_object(
          'rivalId', rival_rec.r->>'id',
          'rivalName', COALESCE(rival_rec.r->>'name', 'Unknown'),
          'netAmount', net_amount
        );
        
        -- Preserve slidingStrokes if it existed
        SELECT vb->'slidingStrokes' INTO rival_profile_id -- reusing var for temp
        FROM (
          SELECT jsonb_array_elements(b->'vsBalances') as vb
          FROM jsonb_array_elements(snap->'balances') as b
          WHERE b->>'playerId' = player_rec.p->>'id'
        ) sub
        WHERE vb->>'rivalId' = rival_rec.r->>'id';
        
        -- Oops, that reuses the var wrong. Let me use a different approach.
        -- Just check if the original had slidingStrokes
        DECLARE
          orig_sliding jsonb;
        BEGIN
          SELECT vb->'slidingStrokes' INTO orig_sliding
          FROM (
            SELECT jsonb_array_elements(b->'vsBalances') as vb
            FROM jsonb_array_elements(snap->'balances') as b
            WHERE b->>'playerId' = player_rec.p->>'id'
          ) sub
          WHERE vb->>'rivalId' = rival_rec.r->>'id';
          
          IF orig_sliding IS NOT NULL AND orig_sliding != 'null'::jsonb THEN
            vs_entry := vs_entry || jsonb_build_object('slidingStrokes', orig_sliding);
          END IF;
        END;
        
        vs_balances := vs_balances || jsonb_build_array(vs_entry);
      END LOOP;
      
      -- Build player balance entry, preserving totalGross
      player_balance := jsonb_build_object(
        'playerId', player_rec.p->>'id',
        'playerName', COALESCE(player_rec.p->>'name', 'Unknown'),
        'totalGross', COALESCE((
          SELECT b->>'totalGross'
          FROM jsonb_array_elements(snap->'balances') as b
          WHERE b->>'playerId' = player_rec.p->>'id'
        )::numeric, 0),
        'totalNet', total_net,
        'vsBalances', vs_balances
      );
      
      new_balances := new_balances || jsonb_build_array(player_balance);
    END LOOP;
    
    -- Update the snapshot with corrected balances
    UPDATE round_snapshots 
    SET snapshot_json = jsonb_set(snap, '{balances}', new_balances)
    WHERE id = snap_row.id;
    
    patched_count := patched_count + 1;
  END LOOP;
  
  -- Now rebuild PvP from corrected snapshots
  PERFORM rebuild_all_pvp_from_snapshots();
  
  RETURN jsonb_build_object('patched_snapshots', patched_count, 'status', 'success');
END;
$$;
