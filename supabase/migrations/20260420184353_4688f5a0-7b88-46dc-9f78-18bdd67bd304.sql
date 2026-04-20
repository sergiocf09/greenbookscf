-- RPC 1: cerrar leaderboard (solo el creador)
CREATE OR REPLACE FUNCTION public.close_leaderboard(p_leaderboard_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_profile_id UUID;
BEGIN
  v_profile_id := get_my_profile_id();
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.leaderboard_events
    SET status = 'completed', updated_at = now()
    WHERE id = p_leaderboard_id AND created_by = v_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found or not authorized'; END IF;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.close_leaderboard(UUID) TO authenticated;

-- RPC 2: reabrir leaderboard
CREATE OR REPLACE FUNCTION public.reopen_leaderboard(p_leaderboard_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_profile_id UUID;
BEGIN
  v_profile_id := get_my_profile_id();
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.leaderboard_events
    SET status = 'active', updated_at = now()
    WHERE id = p_leaderboard_id AND created_by = v_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found or not authorized'; END IF;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.reopen_leaderboard(UUID) TO authenticated;

-- RLS: reemplazar política abierta por una restrictiva
DROP POLICY IF EXISTS "Anyone authenticated can view leaderboard events"
  ON public.leaderboard_events;
DROP POLICY IF EXISTS "Authenticated can view leaderboard events"
  ON public.leaderboard_events;
DROP POLICY IF EXISTS "Users can view own or joined leaderboard events"
  ON public.leaderboard_events;

CREATE POLICY "Users can view own and participating leaderboards"
  ON public.leaderboard_events FOR SELECT TO authenticated
  USING (
    created_by = get_my_profile_id()
    OR EXISTS (
      SELECT 1 FROM public.leaderboard_participants lp
      WHERE lp.leaderboard_id = leaderboard_events.id
        AND lp.profile_id = get_my_profile_id()
        AND lp.is_active = true
    )
  );