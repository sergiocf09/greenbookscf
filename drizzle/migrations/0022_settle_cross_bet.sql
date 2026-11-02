CREATE OR REPLACE FUNCTION public.settle_cross_bet(p_cross_bet_id uuid, p_lines jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cb record; v_me uuid; v_n integer := 0; l jsonb;
BEGIN
  SELECT * INTO v_cb FROM public.round_cross_bets WHERE id = p_cross_bet_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'cross_bet_not_found'; END IF;
  v_me := public.get_my_profile_id();
  IF v_me IS NULL OR (v_me <> v_cb.initiator_profile_id AND v_me <> v_cb.target_profile_id) THEN
    RAISE EXCEPTION 'not_cross_bet_player';
  END IF;
  DELETE FROM public.ledger_transactions
   WHERE round_id = v_cb.round_id
     AND description LIKE 'Cruce%'
     AND ((from_profile_id = v_cb.initiator_profile_id AND to_profile_id = v_cb.target_profile_id)
       OR (from_profile_id = v_cb.target_profile_id AND to_profile_id = v_cb.initiator_profile_id));
  FOR l IN SELECT * FROM jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) LOOP
    IF (l->>'from_profile_id')::uuid NOT IN (v_cb.initiator_profile_id, v_cb.target_profile_id)
       OR (l->>'to_profile_id')::uuid NOT IN (v_cb.initiator_profile_id, v_cb.target_profile_id) THEN
      RAISE EXCEPTION 'invalid_cross_line';
    END IF;
    INSERT INTO public.ledger_transactions(round_id, from_profile_id, to_profile_id, bet_type, segment, hole_number, amount, description)
    VALUES (v_cb.round_id, (l->>'from_profile_id')::uuid, (l->>'to_profile_id')::uuid, (l->>'bet_type')::bet_type,
            coalesce(l->>'segment','total'), nullif(l->>'hole_number','')::int, abs((l->>'amount')::numeric),
            'Cruce · ' || coalesce(l->>'label',''));
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.settle_cross_bet(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_cross_bet(uuid, jsonb) TO authenticated;