
DO $$
DECLARE
  v_round_ids uuid[] := ARRAY[
    '80664a89-2671-4137-aa6c-48d91b56e2ca',
    '4cb1884f-5afd-4013-802b-c785b66910d3',
    '3214d6d2-ea6e-4f9a-9f84-f0d8d9a3f7fd',
    '34aba392-5406-448f-80ab-c4b4b4bc1fd8',
    '20cb3fff-ff35-4d2d-a3c7-8041c6476a26'
  ];
  v_rid uuid;
  v_snapshot jsonb;
  v_players jsonb;
  v_ledger jsonb;
  v_entry jsonb;
  v_from_profile uuid;
  v_to_profile uuid;
  v_amount numeric;
  v_raw_bet_type text;
  v_mapped_bet_type text;
BEGIN
  FOREACH v_rid IN ARRAY v_round_ids
  LOOP
    DELETE FROM public.ledger_transactions WHERE round_id = v_rid;

    SELECT rs.snapshot_json INTO v_snapshot
    FROM public.round_snapshots rs WHERE rs.round_id = v_rid;

    IF v_snapshot IS NULL THEN CONTINUE; END IF;

    v_players := COALESCE(v_snapshot->'players', '[]'::jsonb);
    v_ledger := COALESCE(v_snapshot->'ledger', '[]'::jsonb);

    FOR v_entry IN SELECT value FROM jsonb_array_elements(v_ledger) AS t(value)
    LOOP
      v_amount := NULLIF(v_entry->>'amount','')::numeric;
      IF v_amount IS NULL OR v_amount <= 0 THEN CONTINUE; END IF;

      SELECT (p->>'profileId')::uuid INTO v_from_profile
      FROM jsonb_array_elements(v_players) AS p
      WHERE p->>'id' = (v_entry->>'fromPlayerId') LIMIT 1;

      SELECT (p->>'profileId')::uuid INTO v_to_profile
      FROM jsonb_array_elements(v_players) AS p
      WHERE p->>'id' = (v_entry->>'toPlayerId') LIMIT 1;

      IF v_from_profile IS NULL OR v_to_profile IS NULL THEN CONTINUE; END IF;

      v_raw_bet_type := v_entry->>'betType';
      v_mapped_bet_type := CASE v_raw_bet_type
        WHEN 'Medal Front 9' THEN 'medal_front'
        WHEN 'Medal Back 9' THEN 'medal_back'
        WHEN 'Medal Total' THEN 'medal_total'
        WHEN 'Medal General' THEN 'medal_total'
        WHEN 'Presiones Front' THEN 'pressure_front'
        WHEN 'Presiones Back' THEN 'pressure_back'
        WHEN 'Presiones Back (Carry x2+Match)' THEN 'pressure_back'
        WHEN 'Presiones Match 18' THEN 'pressure_back'
        WHEN 'Skins Front' THEN 'skins_front'
        WHEN 'Skins Back' THEN 'skins_back'
        WHEN 'Caros' THEN 'caros'
        WHEN 'Unidades' THEN 'units'
        WHEN 'Manchas' THEN 'manchas'
        WHEN 'Culebras' THEN 'culebras'
        WHEN 'Pingüinos' THEN 'pinguinos'
        WHEN 'Carritos Front' THEN 'carritos_front'
        WHEN 'Carritos Back' THEN 'carritos_back'
        WHEN 'Carritos Total' THEN 'carritos_total'
        WHEN 'Rayas Front' THEN 'rayas_front'
        WHEN 'Rayas Back' THEN 'rayas_back'
        WHEN 'Rayas Medal Total' THEN 'rayas_medal_total'
        WHEN 'Rayas Oyes' THEN 'rayas_oyes'
        WHEN 'Oyes' THEN 'rayas_oyes'
        WHEN 'Coneja' THEN 'coneja'
        WHEN 'Putts Front' THEN 'medal_front'
        WHEN 'Putts Back' THEN 'medal_back'
        WHEN 'Putts Total' THEN 'medal_total'
        WHEN 'Side Bet' THEN 'medal_total'
        ELSE NULL
      END;

      IF v_mapped_bet_type IS NULL THEN CONTINUE; END IF;

      INSERT INTO public.ledger_transactions(
        round_id, from_profile_id, to_profile_id, amount, bet_type, segment, hole_number, description
      ) VALUES (
        v_rid, v_from_profile, v_to_profile, v_amount,
        v_mapped_bet_type::public.bet_type,
        COALESCE(v_entry->>'segment', 'total'),
        NULLIF(v_entry->>'holeNumber','')::int,
        NULLIF(v_entry->>'description','')
      );
    END LOOP;
  END LOOP;
END;
$$;
