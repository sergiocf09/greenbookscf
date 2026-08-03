DELETE FROM public.hole_markers
WHERE hole_score_id IN (
  SELECT hs.id
  FROM public.hole_scores hs
  JOIN public.round_players rp ON rp.id = hs.round_player_id
  WHERE rp.round_id = '3811a021-943e-45c0-bb5d-4154851877b7'
    AND hs.hole_number > 9
    AND hs.confirmed IS NOT TRUE
);

DELETE FROM public.hole_scores hs
USING public.round_players rp
WHERE rp.id = hs.round_player_id
  AND rp.round_id = '3811a021-943e-45c0-bb5d-4154851877b7'
  AND hs.hole_number > 9
  AND hs.confirmed IS NOT TRUE;