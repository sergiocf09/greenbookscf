
DO $$
DECLARE
  v_map jsonb := jsonb_build_array(
    jsonb_build_object('n','marcos rivera','p','39254792-ab00-4d4d-b1a8-80ecd0a8a1f0'),
    jsonb_build_object('n','pablo mier','p','e4266bc2-f904-4d8b-8ab7-4ce83eff7847'),
    jsonb_build_object('n','mario salmon','p','a4ba0c3f-b1b4-46df-908f-8b10d71edff6'),
    jsonb_build_object('n','carlos favela','p','73dadea7-50dc-47c9-ba24-8c4b9e82fe47'),
    jsonb_build_object('n','enrique rubio','p','9364f944-ca4f-42f2-adde-68725ed78130'),
    jsonb_build_object('n','luis gonzalez','p','6b9beeac-abfc-4d4b-8b7b-d71d208e707d'),
    jsonb_build_object('n','santiago viesca','p','dc7d2ab7-26dc-4cc5-a7c1-158f908f6c99'),
    jsonb_build_object('n','carlos lomeli','p','d810aa75-66f1-4e2d-a8d7-21b09954bb9b'),
    jsonb_build_object('n','eduardo serrano','p','825c3db4-5aed-4544-a9f8-e088cc9520df'),
    jsonb_build_object('n','rodrigo pando','p','cda0539e-071b-4bf1-bb76-11d8b63f8c2d'),
    jsonb_build_object('n','oscar jiménez','p','b17f9101-5765-4afa-aa78-333191fd02e8'),
    jsonb_build_object('n','angel arellano','p','d7bafc4f-ff08-4cb6-aa28-54977da3ff84')
  );
  r record;
  v_snap jsonb;
  v_idx int;
  v_player jsonb;
  v_rounds uuid[] := '{}';
BEGIN
  ALTER TABLE public.round_players DISABLE TRIGGER enforce_round_players_self_update_trg;
  ALTER TABLE public.round_players DISABLE TRIGGER prevent_round_player_escalation;

  FOR r IN
    SELECT rp.id AS rp_id, rp.round_id, (m->>'p')::uuid AS profile_id
    FROM public.round_players rp
    JOIN jsonb_array_elements(v_map) AS t(m)
      ON lower(trim(rp.guest_name)) = (t.m->>'n')
    WHERE rp.profile_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.round_players rp2
        WHERE rp2.round_id = rp.round_id AND rp2.profile_id = (t.m->>'p')::uuid
      )
  LOOP
    UPDATE public.round_players
    SET profile_id = r.profile_id, guest_name = NULL, guest_initials = NULL, guest_color = NULL
    WHERE id = r.rp_id;

    v_rounds := array_append(v_rounds, r.round_id);

    -- Rewrite snapshot: replace player id references, mark as registered
    SELECT snapshot_json INTO v_snap FROM public.round_snapshots WHERE round_id = r.round_id;
    IF v_snap IS NOT NULL THEN
      v_snap := replace(v_snap::text, r.rp_id::text, r.profile_id::text)::jsonb;

      SELECT ord - 1 INTO v_idx
      FROM jsonb_array_elements(COALESCE(v_snap->'players','[]'::jsonb)) WITH ORDINALITY AS e(value, ord)
      WHERE e.value->>'id' = r.profile_id::text
      LIMIT 1;

      IF v_idx IS NOT NULL THEN
        v_player := (v_snap->'players')->v_idx;
        v_player := v_player
          || jsonb_build_object('profileId', r.profile_id::text, 'isGuest', false);
        v_snap := jsonb_set(v_snap, ARRAY['players', v_idx::text], v_player);
      END IF;

      UPDATE public.round_snapshots SET snapshot_json = v_snap WHERE round_id = r.round_id;
    END IF;
  END LOOP;

  ALTER TABLE public.round_players ENABLE TRIGGER enforce_round_players_self_update_trg;
  ALTER TABLE public.round_players ENABLE TRIGGER prevent_round_player_escalation;

  PERFORM public.rebuild_all_pvp_from_snapshots();
END $$;
