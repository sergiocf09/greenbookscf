DO $$
DECLARE
  target_rounds uuid[] := ARRAY[
    '0b0c78ac-fb50-455d-af21-eb6de6114a31',
    '1e9dcb33-5a1a-428a-a2a7-d187d4b0a6f1',
    'a61960cc-5df0-4ad9-99b0-65de8dcecb9f',
    '3fa779f1-b948-4a70-be21-af06f1496962',
    '6db8d6a7-1f52-4319-abcc-08efd878490f'
  ]::uuid[];
  rp_ids uuid[];
  hs_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO rp_ids FROM public.round_players WHERE round_id = ANY(target_rounds);

  IF rp_ids IS NOT NULL THEN
    SELECT array_agg(id) INTO hs_ids FROM public.hole_scores WHERE round_player_id = ANY(rp_ids);
    IF hs_ids IS NOT NULL THEN
      DELETE FROM public.hole_markers WHERE hole_score_id = ANY(hs_ids);
      DELETE FROM public.hole_scores WHERE id = ANY(hs_ids);
    END IF;
  END IF;

  DELETE FROM public.wolf_hole_state      WHERE round_id = ANY(target_rounds);
  DELETE FROM public.wolf_config          WHERE round_id = ANY(target_rounds);
  DELETE FROM public.vegas_config         WHERE round_id = ANY(target_rounds);
  DELETE FROM public.sixes_sets           WHERE round_id = ANY(target_rounds);
  DELETE FROM public.sixes_config         WHERE round_id = ANY(target_rounds);
  DELETE FROM public.nines_config         WHERE round_id = ANY(target_rounds);
  DELETE FROM public.sliding_history      WHERE round_id = ANY(target_rounds);
  DELETE FROM public.team_bets            WHERE round_id = ANY(target_rounds);
  DELETE FROM public.bilateral_bets       WHERE round_id = ANY(target_rounds);
  DELETE FROM public.cross_bet_invitations WHERE round_id = ANY(target_rounds);
  DELETE FROM public.round_cross_bets     WHERE round_id = ANY(target_rounds);
  DELETE FROM public.ledger_transactions  WHERE round_id = ANY(target_rounds);
  DELETE FROM public.leaderboard_scores   WHERE round_id = ANY(target_rounds);
  DELETE FROM public.leaderboard_rounds   WHERE round_id = ANY(target_rounds);
  UPDATE public.cup_matches SET round_id = NULL WHERE round_id = ANY(target_rounds);
  DELETE FROM public.handicap_history     WHERE round_id = ANY(target_rounds);
  DELETE FROM public.round_handicaps      WHERE round_id = ANY(target_rounds);
  DELETE FROM public.round_snapshots      WHERE round_id = ANY(target_rounds);
  DELETE FROM public.round_close_attempts WHERE round_id = ANY(target_rounds);
  DELETE FROM public.round_audit_log      WHERE round_id = ANY(target_rounds);
  DELETE FROM public.guest_sessions       WHERE round_id = ANY(target_rounds);
  DELETE FROM public.round_players        WHERE round_id = ANY(target_rounds);
  DELETE FROM public.round_groups         WHERE round_id = ANY(target_rounds);
  DELETE FROM public.rounds               WHERE id = ANY(target_rounds);
END $$;