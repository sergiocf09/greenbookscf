
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS attested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attested_at TIMESTAMPTZ;

ALTER TABLE public.handicap_history
  ADD COLUMN IF NOT EXISTS is_attested BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.attest_round(p_round_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organizer_id UUID;
  v_status TEXT;
  v_attested_by UUID;
  v_actor_profile_id UUID := public.get_my_profile_id();
BEGIN
  IF v_actor_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT organizer_id, status::TEXT, attested_by
    INTO v_organizer_id, v_status, v_attested_by
  FROM public.rounds WHERE id = p_round_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'round_not_found'; END IF;
  IF v_status != 'completed' THEN RAISE EXCEPTION 'round_not_completed'; END IF;
  IF v_attested_by IS NOT NULL THEN RAISE EXCEPTION 'already_attested'; END IF;
  IF v_organizer_id = v_actor_profile_id THEN RAISE EXCEPTION 'organizer_cannot_attest'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.round_players rp
    JOIN public.profiles p ON p.id = rp.profile_id
    WHERE rp.round_id = p_round_id
      AND rp.profile_id = v_actor_profile_id
      AND p.is_ghost = false
  ) THEN RAISE EXCEPTION 'not_a_participant'; END IF;

  UPDATE public.rounds
     SET attested_by = v_actor_profile_id, attested_at = now()
   WHERE id = p_round_id;

  UPDATE public.handicap_history
     SET is_attested = true
   WHERE round_id = p_round_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.attest_round(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_pending_attestations()
RETURNS TABLE (
  round_id         UUID,
  round_date       DATE,
  course_name      TEXT,
  organizer_name   TEXT,
  player_names     TEXT[],
  my_total_strokes INTEGER
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
    ARRAY(
      SELECT COALESCE(p2.display_name, 'Jugador')
      FROM public.round_players rp2
      LEFT JOIN public.profiles p2 ON p2.id = rp2.profile_id
      WHERE rp2.round_id = r.id
        AND rp2.profile_id IS NOT NULL
        AND rp2.profile_id <> v_actor_profile_id
      ORDER BY p2.display_name
    ),
    (
      SELECT COALESCE(SUM(hs.strokes), 0)::INTEGER
      FROM public.round_players rp3
      JOIN public.hole_scores hs ON hs.round_player_id = rp3.id
      WHERE rp3.round_id = r.id
        AND rp3.profile_id = v_actor_profile_id
        AND hs.confirmed = true
    )
  FROM public.rounds r
  JOIN public.golf_courses gc ON gc.id = r.course_id
  JOIN public.profiles org ON org.id = r.organizer_id
  WHERE r.status = 'completed'
    AND r.attested_by IS NULL
    AND r.organizer_id <> v_actor_profile_id
    AND EXISTS (
      SELECT 1 FROM public.round_players rp
      JOIN public.profiles pp ON pp.id = rp.profile_id
      WHERE rp.round_id = r.id
        AND rp.profile_id = v_actor_profile_id
        AND pp.is_ghost = false
    )
  ORDER BY r.date DESC, r.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_pending_attestations() TO authenticated;
