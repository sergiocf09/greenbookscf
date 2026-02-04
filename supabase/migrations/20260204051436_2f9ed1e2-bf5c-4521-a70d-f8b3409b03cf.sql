-- Idempotent, diagnosable round closure attempts (fix: Postgres doesn't support CREATE POLICY IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS public.round_close_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL,
  organizer_profile_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('started','succeeded','failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz NULL,
  error_stage text NULL,
  error_message text NULL,
  report_json jsonb NULL
);

CREATE INDEX IF NOT EXISTS idx_round_close_attempts_round_started_at
  ON public.round_close_attempts (round_id, started_at DESC);

ALTER TABLE public.round_close_attempts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='round_close_attempts' AND policyname='Organizer can view close attempts'
  ) THEN
    CREATE POLICY "Organizer can view close attempts"
    ON public.round_close_attempts
    FOR SELECT
    USING (public.is_round_organizer(round_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='round_close_attempts' AND policyname='No direct inserts to close attempts'
  ) THEN
    CREATE POLICY "No direct inserts to close attempts"
    ON public.round_close_attempts
    FOR INSERT
    WITH CHECK (false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='round_close_attempts' AND policyname='No direct updates to close attempts'
  ) THEN
    CREATE POLICY "No direct updates to close attempts"
    ON public.round_close_attempts
    FOR UPDATE
    USING (false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='round_close_attempts' AND policyname='No direct deletes to close attempts'
  ) THEN
    CREATE POLICY "No direct deletes to close attempts"
    ON public.round_close_attempts
    FOR DELETE
    USING (false);
  END IF;
END $$;

-- Begin an attempt (returns existing started attempt if still fresh)
CREATE OR REPLACE FUNCTION public.begin_round_close_attempt(p_round_id uuid, p_lock_seconds int DEFAULT 60)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_round_status public.round_status;
  v_org uuid;
  v_existing record;
  v_new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_round_organizer(p_round_id) THEN
    RAISE EXCEPTION 'Only organizer can close round';
  END IF;

  SELECT r.status, r.organizer_id INTO v_round_status, v_org
  FROM public.rounds r
  WHERE r.id = p_round_id;

  IF v_round_status IS NULL THEN
    RAISE EXCEPTION 'Round not found';
  END IF;

  IF v_round_status = 'completed' THEN
    RETURN jsonb_build_object(
      'state', 'already_closed',
      'round_status', v_round_status
    );
  END IF;

  -- If there is a recent started attempt, return it to enforce idempotency.
  SELECT * INTO v_existing
  FROM public.round_close_attempts a
  WHERE a.round_id = p_round_id
    AND a.status = 'started'
    AND a.started_at > (now() - make_interval(secs => p_lock_seconds))
  ORDER BY a.started_at DESC
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'state', 'locked',
      'attempt_id', v_existing.id,
      'started_at', v_existing.started_at,
      'round_status', v_round_status
    );
  END IF;

  INSERT INTO public.round_close_attempts(round_id, organizer_profile_id, status)
  VALUES (p_round_id, v_org, 'started')
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'state', 'started',
    'attempt_id', v_new_id,
    'round_status', v_round_status
  );
END;
$$;

-- Finish an attempt (succeeded/failed)
CREATE OR REPLACE FUNCTION public.finish_round_close_attempt(
  p_attempt_id uuid,
  p_status text,
  p_error_stage text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_report jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_round_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT round_id INTO v_round_id
  FROM public.round_close_attempts
  WHERE id = p_attempt_id;

  IF v_round_id IS NULL THEN
    RAISE EXCEPTION 'Attempt not found';
  END IF;

  IF NOT public.is_round_organizer(v_round_id) THEN
    RAISE EXCEPTION 'Only organizer can finish close attempt';
  END IF;

  UPDATE public.round_close_attempts
  SET
    status = p_status,
    ended_at = now(),
    error_stage = p_error_stage,
    error_message = left(p_error_message, 2000),
    report_json = p_report
  WHERE id = p_attempt_id;
END;
$$;

-- Make finalize_round_bets idempotent
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

  IF NOT public.is_round_organizer(p_round_id) THEN
    RAISE EXCEPTION 'Only organizer can finalize bets';
  END IF;

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

    IF v_from < v_to THEN
      v_player_a := v_from;
      v_player_b := v_to;
      v_pvp_key := v_from::text || '-' || v_to::text;
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
      v_pvp_updates := jsonb_set(
        v_pvp_updates,
        ARRAY[v_pvp_key],
        COALESCE(v_pvp_updates->v_pvp_key, '{"a_won":0,"b_won":0}'::jsonb) ||
        jsonb_build_object('a_won', COALESCE((v_pvp_updates->v_pvp_key->>'a_won')::numeric, 0) + v_amount),
        true
      );
    END IF;
  END LOOP;

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