DROP POLICY IF EXISTS "Authenticated can read ghost profiles" ON public.profiles;

CREATE POLICY "Authenticated can read ghost profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (is_ghost = true AND user_id IS NULL);