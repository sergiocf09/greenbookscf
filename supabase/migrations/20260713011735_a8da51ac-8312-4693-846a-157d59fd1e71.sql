
-- 1. Profiles: prevent self-elevation of subscription fields
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
     OR NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at
     OR NEW.is_founder IS DISTINCT FROM OLD.is_founder THEN
    RAISE EXCEPTION 'Not allowed to modify subscription fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 2. round_players: prevent self admin/handicap escalation
CREATE OR REPLACE FUNCTION public.prevent_round_player_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.is_round_organizer(NEW.round_id) THEN
    RETURN NEW;
  END IF;
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
     OR NEW.is_organizer IS DISTINCT FROM OLD.is_organizer
     OR NEW.handicap_for_round IS DISTINCT FROM OLD.handicap_for_round
     OR NEW.group_id IS DISTINCT FROM OLD.group_id
     OR NEW.round_id IS DISTINCT FROM OLD.round_id
     OR NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
    RAISE EXCEPTION 'Not allowed to modify privileged round_player fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_round_player_escalation ON public.round_players;
CREATE TRIGGER prevent_round_player_escalation
BEFORE UPDATE ON public.round_players
FOR EACH ROW EXECUTE FUNCTION public.prevent_round_player_escalation();

-- 3. course_visibility: organizer can only grant visibility to actual participants
DROP POLICY IF EXISTS "Organizer can insert visibility for participants" ON public.course_visibility;
CREATE POLICY "Organizer can insert visibility for participants"
ON public.course_visibility
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.rounds r
    JOIN public.round_players rp ON rp.round_id = r.id
    WHERE r.organizer_id = public.get_my_profile_id()
      AND r.course_id = course_visibility.course_id
      AND rp.profile_id = course_visibility.profile_id
  )
);

-- 4. Leaderboard visibility: restrict SELECT to members
CREATE OR REPLACE FUNCTION public.can_view_leaderboard(_leaderboard_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.leaderboard_events le
      WHERE le.id = _leaderboard_id
        AND le.created_by = public.get_my_profile_id()
    )
    OR EXISTS (
      SELECT 1 FROM public.leaderboard_participants lp
      WHERE lp.leaderboard_id = _leaderboard_id
        AND lp.profile_id = public.get_my_profile_id()
    )
    OR public.is_linked_round_organizer(_leaderboard_id);
$$;

DROP POLICY IF EXISTS "Authenticated can view leaderboard participants" ON public.leaderboard_participants;
CREATE POLICY "Members can view leaderboard participants"
ON public.leaderboard_participants
FOR SELECT
USING (public.can_view_leaderboard(leaderboard_id));

DROP POLICY IF EXISTS "Authenticated can view leaderboard scores" ON public.leaderboard_scores;
CREATE POLICY "Members can view leaderboard scores"
ON public.leaderboard_scores
FOR SELECT
USING (public.can_view_leaderboard(leaderboard_id));

DROP POLICY IF EXISTS "Authenticated can view leaderboard rounds" ON public.leaderboard_rounds;
CREATE POLICY "Members can view leaderboard rounds"
ON public.leaderboard_rounds
FOR SELECT
USING (public.can_view_leaderboard(leaderboard_id));

DROP POLICY IF EXISTS "Authenticated can view cup teams" ON public.cup_teams;
CREATE POLICY "Members can view cup teams"
ON public.cup_teams
FOR SELECT
USING (public.can_view_leaderboard(leaderboard_id));

-- 5. round_audit_log: only participants/organizers can insert
DROP POLICY IF EXISTS "Authenticated users can insert audit log" ON public.round_audit_log;
CREATE POLICY "Participants can insert audit log"
ON public.round_audit_log
FOR INSERT
WITH CHECK (
  public.is_round_participant(round_id) OR public.is_round_organizer(round_id)
);
