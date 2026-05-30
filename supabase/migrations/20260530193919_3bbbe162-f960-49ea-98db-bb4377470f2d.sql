-- RPC: update_cross_bet_config
-- Permite a iniciador o target editar el bet_config (banderas included por apuesta) del cruce
CREATE OR REPLACE FUNCTION public.update_cross_bet_config(
  p_cross_bet_id UUID,
  p_bet_config JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_profile UUID;
  v_initiator UUID;
  v_target UUID;
BEGIN
  v_my_profile := public.get_my_profile_id();
  IF v_my_profile IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT initiator_profile_id, target_profile_id
    INTO v_initiator, v_target
    FROM public.round_cross_bets
    WHERE id = p_cross_bet_id;

  IF v_initiator IS NULL THEN
    RAISE EXCEPTION 'cross_bet_not_found';
  END IF;

  IF v_my_profile <> v_initiator AND v_my_profile <> v_target THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.round_cross_bets
    SET bet_config = COALESCE(p_bet_config, '{}'::jsonb)
    WHERE id = p_cross_bet_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_cross_bet_config(UUID, JSONB) TO authenticated;