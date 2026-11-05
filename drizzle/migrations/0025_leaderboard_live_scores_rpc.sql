CREATE OR REPLACE FUNCTION public.get_leaderboard_live_scores(p_leaderboard_id uuid)
RETURNS TABLE(round_player_id uuid, round_id uuid, profile_id uuid, guest_name text, handicap_for_round numeric, hole_number integer, strokes integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_view_leaderboard(p_leaderboard_id) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT rp.id, rp.round_id, rp.profile_id, rp.guest_name, rp.handicap_for_round, hs.hole_number, hs.strokes
  FROM leaderboard_rounds lr
  JOIN round_players rp ON rp.round_id = lr.round_id AND rp.is_cross_only = false
  LEFT JOIN hole_scores hs ON hs.round_player_id = rp.id AND hs.confirmed = true
  WHERE lr.leaderboard_id = p_leaderboard_id;
END $$;
REVOKE ALL ON FUNCTION public.get_leaderboard_live_scores(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_live_scores(uuid) TO authenticated;