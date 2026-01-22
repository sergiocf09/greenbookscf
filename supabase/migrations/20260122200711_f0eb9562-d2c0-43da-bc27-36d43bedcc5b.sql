CREATE OR REPLACE FUNCTION public.create_round(p_course_id uuid, p_tee_color text, p_date date, p_bet_config jsonb)
 RETURNS TABLE(round_id uuid, group_id uuid, round_player_id uuid, organizer_profile_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- For now, every new round starts at 0 handicap until USGA-based calculation is enabled.
  v_handicap := 0;

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
$function$;