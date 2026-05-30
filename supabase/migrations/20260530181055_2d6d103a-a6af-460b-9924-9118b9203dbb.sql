-- 1. Columnas nuevas en round_players
ALTER TABLE public.round_players
  ADD COLUMN IF NOT EXISTS is_cross_only BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cross_bet_id  UUID,
  ADD COLUMN IF NOT EXISTS added_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Tabla de invitaciones de cruce
CREATE TABLE public.cross_bet_invitations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id              UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  initiator_profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_profile_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','accepted','declined','cancelled')),
  bet_config_proposal   JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at          TIMESTAMPTZ,
  CONSTRAINT cross_bet_invitations_no_self CHECK (initiator_profile_id != target_profile_id),
  UNIQUE (round_id, initiator_profile_id, target_profile_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cross_bet_invitations TO authenticated;
GRANT ALL ON public.cross_bet_invitations TO service_role;

ALTER TABLE public.cross_bet_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can view their cross invitations"
ON public.cross_bet_invitations FOR SELECT
USING (
  initiator_profile_id = public.get_my_profile_id()
  OR target_profile_id = public.get_my_profile_id()
);

-- 3. Tabla de cruces activos
CREATE TABLE public.round_cross_bets (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id          UUID NOT NULL REFERENCES public.cross_bet_invitations(id) ON DELETE CASCADE,
  round_id               UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  initiator_profile_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_profile_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_round_player_id UUID REFERENCES public.round_players(id) ON DELETE SET NULL,
  bet_config             JSONB NOT NULL DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, initiator_profile_id, target_profile_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.round_cross_bets TO authenticated;
GRANT ALL ON public.round_cross_bets TO service_role;

ALTER TABLE public.round_cross_bets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can view cross bets for their rounds"
ON public.round_cross_bets FOR SELECT
USING (
  initiator_profile_id = public.get_my_profile_id()
  OR target_profile_id = public.get_my_profile_id()
  OR public.is_round_participant(round_id)
);

-- FK diferida (ahora que round_cross_bets existe)
ALTER TABLE public.round_players
  ADD CONSTRAINT fk_round_players_cross_bet_id
  FOREIGN KEY (cross_bet_id) REFERENCES public.round_cross_bets(id) ON DELETE SET NULL;

-- 4. Helper de participación por profile_id
CREATE OR REPLACE FUNCTION public.is_round_participant_by_profile(p_round_id UUID, p_profile_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.round_players rp
    JOIN public.profiles pr ON pr.id = rp.profile_id
    WHERE rp.round_id = p_round_id AND rp.profile_id = p_profile_id
      AND (pr.is_ghost IS NULL OR pr.is_ghost = false)
  ) OR EXISTS (
    SELECT 1 FROM public.rounds r WHERE r.id = p_round_id AND r.organizer_id = p_profile_id
  );
$$;

-- 5. Helper de suscripción
CREATE OR REPLACE FUNCTION public.both_players_can_cross(p_profile_a UUID, p_profile_b UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (
    NOW() < TIMESTAMPTZ '2026-06-13T00:00:00-06:00'
    OR (
      EXISTS (SELECT 1 FROM profiles WHERE id = p_profile_a AND subscription_tier = 'pro')
      AND EXISTS (SELECT 1 FROM profiles WHERE id = p_profile_b AND subscription_tier = 'pro')
    )
  );
$$;

-- 6. RPC: send_cross_bet_invitation
CREATE OR REPLACE FUNCTION public.send_cross_bet_invitation(
  p_round_id UUID, p_target_profile_id UUID, p_bet_config_proposal JSONB DEFAULT '{}'
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  INSERT INTO cross_bet_invitations (round_id, initiator_profile_id, target_profile_id, bet_config_proposal)
  VALUES (p_round_id, v_actor_id, p_target_profile_id, p_bet_config_proposal)
  RETURNING id INTO v_inv_id;
  RETURN v_inv_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.send_cross_bet_invitation(UUID, UUID, JSONB) TO authenticated;

-- 7. RPC: accept_cross_bet_invitation
CREATE OR REPLACE FUNCTION public.accept_cross_bet_invitation(p_invitation_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  UPDATE round_players SET cross_bet_id = v_cb_id WHERE id = v_rp_id;
  RETURN v_cb_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.accept_cross_bet_invitation(UUID) TO authenticated;

-- 8. RPC: decline_cross_bet_invitation
CREATE OR REPLACE FUNCTION public.decline_cross_bet_invitation(p_invitation_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor_id UUID := public.get_my_profile_id();
  v_inv      cross_bet_invitations%ROWTYPE;
BEGIN
  SELECT * INTO v_inv FROM cross_bet_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
  IF v_inv.target_profile_id != v_actor_id THEN RAISE EXCEPTION 'not_the_target'; END IF;
  IF v_inv.status != 'pending' THEN RAISE EXCEPTION 'invitation_not_pending'; END IF;
  UPDATE cross_bet_invitations SET status = 'declined', responded_at = now() WHERE id = p_invitation_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.decline_cross_bet_invitation(UUID) TO authenticated;

-- 9. RPC: cancel_cross_bet_invitation
CREATE OR REPLACE FUNCTION public.cancel_cross_bet_invitation(p_invitation_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor_id UUID := public.get_my_profile_id();
  v_inv      cross_bet_invitations%ROWTYPE;
BEGIN
  SELECT * INTO v_inv FROM cross_bet_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
  IF v_inv.initiator_profile_id != v_actor_id THEN RAISE EXCEPTION 'not_the_initiator'; END IF;
  IF v_inv.status != 'pending' THEN RAISE EXCEPTION 'invitation_not_pending'; END IF;
  UPDATE cross_bet_invitations SET status = 'cancelled', responded_at = now() WHERE id = p_invitation_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_cross_bet_invitation(UUID) TO authenticated;

-- 10. RPC: get_my_pending_cross_invitations
CREATE OR REPLACE FUNCTION public.get_my_pending_cross_invitations()
RETURNS TABLE (invitation_id UUID, round_id UUID, initiator_profile_id UUID, initiator_name TEXT,
  initiator_initials TEXT, initiator_color TEXT, course_name TEXT, holes_played INT,
  bet_config_proposal JSONB, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor_id UUID := public.get_my_profile_id();
BEGIN
  RETURN QUERY
  SELECT cbi.id, cbi.round_id, cbi.initiator_profile_id, p.display_name, p.initials, p.avatar_color,
    COALESCE(gc.name, 'Campo'),
    COALESCE((SELECT COUNT(DISTINCT hs.hole_number)::int FROM round_players rp2
      JOIN hole_scores hs ON hs.round_player_id = rp2.id
      WHERE rp2.round_id = cbi.round_id AND rp2.profile_id = cbi.initiator_profile_id AND hs.confirmed = true), 0),
    cbi.bet_config_proposal, cbi.created_at
  FROM cross_bet_invitations cbi
  JOIN profiles p ON p.id = cbi.initiator_profile_id
  JOIN rounds r ON r.id = cbi.round_id
  LEFT JOIN golf_courses gc ON gc.id = r.course_id
  WHERE cbi.target_profile_id = v_actor_id AND cbi.status = 'pending'
  ORDER BY cbi.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_pending_cross_invitations() TO authenticated;

-- 11. RPC: get_cross_bets_for_round
CREATE OR REPLACE FUNCTION public.get_cross_bets_for_round(p_round_id UUID)
RETURNS TABLE (cross_bet_id UUID, initiator_profile_id UUID, initiator_name TEXT,
  initiator_initials TEXT, initiator_color TEXT, target_profile_id UUID, target_name TEXT,
  target_initials TEXT, target_color TEXT, target_round_player_id UUID, bet_config JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_round_participant(p_round_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY
  SELECT cb.id, cb.initiator_profile_id, pi.display_name, pi.initials, pi.avatar_color,
    cb.target_profile_id, pt.display_name, pt.initials, pt.avatar_color,
    cb.target_round_player_id, cb.bet_config
  FROM round_cross_bets cb
  JOIN profiles pi ON pi.id = cb.initiator_profile_id
  JOIN profiles pt ON pt.id = cb.target_profile_id
  WHERE cb.round_id = p_round_id ORDER BY cb.created_at;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_cross_bets_for_round(UUID) TO authenticated;