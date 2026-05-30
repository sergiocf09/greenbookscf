UPDATE public.sliding_current
SET strokes_a_gives_b_current = -strokes_a_gives_b_current,
    last_updated_at = now()
WHERE (player_a_profile_id = '5cae8054-903c-4075-a2ba-efc213fe5ef2' AND player_b_profile_id = '6669d582-6a34-4f36-967a-f7ece96d4de8')
   OR (player_a_profile_id = '36ff84de-c687-49eb-b15d-317909f252c9' AND player_b_profile_id = '5cae8054-903c-4075-a2ba-efc213fe5ef2');