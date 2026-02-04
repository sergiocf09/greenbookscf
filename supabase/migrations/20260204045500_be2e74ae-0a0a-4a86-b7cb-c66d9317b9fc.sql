-- 1) Ensure sliding_current supports upsert(onConflict)
CREATE UNIQUE INDEX IF NOT EXISTS sliding_current_pair_uidx
ON public.sliding_current (player_a_profile_id, player_b_profile_id);

-- 2) Patch finalize_round_bets to also update player_vs_player.last_round_id
CREATE OR REPLACE FUNCTION public.finalize_round_bets(p_round_id uuid, p_ledger jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item jsonb;
  v_from uuid;
  v_to uuid;
  v_amount numeric;
  v_bet_type public.bet_type;
  v_segment text;
  v_hole_number int;
  v_description text;
  v_pvp_key text;
  v_pvp_updates jsonb := '{}'::jsonb;
  v_player_a uuid;
  v_player_b uuid;
  v_existing_pvp record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Only organizer can finalize round bets
  IF NOT public.is_round_organizer(p_round_id) THEN
    RAISE EXCEPTION 'Only organizer can finalize bets';
  END IF;

  -- Validate input payload
  IF p_ledger IS NULL OR jsonb_typeof(p_ledger) <> 'array' THEN
    RAISE EXCEPTION 'Invalid ledger payload';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_ledger) AS t(value)
  LOOP
    v_from := NULLIF(v_item->>'from_profile_id','')::uuid;
    v_to := NULLIF(v_item->>'to_profile_id','')::uuid;
    v_amount := NULLIF(v_item->>'amount','')::numeric;
    v_bet_type := (v_item->>'bet_type')::public.bet_type;
    v_segment := COALESCE(v_item->>'segment','total');
    v_hole_number := NULLIF(v_item->>'hole_number','')::int;
    v_description := NULLIF(v_item->>'description','');

    IF v_from IS NULL OR v_to IS NULL THEN
      RAISE EXCEPTION 'Missing from/to profile id';
    END IF;

    IF v_from = v_to THEN
      RAISE EXCEPTION 'from_profile_id cannot equal to_profile_id';
    END IF;

    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Invalid amount';
    END IF;

    IF v_amount > 1000000 THEN
      RAISE EXCEPTION 'Amount too large';
    END IF;

    IF v_segment NOT IN ('front', 'back', 'total', 'hole') THEN
      RAISE EXCEPTION 'Invalid segment value: %', v_segment;
    END IF;

    IF v_segment = 'hole' AND (v_hole_number IS NULL OR v_hole_number < 1 OR v_hole_number > 18) THEN
      RAISE EXCEPTION 'Invalid hole_number for hole segment';
    END IF;

    -- Ensure both profiles are participants in this round (registered only)
    IF NOT EXISTS (
      SELECT 1
      FROM public.round_players rp
      WHERE rp.round_id = p_round_id
        AND rp.profile_id = v_from
    ) THEN
      RAISE EXCEPTION 'from_profile_id is not a participant in this round';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.round_players rp
      WHERE rp.round_id = p_round_id
        AND rp.profile_id = v_to
    ) THEN
      RAISE EXCEPTION 'to_profile_id is not a participant in this round';
    END IF;

    INSERT INTO public.ledger_transactions(
      round_id,
      from_profile_id,
      to_profile_id,
      amount,
      bet_type,
      segment,
      hole_number,
      description
    ) VALUES (
      p_round_id,
      v_from,
      v_to,
      v_amount,
      v_bet_type,
      v_segment,
      v_hole_number,
      v_description
    );

    -- Accumulate PvP updates: always order player IDs consistently (smaller first)
    IF v_from < v_to THEN
      v_player_a := v_from;
      v_player_b := v_to;
      v_pvp_key := v_from::text || '-' || v_to::text;
      -- v_to won v_amount from v_from, so player_b won
      v_pvp_updates := jsonb_set(
        v_pvp_updates,
        ARRAY[v_pvp_key],
        COALESCE(v_pvp_updates->v_pvp_key, '{"a_won":0,"b_won":0}'::jsonb) ||
        jsonb_build_object('b_won', COALESCE((v_pvp_updates->v_pvp_key->>'b_won')::numeric, 0) + v_amount),
        true
      );
    ELSE
      v_player_a := v_to;
      v_player_b := v_from;
      v_pvp_key := v_to::text || '-' || v_from::text;
      -- v_to won v_amount from v_from, so player_a won
      v_pvp_updates := jsonb_set(
        v_pvp_updates,
        ARRAY[v_pvp_key],
        COALESCE(v_pvp_updates->v_pvp_key, '{"a_won":0,"b_won":0}'::jsonb) ||
        jsonb_build_object('a_won', COALESCE((v_pvp_updates->v_pvp_key->>'a_won')::numeric, 0) + v_amount),
        true
      );
    END IF;
  END LOOP;

  -- Now update player_vs_player table with aggregated results
  FOR v_pvp_key IN SELECT jsonb_object_keys(v_pvp_updates)
  LOOP
    v_player_a := (split_part(v_pvp_key, '-', 1))::uuid;
    v_player_b := (split_part(v_pvp_key, '-', 2))::uuid;

    SELECT * INTO v_existing_pvp
    FROM public.player_vs_player
    WHERE player_a_id = v_player_a AND player_b_id = v_player_b;

    IF v_existing_pvp IS NOT NULL THEN
      UPDATE public.player_vs_player
      SET
        rounds_played = v_existing_pvp.rounds_played + 1,
        total_won_by_a = v_existing_pvp.total_won_by_a + COALESCE((v_pvp_updates->v_pvp_key->>'a_won')::numeric, 0),
        total_won_by_b = v_existing_pvp.total_won_by_b + COALESCE((v_pvp_updates->v_pvp_key->>'b_won')::numeric, 0),
        last_played_at = now(),
        last_round_id = p_round_id,
        updated_at = now()
      WHERE id = v_existing_pvp.id;
    ELSE
      INSERT INTO public.player_vs_player (player_a_id, player_b_id, rounds_played, total_won_by_a, total_won_by_b, last_played_at, last_round_id)
      VALUES (
        v_player_a,
        v_player_b,
        1,
        COALESCE((v_pvp_updates->v_pvp_key->>'a_won')::numeric, 0),
        COALESCE((v_pvp_updates->v_pvp_key->>'b_won')::numeric, 0),
        now(),
        p_round_id
      );
    END IF;
  END LOOP;
