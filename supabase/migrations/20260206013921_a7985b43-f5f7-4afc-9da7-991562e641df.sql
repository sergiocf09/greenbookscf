-- Fix race condition in finalize_round_bets by using UPSERT (ON CONFLICT)
-- This prevents duplicate key violations when multiple rounds with shared players are closed concurrently

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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_round_organizer(p_round_id) THEN
    RAISE EXCEPTION 'Only organizer can finalize bets';
  END IF;

  -- Idempotency: if already finalized, return early
  IF EXISTS (SELECT 1 FROM public.ledger_transactions WHERE round_id = p_round_id)
     OR EXISTS (SELECT 1 FROM public.player_vs_player WHERE last_round_id = p_round_id) THEN
    RETURN;
  END IF;

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

    IF NOT EXISTS (
      SELECT 1 FROM public.round_players rp
      WHERE rp.round_id = p_round_id AND rp.profile_id = v_from
    ) THEN
      RAISE EXCEPTION 'from_profile_id is not a participant in this round';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.round_players rp
      WHERE rp.round_id = p_round_id AND rp.profile_id = v_to
    ) THEN
      RAISE EXCEPTION 'to_profile_id is not a participant in this round';
    END IF;

    INSERT INTO public.ledger_transactions(
      round_id, from_profile_id, to_profile_id, amount, bet_type, segment, hole_number, description
    ) VALUES (
      p_round_id, v_from, v_to, v_amount, v_bet_type, v_segment, v_hole_number, v_description
    );

    -- Use '||' as separator instead of '-' to avoid confusion with UUID hyphens
    IF v_from < v_to THEN
      v_player_a := v_from;
      v_player_b := v_to;
      v_pvp_key := v_from::text || '||' || v_to::text;
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
      v_pvp_key := v_to::text || '||' || v_from::text;
      v_pvp_updates := jsonb_set(
        v_pvp_updates,
        ARRAY[v_pvp_key],
        COALESCE(v_pvp_updates->v_pvp_key, '{"a_won":0,"b_won":0}'::jsonb) ||
        jsonb_build_object('a_won', COALESCE((v_pvp_updates->v_pvp_key->>'a_won')::numeric, 0) + v_amount),
        true
      );
    END IF;
  END LOOP;

  -- Apply PvP updates using UPSERT to handle race conditions atomically
  FOR v_pvp_key IN SELECT jsonb_object_keys(v_pvp_updates)
  LOOP
    v_player_a := (split_part(v_pvp_key, '||', 1))::uuid;
    v_player_b := (split_part(v_pvp_key, '||', 2))::uuid;

    INSERT INTO public.player_vs_player (
      player_a_id, player_b_id, player_a_is_guest, player_b_is_guest,
      rounds_played, total_won_by_a, total_won_by_b, 
      last_played_at, last_round_id
    )
    VALUES (
      v_player_a, 
      v_player_b, 
      false, 
      false,
      1,
      COALESCE((v_pvp_updates->v_pvp_key->>'a_won')::numeric, 0),
      COALESCE((v_pvp_updates->v_pvp_key->>'b_won')::numeric, 0),
      now(),
      p_round_id
    )
    ON CONFLICT (player_a_id, player_b_id) 
    DO UPDATE SET
      rounds_played = player_vs_player.rounds_played + 1,
      total_won_by_a = player_vs_player.total_won_by_a + EXCLUDED.total_won_by_a,
      total_won_by_b = player_vs_player.total_won_by_b + EXCLUDED.total_won_by_b,
      last_played_at = now(),
      last_round_id = p_round_id,
      updated_at = now();
  END LOOP;
END;
$function$;