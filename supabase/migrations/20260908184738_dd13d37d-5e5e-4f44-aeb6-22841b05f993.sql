CREATE OR REPLACE FUNCTION public.enqueue_auto_close_notification(p_round_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_organizer_email text;
  v_organizer_name text;
  v_course_name text;
  v_round_date date;
  v_html text;
BEGIN
  SELECT u.email, p.display_name, gc.name, r.date
  INTO v_organizer_email, v_organizer_name, v_course_name, v_round_date
  FROM public.rounds r
  JOIN public.profiles p ON p.id = r.organizer_id
  JOIN auth.users u ON u.id = p.user_id
  JOIN public.golf_courses gc ON gc.id = r.course_id
  WHERE r.id = p_round_id;

  IF v_organizer_email IS NULL THEN RETURN; END IF;

  v_organizer_name := COALESCE(v_organizer_name, 'Golfista');
  v_course_name    := COALESCE(v_course_name, 'tu campo');

  v_html := format($HTML$<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Cierre automatico de ronda</title></head>
<body style="margin:0;padding:0;background:#0a0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%%" cellpadding="0" cellspacing="0" style="background:#0a0f1a;padding:20px 0;"><tr><td align="center">
<table width="100%%" style="max-width:480px;margin:0 auto;" cellpadding="0" cellspacing="0">
<tr><td style="background:#0a2d18;padding:28px 24px 20px;text-align:center;border-radius:16px 16px 0 0;">
<div style="font-family:Georgia,serif;font-size:32px;font-style:italic;font-weight:500;color:#d9af4f;letter-spacing:1px;">GreenBook</div>
<div style="font-size:20px;font-weight:800;color:#f8fafc;margin-top:10px;">Cierre automatico de ronda</div>
</td></tr>
<tr><td style="background:#0f172a;padding:22px 24px;">
<div style="font-size:14px;color:#f8fafc;margin-bottom:12px;">Hola %s,</div>
<div style="font-size:14px;color:#cbd5e1;line-height:1.6;">Tu ronda en <strong style="color:#f8fafc;">%s</strong> del <strong style="color:#f8fafc;">%s</strong> sigue abierta y sera cerrada automaticamente.</div>
<div style="font-size:13px;color:#94a3b8;line-height:1.6;margin-top:12px;">Si falta capturar golpes o revisar apuestas, entra ahora para completar la ronda antes del cierre.</div>
</td></tr>
<tr><td style="background:#061a0e;padding:20px 24px;border-radius:0 0 16px 16px;text-align:center;">
<a href="https://golfgreenbookscf.com" style="display:inline-block;background:#166534;color:#f8fafc;font-size:13px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;">Abrir GreenBook</a>
<div style="font-size:10px;color:#1f2937;margin-top:14px;">&copy; 2026 GreenBook. Todos los derechos reservados.</div>
</td></tr></table></td></tr></table></body></html>$HTML$,
    v_organizer_name,
    v_course_name,
    COALESCE(v_round_date::text, 'dia pendiente')
  );

  PERFORM public.enqueue_email('transactional_emails', jsonb_build_object(
    'to',      v_organizer_email,
    'subject', 'Tu ronda de golf sera cerrada automaticamente',
    'html',    v_html,
    'label',   'auto_close_warning',
    'text',    format('Hola %s: tu ronda en %s del %s sera cerrada automaticamente. Abre https://golfgreenbookscf.com para completarla.',
                v_organizer_name, v_course_name, COALESCE(v_round_date::text, 'dia pendiente')),
    'idempotency_key', p_round_id::text || '::auto_close_warning'
  ));
END;
$fn$;

-- Defensa: nunca encolar un correo sin cuerpo utilizable.
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $fn$
DECLARE
  v_payload jsonb := payload;
  v_to      text;
  v_token   text;
BEGIN
  IF queue_name = 'transactional_emails' THEN
    IF COALESCE(v_payload->>'html', '') = '' THEN
      RAISE EXCEPTION 'enqueue_email: payload sin html utilizable (label=%, to=%)',
        COALESCE(v_payload->>'label', 'n/a'), COALESCE(v_payload->>'to', 'n/a');
    END IF;

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
$fn$;