-- =============================================
-- FRIENDSHIPS TABLE
-- =============================================
CREATE TABLE public.friendships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active',
  
  -- Constraints
  CONSTRAINT friendships_no_self_friend CHECK (owner_profile_id != friend_profile_id),
  CONSTRAINT friendships_unique_pair UNIQUE (owner_profile_id, friend_profile_id)
);

-- Enable RLS
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own friendships"
ON public.friendships
FOR SELECT
USING (owner_profile_id = get_my_profile_id());

CREATE POLICY "Users can create their own friendships"
ON public.friendships
FOR INSERT
WITH CHECK (owner_profile_id = get_my_profile_id());

CREATE POLICY "Users can delete their own friendships"
ON public.friendships
FOR DELETE
USING (owner_profile_id = get_my_profile_id());

-- Index for faster lookups
CREATE INDEX idx_friendships_owner ON public.friendships(owner_profile_id);
CREATE INDEX idx_friendships_friend ON public.friendships(friend_profile_id);

-- =============================================
-- SEARCH PROFILES RPC (partial match by name or email)
-- =============================================
CREATE OR REPLACE FUNCTION public.search_profiles(p_query TEXT)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  initials TEXT,
  avatar_color TEXT,
  current_handicap NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_my_profile_id UUID;
  v_search_pattern TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_my_profile_id := get_my_profile_id();
  v_search_pattern := '%' || LOWER(TRIM(p_query)) || '%';

  RETURN QUERY
  SELECT 
    p.id,
    p.display_name,
    p.initials,
    p.avatar_color,
    p.current_handicap
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id
  WHERE p.id != v_my_profile_id
    AND (
      LOWER(p.display_name) LIKE v_search_pattern
      OR LOWER(u.email) LIKE v_search_pattern
    )
  ORDER BY p.display_name
  LIMIT 20;
END;
$$;

-- =============================================
-- GET FRIENDS WITH PROFILE DATA
-- =============================================
CREATE OR REPLACE FUNCTION public.get_my_friends()
RETURNS TABLE (
  friendship_id UUID,
  friend_profile_id UUID,
  display_name TEXT,
  initials TEXT,
  avatar_color TEXT,
  current_handicap NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_my_profile_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_my_profile_id := get_my_profile_id();

  RETURN QUERY
  SELECT 
    f.id AS friendship_id,
    f.friend_profile_id,
    p.display_name,
    p.initials,
    p.avatar_color,
    p.current_handicap,
    f.created_at
  FROM public.friendships f
  JOIN public.profiles p ON p.id = f.friend_profile_id
  WHERE f.owner_profile_id = v_my_profile_id
    AND f.status = 'active'
  ORDER BY p.display_name;
END;
$$;