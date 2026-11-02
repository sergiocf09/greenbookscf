CREATE OR REPLACE FUNCTION public.send_cross_bet_invitation(p_round_id uuid, p_target_profile_id uuid, p_bet_config_proposal jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id UUID := public.get_my_profile_id();
  v_inv_id   UUID;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_actor_id = p_target_profile_id THEN RAISE EXCEPTION 'cannot_invite_self'; END IF;
  IF NOT public.is_round_participant_by_profile(p_round_id, v_actor_id) THEN
    RAISE EXCEPTION 'initiator_not_in_round';
  END IF;
  IF NOT public.both_players_can_cross(v_actor_id, p_target_profile_id) THEN
    RAISE EXCEPTION 'subscription_required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM cross_bet_invitations
    WHERE round_id = p_round_id AND initiator_profile_id = v_actor_id
      AND target_profile_id = p_target_profile_id AND status = 'pending'
  ) THEN RAISE EXCEPTION 'invitation_already_pending'; END IF;
  IF EXISTS (
    SELECT 1 FROM round_cross_bets
    WHERE round_id = p_round_id AND initiator_profile_id = v_actor_id
      AND target_profile_id = p_target_profile_id
  ) THEN RAISE EXCEPTION 'cross_bet_already_active'; END IF;
  -- Reuse a previously cancelled/declined/removed invitation instead of failing on the unique key
  INSERT INTO cross_bet_invitations (round_id, initiator_profile_id, target_profile_id, bet_config_proposal)
  VALUES (p_round_id, v_actor_id, p_target_profile_id, p_bet_config_proposal)
  ON CONFLICT (round_id, initiator_profile_id, target_profile_id) DO UPDATE
    SET status = 'pending', bet_config_proposal = EXCLUDED.bet_config_proposal,
        created_at = now(), responded_at = NULL
  RETURNING id INTO v_inv_id;
  RETURN v_inv_id;
END;
$function$;