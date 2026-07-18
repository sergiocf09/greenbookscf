CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq'
AS $function$
DECLARE
  v_payload jsonb := payload;
BEGIN
  IF queue_name = 'transactional_emails' THEN
    IF NOT (v_payload ? 'message_id')    THEN v_payload := v_payload || jsonb_build_object('message_id',    gen_random_uuid()::text); END IF;
    IF NOT (v_payload ? 'purpose')       THEN v_payload := v_payload || jsonb_build_object('purpose',       'transactional'); END IF;
    IF NOT (v_payload ? 'from')          THEN v_payload := v_payload || jsonb_build_object('from',          'greenbookscf <noreply@notify.golfgreenbookscf.com>'); END IF;
    IF NOT (v_payload ? 'sender_domain') THEN v_payload := v_payload || jsonb_build_object('sender_domain', 'notify.golfgreenbookscf.com'); END IF;
    IF NOT (v_payload ? 'queued_at')     THEN v_payload := v_payload || jsonb_build_object('queued_at',     now()); END IF;
    IF NOT (v_payload ? 'text') THEN
      v_payload := v_payload || jsonb_build_object('text',
        COALESCE(v_payload->>'subject','GreenBook CF') || E'\n\nAbre este correo en un cliente compatible con HTML para ver el resumen completo.');
    END IF;
  END IF;
  RETURN pgmq.send(queue_name, v_payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, v_payload);
END;
$function$;

-- Purge failed messages and re-enqueue
SELECT pgmq.delete('transactional_emails', msg_id) FROM pgmq.q_transactional_emails;
SELECT public.enqueue_round_close_emails('34b1a403-8103-4182-ba3a-ed558c3d2de5'::uuid);