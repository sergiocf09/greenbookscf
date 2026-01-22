-- Create a security-definer RPC to create a round + default group + organizer player in one atomic call.
-- This avoids client-side multi-step inserts and RLS edge cases.

CREATE OR REPLACE FUNCTION public.create_round(
  p_course_id uuid,
  p_tee_color text,
  p_date date,
  p_bet_config jsonb
)
RETURNS TABLE (
  round_id uuid,
  group_id uuid,
  round_player_id uuid,
  organizer_profile_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round_id uuid;
  v_group_id uuid;
  v_round_player_id uuid;
  v_profile_id uuid;
  v_handicap numeric;
BEGIN
  -- Must be authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Resolve caller profile
  SELECT public.get_my_profile_id() INTO v_profile_id;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for current user';
  END IF;

  -- Fetch current handicap from profiles
  SELECT p.current_handicap INTO v_handicap
  FROM public.profiles p
  WHERE p.id = v_profile_id;

  INSERT INTO public.rounds (course_id, organizer_id, tee_color, date, status, bet_config)
  VALUES (p_course_id, v_profile_id, COALESCE(p_tee_color, 'white'), COALESCE(p_date, CURRENT_DATE), 'setup', COALESCE(p_bet_config, '{}'::jsonb))
  RETURNING id INTO v_round_id;

  INSERT INTO public.round_groups (round_id, group_number)
  VALUES (v_round_id, 1)
  RETURNING id INTO v_group_id;

  INSERT INTO public.round_players (round_id, group_id, profile_id, handicap_for_round, is_organizer)
  VALUES (v_round_id, v_group_id, v_profile_id, COALESCE(v_handicap, 0), true)
  RETURNING id INTO v_round_player_id;

  round_id := v_round_id;
  group_id := v_group_id;
  round_player_id := v_round_player_id;
  organizer_profile_id := v_profile_id;
  RETURN NEXT;
END;
$$;

-- Ensure authenticated users can call the function
REVOKE ALL ON FUNCTION public.create_round(uuid, text, date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_round(uuid, text, date, jsonb) TO authenticated;
