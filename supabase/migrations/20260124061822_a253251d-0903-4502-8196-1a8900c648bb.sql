-- RPC helpers for inviting/joining rounds without requiring prior RLS access.
-- These functions are SECURITY DEFINER and return limited information to avoid broad data exposure.

CREATE OR REPLACE FUNCTION public.resolve_round_id_by_code(p_code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT r.id
  FROM public.rounds r
  WHERE lower(r.id::text) LIKE lower(trim(p_code)) || '%'
    AND r.status IN ('setup','in_progress')
  ORDER BY r.created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_round_invite_info(p_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_round record;
  v_course record;
  v_organizer_name text;
  v_players jsonb;
BEGIN
  SELECT id, date, tee_color, status, course_id, organizer_id
  INTO v_round
  FROM public.rounds
  WHERE id = p_round_id;

  IF v_round.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Only expose non-sensitive info for invites
  SELECT name, location
  INTO v_course
  FROM public.golf_courses
  WHERE id = v_round.course_id;

  SELECT display_name
  INTO v_organizer_name
  FROM public.profiles
  WHERE id = v_round.organizer_id;

  -- Expose only joined registered players' public fields (no user_id)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'display_name', p.display_name,
        'initials', p.initials,
        'avatar_color', p.avatar_color
      )
    ),
    '[]'::jsonb
  )
  INTO v_players
  FROM public.round_players rp
  JOIN public.profiles p ON p.id = rp.profile_id
  WHERE rp.round_id = p_round_id
    AND rp.profile_id IS NOT NULL;

  RETURN jsonb_build_object(
    'id', v_round.id,
    'date', v_round.date,
    'tee_color', v_round.tee_color,
    'status', v_round.status,
    'course', jsonb_build_object(
      'name', COALESCE(v_course.name, 'Desconocido'),
      'location', COALESCE(v_course.location, '')
    ),
    'organizer', jsonb_build_object(
      'display_name', COALESCE(v_organizer_name, 'Organizador')
    ),
    'players', v_players
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.join_round(p_round_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile_id uuid;
  v_group_id uuid;
  v_existing uuid;
  v_status public.round_status;
  v_new_id uuid;
  v_handicap numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Resolve caller profile
  SELECT public.get_my_profile_id() INTO v_profile_id;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for current user';
  END IF;

  -- Only allow joining active rounds
  SELECT status INTO v_status FROM public.rounds WHERE id = p_round_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Round not found';
  END IF;
  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'Round is completed';
  END IF;

  -- Already joined?
  SELECT id INTO v_existing
  FROM public.round_players
  WHERE round_id = p_round_id
    AND profile_id = v_profile_id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Join first group (lowest group_number)
  SELECT id INTO v_group_id
  FROM public.round_groups
  WHERE round_id = p_round_id
  ORDER BY group_number ASC
  LIMIT 1;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'No group found for round';
  END IF;

  SELECT current_handicap INTO v_handicap FROM public.profiles WHERE id = v_profile_id;
  IF v_handicap IS NULL OR v_handicap < 0 OR v_handicap > 54 THEN
    v_handicap := 0;
  END IF;

  INSERT INTO public.round_players (round_id, group_id, profile_id, handicap_for_round, is_organizer)
  VALUES (p_round_id, v_group_id, v_profile_id, v_handicap, false)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;
