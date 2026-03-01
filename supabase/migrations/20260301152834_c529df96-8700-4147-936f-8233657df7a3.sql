
CREATE OR REPLACE FUNCTION public.update_round_bet_config(p_round_id uuid, p_bet_config jsonb)
 RETURNS timestamptz
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_updated_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_round_participant(p_round_id) THEN
    RAISE EXCEPTION 'Only round participants can update bet config';
  END IF;

  UPDATE public.rounds
  SET bet_config = p_bet_config, updated_at = now()
  WHERE id = p_round_id
  RETURNING updated_at INTO v_updated_at;

  RETURN v_updated_at;
END;
$$;
