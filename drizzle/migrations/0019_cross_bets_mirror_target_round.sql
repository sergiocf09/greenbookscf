DROP FUNCTION IF EXISTS public.get_cross_bets_for_round(uuid);
CREATE FUNCTION public.get_cross_bets_for_round(p_round_id uuid)
 RETURNS TABLE(cross_bet_id uuid, initiator_profile_id uuid, initiator_name text, initiator_initials text, initiator_color text, target_profile_id uuid, target_name text, target_initials text, target_color text, target_round_player_id uuid, bet_config jsonb, origin_round_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_date date;
BEGIN
  IF NOT public.is_round_participant(p_round_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT r.date INTO v_date FROM rounds r WHERE r.id = p_round_id;
  RETURN QUERY
  SELECT cb.id, cb.initiator_profile_id, pi.display_name, pi.initials, pi.avatar_color,
    cb.target_profile_id, pt.display_name, pt.initials, pt.avatar_color,
    cb.target_round_player_id, cb.bet_config, cb.round_id
  FROM round_cross_bets cb
  JOIN profiles pi ON pi.id = cb.initiator_profile_id
  JOIN profiles pt ON pt.id = cb.target_profile_id
  JOIN rounds orr ON orr.id = cb.round_id
  WHERE cb.round_id = p_round_id
     OR (cb.round_id <> p_round_id AND orr.date = v_date
         AND EXISTS (SELECT 1 FROM round_players rp WHERE rp.round_id = p_round_id
                     AND rp.profile_id = cb.target_profile_id AND NOT rp.is_cross_only))
  ORDER BY cb.created_at;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_cross_bets_for_round(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_cross_bet_scores(p_round_id uuid)
 RETURNS TABLE(cross_bet_id uuid, profile_id uuid, hole_number integer, strokes integer, net_score integer, putts integer, oyes_proximity integer, oyes_proximity_sangron integer, markers jsonb)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_round_participant(p_round_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY
  WITH cbs AS (
    SELECT g.cross_bet_id AS id, g.origin_round_id AS oround, g.initiator_profile_id AS ipid, g.target_profile_id AS tpid, r.date AS odate
    FROM public.get_cross_bets_for_round(p_round_id) g JOIN rounds r ON r.id = g.origin_round_id
  ),
  src AS (
    SELECT c.id AS cb_id, c.ipid AS pid,
      (SELECT rp.id FROM round_players rp WHERE rp.round_id = c.oround AND rp.profile_id = c.ipid AND NOT rp.is_cross_only LIMIT 1) AS rp_id
    FROM cbs c
    UNION ALL
    SELECT c.id, c.tpid,
      (SELECT rp.id FROM round_players rp JOIN rounds r ON r.id = rp.round_id
        WHERE rp.profile_id = c.tpid AND NOT rp.is_cross_only AND r.date = c.odate AND r.id <> c.oround
        ORDER BY r.created_at DESC LIMIT 1)
    FROM cbs c
  )
  SELECT s.cb_id, s.pid, hs.hole_number, hs.strokes, hs.net_score, hs.putts, hs.oyes_proximity, hs.oyes_proximity_sangron,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('t', hm.marker_type::text, 'n', hm.marker_count)) FROM hole_markers hm WHERE hm.hole_score_id = hs.id), '[]'::jsonb)
  FROM src s JOIN hole_scores hs ON hs.round_player_id = s.rp_id
  WHERE hs.confirmed = true AND hs.strokes IS NOT NULL AND hs.strokes > 0;
END;
$$;