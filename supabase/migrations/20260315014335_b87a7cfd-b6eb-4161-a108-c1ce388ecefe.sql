DO $$
DECLARE
  v_old uuid := 'b59d56bd-f805-4a85-9076-29c3d83732c9';
  v_target uuid := 'dc1e017a-5bb7-4cf6-8d2a-fc83b9044d2a';
  v_mar9_rp uuid := '54f35a9d-4bec-4e86-ba02-130d6af77e3c';
  v_mar9_round uuid := '36a5f334-0965-47e5-a47e-bd96dd5a4077';
  rec RECORD;
  v_counterpart uuid;
  v_old_won numeric;
  v_counterpart_won numeric;
  v_existing_id uuid;
BEGIN
  -- STEP 1: Remove phantom player from Mar 9 round
  DELETE FROM hole_markers WHERE hole_score_id IN (
    SELECT id FROM hole_scores WHERE round_player_id = v_mar9_rp);
  DELETE FROM hole_scores WHERE round_player_id = v_mar9_rp;
  DELETE FROM round_handicaps WHERE round_id = v_mar9_round
    AND (player_a_id = v_mar9_rp OR player_b_id = v_mar9_rp);
  DELETE FROM bilateral_bets WHERE round_id = v_mar9_round
    AND (player_a_id = v_mar9_rp OR player_b_id = v_mar9_rp);
  DELETE FROM team_bets WHERE round_id = v_mar9_round
    AND (team_a_player1_id = v_mar9_rp OR team_a_player2_id = v_mar9_rp
      OR team_b_player1_id = v_mar9_rp OR team_b_player2_id = v_mar9_rp);
  DELETE FROM round_players WHERE id = v_mar9_rp;

  -- STEP 2: Reassign round_players
  UPDATE round_players SET profile_id = v_target WHERE profile_id = v_old;

  -- STEP 3: Reassign ledger_transactions
  UPDATE ledger_transactions SET from_profile_id = v_target WHERE from_profile_id = v_old;
  UPDATE ledger_transactions SET to_profile_id = v_target WHERE to_profile_id = v_old;

  -- STEP 4: Update snapshot JSON
  UPDATE round_snapshots
  SET snapshot_json = (
    regexp_replace(
      regexp_replace(
        regexp_replace(
          replace(snapshot_json::text, v_old::text, v_target::text),
          '"Alejandro "', '"Alejandro Saucedo Urbina"', 'g'
        ),
        '"initials":\s*"A"', '"initials": "AS"', 'g'
      ),
      '"avatar_color":\s*"#d8bece"', '"avatar_color": "#83a899"', 'g'
    )
  )::jsonb
  WHERE round_id IN ('22260880-ce1c-44fc-a219-cc35bae0aa8c', '1563dedb-d7aa-4a28-bc00-bbc5c0226c5e');

  -- STEP 5: Handle sliding_history
  DELETE FROM sliding_history WHERE
    (player_a_profile_id = v_old AND player_b_profile_id = v_target) OR
    (player_a_profile_id = v_target AND player_b_profile_id = v_old);
  UPDATE sliding_history SET
    player_a_profile_id = CASE WHEN v_target < player_b_profile_id THEN v_target ELSE player_b_profile_id END,
    player_b_profile_id = CASE WHEN v_target < player_b_profile_id THEN player_b_profile_id ELSE v_target END,
    strokes_a_gives_b_used = CASE WHEN v_target < player_b_profile_id THEN strokes_a_gives_b_used ELSE -strokes_a_gives_b_used END,
    strokes_a_gives_b_next = CASE WHEN v_target < player_b_profile_id THEN strokes_a_gives_b_next ELSE -strokes_a_gives_b_next END,
    front_main_winner = CASE WHEN v_target < player_b_profile_id THEN front_main_winner
      ELSE CASE front_main_winner WHEN 'A' THEN 'B' WHEN 'B' THEN 'A' ELSE 'tie' END END,
    back_main_winner = CASE WHEN v_target < player_b_profile_id THEN back_main_winner
      ELSE CASE back_main_winner WHEN 'A' THEN 'B' WHEN 'B' THEN 'A' ELSE 'tie' END END,
    match_total_winner = CASE WHEN v_target < player_b_profile_id THEN match_total_winner
      ELSE CASE match_total_winner WHEN 'A' THEN 'B' WHEN 'B' THEN 'A' ELSE 'tie' END END
  WHERE player_a_profile_id = v_old;
  UPDATE sliding_history SET
    player_a_profile_id = CASE WHEN player_a_profile_id < v_target THEN player_a_profile_id ELSE v_target END,
    player_b_profile_id = CASE WHEN player_a_profile_id < v_target THEN v_target ELSE player_a_profile_id END,
    strokes_a_gives_b_used = CASE WHEN player_a_profile_id < v_target THEN strokes_a_gives_b_used ELSE -strokes_a_gives_b_used END,
    strokes_a_gives_b_next = CASE WHEN player_a_profile_id < v_target THEN strokes_a_gives_b_next ELSE -strokes_a_gives_b_next END,
    front_main_winner = CASE WHEN player_a_profile_id < v_target THEN front_main_winner
      ELSE CASE front_main_winner WHEN 'A' THEN 'B' WHEN 'B' THEN 'A' ELSE 'tie' END END,
    back_main_winner = CASE WHEN player_a_profile_id < v_target THEN back_main_winner
      ELSE CASE back_main_winner WHEN 'A' THEN 'B' WHEN 'B' THEN 'A' ELSE 'tie' END END,
    match_total_winner = CASE WHEN player_a_profile_id < v_target THEN match_total_winner
      ELSE CASE match_total_winner WHEN 'A' THEN 'B' WHEN 'B' THEN 'A' ELSE 'tie' END END
  WHERE player_b_profile_id = v_old;

  -- STEP 6: Handle sliding_current
  DELETE FROM sliding_current WHERE
    (player_a_profile_id = v_old AND player_b_profile_id = v_target) OR
    (player_a_profile_id = v_target AND player_b_profile_id = v_old);
  DELETE FROM sliding_current sc_old
  WHERE (sc_old.player_a_profile_id = v_old OR sc_old.player_b_profile_id = v_old)
  AND EXISTS (
    SELECT 1 FROM sliding_current sc2 WHERE sc2.id != sc_old.id
    AND (
      (sc2.player_a_profile_id = v_target AND sc2.player_b_profile_id =
        CASE WHEN sc_old.player_a_profile_id = v_old THEN sc_old.player_b_profile_id ELSE sc_old.player_a_profile_id END)
      OR (sc2.player_b_profile_id = v_target AND sc2.player_a_profile_id =
        CASE WHEN sc_old.player_a_profile_id = v_old THEN sc_old.player_b_profile_id ELSE sc_old.player_a_profile_id END)
      OR (sc2.player_a_profile_id =
        CASE WHEN sc_old.player_a_profile_id = v_old THEN sc_old.player_b_profile_id ELSE sc_old.player_a_profile_id END
        AND sc2.player_b_profile_id = v_target)
    )
  );
  UPDATE sliding_current SET
    player_a_profile_id = CASE WHEN v_target < player_b_profile_id THEN v_target ELSE player_b_profile_id END,
    player_b_profile_id = CASE WHEN v_target < player_b_profile_id THEN player_b_profile_id ELSE v_target END,
    strokes_a_gives_b_current = CASE WHEN v_target < player_b_profile_id THEN strokes_a_gives_b_current ELSE -strokes_a_gives_b_current END
  WHERE player_a_profile_id = v_old;
  UPDATE sliding_current SET
    player_a_profile_id = CASE WHEN player_a_profile_id < v_target THEN player_a_profile_id ELSE v_target END,
    player_b_profile_id = CASE WHEN player_a_profile_id < v_target THEN v_target ELSE player_a_profile_id END,
    strokes_a_gives_b_current = CASE WHEN player_a_profile_id < v_target THEN strokes_a_gives_b_current ELSE -strokes_a_gives_b_current END
  WHERE player_b_profile_id = v_old;

  -- STEP 7: Handle player_vs_player
  DELETE FROM player_vs_player WHERE
    (player_a_id = v_old AND player_b_id = v_target) OR
    (player_a_id = v_target AND player_b_id = v_old);
  FOR rec IN SELECT * FROM player_vs_player WHERE player_a_id = v_old OR player_b_id = v_old
  LOOP
    IF rec.player_a_id = v_old THEN
      v_counterpart := rec.player_b_id;
      v_old_won := rec.total_won_by_a;
      v_counterpart_won := rec.total_won_by_b;
    ELSE
      v_counterpart := rec.player_a_id;
      v_old_won := rec.total_won_by_b;
      v_counterpart_won := rec.total_won_by_a;
    END IF;
    SELECT id INTO v_existing_id FROM player_vs_player
    WHERE ((player_a_id = v_target AND player_b_id = v_counterpart)
        OR (player_a_id = v_counterpart AND player_b_id = v_target))
    AND id != rec.id LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      UPDATE player_vs_player SET
        rounds_played = player_vs_player.rounds_played + rec.rounds_played,
        total_won_by_a = player_vs_player.total_won_by_a + CASE WHEN player_vs_player.player_a_id = v_target THEN v_old_won ELSE v_counterpart_won END,
        total_won_by_b = player_vs_player.total_won_by_b + CASE WHEN player_vs_player.player_a_id = v_target THEN v_counterpart_won ELSE v_old_won END,
        last_played_at = GREATEST(player_vs_player.last_played_at, rec.last_played_at),
        updated_at = now()
      WHERE id = v_existing_id;
      DELETE FROM player_vs_player WHERE id = rec.id;
    ELSE
      IF rec.player_a_id = v_old THEN
        UPDATE player_vs_player SET player_a_id = v_target, player_a_name = 'Alejandro Saucedo Urbina' WHERE id = rec.id;
      ELSE
        UPDATE player_vs_player SET player_b_id = v_target, player_b_name = 'Alejandro Saucedo Urbina' WHERE id = rec.id;
      END IF;
    END IF;
  END LOOP;

  -- STEP 8: Clean up auxiliary tables (including leaderboard_participants)
  DELETE FROM leaderboard_scores WHERE participant_id IN (
    SELECT id FROM leaderboard_participants WHERE profile_id = v_old);
  DELETE FROM leaderboard_participants WHERE profile_id = v_old;
  DELETE FROM friendships WHERE owner_profile_id = v_old OR friend_profile_id = v_old;
  DELETE FROM player_statistics WHERE profile_id = v_old;
  DELETE FROM handicap_history WHERE profile_id = v_old;
  DELETE FROM bet_templates WHERE owner_profile_id = v_old;
  DELETE FROM course_favorites WHERE profile_id = v_old;
  DELETE FROM course_visibility WHERE profile_id = v_old;

  -- STEP 9: Delete old profile
  DELETE FROM profiles WHERE id = v_old;
END $$;