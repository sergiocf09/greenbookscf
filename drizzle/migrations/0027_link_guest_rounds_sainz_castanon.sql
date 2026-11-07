DO $$
DECLARE
  v_map jsonb := jsonb_build_array(
    jsonb_build_object('rp','23f3a733-ed96-4dfb-b5bd-58bb685a4ae0','p','e7daeaf2-86ba-492a-8bf9-542076d8a3f1'),
    jsonb_build_object('rp','29289b38-e152-4bf6-8802-287934c33178','p','8ebb8efe-07ac-45c0-bff4-7155b51dc9f6'),
    jsonb_build_object('rp','520ae489-6df1-4d3d-8b15-3767d9ea2d89','p','8ebb8efe-07ac-45c0-bff4-7155b51dc9f6')
  );
  m jsonb;
  v_rp uuid; v_prof uuid; v_round uuid; v_name text;
  v_snap jsonb; v_idx int; v_player jsonb;
  v_rounds uuid[] := '{}';
  e jsonb; v_from uuid; v_to uuid; v_bt text; v_map_bt jsonb := '{
    "Medal Front 9":"medal_front","Medal Back 9":"medal_back","Medal Total":"medal_total",
    "Presiones Front":"pressure_front","Presiones Back":"pressure_back","Presiones Match 18":"medal_total",
    "Presiones Parejas":"pressure_front","Carritos Front":"carritos_front","Carritos Back":"carritos_back",
    "Carritos Total":"carritos_total","Caros":"caros","Unidades":"units","Manchas":"manchas",
    "Culebras":"culebras","Pingüinos":"pinguinos","Coneja":"coneja","Side Bet":"medal_total"}'::jsonb;
BEGIN
  -- Clean stray whitespace in Guillermo's name
  UPDATE public.profiles SET display_name = btrim(display_name)
  WHERE id = 'e7daeaf2-86ba-492a-8bf9-542076d8a3f1' AND display_name <> btrim(display_name);

  ALTER TABLE public.round_players DISABLE TRIGGER enforce_round_players_self_update_trg;
  ALTER TABLE public.round_players DISABLE TRIGGER prevent_round_player_escalation;

  FOR m IN SELECT value FROM jsonb_array_elements(v_map) LOOP
    v_rp := (m->>'rp')::uuid; v_prof := (m->>'p')::uuid;
    SELECT round_id INTO v_round FROM public.round_players WHERE id = v_rp AND profile_id IS NULL;
    IF v_round IS NULL THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM public.round_players WHERE round_id = v_round AND profile_id = v_prof) THEN CONTINUE; END IF;
    SELECT display_name INTO v_name FROM public.profiles WHERE id = v_prof;

    UPDATE public.round_players
    SET profile_id = v_prof, guest_name = NULL, guest_initials = NULL, guest_color = NULL
    WHERE id = v_rp;

    IF NOT v_round = ANY(v_rounds) THEN v_rounds := array_append(v_rounds, v_round); END IF;

    SELECT snapshot_json INTO v_snap FROM public.round_snapshots WHERE round_id = v_round;
    IF v_snap IS NOT NULL THEN
      v_snap := replace(v_snap::text, v_rp::text, v_prof::text)::jsonb;
      SELECT ord - 1 INTO v_idx
      FROM jsonb_array_elements(COALESCE(v_snap->'players','[]'::jsonb)) WITH ORDINALITY AS x(value, ord)
      WHERE x.value->>'id' = v_prof::text LIMIT 1;
      IF v_idx IS NOT NULL THEN
        v_player := (v_snap->'players')->v_idx
          || jsonb_build_object('profileId', v_prof::text, 'isGuest', false, 'name', v_name);
        v_snap := jsonb_set(v_snap, ARRAY['players', v_idx::text], v_player);
      END IF;
      UPDATE public.round_snapshots SET snapshot_json = v_snap WHERE round_id = v_round;
    END IF;
  END LOOP;

  ALTER TABLE public.round_players ENABLE TRIGGER enforce_round_players_self_update_trg;
  ALTER TABLE public.round_players ENABLE TRIGGER prevent_round_player_escalation;

  -- Ledger: insert missing registered-vs-registered transactions from each snapshot
  FOREACH v_round IN ARRAY v_rounds LOOP
    IF EXISTS (SELECT 1 FROM public.ledger_transactions WHERE round_id = v_round AND cross_bet_id IS NULL) THEN
      CONTINUE;
    END IF;
    SELECT snapshot_json INTO v_snap FROM public.round_snapshots WHERE round_id = v_round;
    FOR e IN SELECT value FROM jsonb_array_elements(COALESCE(v_snap->'ledger','[]'::jsonb)) LOOP
      IF COALESCE((e->>'amount')::numeric,0) <= 0 THEN CONTINUE; END IF;
      SELECT NULLIF(p->>'profileId','')::uuid INTO v_from FROM jsonb_array_elements(v_snap->'players') p WHERE p->>'id' = e->>'fromPlayerId' LIMIT 1;
      SELECT NULLIF(p->>'profileId','')::uuid INTO v_to FROM jsonb_array_elements(v_snap->'players') p WHERE p->>'id' = e->>'toPlayerId' LIMIT 1;
      IF v_from IS NULL OR v_to IS NULL OR v_from = v_to THEN CONTINUE; END IF;
      v_bt := COALESCE(v_map_bt->>(e->>'betType'), e->>'betType');
      IF NOT EXISTS (SELECT 1 FROM pg_enum en JOIN pg_type t ON t.oid = en.enumtypid WHERE t.typname = 'bet_type' AND en.enumlabel = v_bt) THEN
        v_bt := 'medal_total';
      END IF;
      INSERT INTO public.ledger_transactions(round_id, from_profile_id, to_profile_id, amount, bet_type, segment, hole_number, description)
      VALUES (v_round, v_from, v_to, (e->>'amount')::numeric, v_bt::public.bet_type, COALESCE(e->>'segment','total'),
              NULLIF(e->>'holeNumber','')::int, NULLIF(e->>'description',''));
    END LOOP;
  END LOOP;

  PERFORM public.rebuild_all_pvp_from_snapshots();
END $$;