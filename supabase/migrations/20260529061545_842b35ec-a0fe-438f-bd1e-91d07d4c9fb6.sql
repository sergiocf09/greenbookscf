-- Fix audit log: use profile id (get_my_profile_id) instead of auth.uid()
DROP POLICY IF EXISTS "Participants can read audit log" ON public.round_audit_log;
DROP POLICY IF EXISTS "Authenticated users can insert audit log" ON public.round_audit_log;

CREATE POLICY "Participants can read audit log"
ON public.round_audit_log
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.round_players rp
    WHERE rp.round_id = round_audit_log.round_id
      AND rp.profile_id = public.get_my_profile_id()
  )
  OR EXISTS (
    SELECT 1 FROM public.rounds r
    WHERE r.id = round_audit_log.round_id
      AND r.organizer_id = public.get_my_profile_id()
  )
);

CREATE POLICY "Authenticated users can insert audit log"
ON public.round_audit_log
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.log_round_event(
  p_round_id         UUID,
  p_event_type       TEXT,
  p_payload          JSONB DEFAULT '{}',
  p_target_player_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID := public.get_my_profile_id();
BEGIN
  IF v_profile_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM rounds WHERE id = p_round_id AND organizer_id = v_profile_id)
    OR EXISTS (SELECT 1 FROM round_players WHERE round_id = p_round_id AND profile_id = v_profile_id)
  ) THEN
    RETURN;
  END IF;

  INSERT INTO round_audit_log (round_id, actor_id, event_type, target_player_id, payload)
  VALUES (p_round_id, v_profile_id, p_event_type, p_target_player_id, p_payload);
END;
$$;