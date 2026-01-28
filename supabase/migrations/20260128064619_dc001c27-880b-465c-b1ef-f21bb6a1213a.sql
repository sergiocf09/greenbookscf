-- ============================================
-- SECURITY FIX: player_vs_player table protection
-- ============================================

-- 1. Add restrictive DELETE policy to prevent deletion of PvP records
CREATE POLICY "Prevent deletion of pvp records"
ON public.player_vs_player
FOR DELETE
USING (false);

-- 2. Drop existing INSERT/UPDATE policies that allow client manipulation
DROP POLICY IF EXISTS "System can manage pvp records" ON public.player_vs_player;
DROP POLICY IF EXISTS "System can update pvp records" ON public.player_vs_player;

-- 3. Add restrictive INSERT/UPDATE policies (server-side only via RPC)
CREATE POLICY "No direct client inserts to pvp"
ON public.player_vs_player
FOR INSERT
WITH CHECK (false);

CREATE POLICY "No direct client updates to pvp"
ON public.player_vs_player
FOR UPDATE
USING (false);

-- ============================================
-- SECURITY FIX: Enhanced RPC input validation
-- ============================================

-- 4. Replace resolve_round_id_by_code with sanitized version
CREATE OR REPLACE FUNCTION public.resolve_round_id_by_code(p_code text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT r.id
  FROM public.rounds r
  WHERE lower(r.id::text) LIKE lower(regexp_replace(trim(p_code), '[^a-zA-Z0-9]', '', 'g')) || '%'
    AND r.status IN ('setup','in_progress')
  ORDER BY r.created_at DESC
  LIMIT 1;
$function$;

-- 5. Replace finalize_round_bets with enhanced validation + PvP updates
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
  v_valid_segments text[] := ARRAY['front', 'back', 'total', 'hole'];
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

    -- Basic sanity limit to prevent abuse/accidents (can be adjusted)
    IF v_amount > 1000000 THEN
      RAISE EXCEPTION 'Amount too large';
    END IF;

    -- Validate segment (enhanced validation)
    IF v_segment NOT IN ('front', 'back', 'total', 'hole') THEN
      RAISE EXCEPTION 'Invalid segment value: %', v_segment;
    END IF;

    -- Validate hole_number if segment is 'hole'
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
        updated_at = now()
      WHERE id = v_existing_pvp.id;
    ELSE
      INSERT INTO public.player_vs_player (player_a_id, player_b_id, rounds_played, total_won_by_a, total_won_by_b, last_played_at)
      VALUES (
        v_player_a,
        v_player_b,
        1,
        COALESCE((v_pvp_updates->v_pvp_key->>'a_won')::numeric, 0),
        COALESCE((v_pvp_updates->v_pvp_key->>'b_won')::numeric, 0),
        now()
      );
    END IF;
  END LOOP;
END;
$function$;