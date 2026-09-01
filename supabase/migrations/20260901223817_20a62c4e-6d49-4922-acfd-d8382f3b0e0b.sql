-- 1) convert_ghost_to_profile: require caller ownership
CREATE OR REPLACE FUNCTION public.convert_ghost_to_profile(p_session_id uuid, p_auth_uid uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session guest_sessions%ROWTYPE;
  v_trigger_profile_id uuid;
BEGIN
  -- Only the backend (service_role) or the authenticated owner of p_auth_uid may convert
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Autenticación requerida';
    END IF;
    IF p_auth_uid IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'No autorizado';
    END IF;
  END IF;

  SELECT * INTO v_session FROM guest_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesión no encontrada'; END IF;
  IF v_session.converted_profile_id IS NOT NULL THEN
    RAISE EXCEPTION 'Sesión ya convertida';
  END IF;
  IF v_session.conversion_deadline IS NOT NULL AND v_session.conversion_deadline < now() THEN
    RAISE EXCEPTION 'Período de conversión expirado';
  END IF;

  SELECT id INTO v_trigger_profile_id
  FROM profiles
  WHERE user_id = p_auth_uid AND id != v_session.ghost_profile_id;

  IF v_trigger_profile_id IS NOT NULL THEN
    DELETE FROM profiles WHERE id = v_trigger_profile_id;
  END IF;

  UPDATE profiles
  SET user_id = p_auth_uid, is_ghost = false
  WHERE id = v_session.ghost_profile_id AND is_ghost = true;

  UPDATE guest_sessions
  SET converted_profile_id = v_session.ghost_profile_id
  WHERE id = p_session_id;

  RETURN v_session.ghost_profile_id::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.convert_ghost_to_profile(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_ghost_to_profile(uuid, uuid) TO authenticated, service_role;

-- 2) profiles: block privileged column changes declaratively (defense in depth with trigger)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles old
    WHERE old.id = profiles.id
      AND old.subscription_tier IS NOT DISTINCT FROM profiles.subscription_tier
      AND old.subscription_expires_at IS NOT DISTINCT FROM profiles.subscription_expires_at
      AND old.is_founder IS NOT DISTINCT FROM profiles.is_founder
      AND old.is_ghost IS NOT DISTINCT FROM profiles.is_ghost
  )
);

-- 3) round_players: self-update limited to tee_color
DROP POLICY IF EXISTS "Participants can update their own tee color" ON public.round_players;
CREATE POLICY "Participants can update their own tee color"
ON public.round_players
FOR UPDATE
TO authenticated
USING (profile_id = public.get_my_profile_id() AND public.is_round_participant(round_id))
WITH CHECK (
  profile_id = public.get_my_profile_id()
  AND public.is_round_participant(round_id)
  AND EXISTS (
    SELECT 1 FROM public.round_players old
    WHERE old.id = round_players.id
      AND old.round_id IS NOT DISTINCT FROM round_players.round_id
      AND old.group_id IS NOT DISTINCT FROM round_players.group_id
      AND old.profile_id IS NOT DISTINCT FROM round_players.profile_id
      AND old.is_admin IS NOT DISTINCT FROM round_players.is_admin
      AND old.is_organizer IS NOT DISTINCT FROM round_players.is_organizer
      AND old.handicap_for_round IS NOT DISTINCT FROM round_players.handicap_for_round
      AND old.attested_by IS NOT DISTINCT FROM round_players.attested_by
      AND old.cross_bet_id IS NOT DISTINCT FROM round_players.cross_bet_id
  )
);