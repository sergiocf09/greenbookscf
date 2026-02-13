
-- Rectify round f9daa571-0604-4ea9-9d08-0222b29a8de2 (Jan 28 Tequisquiapan)
-- Step 1: Delete snapshot
DELETE FROM round_snapshots WHERE round_id = 'f9daa571-0604-4ea9-9d08-0222b29a8de2';

-- Step 2: Delete ledger transactions
DELETE FROM ledger_transactions WHERE round_id = 'f9daa571-0604-4ea9-9d08-0222b29a8de2';

-- Step 3: Clean player_vs_player references to this round
UPDATE player_vs_player SET last_round_id = NULL WHERE last_round_id = 'f9daa571-0604-4ea9-9d08-0222b29a8de2';

-- Step 4: Delete sliding history for this round
DELETE FROM sliding_history WHERE round_id = 'f9daa571-0604-4ea9-9d08-0222b29a8de2';

-- Step 5: Revert round to in_progress
UPDATE rounds SET status = 'in_progress' WHERE id = 'f9daa571-0604-4ea9-9d08-0222b29a8de2';

-- Step 6: Clean betOverrides - remove entries with stale player IDs
-- Valid round_player IDs: 3b9093e4, 6913e5b5, 5e089f78, 81054bfc
UPDATE rounds
SET bet_config = jsonb_set(
  bet_config,
  '{betOverrides}',
  (
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
    FROM jsonb_array_elements(bet_config->'betOverrides') elem
    WHERE elem->>'playerAId' IN (
      '3b9093e4-485f-4a18-beea-c6285808be09',
      '6913e5b5-9e9b-445a-9163-0e2f6da5560c',
      '5e089f78-d1c3-4f81-ad29-d4d1c2d580bf',
      '81054bfc-b755-4841-8a08-f80209c2d203'
    )
    AND elem->>'playerBId' IN (
      '3b9093e4-485f-4a18-beea-c6285808be09',
      '6913e5b5-9e9b-445a-9163-0e2f6da5560c',
      '5e089f78-d1c3-4f81-ad29-d4d1c2d580bf',
      '81054bfc-b755-4841-8a08-f80209c2d203'
    )
  )
)
WHERE id = 'f9daa571-0604-4ea9-9d08-0222b29a8de2';
