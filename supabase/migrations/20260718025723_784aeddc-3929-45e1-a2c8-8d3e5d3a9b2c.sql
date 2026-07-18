CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq', 'extensions'
AS $function$
DECLARE
  v_payload jsonb := payload;
  v_to      text;
  v_token   text;
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

    IF NOT (v_payload ? 'unsubscribe_token') THEN
      v_to := lower(trim(v_payload->>'to'));
      IF v_to IS NOT NULL AND v_to <> '' THEN
        SELECT token INTO v_token FROM public.email_unsubscribe_tokens
        WHERE email = v_to AND used_at IS NULL LIMIT 1;
        IF v_token IS NULL THEN
          v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
          INSERT INTO public.email_unsubscribe_tokens (email, token) VALUES (v_to, v_token)
          ON CONFLICT DO NOTHING;
        END IF;
        v_payload := v_payload || jsonb_build_object('unsubscribe_token', v_token);
      END IF;
    END IF;

    IF v_payload ? 'idempotency_key' THEN
      v_payload := v_payload || jsonb_build_object('idempotency_key',
        (v_payload->>'idempotency_key') || '::' || to_char(now(),'YYYYMMDDHH24MISS') || '::' || substr(md5(random()::text),1,6));
    END IF;
  END IF;

  RETURN pgmq.send(queue_name, v_payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, v_payload);
END;
$function$;

SELECT pgmq.delete('transactional_emails', msg_id) FROM pgmq.q_transactional_emails;
SELECT public.enqueue_round_close_emails('34b1a403-8103-4182-ba3a-ed558c3d2de5'::uuid);