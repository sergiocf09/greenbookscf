
CREATE OR REPLACE FUNCTION public.reset_round_groups_and_players(p_round_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile_id uuid;
  v_organizer_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT public.get_my_profile_id() INTO v_profile_id;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for current user';
  END IF;

  SELECT organizer_id INTO v_organizer_id FROM public.rounds WHERE id = p_round_id;
  IF v_organizer_id IS NULL THEN
    RAISE EXCEPTION 'Round not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_organizer_id <> v_profile_id THEN
    RAISE EXCEPTION 'Only the round organizer can reset foursomes' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.round_players WHERE round_id = p_round_id;
  DELETE FROM public.round_groups  WHERE round_id = p_round_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_round_groups_and_players(uuid) TO authenticated;
