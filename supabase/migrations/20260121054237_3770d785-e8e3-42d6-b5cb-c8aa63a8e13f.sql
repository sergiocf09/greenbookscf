-- Update handle_new_user function to use first letter of first name + first letter of last name
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
  v_display_name := COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1));
  
  -- Split display name into parts
  v_parts := string_to_array(v_display_name, ' ');
  
  -- Get first letter of first name + first letter of last name (or second part)
  IF array_length(v_parts, 1) >= 2 THEN
    v_initials := UPPER(LEFT(v_parts[1], 1) || LEFT(v_parts[2], 1));
  ELSE
    -- Fallback to first 2 letters if only one word
    v_initials := UPPER(LEFT(v_display_name, 2));
  END IF;

  INSERT INTO public.profiles (user_id, display_name, initials, avatar_color)
  VALUES (
    NEW.id,
    v_display_name,
    v_initials,
    '#' || LPAD(TO_HEX((RANDOM() * 16777215)::INT), 6, '0')
  );
  
  -- Also create statistics record
  INSERT INTO public.player_statistics (profile_id)
  SELECT id FROM public.profiles WHERE user_id = NEW.id;
  
  RETURN NEW;
END;
$function$;

-- Update existing profile for Sergio to have correct initials
UPDATE public.profiles 
SET initials = 'SC'
WHERE display_name LIKE 'Sergio%';