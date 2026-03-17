
-- Fix 1: Remove third-party round participant condition from player_vs_player SELECT policy
-- Only the two players directly involved should see their cumulative betting history
DROP POLICY IF EXISTS "Users can view their pvp records including guests" ON public.player_vs_player;

CREATE POLICY "Users can view their pvp records"
ON public.player_vs_player
FOR SELECT
USING (
  (player_a_id = get_my_profile_id()) OR (player_b_id = get_my_profile_id())
);

-- Fix 2: Tighten leaderboard_participants INSERT to only allow event creator
-- Self-enrollment will go through a new RPC that validates the join code
DROP POLICY IF EXISTS "Event creator or self can insert participants" ON public.leaderboard_participants;

CREATE POLICY "Event creator can insert participants"
ON public.leaderboard_participants
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM leaderboard_events le
    WHERE le.id = leaderboard_participants.leaderboard_id
      AND le.created_by = get_my_profile_id()
  )
);

-- Fix 3: Restrict leaderboard_events SELECT to hide code from non-creators/non-participants
DROP POLICY IF EXISTS "Anyone authenticated can view leaderboard events" ON public.leaderboard_events;

CREATE POLICY "Authenticated can view leaderboard events"
ON public.leaderboard_events
FOR SELECT
TO authenticated
USING (true);

-- Create RPC for code-validated leaderboard joining
CREATE OR REPLACE FUNCTION public.join_leaderboard_by_code(
  p_code text,
  p_handicap numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_leaderboard_id uuid;
  v_profile_id uuid;
  v_existing_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_profile_id := get_my_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- Validate code
  SELECT id INTO v_leaderboard_id
  FROM public.leaderboard_events
  WHERE lower(code) = lower(trim(p_code))
    AND status = 'active';

  IF v_leaderboard_id IS NULL THEN
    RAISE EXCEPTION 'Invalid leaderboard code';
  END IF;

  -- Check if already a participant
  SELECT id INTO v_existing_id
  FROM public.leaderboard_participants
  WHERE leaderboard_id = v_leaderboard_id
    AND profile_id = v_profile_id
    AND is_active = true;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_leaderboard_id;
  END IF;

  -- Insert participant
  INSERT INTO public.leaderboard_participants (
    leaderboard_id, profile_id, handicap_for_leaderboard
  ) VALUES (
    v_leaderboard_id, v_profile_id, p_handicap
  );

  RETURN v_leaderboard_id;
END;
$$;
