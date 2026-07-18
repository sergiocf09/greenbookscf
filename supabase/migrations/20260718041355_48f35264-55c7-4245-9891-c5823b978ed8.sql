DO $$
DECLARE
  v_sql text;
  v_fn_oid oid;
BEGIN
  SELECT oid INTO v_fn_oid
  FROM pg_proc
  WHERE proname = 'enqueue_round_close_emails' AND pronamespace = 'public'::regnamespace;

  v_sql := pg_get_functiondef(v_fn_oid);

  v_sql := replace(v_sql,
    '<tr><td style="padding:0;border-radius:16px 16px 0 0;overflow:hidden;text-align:center;background:#0a2d18;">' || chr(10) ||
    '<img src="https://golfgreenbookscf.com/email-header.png" alt="GreenBook" width="480" style="display:block;width:100%;max-width:480px;height:auto;border:0;outline:none;text-decoration:none;" />' || chr(10) ||
    '</td></tr>' || chr(10) ||
    '<tr><td style="background:#0a2d18;padding:0 24px 20px;text-align:center;">',
    '<tr><td style="background:#0a2d18;padding:28px 24px 8px;text-align:center;border-radius:16px 16px 0 0;">' || chr(10) ||
    '<div style="font-family:Georgia,serif;font-size:32px;font-style:italic;font-weight:500;color:#d9af4f;letter-spacing:1px;">GreenBook</div>' || chr(10) ||
    '</td></tr>' || chr(10) ||
    '<tr><td style="background:#0a2d18;padding:0 24px 20px;text-align:center;">'
  );

  EXECUTE v_sql;
END;
$$;