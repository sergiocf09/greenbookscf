CREATE OR REPLACE FUNCTION public.merge_round_bet_config(p_round_id uuid, p_base_config jsonb, p_bet_config jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_config jsonb;
  v_merged jsonb;
  v_updated_at timestamptz;
  v_own_groups text[];
  v_key text;
  v_new_gbo jsonb;
  v_old_gbo jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_round_participant(p_round_id) THEN RAISE EXCEPTION 'Only round participants can update bet config'; END IF;

  SELECT COALESCE(bet_config,'{}'::jsonb), updated_at INTO v_config, v_updated_at
  FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Round not found'; END IF;

  v_merged := public.merge_bet_config_changes(COALESCE(p_base_config,'{}'::jsonb), p_bet_config, v_config);

  IF NOT public.is_round_admin(p_round_id) THEN
    -- Non-admin: a no-op save is acknowledged without writing.
    IF v_merged IS NOT DISTINCT FROM v_config THEN
      RETURN jsonb_build_object('bet_config', v_config, 'updated_at', v_updated_at);
    END IF;

    -- Everything outside per-group overrides is reserved to organizer/co-admins.
    IF (v_merged - 'groupBetOverrides') IS DISTINCT FROM (v_config - 'groupBetOverrides') THEN
      RAISE EXCEPTION 'ROUND_ADMIN_REQUIRED' USING ERRCODE = '42501';
    END IF;

    -- Players of secondary groups (G2+) may edit only their own group's overrides.
    SELECT array_agg(rp.group_id::text) INTO v_own_groups
    FROM public.round_players rp
    JOIN public.round_groups rg ON rg.id = rp.group_id
    WHERE rp.round_id = p_round_id
      AND rp.profile_id = public.get_my_profile_id()
      AND rg.group_number > 1;

    v_new_gbo := CASE WHEN jsonb_typeof(v_merged->'groupBetOverrides') = 'object' THEN v_merged->'groupBetOverrides' ELSE '{}'::jsonb END;
    v_old_gbo := CASE WHEN jsonb_typeof(v_config->'groupBetOverrides') = 'object' THEN v_config->'groupBetOverrides' ELSE '{}'::jsonb END;

    FOR v_key IN SELECT jsonb_object_keys(v_new_gbo || v_old_gbo) LOOP
      IF (v_new_gbo->v_key) IS DISTINCT FROM (v_old_gbo->v_key)
         AND NOT (v_key = ANY (COALESCE(v_own_groups, '{}'::text[]))) THEN
        RAISE EXCEPTION 'ROUND_ADMIN_REQUIRED' USING ERRCODE = '42501';
      END IF;
    END LOOP;
  END IF;

  UPDATE public.rounds SET bet_config = v_merged, updated_at = clock_timestamp()
  WHERE id = p_round_id RETURNING updated_at INTO v_updated_at;
  RETURN jsonb_build_object('bet_config', v_merged, 'updated_at', v_updated_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_round_bet_config(p_round_id uuid, p_bet_config jsonb)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_round_admin(p_round_id) THEN
    RAISE EXCEPTION 'ROUND_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.rounds
  SET bet_config = p_bet_config, updated_at = now()
  WHERE id = p_round_id
  RETURNING updated_at INTO v_updated_at;

  RETURN v_updated_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_abandoned_setup_rounds()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  v_round record;
BEGIN
  FOR v_round IN
    SELECT r.id,
      EXISTS (
        SELECT 1 FROM public.round_players rp
        JOIN public.hole_scores hs ON hs.round_player_id = rp.id
        WHERE rp.round_id = r.id
      ) AS has_scores
    FROM public.rounds r
    WHERE r.status = 'setup'
      AND r.updated_at < now() - interval '48 hours'
  LOOP
    BEGIN
      IF v_round.has_scores THEN
        -- Never leave a scored round open forever: close it as incomplete
        -- (no snapshot, so no balances or ledger are generated).
        UPDATE public.rounds
        SET status = 'completed',
            is_incomplete = true,
            auto_close_pending = false,
            auto_close_scheduled_at = NULL,
            updated_at = now()
        WHERE id = v_round.id;
      ELSE
        DELETE FROM public.rounds WHERE id = v_round.id;
      END IF;
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
  RETURN v_count;
END;
$function$;