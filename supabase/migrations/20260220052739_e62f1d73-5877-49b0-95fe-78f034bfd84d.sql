
-- Fix LIKE wildcard injection in search_profiles by escaping special characters
CREATE OR REPLACE FUNCTION public.search_profiles(p_query text)
 RETURNS TABLE(id uuid, display_name text, initials text, avatar_color text, current_handicap numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_my_profile_id UUID;
  v_escaped_query TEXT;
  v_search_pattern TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Require at least 2 meaningful (non-wildcard) characters to prevent enumeration
  v_escaped_query := LOWER(TRIM(p_query));
  IF LENGTH(regexp_replace(v_escaped_query, '[%_\s]', '', 'g')) < 2 THEN
    RAISE EXCEPTION 'Search term too short';
  END IF;

  -- Escape LIKE special characters to prevent wildcard injection
  v_escaped_query := regexp_replace(v_escaped_query, '([%_\\])', '\\\1', 'g');
  v_search_pattern := '%' || v_escaped_query || '%';

  v_my_profile_id := get_my_profile_id();

  -- Only search by display_name to prevent email enumeration
  RETURN QUERY
  SELECT 
    p.id,
    p.display_name,
    p.initials,
    p.avatar_color,
    p.current_handicap
  FROM public.profiles p
  WHERE p.id != v_my_profile_id
    AND LOWER(p.display_name) LIKE v_search_pattern
  ORDER BY p.display_name
  LIMIT 20;
END;
$function$;
