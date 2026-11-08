-- Each close (including re-closes after reopening) must produce a new results email.
-- Previously the idempotency key was round::profile, so re-closed rounds were deduplicated by the email provider and never delivered.
DO $mig$
DECLARE
  d text;
  old_select text := E'  SELECT rs.snapshot_json INTO v_snapshot\n  FROM public.round_snapshots rs\n  WHERE rs.round_id = p_round_id;';
  new_select text := E'  SELECT rs.snapshot_json,\n         COALESCE(extract(epoch FROM COALESCE(rs.closed_at, rs.created_at))::bigint::text, ''v'' || rs.snapshot_version::text)\n  INTO v_snapshot, v_close_key\n  FROM public.round_snapshots rs\n  WHERE rs.round_id = p_round_id;';
  old_key text := $k$'idempotency_key',  p_round_id || '::' || v_profile_id::text$k$;
  new_key text := $k$'idempotency_key',  p_round_id || '::' || v_profile_id::text || '::' || COALESCE(v_close_key, '0')$k$;
BEGIN
  d := pg_get_functiondef('public.enqueue_round_close_emails(uuid)'::regprocedure);
  IF position('v_close_key' IN d) > 0 THEN
    RETURN; -- already applied
  END IF;
  IF position(old_select IN d) = 0 OR position(old_key IN d) = 0 THEN
    RAISE EXCEPTION 'enqueue_round_close_emails has unexpected shape; aborting';
  END IF;
  d := replace(d, E'  v_snapshot       jsonb;\n', E'  v_snapshot       jsonb;\n  v_close_key      text;\n');
  d := replace(d, old_select, new_select);
  d := replace(d, old_key, new_key);
  EXECUTE d;
END
$mig$;