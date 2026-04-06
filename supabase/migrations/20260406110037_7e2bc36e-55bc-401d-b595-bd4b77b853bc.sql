-- Restaurar política completa de profiles SELECT
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles of round participants" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can view ghost profiles" ON public.profiles;

-- Política unificada: cubre todos los casos válidos
CREATE POLICY "profiles_select_policy"
  ON public.profiles FOR SELECT
  USING (
    -- El usuario ve su propio profile real
    (user_id = auth.uid() AND is_ghost = false)
    -- El usuario ve profiles de jugadores en sus rondas
    OR (
      is_ghost = false
      AND id IN (
        SELECT rp.profile_id FROM public.round_players rp
        WHERE rp.round_id IN (
          SELECT rp2.round_id FROM public.round_players rp2
          WHERE rp2.profile_id IN (
            SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
          )
        )
        AND rp.profile_id IS NOT NULL
      )
    )
    -- Profiles fantasma visibles para todos (para scorecards)
    OR (is_ghost = true AND user_id IS NULL)
  );