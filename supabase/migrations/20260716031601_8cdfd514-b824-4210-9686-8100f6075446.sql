
-- PARTE A
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS auto_close_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_close_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_incomplete boolean NOT NULL DEFAULT false;

-- PARTE B
CREATE OR REPLACE FUNCTION public.reset_round_for_reclose(p_round_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_snapshot jsonb;
  v_ledger jsonb;
  v_entry jsonb;
  v_from_profile uuid;
  v_to_profile uuid;
  v_amount numeric;
  v_pvp_key text;
  v_pvp_decrements jsonb := '{}'::jsonb;
  v_player_a uuid;
  v_player_b uuid;
  v_existing_pvp record;
  v_players jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.is_round_organizer(p_round_id) OR
    EXISTS (
      SELECT 1 FROM public.round_players rp
      JOIN public.profiles p ON p.id = rp.profile_id
      WHERE rp.round_id = p_round_id
        AND p.user_id = auth.uid()
        AND rp.is_admin = true
    )
  ) THEN
    RAISE EXCEPTION 'Only organizer or co-admin can reopen round';
  END IF;

  IF (SELECT status FROM rounds WHERE id = p_round_id) != 'completed' THEN
    RAISE EXCEPTION 'Round is not completed';
  END IF;

  SELECT rs.snapshot_json INTO v_snapshot
  FROM public.round_snapshots rs
  WHERE rs.round_id = p_round_id;

  IF v_snapshot IS NOT NULL AND v_snapshot->'ledger' IS NOT NULL THEN
    v_players := COALESCE(v_snapshot->'players', '[]'::jsonb);
    v_ledger := v_snapshot->'ledger';

    FOR v_entry IN SELECT value FROM jsonb_array_elements(v_ledger) AS t(value)
    LOOP
      v_amount := NULLIF(v_entry->>'amount','')::numeric;
      IF v_amount IS NULL OR v_amount <= 0 THEN CONTINUE; END IF;

      SELECT (p->>'profileId')::uuid INTO v_from_profile
      FROM jsonb_array_elements(v_players) AS p
      WHERE p->>'id' = v_entry->>'fromPlayerId' AND p->>'profileId' IS NOT NULL
      LIMIT 1;

      SELECT (p->>'profileId')::uuid INTO v_to_profile
      FROM jsonb_array_elements(v_players) AS p
      WHERE p->>'id' = v_entry->>'toPlayerId' AND p->>'profileId' IS NOT NULL
      LIMIT 1;

      IF v_from_profile IS NOT NULL AND v_to_profile IS NOT NULL THEN
        IF v_from_profile < v_to_profile THEN
          v_pvp_key := v_from_profile::text || '||' || v_to_profile::text;
          v_pvp_decrements := jsonb_set(
            v_pvp_decrements, ARRAY[v_pvp_key],
            COALESCE(v_pvp_decrements->v_pvp_key, '{"a_won":0,"b_won":0}'::jsonb) ||
            jsonb_build_object('b_won', COALESCE((v_pvp_decrements->v_pvp_key->>'b_won')::numeric, 0) + v_amount),
            true
          );
        ELSE
          v_pvp_key := v_to_profile::text || '||' || v_from_profile::text;
          v_pvp_decrements := jsonb_set(
            v_pvp_decrements, ARRAY[v_pvp_key],
            COALESCE(v_pvp_decrements->v_pvp_key, '{"a_won":0,"b_won":0}'::jsonb) ||
            jsonb_build_object('a_won', COALESCE((v_pvp_decrements->v_pvp_key->>'a_won')::numeric, 0) + v_amount),
            true
          );
        END IF;
      END IF;
    END LOOP;

    FOR v_pvp_key IN SELECT jsonb_object_keys(v_pvp_decrements)
    LOOP
      v_player_a := (split_part(v_pvp_key, '||', 1))::uuid;
      v_player_b := (split_part(v_pvp_key, '||', 2))::uuid;

      SELECT * INTO v_existing_pvp
      FROM public.player_vs_player
      WHERE player_a_id = v_player_a AND player_b_id = v_player_b;

      IF v_existing_pvp IS NOT NULL THEN
        UPDATE public.player_vs_player
        SET
          rounds_played = GREATEST(0, v_existing_pvp.rounds_played - 1),
          total_won_by_a = GREATEST(0, v_existing_pvp.total_won_by_a - COALESCE((v_pvp_decrements->v_pvp_key->>'a_won')::numeric, 0)),
          total_won_by_b = GREATEST(0, v_existing_pvp.total_won_by_b - COALESCE((v_pvp_decrements->v_pvp_key->>'b_won')::numeric, 0)),
          updated_at = now()
        WHERE id = v_existing_pvp.id;

        DELETE FROM public.player_vs_player
        WHERE id = v_existing_pvp.id AND rounds_played <= 0;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.player_vs_player SET last_round_id = NULL, updated_at = now()
  WHERE last_round_id = p_round_id;

  DELETE FROM round_snapshots WHERE round_id = p_round_id;
  DELETE FROM ledger_transactions WHERE round_id = p_round_id;
  DELETE FROM sliding_history WHERE round_id = p_round_id;
  DELETE FROM round_close_attempts WHERE round_id = p_round_id;

  UPDATE rounds
  SET status = 'in_progress',
      auto_close_pending = false,
      auto_close_scheduled_at = NULL,
      is_incomplete = false,
      updated_at = now()
  WHERE id = p_round_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_round_for_reclose(uuid) TO authenticated;

