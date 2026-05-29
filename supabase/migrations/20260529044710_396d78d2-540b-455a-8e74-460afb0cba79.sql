
-- Per-player attestation model
ALTER TABLE public.round_players
  ADD COLUMN IF NOT EXISTS attested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attested_at TIMESTAMPTZ;

DROP FUNCTION IF EXISTS public.attest_round(UUID);
DROP FUNCTION IF EXISTS public.get_pending_attestations();

-- Attest a single player's score in a round.
CREATE OR REPLACE FUNCTION public.attest_round_player(p_round_player_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_profile_id UUID := public.get_my_profile_id();
  v_round_id UUID;
  v_target_profile UUID;
  v_status TEXT;
  v_already UUID;
  v_target_ghost BOOLEAN;
BEGIN
  IF v_actor_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT rp.round_id, rp.profile_id, rp.attested_by, COALESCE(p.is_ghost,false)
    INTO v_round_id, v_target_profile, v_already, v_target_ghost
  FROM public.round_players rp
  LEFT JOIN public.profiles p ON p.id = rp.profile_id
  WHERE rp.id = p_round_player_id;

  IF v_round_id IS NULL THEN RAISE EXCEPTION 'player_not_found'; END IF;
  IF v_target_profile IS NULL OR v_target_ghost THEN RAISE EXCEPTION 'target_not_attestable'; END IF;
  IF v_already IS NOT NULL THEN RAISE EXCEPTION 'already_attested'; END IF;
  IF v_target_profile = v_actor_profile_id THEN RAISE EXCEPTION 'cannot_attest_self'; END IF;

  SELECT status::TEXT INTO v_status FROM public.rounds WHERE id = v_round_id;
  IF v_status <> 'completed' THEN RAISE EXCEPTION 'round_not_completed'; END IF;

  -- Caller must be a non-ghost participant (organizer or any player) of this round.
  IF NOT EXISTS (
    SELECT 1 FROM public.round_players rp2
    JOIN public.profiles p2 ON p2.id = rp2.profile_id
    WHERE rp2.round_id = v_round_id
      AND rp2.profile_id = v_actor_profile_id
      AND COALESCE(p2.is_ghost,false) = false
  ) THEN RAISE EXCEPTION 'not_a_participant'; END IF;

  UPDATE public.round_players
     SET attested_by = v_actor_profile_id, attested_at = now()
   WHERE id = p_round_player_id;

  UPDATE public.handicap_history
     SET is_attested = true
   WHERE round_id = v_round_id AND profile_id = v_target_profile;
END;
$$;
GRANT EXECUTE ON FUNCTION public.attest_round_player(UUID) TO authenticated;

-- Return one row per round with pending players (excluding caller).
CREATE OR REPLACE FUNCTION public.get_pending_attestations()
RETURNS TABLE (
  round_id        UUID,
  round_date      DATE,
  course_name     TEXT,
  organizer_name  TEXT,
  pending_players JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_profile_id UUID := public.get_my_profile_id();
BEGIN
  IF v_actor_profile_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.date,
    gc.name,
    org.display_name,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'round_player_id', rp.id,
        'profile_id',      rp.profile_id,
        'name',            COALESCE(p.display_name, 'Jugador'),
        'total_strokes',   COALESCE((
          SELECT SUM(hs.strokes)::INTEGER
          FROM public.hole_scores hs
          WHERE hs.round_player_id = rp.id AND hs.confirmed = true
        ), 0)
      ) ORDER BY p.display_name)
      FROM public.round_players rp
      LEFT JOIN public.profiles p ON p.id = rp.profile_id
      WHERE rp.round_id = r.id
        AND rp.profile_id IS NOT NULL
        AND rp.profile_id <> v_actor_profile_id
        AND COALESCE(p.is_ghost,false) = false
        AND rp.attested_by IS NULL
    ), '[]'::jsonb)
  FROM public.rounds r
  JOIN public.golf_courses gc ON gc.id = r.course_id
  JOIN public.profiles org    ON org.id = r.organizer_id
  WHERE r.status = 'completed'
    -- caller is a non-ghost participant of this round
    AND EXISTS (
      SELECT 1 FROM public.round_players rpm
      JOIN public.profiles pm ON pm.id = rpm.profile_id
      WHERE rpm.round_id = r.id
        AND rpm.profile_id = v_actor_profile_id
        AND COALESCE(pm.is_ghost,false) = false
    )
    -- at least one other player still pending
    AND EXISTS (
      SELECT 1 FROM public.round_players rpx
      JOIN public.profiles px ON px.id = rpx.profile_id
      WHERE rpx.round_id = r.id
        AND rpx.profile_id IS NOT NULL
        AND rpx.profile_id <> v_actor_profile_id
        AND COALESCE(px.is_ghost,false) = false
        AND rpx.attested_by IS NULL
    )
  ORDER BY r.date DESC, r.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_pending_attestations() TO authenticated;
