CREATE OR REPLACE FUNCTION public.get_cross_bet_scores(p_round_id uuid)
RETURNS TABLE(cross_bet_id uuid, profile_id uuid, hole_number int, strokes int, net_score int, putts int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_date date;
BEGIN
  IF NOT public.is_round_participant(p_round_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT r.date INTO v_date FROM rounds r WHERE r.id = p_round_id;
  RETURN QUERY
  WITH cbs AS (SELECT cb.id, cb.initiator_profile_id, cb.target_profile_id FROM round_cross_bets cb WHERE cb.round_id = p_round_id),
  src AS (
    SELECT c.id AS cb_id, c.initiator_profile_id AS pid,
      (SELECT rp.id FROM round_players rp WHERE rp.round_id = p_round_id AND rp.profile_id = c.initiator_profile_id AND NOT rp.is_cross_only LIMIT 1) AS rp_id
    FROM cbs c
    UNION ALL
    SELECT c.id, c.target_profile_id,
      (SELECT rp.id FROM round_players rp JOIN rounds r ON r.id = rp.round_id
        WHERE rp.profile_id = c.target_profile_id AND NOT rp.is_cross_only AND r.date = v_date AND r.id <> p_round_id
        ORDER BY r.created_at DESC LIMIT 1)
    FROM cbs c
  )
  SELECT s.cb_id, s.pid, hs.hole_number, hs.strokes, hs.net_score, hs.putts
  FROM src s JOIN hole_scores hs ON hs.round_player_id = s.rp_id
  WHERE hs.confirmed = true AND hs.strokes IS NOT NULL AND hs.strokes > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.get_cross_bet_scores(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cross_bet_scores(uuid) TO authenticated;