END;
$function$;

-- 3) Rebuild ledger + PvP (including guests) from a stored round snapshot
--    This is a repair tool for rounds that ended up 'completed' but missed persistence.
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
  v_from_idx int;
  v_to_idx int;
  v_player_a uuid;
  v_player_b uuid;
  v_existing_pvp record;
  v_a_is_guest boolean;
  v_b_is_guest boolean;
  v_a_name text;
  v_b_name text;
  v_a_won numeric;
  v_b_won numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_round_organizer(p_round_id) THEN
    RAISE EXCEPTION 'Only organizer can rebuild round financials';
  END IF;

  SELECT rs.snapshot_json INTO v_snapshot
  FROM public.round_snapshots rs
  WHERE rs.round_id = p_round_id;

  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'Snapshot not found for round %', p_round_id;
  END IF;

  v_players := COALESCE(v_snapshot->'players', '[]'::jsonb);
  v_ledger := COALESCE(v_snapshot->'ledger', '[]'::jsonb);

  -- Insert missing ledger_transactions for registered-vs-registered entries
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

    -- Resolve players in snapshot to get profile IDs / guest names
    -- (IDs in snapshot are local player IDs; for logged-in players it is profile UUID)
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
      IF NOT EXISTS (
        SELECT 1 FROM public.ledger_transactions lt
        WHERE lt.round_id = p_round_id
          AND lt.from_profile_id = v_from_profile
          AND lt.to_profile_id = v_to_profile
          AND lt.amount = v_amount
          AND lt.bet_type::text = v_bet_type
          AND lt.segment = v_segment
          AND COALESCE(lt.hole_number,0) = COALESCE(v_hole_number,0)
          AND COALESCE(lt.description,'') = COALESCE(v_description,'')
      ) THEN
        INSERT INTO public.ledger_transactions(
          round_id, from_profile_id, to_profile_id, amount, bet_type, segment, hole_number, description
        ) VALUES (
          p_round_id, v_from_profile, v_to_profile, v_amount, v_bet_type::public.bet_type, v_segment, v_hole_number, v_description
        );
      END IF;
    END IF;

    -- Update player_vs_player for everyone (registered + guests)
    -- Normalize by (profile uuid when present, otherwise NULL + guest name)
    IF v_from_profile IS NULL AND (v_from_name IS NULL OR v_from_name = '') THEN
      v_from_name := COALESCE(v_entry->>'fromPlayerName','Invitado');
    END IF;
    IF v_to_profile IS NULL AND (v_to_name IS NULL OR v_to_name = '') THEN
      v_to_name := COALESCE(v_entry->>'toPlayerName','Invitado');
    END IF;

    -- Determine player A/B ordering by text key (profile uuid text preferred, else name)
    -- If both are registered, we just use uuid ordering.
    IF v_from_profile IS NOT NULL AND v_to_profile IS NOT NULL THEN
      IF v_from_profile < v_to_profile THEN
        v_player_a := v_from_profile;
        v_player_b := v_to_profile;
        v_a_is_guest := false;
        v_b_is_guest := false;
        v_a_name := NULL;
        v_b_name := NULL;
        v_a_won := 0;
        v_b_won := v_amount; -- to won
      ELSE
        v_player_a := v_to_profile;
        v_player_b := v_from_profile;
        v_a_is_guest := false;
        v_b_is_guest := false;
        v_a_name := NULL;
        v_b_name := NULL;
        v_a_won := v_amount; -- to won and is a
        v_b_won := 0;
      END IF;

      SELECT * INTO v_existing_pvp
      FROM public.player_vs_player
      WHERE player_a_id = v_player_a AND player_b_id = v_player_b;

      IF v_existing_pvp IS NOT NULL THEN
        UPDATE public.player_vs_player
        SET
          rounds_played = v_existing_pvp.rounds_played + 1,
          total_won_by_a = v_existing_pvp.total_won_by_a + v_a_won,
          total_won_by_b = v_existing_pvp.total_won_by_b + v_b_won,
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
          v_player_a, v_player_b,
          false, false,
          NULL, NULL,
          1, v_a_won, v_b_won,
          now(), p_round_id
        );
      END IF;
    ELSE
      -- At least one is a guest. We store profile IDs when present, otherwise NULL + name.
      -- For deterministic ordering, compare (COALESCE(profile::text, 'guest:'||name)).
      DECLARE
        k_from text := COALESCE(v_from_profile::text, 'guest:' || COALESCE(v_from_name,'Invitado'));
        k_to text := COALESCE(v_to_profile::text, 'guest:' || COALESCE(v_to_name,'Invitado'));
        a_is_from boolean;
      BEGIN
        a_is_from := (k_from < k_to);

        IF a_is_from THEN
          v_player_a := v_from_profile;
          v_player_b := v_to_profile;
          v_a_is_guest := (v_from_profile IS NULL);
          v_b_is_guest := (v_to_profile IS NULL);
          v_a_name := CASE WHEN v_from_profile IS NULL THEN v_from_name ELSE NULL END;
          v_b_name := CASE WHEN v_to_profile IS NULL THEN v_to_name ELSE NULL END;
          -- Winner is 'to' (receiver of amount)
          v_a_won := CASE WHEN v_to_profile IS NULL AND v_player_b IS NULL AND v_b_is_guest THEN v_amount ELSE 0 END;
          v_b_won := CASE WHEN NOT (v_to_profile IS NULL) OR v_b_is_guest THEN v_amount ELSE 0 END;
          -- Above isn't reliable for guest-vs-registered; do it explicitly below.
        ELSE
          v_player_a := v_to_profile;
          v_player_b := v_from_profile;
          v_a_is_guest := (v_to_profile IS NULL);
          v_b_is_guest := (v_from_profile IS NULL);
          v_a_name := CASE WHEN v_to_profile IS NULL THEN v_to_name ELSE NULL END;
          v_b_name := CASE WHEN v_from_profile IS NULL THEN v_from_name ELSE NULL END;
        END IF;

        -- Decide who won relative to A/B
        IF (a_is_from AND v_to_profile IS NOT NULL) OR (NOT a_is_from AND v_from_profile IS NOT NULL) THEN
          -- Winner is registered profile; compare against A/B profile IDs
          IF v_to_profile IS NOT NULL THEN
            -- Winner is 'to'
            IF (a_is_from AND v_player_b = v_to_profile) OR ((NOT a_is_from) AND v_player_a = v_to_profile) THEN
              v_a_won := CASE WHEN (NOT a_is_from) THEN v_amount ELSE 0 END;
              v_b_won := CASE WHEN a_is_from THEN v_amount ELSE 0 END;
            ELSE
              v_a_won := v_amount;
              v_b_won := 0;
            END IF;
          ELSE
            -- Winner is guest (to)
            v_a_won := CASE WHEN (NOT a_is_from) THEN v_amount ELSE 0 END;
            v_b_won := CASE WHEN a_is_from THEN v_amount ELSE 0 END;
          END IF;
        ELSE
          -- Winner is guest (to)
          v_a_won := CASE WHEN (NOT a_is_from) THEN v_amount ELSE 0 END;
          v_b_won := CASE WHEN a_is_from THEN v_amount ELSE 0 END;
        END IF;

        SELECT * INTO v_existing_pvp
        FROM public.player_vs_player
        WHERE
          COALESCE(player_a_id::text,'') = COALESCE(v_player_a::text,'')
          AND COALESCE(player_b_id::text,'') = COALESCE(v_player_b::text,'')
          AND player_a_is_guest = v_a_is_guest
          AND player_b_is_guest = v_b_is_guest
          AND COALESCE(player_a_name,'') = COALESCE(v_a_name,'')
          AND COALESCE(player_b_name,'') = COALESCE(v_b_name,'');

        IF v_existing_pvp IS NOT NULL THEN
          UPDATE public.player_vs_player
          SET
            rounds_played = v_existing_pvp.rounds_played + 1,
            total_won_by_a = v_existing_pvp.total_won_by_a + COALESCE(v_a_won,0),
            total_won_by_b = v_existing_pvp.total_won_by_b + COALESCE(v_b_won,0),
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
            v_player_a, v_player_b,
            v_a_is_guest, v_b_is_guest,
            v_a_name, v_b_name,
            1, COALESCE(v_a_won,0), COALESCE(v_b_won,0),
            now(), p_round_id
          );
        END IF;
      END;
    END IF;
  END LOOP;
END;
$function$;