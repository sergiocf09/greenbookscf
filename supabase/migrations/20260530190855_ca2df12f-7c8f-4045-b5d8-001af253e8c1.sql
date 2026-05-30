
-- Server-side entitlement function for leaderboard creation
CREATE OR REPLACE FUNCTION public.can_create_leaderboard()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile_id uuid;
  v_tier text;
  v_expires_at timestamptz;
  v_is_founder boolean;
  v_paywall_date timestamptz := '2026-06-13T06:00:00Z';
BEGIN
  IF now() < v_paywall_date THEN RETURN true; END IF;

  SELECT id, subscription_tier, subscription_expires_at, COALESCE(is_founder, false)
    INTO v_profile_id, v_tier, v_expires_at, v_is_founder
    FROM profiles WHERE user_id = auth.uid();

  IF v_profile_id IS NULL THEN RETURN false; END IF;
  IF v_is_founder THEN RETURN true; END IF;

  IF v_tier = 'pro' AND (v_expires_at IS NULL OR v_expires_at > now()) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_create_leaderboard() TO authenticated;

-- Enforce entitlement on leaderboard_events INSERT
DROP POLICY IF EXISTS "Creator can insert leaderboard events" ON public.leaderboard_events;
CREATE POLICY "Creator can insert leaderboard events"
  ON public.leaderboard_events
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = get_my_profile_id() AND can_create_leaderboard());
