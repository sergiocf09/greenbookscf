ALTER TABLE public.ledger_transactions ADD COLUMN IF NOT EXISTS cross_bet_id uuid;
CREATE INDEX IF NOT EXISTS ledger_cross_bet_idx ON public.ledger_transactions(cross_bet_id) WHERE cross_bet_id IS NOT NULL;
UPDATE public.ledger_transactions l SET cross_bet_id=cb.id FROM public.round_cross_bets cb WHERE l.cross_bet_id IS NULL AND l.round_id=cb.round_id AND l.description LIKE 'Cruce%' AND ((l.from_profile_id=cb.initiator_profile_id AND l.to_profile_id=cb.target_profile_id) OR (l.to_profile_id=cb.initiator_profile_id AND l.from_profile_id=cb.target_profile_id));
CREATE OR REPLACE FUNCTION public.settle_cross_bet(p_cross_bet_id uuid,p_lines jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_cb record; v_me uuid; v_n integer:=0; l jsonb; v_target_round uuid; v_date date;
BEGIN
 SELECT * INTO v_cb FROM public.round_cross_bets WHERE id=p_cross_bet_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'cross_bet_not_found'; END IF;
 SELECT date INTO v_date FROM public.rounds WHERE id=v_cb.round_id;
 SELECT r.id INTO v_target_round FROM public.rounds r JOIN public.round_players rp ON rp.round_id=r.id WHERE r.date=v_date AND r.id<>v_cb.round_id AND rp.profile_id=v_cb.target_profile_id AND NOT rp.is_cross_only ORDER BY r.created_at DESC LIMIT 1;
 v_me:=public.get_my_profile_id();
 IF v_me IS NULL OR NOT (v_me IN (v_cb.initiator_profile_id,v_cb.target_profile_id) OR public.is_round_organizer(v_cb.round_id) OR (v_target_round IS NOT NULL AND public.is_round_organizer(v_target_round))) THEN RAISE EXCEPTION 'not_authorized'; END IF;
 IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' THEN RAISE EXCEPTION 'invalid_cross_lines'; END IF;
 DELETE FROM public.ledger_transactions WHERE cross_bet_id=p_cross_bet_id;
 FOR l IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF (l->>'from_profile_id') IS NULL OR (l->>'to_profile_id') IS NULL OR (l->>'from_profile_id')::uuid NOT IN (v_cb.initiator_profile_id,v_cb.target_profile_id) OR (l->>'to_profile_id')::uuid NOT IN (v_cb.initiator_profile_id,v_cb.target_profile_id) OR (l->>'from_profile_id')=(l->>'to_profile_id') THEN RAISE EXCEPTION 'invalid_cross_line'; END IF;
  IF (l->>'amount') IS NULL OR (l->>'amount')::numeric<=0 OR (l->>'amount')::numeric>1000000 OR coalesce(l->>'segment','total') NOT IN ('front','back','total','hole') THEN RAISE EXCEPTION 'invalid_cross_amount_or_segment'; END IF;
  IF l->>'segment'='hole' AND (nullif(l->>'hole_number','')::int IS NULL OR (l->>'hole_number')::int NOT BETWEEN 1 AND 18) THEN RAISE EXCEPTION 'invalid_cross_hole'; END IF;
  INSERT INTO public.ledger_transactions(round_id,cross_bet_id,from_profile_id,to_profile_id,bet_type,segment,hole_number,amount,description) VALUES(v_cb.round_id,p_cross_bet_id,(l->>'from_profile_id')::uuid,(l->>'to_profile_id')::uuid,(l->>'bet_type')::public.bet_type,coalesce(l->>'segment','total'),nullif(l->>'hole_number','')::int,(l->>'amount')::numeric,'Cruce · '||coalesce(l->>'label',''));
  v_n:=v_n+1;
 END LOOP;
 RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.settle_cross_bet(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.settle_cross_bet(uuid,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_my_cross_bet_history() RETURNS TABLE(line_id uuid,cross_bet_id uuid,origin_round_id uuid,own_round_id uuid,date date,course_name text,rival_profile_id uuid,rival_name text,net_amount numeric,label text,segment text,hole_number integer,is_final boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH me AS (SELECT public.get_my_profile_id() AS id), records AS (
 SELECT l.*,r.date AS play_date,r.status AS origin_status,c.name AS origin_course,
 CASE WHEN EXISTS(SELECT 1 FROM public.round_players rp WHERE rp.round_id=l.round_id AND rp.profile_id=me.id AND NOT rp.is_cross_only) THEN l.round_id ELSE (SELECT rr.id FROM public.round_players rp JOIN public.rounds rr ON rr.id=rp.round_id WHERE rp.profile_id=me.id AND NOT rp.is_cross_only AND rr.date=r.date AND rr.id<>r.id ORDER BY rr.created_at DESC LIMIT 1) END AS own_id,
 CASE WHEN l.to_profile_id=me.id THEN l.from_profile_id ELSE l.to_profile_id END AS rival_id,
 CASE WHEN l.to_profile_id=me.id THEN l.amount ELSE -l.amount END AS signed_amount
 FROM public.ledger_transactions l JOIN public.rounds r ON r.id=l.round_id JOIN public.golf_courses c ON c.id=r.course_id CROSS JOIN me WHERE me.id IS NOT NULL AND (l.from_profile_id=me.id OR l.to_profile_id=me.id) AND (l.cross_bet_id IS NOT NULL OR l.description LIKE 'Cruce%')
 ) SELECT q.id,q.cross_bet_id,q.round_id,q.own_id,q.play_date,q.origin_course,q.rival_id,p.display_name,q.signed_amount,regexp_replace(coalesce(q.description,''),'^Cruce · ',''),q.segment,q.hole_number,
 q.origin_status='completed' AND EXISTS(SELECT 1 FROM public.round_players rp JOIN public.rounds rr ON rr.id=rp.round_id WHERE rp.profile_id=q.rival_id AND NOT rp.is_cross_only AND rr.date=q.play_date AND rr.id<>q.own_id AND rr.status='completed')
 FROM records q JOIN public.profiles p ON p.id=q.rival_id WHERE q.origin_status='completed' OR EXISTS(SELECT 1 FROM public.rounds rr WHERE rr.id=q.own_id AND rr.status='completed');
$$;
REVOKE ALL ON FUNCTION public.get_my_cross_bet_history() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_cross_bet_history() TO authenticated;