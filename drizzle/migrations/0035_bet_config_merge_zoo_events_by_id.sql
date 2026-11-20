CREATE OR REPLACE FUNCTION public._merge_bet_config_id_array(p_base jsonb, p_local jsonb, p_remote jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_base_arr jsonb := CASE WHEN jsonb_typeof(p_base) = 'array' THEN p_base ELSE '[]'::jsonb END;
  v_remote_arr jsonb := CASE WHEN jsonb_typeof(p_remote) = 'array' THEN p_remote ELSE '[]'::jsonb END;
  v_b jsonb := '{}'::jsonb;
  v_l jsonb := '{}'::jsonb;
  v_seen jsonb := '{}'::jsonb;
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
  v_id text;
BEGIN
  IF jsonb_typeof(p_local) IS DISTINCT FROM 'array' THEN RETURN p_local; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_local || v_base_arr || v_remote_arr) e(value)
    WHERE jsonb_typeof(e.value) <> 'object' OR jsonb_typeof(e.value->'id') IS DISTINCT FROM 'string'
  ) THEN
    RETURN p_local;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_base_arr) LOOP
    v_b := v_b || jsonb_build_object(v_item->>'id', v_item);
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_local) LOOP
    v_l := v_l || jsonb_build_object(v_item->>'id', v_item);
  END LOOP;

  FOR v_item IN SELECT t.value FROM jsonb_array_elements(v_remote_arr) WITH ORDINALITY t(value, ord) ORDER BY t.ord LOOP
    v_id := v_item->>'id';
    v_seen := v_seen || jsonb_build_object(v_id, true);
    IF (v_b ? v_id) AND NOT (v_l ? v_id) THEN
      CONTINUE; -- deleted on the saving phone
    ELSIF (v_l ? v_id) AND (v_b->v_id) IS DISTINCT FROM (v_l->v_id) THEN
      v_out := v_out || jsonb_build_array(public.merge_bet_config_changes(v_b->v_id, v_l->v_id, v_item));
    ELSE
      v_out := v_out || jsonb_build_array(v_item);
    END IF;
  END LOOP;

  FOR v_item IN SELECT t.value FROM jsonb_array_elements(p_local) WITH ORDINALITY t(value, ord) ORDER BY t.ord LOOP
    v_id := v_item->>'id';
    IF (v_seen ? v_id) OR (v_b ? v_id) THEN CONTINUE; END IF; -- merged already, or deleted elsewhere
    v_out := v_out || jsonb_build_array(v_item);
  END LOOP;

  RETURN v_out;
END;
$function$;

CREATE OR REPLACE FUNCTION public.merge_bet_config_changes(p_base jsonb, p_local jsonb, p_remote jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
   ELSIF v_key = 'events' AND jsonb_typeof(v_local) = 'array' THEN
    v_result := jsonb_set(v_result,ARRAY[v_key],public._merge_bet_config_id_array(v_base,v_local,v_remote),true);
   ELSE v_result := jsonb_set(v_result,ARRAY[v_key],COALESCE(public.merge_bet_config_changes(v_base,v_local,v_remote),'null'::jsonb),true);
   END IF;
  END LOOP;
  RETURN v_result;
 END IF;
 RETURN p_local;
END;
$function$;

REVOKE ALL ON FUNCTION public._merge_bet_config_id_array(jsonb, jsonb, jsonb) FROM PUBLIC, anon;