-- PARTE G (definida antes para que mark_auto_close_pending pueda llamarla)
CREATE OR REPLACE FUNCTION public.enqueue_auto_close_notification(p_round_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organizer_email text;
  v_organizer_name text;
  v_course_name text;
  v_round_date date;
BEGIN
  SELECT
    u.email,
    p.display_name,
    gc.name,
    r.date
  INTO v_organizer_email, v_organizer_name, v_course_name, v_round_date
  FROM public.rounds r
  JOIN public.profiles p ON p.id = r.organizer_id
  JOIN auth.users u ON u.id = p.user_id
  JOIN public.golf_courses gc ON gc.id = r.course_id
  WHERE r.id = p_round_id;

  IF v_organizer_email IS NULL THEN RETURN; END IF;

  PERFORM public.enqueue_email('transactional_emails', jsonb_build_object(
    'to', v_organizer_email,
    'subject', 'Tu ronda de golf será cerrada automáticamente',
    'template', 'auto_close_warning',
    'variables', jsonb_build_object(
      'organizer_name', COALESCE(v_organizer_name, 'Golfista'),
      'course_name', v_course_name,
      'round_date', v_round_date::text,
      'reopen_url', 'https://golfgreenbookscf.com'
    )
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_auto_close_notification(uuid) TO service_role;

-- PARTE C (con loop de notificaciones — PARTE G)
CREATE OR REPLACE FUNCTION public.mark_auto_close_pending()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_round record;
BEGIN
  FOR v_round IN
    SELECT r.id
    FROM public.rounds r
    WHERE r.status = 'in_progress'
      AND r.date <= CURRENT_DATE - 3
      AND r.auto_close_pending = false
      AND EXISTS (
        SELECT 1
        FROM public.round_players rp
        JOIN public.hole_scores hs ON hs.round_player_id = rp.id
        WHERE rp.round_id = r.id
          AND rp.profile_id = r.organizer_id
          AND hs.confirmed = true
          AND hs.strokes IS NOT NULL
      )
  LOOP
    UPDATE public.rounds
    SET auto_close_pending = true,
        auto_close_scheduled_at = now()
    WHERE id = v_round.id;

    v_count := v_count + 1;

    BEGIN
      PERFORM public.enqueue_auto_close_notification(v_round.id);
    EXCEPTION WHEN OTHERS THEN
      -- No abortar el batch si falla el email de un organizador
      NULL;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_auto_close_pending() TO service_role;

-- PARTE D
CREATE OR REPLACE FUNCTION public.get_my_pending_auto_close_rounds()
RETURNS TABLE (
  round_id uuid,
  round_date date,
  course_name text,
  organizer_name text,
  organizer_email text,
  all_players_complete boolean,
  incomplete_player_names text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid := public.get_my_profile_id();
BEGIN
  IF v_profile_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.date,
    gc.name,
    org.display_name,
    u.email,
    NOT EXISTS (
      SELECT 1 FROM public.round_players rp2
      WHERE rp2.round_id = r.id
        AND rp2.profile_id IS NOT NULL
        AND (
          SELECT COUNT(*) FROM public.hole_scores hs2
          WHERE hs2.round_player_id = rp2.id
            AND hs2.confirmed = true
            AND hs2.strokes IS NOT NULL
        ) < 18
    ),
    ARRAY(
      SELECT COALESCE(p2.display_name, rp3.guest_name, 'Jugador')
      FROM public.round_players rp3
      LEFT JOIN public.profiles p2 ON p2.id = rp3.profile_id
      WHERE rp3.round_id = r.id
        AND (
          SELECT COUNT(*) FROM public.hole_scores hs3
          WHERE hs3.round_player_id = rp3.id
            AND hs3.confirmed = true
            AND hs3.strokes IS NOT NULL
        ) < 18
    )
  FROM public.rounds r
  JOIN public.golf_courses gc ON gc.id = r.course_id
  JOIN public.profiles org ON org.id = r.organizer_id
  LEFT JOIN auth.users u ON u.id = org.user_id
  WHERE r.auto_close_pending = true
    AND r.status = 'in_progress'
    AND EXISTS (
      SELECT 1 FROM public.round_players rp
      WHERE rp.round_id = r.id
        AND rp.profile_id = v_profile_id
    )
  ORDER BY r.date ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_pending_auto_close_rounds() TO authenticated;

-- PARTE E
CREATE OR REPLACE FUNCTION public.close_round_as_incomplete(p_round_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid := public.get_my_profile_id();
BEGIN
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.round_players rp
    WHERE rp.round_id = p_round_id AND rp.profile_id = v_profile_id
  ) THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;

  IF (SELECT status FROM public.rounds WHERE id = p_round_id) != 'in_progress' THEN
    RAISE EXCEPTION 'round_not_in_progress';
  END IF;

  UPDATE public.rounds
  SET
    status = 'completed',
    is_incomplete = true,
    auto_close_pending = false,
    auto_close_scheduled_at = NULL,
    updated_at = now()
  WHERE id = p_round_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_round_as_incomplete(uuid) TO authenticated;

-- PARTE F
DO $$
BEGIN
  PERFORM cron.unschedule('mark-auto-close-pending');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'mark-auto-close-pending',
  '0 9 * * *',
  $$SELECT public.mark_auto_close_pending();$$
);
