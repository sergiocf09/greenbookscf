CREATE OR REPLACE FUNCTION public.remove_round_cross_bet(p_cross_bet_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_actor uuid := public.get_my_profile_id();
  v_cb round_cross_bets%ROWTYPE;
  v_status round_status;
BEGIN
  SELECT * INTO v_cb FROM round_cross_bets WHERE id = p_cross_bet_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'cross_bet_not_found'; END IF;
  IF v_actor IS NULL OR v_actor NOT IN (v_cb.initiator_profile_id, v_cb.target_profile_id) THEN
    RAISE EXCEPTION 'not_a_party';
  END IF;
  SELECT status INTO v_status FROM rounds WHERE id = v_cb.round_id;
  IF v_status = 'completed' THEN RAISE EXCEPTION 'round_completed'; END IF;
  DELETE FROM round_players WHERE cross_bet_id = p_cross_bet_id AND is_cross_only = true;
  UPDATE round_players SET cross_bet_id = NULL WHERE cross_bet_id = p_cross_bet_id;
  DELETE FROM round_cross_bets WHERE id = p_cross_bet_id;
  UPDATE cross_bet_invitations SET status = 'cancelled', responded_at = now() WHERE id = v_cb.invitation_id;
END $$;
REVOKE ALL ON FUNCTION public.remove_round_cross_bet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_round_cross_bet(uuid) TO authenticated;