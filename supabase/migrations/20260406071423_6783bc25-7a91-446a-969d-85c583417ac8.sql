CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_display_name TEXT;
  v_initials TEXT;
  v_parts TEXT[];
BEGIN
  -- Skip anonymous users — ghost profiles are created by join_round_as_guest RPC
  IF NEW.is_anonymous = true THEN
    RETURN NEW;
  END IF;

  v_display_name := COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1));
  
  v_parts := string_to_array(v_display_name, ' ');
  
  IF array_length(v_parts, 1) >= 2 THEN
    v_initials := UPPER(LEFT(v_parts[1], 1) || LEFT(v_parts[2], 1));
  ELSE
    v_initials := UPPER(LEFT(v_display_name, 2));
  END IF;

  INSERT INTO public.profiles (user_id, display_name, initials, avatar_color)
  VALUES (
    NEW.id,
    v_display_name,
    v_initials,
    '#' || LPAD(TO_HEX((RANDOM() * 16777215)::INT), 6, '0')
  );
  
  INSERT INTO public.player_statistics (profile_id)
  SELECT id FROM public.profiles WHERE user_id = NEW.id;
  
  RETURN NEW;
END;
$function$;