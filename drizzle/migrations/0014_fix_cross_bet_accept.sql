CREATE OR REPLACE FUNCTION public.enforce_round_players_self_update()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_round_organizer(NEW.round_id) THEN
    RETURN NEW;
  END IF;
  IF NEW.profile_id IS DISTINCT FROM OLD.profile_id
     OR NEW.round_id IS DISTINCT FROM OLD.round_id
     OR NEW.group_id IS DISTINCT FROM OLD.group_id
     OR NEW.handicap_for_round IS DISTINCT FROM OLD.handicap_for_round
     OR NEW.is_organizer IS DISTINCT FROM OLD.is_organizer
     OR NEW.is_admin IS DISTINCT FROM OLD.is_admin
     OR NEW.guest_name IS DISTINCT FROM OLD.guest_name
     OR NEW.guest_initials IS DISTINCT FROM OLD.guest_initials
     OR NEW.guest_color IS DISTINCT FROM OLD.guest_color
     OR (NEW.cross_bet_id IS DISTINCT FROM OLD.cross_bet_id
         AND COALESCE(current_setting('app.cross_bet_accept', true), '') <> 'on')
  THEN
    RAISE EXCEPTION 'Only tee_color can be updated by non-organizer participants';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.accept_cross_bet_invitation(p_invitation_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id UUID := public.get_my_profile_id();
  v_inv      cross_bet_invitations%ROWTYPE;
  v_rp_id    UUID;
  v_cb_id    UUID;
  v_group_id UUID;
BEGIN
  SELECT * INTO v_inv FROM cross_bet_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
  IF v_inv.target_profile_id != v_actor_id THEN RAISE EXCEPTION 'not_the_target'; END IF;
  IF v_inv.status != 'pending' THEN RAISE EXCEPTION 'invitation_not_pending'; END IF;
  IF NOT public.both_players_can_cross(v_inv.initiator_profile_id, v_actor_id) THEN
    RAISE EXCEPTION 'subscription_required';
  END IF;
  SELECT id INTO v_group_id FROM round_groups
  WHERE round_id = v_inv.round_id ORDER BY group_number ASC LIMIT 1;
  INSERT INTO round_players (round_id, profile_id, group_id, handicap_for_round, is_cross_only, added_by_profile_id)
  SELECT v_inv.round_id, v_actor_id, v_group_id, COALESCE(p.current_handicap, 0), true, v_inv.initiator_profile_id
  FROM profiles p WHERE p.id = v_actor_id
  RETURNING id INTO v_rp_id;
  UPDATE cross_bet_invitations SET status = 'accepted', responded_at = now() WHERE id = p_invitation_id;
  INSERT INTO round_cross_bets (invitation_id, round_id, initiator_profile_id, target_profile_id, target_round_player_id, bet_config)
  VALUES (p_invitation_id, v_inv.round_id, v_inv.initiator_profile_id, v_actor_id, v_rp_id, v_inv.bet_config_proposal)
  RETURNING id INTO v_cb_id;
  PERFORM set_config('app.cross_bet_accept', 'on', true);
  UPDATE round_players SET cross_bet_id = v_cb_id WHERE id = v_rp_id;
  PERFORM set_config('app.cross_bet_accept', '', true);
  RETURN v_cb_id;
END;
$function$;