
DROP FUNCTION IF EXISTS public.convert_ghost_to_profile(uuid, uuid);

CREATE FUNCTION public.convert_ghost_to_profile(p_session_id uuid, p_auth_uid uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session guest_sessions%ROWTYPE;
  v_trigger_profile_id uuid;
BEGIN
  SELECT * INTO v_session FROM guest_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesión no encontrada'; END IF;
  IF v_session.converted_profile_id IS NOT NULL THEN
    RAISE EXCEPTION 'Sesión ya convertida';
  END IF;
  IF v_session.conversion_deadline IS NOT NULL AND v_session.conversion_deadline < now() THEN
    RAISE EXCEPTION 'Período de conversión expirado';
  END IF;

  -- Delete the auto-created profile from handle_new_user trigger (if any)
  -- to avoid unique constraint violation on user_id
  SELECT id INTO v_trigger_profile_id
  FROM profiles
  WHERE user_id = p_auth_uid AND id != v_session.ghost_profile_id;
  
  IF v_trigger_profile_id IS NOT NULL THEN
    DELETE FROM profiles WHERE id = v_trigger_profile_id;
  END IF;

  -- Link ghost to real auth user
  UPDATE profiles
  SET user_id = p_auth_uid, is_ghost = false
  WHERE id = v_session.ghost_profile_id AND is_ghost = true;

  -- Mark session as converted
  UPDATE guest_sessions
  SET converted_profile_id = v_session.ghost_profile_id
  WHERE id = p_session_id;

  RETURN v_session.ghost_profile_id::text;
END;
$$;
