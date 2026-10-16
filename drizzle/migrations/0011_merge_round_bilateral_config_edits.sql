CREATE OR REPLACE FUNCTION public.merge_bet_config_changes(p_base jsonb, p_local jsonb, p_remote jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $fn$
DECLARE v_result jsonb := COALESCE(p_remote, '{}'::jsonb); v_key text; v_base jsonb; v_local jsonb; v_remote jsonb; v_item jsonb; v_id text; v_map_base jsonb := '{}'; v_map_local jsonb := '{}'; v_map_remote jsonb := '{}';
BEGIN
 IF p_base IS NOT DISTINCT FROM p_local THEN RETURN p_remote; END IF;
 IF jsonb_typeof(p_base) = 'object' AND jsonb_typeof(p_local) = 'object' THEN
  IF jsonb_typeof(v_result) <> 'object' THEN v_result := '{}'; END IF;
  FOR v_key IN SELECT key FROM jsonb_object_keys(p_base || p_local) AS keys(key) LOOP
   v_base := p_base->v_key; v_local := p_local->v_key; v_remote := v_result->v_key;
   IF v_base IS NOT DISTINCT FROM v_local THEN CONTINUE; END IF;
   IF NOT (p_local ? v_key) THEN v_result := v_result - v_key;
   ELSIF v_key = 'betOverrides' AND jsonb_typeof(v_local) = 'array' THEN
    v_map_base := '{}'; v_map_local := '{}'; v_map_remote := '{}';
    FOR v_item IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_base) = 'array' THEN v_base ELSE '[]' END) LOOP
     v_id := LEAST(v_item->>'playerAId',v_item->>'playerBId') || ':' || GREATEST(v_item->>'playerAId',v_item->>'playerBId') || ':' || (v_item->>'betType');
     v_map_base := v_map_base || jsonb_build_object(v_id,v_item);
    END LOOP;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_local) LOOP
     v_id := LEAST(v_item->>'playerAId',v_item->>'playerBId') || ':' || GREATEST(v_item->>'playerAId',v_item->>'playerBId') || ':' || (v_item->>'betType');
     v_map_local := v_map_local || jsonb_build_object(v_id,v_item);
    END LOOP;
    FOR v_item IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_remote) = 'array' THEN v_remote ELSE '[]' END) LOOP
     v_id := LEAST(v_item->>'playerAId',v_item->>'playerBId') || ':' || GREATEST(v_item->>'playerAId',v_item->>'playerBId') || ':' || (v_item->>'betType');
     v_map_remote := v_map_remote || jsonb_build_object(v_id,v_item);
    END LOOP;
    SELECT COALESCE(jsonb_agg(value ORDER BY key),'[]'::jsonb) INTO v_local FROM jsonb_each(public.merge_bet_config_changes(v_map_base,v_map_local,v_map_remote));
    v_result := jsonb_set(v_result,ARRAY[v_key],v_local,true);
   ELSE v_result := jsonb_set(v_result,ARRAY[v_key],COALESCE(public.merge_bet_config_changes(v_base,v_local,v_remote),'null'::jsonb),true);
   END IF;
  END LOOP;
  RETURN v_result;
 END IF;
 RETURN p_local;
END;
$fn$;
REVOKE ALL ON FUNCTION public.merge_bet_config_changes(jsonb,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_bet_config_changes(jsonb,jsonb,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.merge_round_bet_config(p_round_id uuid, p_base_config jsonb, p_bet_config jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_config jsonb; v_updated_at timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 IF NOT public.is_round_participant(p_round_id) THEN RAISE EXCEPTION 'Only round participants can update bet config'; END IF;
 SELECT COALESCE(bet_config,'{}'::jsonb) INTO v_config FROM public.rounds WHERE id=p_round_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Round not found'; END IF;
 v_config := public.merge_bet_config_changes(COALESCE(p_base_config,'{}'::jsonb),p_bet_config,v_config);
 UPDATE public.rounds SET bet_config=v_config, updated_at=clock_timestamp() WHERE id=p_round_id RETURNING updated_at INTO v_updated_at;
 RETURN jsonb_build_object('bet_config',v_config,'updated_at',v_updated_at);
END;
$fn$;
REVOKE ALL ON FUNCTION public.merge_round_bet_config(uuid,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_round_bet_config(uuid,jsonb,jsonb) TO authenticated, service_role;