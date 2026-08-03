ALTER TABLE public.hole_scores DISABLE TRIGGER USER;

UPDATE hole_scores hs
SET confirmed = true
FROM round_players rp
LEFT JOIN profiles p ON p.id = rp.profile_id
WHERE hs.round_player_id = rp.id
  AND rp.round_id = 'cc200880-4d65-46bb-a044-f6cd033c5f24'
  AND hs.hole_number = 2
  AND hs.confirmed = false
  AND COALESCE(rp.guest_name, p.display_name) IN ('Oscar Jimenez', 'Eduardo Ralph');

ALTER TABLE public.hole_scores ENABLE TRIGGER USER;