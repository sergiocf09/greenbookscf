DROP POLICY IF EXISTS "Round participants can view guest sessions" ON public.guest_sessions;
CREATE POLICY "Round participants can view guest sessions"
ON public.guest_sessions
FOR SELECT
TO authenticated
USING (is_round_organizer(round_id) OR is_round_participant(round_id));

REVOKE SELECT ON public.guest_sessions FROM anon;