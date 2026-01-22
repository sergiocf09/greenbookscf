-- Fix RLS for creating rounds: use helper function instead of direct comparison

DROP POLICY IF EXISTS "Authenticated users can create rounds" ON public.rounds;

CREATE POLICY "Authenticated users can create rounds"
ON public.rounds
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_own_profile(organizer_id)
);
