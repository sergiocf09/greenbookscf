-- Fix 1: Add UPDATE policy for round_snapshots so upsert retries work
CREATE POLICY "Organizer can update snapshots"
ON public.round_snapshots
FOR UPDATE
USING (is_round_organizer(round_id))
WITH CHECK (is_round_organizer(round_id));

-- Fix 2: Clear the zombie lock using valid status 'failed'
UPDATE public.round_close_attempts
SET status = 'failed',
    ended_at = now(),
    error_message = 'Zombie lock cleared - process never completed'
WHERE id = '1b084290-367f-4f9f-adde-42ff1d3f86f0'
  AND status = 'started'
  AND ended_at IS NULL;