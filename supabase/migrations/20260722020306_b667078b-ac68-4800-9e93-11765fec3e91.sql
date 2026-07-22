
-- 1) Fix mark_auto_close_pending: drop organizer-score requirement, still require in_progress + date past
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
      AND r.updated_at < now() - interval '24 hours'
  LOOP
    UPDATE public.rounds
    SET auto_close_pending = true,
        auto_close_scheduled_at = now()
    WHERE id = v_round.id;
    v_count := v_count + 1;
    BEGIN
      PERFORM public.enqueue_auto_close_notification(v_round.id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  RETURN v_count;
END;
$function$;

-- 2) Cleanup abandoned setup rounds: delete rounds still in 'setup' with no scores, > 48h old
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
    SELECT r.id
    FROM public.rounds r
    WHERE r.status = 'setup'
      AND r.updated_at < now() - interval '48 hours'
      AND NOT EXISTS (
        SELECT 1 FROM public.round_players rp
        JOIN public.hole_scores hs ON hs.round_player_id = rp.id
        WHERE rp.round_id = r.id
      )
  LOOP
    DELETE FROM public.rounds WHERE id = v_round.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

-- 3) Schedule cleanup daily alongside existing crons
SELECT cron.unschedule('cleanup-abandoned-setup-rounds') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='cleanup-abandoned-setup-rounds');
SELECT cron.schedule('cleanup-abandoned-setup-rounds', '30 9 * * *', 'SELECT public.cleanup_abandoned_setup_rounds();');

-- 4) One-time cleanup of the 6 stale rounds
--    Delete abandoned setup + in_progress with 0 scores older than 48h
DELETE FROM public.rounds
WHERE id IN (
  '8a2a955d-8afe-4404-8391-ee99169cac34', -- Carlos Riveron, setup, 0 scores
  'c3270667-4e7c-4ca0-bd65-538043d19e19', -- Alberto, setup, 0 scores
  '2270bed4-efac-4440-b023-da6b5efdd3d8'  -- Lelo De Larrea, in_progress but 0 scores
);

-- Close as incomplete the in_progress rounds that have score data
UPDATE public.rounds
SET status = 'completed',
    is_incomplete = true,
    auto_close_pending = false,
    auto_close_scheduled_at = NULL,
    updated_at = now()
WHERE id IN (
  '9f800f5a-c7bb-4e72-b47c-725802463e6c', -- Sergio Cruz F, 18 scores
  '5d0d0980-01f8-4160-b277-c8745df65b4e'  -- Gustavo De Echevarría, 12 scores
);

-- (Angel Arellano 0b0c78ac created hoy 21-jul, se deja intacta; setup activo)
