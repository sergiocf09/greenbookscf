DROP POLICY IF EXISTS "Authenticated users can create ghost profiles" ON public.profiles;

CREATE POLICY "Anyone can create ghost profiles"
ON public.profiles
FOR INSERT
TO public
WITH CHECK ((is_ghost = true) AND (user_id IS NULL));