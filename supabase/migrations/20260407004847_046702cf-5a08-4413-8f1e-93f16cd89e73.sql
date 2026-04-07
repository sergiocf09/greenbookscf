CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT id INTO v_profile_id FROM profiles WHERE user_id = v_user_id;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado';
  END IF;

  -- Anonimizar el profile: desvincula identidad pero preserva
  -- el registro para mantener integridad del historial de terceros
  UPDATE profiles SET
    display_name = 'Usuario eliminado',
    initials = 'XX',
    user_id = NULL,
    avatar_color = '#888888',
    updated_at = now()
  WHERE id = v_profile_id;

  -- Eliminar membresías activas (no afecta historial de rondas)
  DELETE FROM money_ranking_members WHERE profile_id = v_profile_id;
  DELETE FROM guest_sessions WHERE ghost_profile_id = v_profile_id;
  DELETE FROM leaderboard_participants WHERE profile_id = v_profile_id;

  -- Eliminar credenciales de autenticación — acción irreversible
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;