ALTER TABLE public.cross_bet_invitations
  ADD COLUMN IF NOT EXISTS cancelled_by_profile_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS was_accepted boolean NOT NULL DEFAULT false;

UPDATE public.cross_bet_invitations i SET was_accepted = true
WHERE i.status = 'accepted' OR EXISTS (SELECT 1 FROM public.round_cross_bets c WHERE c.invitation_id = i.id);

CREATE OR REPLACE FUNCTION public.cancel_cross_bet_invitation(p_invitation_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id UUID := public.get_my_profile_id();
  v_inv      cross_bet_invitations%ROWTYPE;
BEGIN
  SELECT * INTO v_inv FROM cross_bet_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
  IF v_inv.initiator_profile_id != v_actor_id THEN RAISE EXCEPTION 'not_the_initiator'; END IF;
  IF v_inv.status != 'pending' THEN RAISE EXCEPTION 'invitation_not_pending'; END IF;
  UPDATE cross_bet_invitations SET status = 'cancelled', responded_at = now(),
    cancelled_by_profile_id = v_actor_id, was_accepted = false WHERE id = p_invitation_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_round_cross_bet(p_cross_bet_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  UPDATE cross_bet_invitations SET status = 'cancelled', responded_at = now(),
    cancelled_by_profile_id = v_actor, was_accepted = true WHERE id = v_cb.invitation_id;
END $function$;

CREATE OR REPLACE FUNCTION public.get_cancelled_cross_bets_for_round(p_round_id uuid)
 RETURNS TABLE(invitation_id uuid, initiator_profile_id uuid, initiator_name text, target_profile_id uuid, target_name text,
   cancelled_by_profile_id uuid, cancelled_by_name text, was_accepted boolean, cancelled_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_date date;
BEGIN
  IF NOT public.is_round_participant(p_round_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT r.date INTO v_date FROM rounds r WHERE r.id = p_round_id;
  RETURN QUERY
  SELECT i.id, i.initiator_profile_id, pi.display_name, i.target_profile_id, pt.display_name,
    i.cancelled_by_profile_id, pc.display_name, i.was_accepted, i.responded_at
  FROM cross_bet_invitations i
  JOIN profiles pi ON pi.id = i.initiator_profile_id
  JOIN profiles pt ON pt.id = i.target_profile_id
  LEFT JOIN profiles pc ON pc.id = i.cancelled_by_profile_id
  JOIN rounds orr ON orr.id = i.round_id
  WHERE i.status = 'cancelled'
    AND (i.round_id = p_round_id
      OR (orr.date = v_date AND EXISTS (SELECT 1 FROM round_players rp WHERE rp.round_id = p_round_id
            AND rp.profile_id = i.target_profile_id AND NOT rp.is_cross_only)))
  ORDER BY i.responded_at;
END $function$;

GRANT EXECUTE ON FUNCTION public.get_cancelled_cross_bets_for_round(uuid) TO authenticated;