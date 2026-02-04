CREATE OR REPLACE FUNCTION public.rebuild_round_financials_from_snapshot(p_round_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_snapshot jsonb;
  v_players jsonb;
  v_ledger jsonb;
  v_entry jsonb;
  v_from_player_id text;
  v_to_player_id text;
  v_amount numeric;
  v_bet_type text;
  v_segment text;
  v_hole_number int;
  v_description text;
  v_from_profile uuid;
  v_to_profile uuid;
  v_from_is_guest boolean;
  v_to_is_guest boolean;
  v_from_name text;
  v_to_name text;
  v_pair_key text;
  v_pvp_updates jsonb := '{}'::jsonb;
  v_existing_pvp record;
  v_a_id uuid;
  v_b_id uuid;
  v_a_is_guest boolean;
  v_b_is_guest boolean;
  v_a_name text;
  v_b_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_round_organizer(p_round_id) THEN
    RAISE EXCEPTION 'Only organizer can rebuild round financials';
  END IF;

  -- Idempotency guard: if we already have any persisted artifacts for this round, do nothing.
  IF EXISTS (SELECT 1 FROM public.ledger_transactions WHERE round_id = p_round_id) OR
     EXISTS (SELECT 1 FROM public.player_vs_player WHERE last_round_id = p_round_id) THEN
    RETURN;
  END IF;

  SELECT rs.snapshot_json INTO v_snapshot
  FROM public.round_snapshots rs
  WHERE rs.round_id = p_round_id;

  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'Snapshot not found for round %', p_round_id;
  END IF;

  v_players := COALESCE(v_snapshot->'players', '[]'::jsonb);
  v_ledger := COALESCE(v_snapshot->'ledger', '[]'::jsonb);

  -- Build aggregated PvP updates per pair (rounds_played should increment once per pair)
  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_ledger) AS t(value)
  LOOP
    v_from_player_id := v_entry->>'fromPlayerId';
    v_to_player_id := v_entry->>'toPlayerId';
    v_amount := NULLIF(v_entry->>'amount','')::numeric;
    v_bet_type := v_entry->>'betType';
    v_segment := COALESCE(v_entry->>'segment','total');
    v_hole_number := NULLIF(v_entry->>'holeNumber','')::int;
    v_description := NULLIF(v_entry->>'description','');

    IF v_amount IS NULL OR v_amount <= 0 THEN
      CONTINUE;
    END IF;

    -- Resolve snapshot players
    v_from_profile := NULL;
    v_to_profile := NULL;
    v_from_is_guest := true;
    v_to_is_guest := true;
    v_from_name := NULL;
    v_to_name := NULL;

    SELECT (p->>'profileId')::uuid, COALESCE((p->>'isGuest')::boolean, true), p->>'name'
      INTO v_from_profile, v_from_is_guest, v_from_name
    FROM jsonb_array_elements(v_players) AS p
    WHERE p->>'id' = v_from_player_id
    LIMIT 1;

    SELECT (p->>'profileId')::uuid, COALESCE((p->>'isGuest')::boolean, true), p->>'name'
      INTO v_to_profile, v_to_is_guest, v_to_name
    FROM jsonb_array_elements(v_players) AS p
    WHERE p->>'id' = v_to_player_id
    LIMIT 1;

    -- ledger_transactions only supports registered players
    IF v_from_profile IS NOT NULL AND v_to_profile IS NOT NULL THEN
      INSERT INTO public.ledger_transactions(
        round_id, from_profile_id, to_profile_id, amount, bet_type, segment, hole_number, description
      ) VALUES (
        p_round_id, v_from_profile, v_to_profile, v_amount, v_bet_type::public.bet_type, v_segment, v_hole_number, v_description
      );
    END IF;

    -- Normalize a pair key using (profile uuid) or (guest:name)
    IF v_from_profile IS NULL THEN
      v_from_name := COALESCE(v_from_name, v_entry->>'fromPlayerName', 'Invitado');
    END IF;
    IF v_to_profile IS NULL THEN
      v_to_name := COALESCE(v_to_name, v_entry->>'toPlayerName', 'Invitado');
    END IF;

    -- Determine deterministic ordering for A/B
    DECLARE
      k_from text := COALESCE(v_from_profile::text, 'guest:' || COALESCE(v_from_name,'Invitado'));
      k_to   text := COALESCE(v_to_profile::text,   'guest:' || COALESCE(v_to_name,'Invitado'));
      a_is_from boolean;
      a_id uuid;
      b_id uuid;
      a_is_guest boolean;
      b_is_guest boolean;
      a_name text;
      b_name text;
      a_won numeric;
      b_won numeric;
    BEGIN
      a_is_from := (k_from < k_to);

      IF a_is_from THEN
        a_id := v_from_profile;
        b_id := v_to_profile;
        a_is_guest := (v_from_profile IS NULL);
        b_is_guest := (v_to_profile IS NULL);
        a_name := CASE WHEN v_from_profile IS NULL THEN v_from_name ELSE NULL END;
        b_name := CASE WHEN v_to_profile IS NULL THEN v_to_name ELSE NULL END;
        -- 'to' (receiver) wins, so if A is from then B is the winner
        a_won := 0;
        b_won := v_amount;
      ELSE
        a_id := v_to_profile;
        b_id := v_from_profile;
        a_is_guest := (v_to_profile IS NULL);
        b_is_guest := (v_from_profile IS NULL);
        a_name := CASE WHEN v_to_profile IS NULL THEN v_to_name ELSE NULL END;
        b_name := CASE WHEN v_from_profile IS NULL THEN v_from_name ELSE NULL END;
        -- A is the winner
        a_won := v_amount;
        b_won := 0;
      END IF;

      v_pair_key := COALESCE(a_id::text, 'guest:'||COALESCE(a_name,'Invitado')) || '|' || COALESCE(b_id::text, 'guest:'||COALESCE(b_name,'Invitado'));

      v_pvp_updates := jsonb_set(
        v_pvp_updates,
        ARRAY[v_pair_key],
        COALESCE(v_pvp_updates->v_pair_key, '{"a_won":0,"b_won":0,"a_is_guest":false,"b_is_guest":false,"a_name":null,"b_name":null}'::jsonb) ||
          jsonb_build_object(
            'a_won', COALESCE((v_pvp_updates->v_pair_key->>'a_won')::numeric,0) + a_won,
            'b_won', COALESCE((v_pvp_updates->v_pair_key->>'b_won')::numeric,0) + b_won,
            'a_is_guest', a_is_guest,
            'b_is_guest', b_is_guest,
            'a_name', a_name,
            'b_name', b_name
          ),
        true
      );
    END;
  END LOOP;

  -- Apply aggregated PvP updates once per pair
  FOR v_pair_key IN SELECT jsonb_object_keys(v_pvp_updates)
  LOOP
    -- Decode key parts
    DECLARE
      a_part text := split_part(v_pair_key, '|', 1);
      b_part text := split_part(v_pair_key, '|', 2);
      a_uuid uuid := NULL;
      b_uuid uuid := NULL;
      a_is_guest boolean := COALESCE((v_pvp_updates->v_pair_key->>'a_is_guest')::boolean, false);
      b_is_guest boolean := COALESCE((v_pvp_updates->v_pair_key->>'b_is_guest')::boolean, false);
      a_name text := NULLIF(v_pvp_updates->v_pair_key->>'a_name','');
      b_name text := NULLIF(v_pvp_updates->v_pair_key->>'b_name','');
      a_won numeric := COALESCE((v_pvp_updates->v_pair_key->>'a_won')::numeric,0);
      b_won numeric := COALESCE((v_pvp_updates->v_pair_key->>'b_won')::numeric,0);
    BEGIN
      IF a_part NOT LIKE 'guest:%' THEN
        a_uuid := a_part::uuid;
      END IF;
      IF b_part NOT LIKE 'guest:%' THEN
        b_uuid := b_part::uuid;
      END IF;

      SELECT * INTO v_existing_pvp
      FROM public.player_vs_player
      WHERE
        COALESCE(player_a_id::text,'') = COALESCE(a_uuid::text,'')
        AND COALESCE(player_b_id::text,'') = COALESCE(b_uuid::text,'')
        AND player_a_is_guest = a_is_guest
        AND player_b_is_guest = b_is_guest
        AND COALESCE(player_a_name,'') = COALESCE(a_name,'')
        AND COALESCE(player_b_name,'') = COALESCE(b_name,'');

      IF v_existing_pvp IS NOT NULL THEN
        UPDATE public.player_vs_player
        SET
          rounds_played = v_existing_pvp.rounds_played + 1,
          total_won_by_a = v_existing_pvp.total_won_by_a + a_won,
          total_won_by_b = v_existing_pvp.total_won_by_b + b_won,
          last_played_at = now(),
          last_round_id = p_round_id,
          updated_at = now()
        WHERE id = v_existing_pvp.id;
      ELSE
        INSERT INTO public.player_vs_player(
          player_a_id, player_b_id,
          player_a_is_guest, player_b_is_guest,
          player_a_name, player_b_name,
          rounds_played, total_won_by_a, total_won_by_b,
          last_played_at, last_round_id
        ) VALUES (
          a_uuid, b_uuid,
          a_is_guest, b_is_guest,
          a_name, b_name,
          1, a_won, b_won,
          now(), p_round_id
        );
      END IF;
    END;
  END LOOP;
END;
$function$;