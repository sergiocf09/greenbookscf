
-- Create a security definer function to check ranking membership without RLS
CREATE OR REPLACE FUNCTION public.is_money_ranking_member(p_ranking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.money_ranking_members
    WHERE ranking_id = p_ranking_id
      AND profile_id = get_my_profile_id()
  )
$$;

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Ver rankings propios o donde soy miembro" ON public.money_rankings;
DROP POLICY IF EXISTS "Ver miembros de mis rankings" ON public.money_ranking_members;
DROP POLICY IF EXISTS "Creador agrega miembros" ON public.money_ranking_members;
DROP POLICY IF EXISTS "Salir o ser removido" ON public.money_ranking_members;

-- Recreate money_rankings SELECT policy using the security definer function
CREATE POLICY "Ver rankings propios o donde soy miembro"
  ON public.money_rankings FOR SELECT
  USING (
    creator_id = get_my_profile_id()
    OR is_money_ranking_member(id)
  );

-- Recreate money_ranking_members SELECT without referencing money_rankings
CREATE POLICY "Ver miembros de mis rankings"
  ON public.money_ranking_members FOR SELECT
  USING (
    profile_id = get_my_profile_id()
    OR is_money_ranking_member(ranking_id)
  );

-- Recreate INSERT policy using security definer approach
CREATE OR REPLACE FUNCTION public.is_money_ranking_creator(p_ranking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.money_rankings
    WHERE id = p_ranking_id
      AND creator_id = get_my_profile_id()
  )
$$;

CREATE POLICY "Creador agrega miembros"
  ON public.money_ranking_members FOR INSERT
  WITH CHECK (
    is_money_ranking_creator(ranking_id)
  );

-- Recreate DELETE policy
CREATE POLICY "Salir o ser removido"
  ON public.money_ranking_members FOR DELETE
  USING (
    profile_id = get_my_profile_id()
    OR is_money_ranking_creator(ranking_id)
  );
