-- Fix: prevent clients from inserting arbitrary ledger transactions

-- Remove overly-permissive insert policy
DROP POLICY IF EXISTS "Participants can insert ledger transactions" ON public.ledger_transactions;

-- Server-side finalization RPC: inserts validated ledger transactions for a round
CREATE OR REPLACE FUNCTION public.finalize_round_bets(
  p_round_id uuid,
  p_ledger jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_from uuid;
  v_to uuid;
  v_amount numeric;
  v_bet_type public.bet_type;
  v_segment text;
  v_hole_number int;
  v_description text;
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
  END LOOP;
END;
$$;

-- Allow authenticated users to execute the finalization RPC (it self-checks organizer)
GRANT EXECUTE ON FUNCTION public.finalize_round_bets(uuid, jsonb) TO authenticated;
