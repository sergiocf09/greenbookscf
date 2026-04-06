
-- =============================================================
-- FIX 1: Tighten guest_sessions UPDATE policy
-- Only round organizers can update guest sessions directly
-- (The convert_ghost_to_profile RPC uses SECURITY DEFINER and bypasses RLS)
-- =============================================================

DROP POLICY IF EXISTS "Anyone can update guest sessions" ON public.guest_sessions;

CREATE POLICY "Organizer can update guest sessions"
  ON public.guest_sessions FOR UPDATE
  TO authenticated
  USING (is_round_organizer(round_id))
  WITH CHECK (is_round_organizer(round_id));

-- =============================================================
-- FIX 2: Tighten guest_sessions INSERT policy
-- Block direct inserts; all inserts go through join_round_as_guest RPC (SECURITY DEFINER)
-- =============================================================

DROP POLICY IF EXISTS "Anyone can create guest sessions" ON public.guest_sessions;

CREATE POLICY "No direct inserts to guest sessions"
  ON public.guest_sessions FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

-- =============================================================
-- FIX 3: Fix ghost profile user_id exposure
-- Null out user_id on any ghost profiles that were converted
-- (converted ghosts should have is_ghost=false; if they still have user_id + is_ghost=true, clean up)
-- =============================================================

UPDATE public.profiles 
SET user_id = NULL 
WHERE is_ghost = true AND user_id IS NOT NULL;

-- Tighten the ghost profile SELECT policy to never return rows where is_ghost=true AND user_id IS NOT NULL
-- (defense in depth - even if data gets dirty again)
DROP POLICY IF EXISTS "Anyone can view ghost profiles" ON public.profiles;

CREATE POLICY "Anyone can view ghost profiles"
  ON public.profiles FOR SELECT
  TO anon, authenticated
  USING (is_ghost = true AND user_id IS NULL);
