-- Run against the database using the read query tool. Each row must pass.
-- The arithmetic helper is internal: exercise it through league linking,
-- mode changes and scoring, not by granting clients permission to call it.
-- Temporary fixture league: 60c1f4f7-91a8-46af-8304-2da0ce8ff291.
WITH expected AS (
  SELECT lp.id AS participant_id, lp.profile_id, r.id AS round_id,
    SUM(hs.strokes) AS gross_total,
    SUM(hs.strokes - (
      (GREATEST(ROUND(CASE WHEN e.rules_json->>'handicap_mode' = 'per_round'
        THEN rp.handicap_for_round ELSE lp.handicap_for_leaderboard END),0)::int / 18)
      + CASE WHEN ch.stroke_index <= (GREATEST(ROUND(CASE WHEN e.rules_json->>'handicap_mode' = 'per_round'
        THEN rp.handicap_for_round ELSE lp.handicap_for_leaderboard END),0)::int % 18) THEN 1 ELSE 0 END
    )) AS net_total,
    SUM(GREATEST(0, 2 + ch.par - hs.strokes + (
      (GREATEST(ROUND(CASE WHEN e.rules_json->>'handicap_mode' = 'per_round'
        THEN rp.handicap_for_round ELSE lp.handicap_for_leaderboard END),0)::int / 18)
      + CASE WHEN ch.stroke_index <= (GREATEST(ROUND(CASE WHEN e.rules_json->>'handicap_mode' = 'per_round'
        THEN rp.handicap_for_round ELSE lp.handicap_for_leaderboard END),0)::int % 18) THEN 1 ELSE 0 END
    ))) AS stableford_total
  FROM public.leaderboard_events e
  JOIN public.leaderboard_rounds lr ON lr.leaderboard_id=e.id
  JOIN public.rounds r ON r.id=lr.round_id
  JOIN public.leaderboard_participants lp ON lp.leaderboard_id=e.id AND lp.is_active
  JOIN public.round_players rp ON rp.round_id=r.id AND rp.profile_id=lp.profile_id AND NOT rp.is_cross_only
  JOIN public.hole_scores hs ON hs.round_player_id=rp.id AND hs.strokes>0
  JOIN public.course_holes ch ON ch.course_id=r.course_id AND ch.hole_number=hs.hole_number
  WHERE e.id='60c1f4f7-91a8-46af-8304-2da0ce8ff291'
  GROUP BY lp.id,lp.profile_id,r.id
)
SELECT ex.profile_id, ex.round_id,
  ls.gross_total = ex.gross_total AS gross_pass,
  ls.net_total = ex.net_total AS net_pass,
  ls.stableford_total = ex.stableford_total AS stableford_pass
FROM expected ex LEFT JOIN public.leaderboard_scores ls
  ON ls.participant_id=ex.participant_id AND ls.round_id=ex.round_id;