CREATE OR REPLACE FUNCTION public.can_create_round_as_organizer()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid; v_tier text; v_expires_at timestamptz; v_count int;
  v_paywall_date timestamptz := '2026-10-05T06:00:00Z';
BEGIN
  IF now() < v_paywall_date THEN RETURN true; END IF;
  SELECT id, subscription_tier, subscription_expires_at INTO v_profile_id, v_tier, v_expires_at FROM profiles WHERE user_id = auth.uid();
  IF v_profile_id IS NULL THEN RETURN false; END IF;
  IF v_tier = 'pro' AND (v_expires_at IS NULL OR v_expires_at > now()) THEN RETURN true; END IF;
  SELECT COUNT(*) INTO v_count FROM rounds WHERE organizer_id = v_profile_id AND status = 'completed';
  RETURN v_count < 12;
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_access_full_history()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid; v_tier text; v_expires_at timestamptz; v_count int;
  v_paywall_date timestamptz := '2026-10-05T06:00:00Z';
BEGIN
  IF now() < v_paywall_date THEN RETURN true; END IF;
  SELECT id, subscription_tier, subscription_expires_at INTO v_profile_id, v_tier, v_expires_at FROM profiles WHERE user_id = auth.uid();
  IF v_profile_id IS NULL THEN RETURN false; END IF;
  IF v_tier = 'pro' AND (v_expires_at IS NULL OR v_expires_at > now()) THEN RETURN true; END IF;
  SELECT COUNT(DISTINCT r.id) INTO v_count FROM rounds r INNER JOIN round_players rp ON rp.round_id = r.id
    WHERE rp.profile_id = v_profile_id AND r.status = 'completed';
  RETURN v_count < 4;
END;
$function$;

CREATE OR REPLACE FUNCTION public.both_players_can_cross(p_profile_a uuid, p_profile_b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (
    NOW() < TIMESTAMPTZ '2026-10-05T00:00:00-06:00'
    OR (
      EXISTS (SELECT 1 FROM profiles WHERE id = p_profile_a AND subscription_tier = 'pro')
      AND EXISTS (SELECT 1 FROM profiles WHERE id = p_profile_b AND subscription_tier = 'pro')
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_create_leaderboard()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid; v_tier text; v_expires_at timestamptz; v_is_founder boolean;
  v_paywall_date timestamptz := '2026-10-05T06:00:00Z';
BEGIN
  IF now() < v_paywall_date THEN RETURN true; END IF;
  SELECT id, subscription_tier, subscription_expires_at, COALESCE(is_founder, false)
    INTO v_profile_id, v_tier, v_expires_at, v_is_founder FROM profiles WHERE user_id = auth.uid();
  IF v_profile_id IS NULL THEN RETURN false; END IF;
  IF v_is_founder THEN RETURN true; END IF;
  IF v_tier = 'pro' AND (v_expires_at IS NULL OR v_expires_at > now()) THEN RETURN true; END IF;
  RETURN false;
END;
$function$;