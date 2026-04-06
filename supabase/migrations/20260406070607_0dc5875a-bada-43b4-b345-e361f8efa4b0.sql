
CREATE OR REPLACE FUNCTION public.join_round_as_guest(
  p_round_id uuid,
  p_display_name text,
  p_group_id uuid DEFAULT NULL,
  p_auth_uid uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_initials text;
  v_avatar_color text;
  v_ghost_profile_id uuid;
  v_session_id uuid;
  v_round_player_id uuid;
  v_target_group_id uuid;
  v_colors text[] := ARRAY['#3B82F6','#EF4444','#10B981','#F59E0B','#8B5CF6','#EC4899','#06B6D4','#F97316'];
BEGIN
  -- Validate round exists and is not completed
  IF NOT EXISTS (SELECT 1 FROM rounds WHERE id = p_round_id AND status != 'completed') THEN
    RAISE EXCEPTION 'Ronda no encontrada o ya finalizada';
  END IF;

  -- Calculate initials
  v_initials := upper(
    left(split_part(trim(p_display_name), ' ', 1), 1) ||
    COALESCE(NULLIF(left(split_part(trim(p_display_name), ' ', 2), 1), ''), '')
  );

  -- Random color
  v_avatar_color := v_colors[1 + floor(random() * array_length(v_colors, 1))::int];

  -- Determine target group
  IF p_group_id IS NOT NULL THEN
    v_target_group_id := p_group_id;
  ELSE
    SELECT id INTO v_target_group_id FROM round_groups WHERE round_id = p_round_id ORDER BY group_number LIMIT 1;
  END IF;

  IF v_target_group_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró grupo para la ronda';
  END IF;

  -- 1. Create ghost profile (linked to anon auth user if provided)
  INSERT INTO profiles (display_name, initials, avatar_color, user_id, is_ghost, current_handicap)
  VALUES (p_display_name, v_initials, v_avatar_color, p_auth_uid, true, 20.0)
  RETURNING id INTO v_ghost_profile_id;

  -- 2. Create guest session
  INSERT INTO guest_sessions (round_id, ghost_profile_id)
  VALUES (p_round_id, v_ghost_profile_id)
  RETURNING id INTO v_session_id;

  -- 3. Create round_player
  INSERT INTO round_players (round_id, group_id, profile_id, guest_name, guest_initials, guest_color, handicap_for_round, is_organizer)
  VALUES (p_round_id, v_target_group_id, v_ghost_profile_id, p_display_name, v_initials, v_avatar_color, 20.0, false)
  RETURNING id INTO v_round_player_id;

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'ghost_profile_id', v_ghost_profile_id,
    'round_player_id', v_round_player_id
  );
END;
$$;

-- Grant to both anon and authenticated
GRANT EXECUTE ON FUNCTION public.join_round_as_guest(uuid, text, uuid, uuid) TO anon, authenticated;
