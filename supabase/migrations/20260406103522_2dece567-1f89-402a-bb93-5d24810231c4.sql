
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (
    (user_id = auth.uid() AND is_ghost = false)
    OR is_ghost = true
  );
