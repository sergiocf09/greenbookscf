
-- 1. Reduce threshold from 3 days to 1 day (24h)
CREATE OR REPLACE FUNCTION public.mark_auto_close_pending()
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
    SELECT r.id
    FROM public.rounds r
    WHERE r.status = 'in_progress'
      AND r.date <= CURRENT_DATE - 1
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
      NULL;
    END;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- 2. New function that force-closes pending rounds as incomplete (server-side, no client dependency)
CREATE OR REPLACE FUNCTION public.execute_auto_close_pending()
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
    SELECT r.id
    FROM public.rounds r
    WHERE r.status = 'in_progress'
      AND r.auto_close_pending = true
  LOOP
    BEGIN
      UPDATE public.rounds
      SET
        status = 'completed',
        is_incomplete = true,
        auto_close_pending = false,
        auto_close_scheduled_at = NULL,
        updated_at = now()
      WHERE id = v_round.id;

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.execute_auto_close_pending() TO service_role;

-- 3. Schedule the execution cron 1 hour after the mark cron
SELECT cron.unschedule('execute-auto-close-pending')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'execute-auto-close-pending');

SELECT cron.schedule(
  'execute-auto-close-pending',
  '0 10 * * *',
  $$SELECT public.execute_auto_close_pending();$$
);
