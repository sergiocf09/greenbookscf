CREATE OR REPLACE FUNCTION public.get_pending_attestations()
RETURNS TABLE (
  round_id        UUID,
  round_date      DATE,
  course_name     TEXT,
  organizer_name  TEXT,
  pending_players JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_profile_id UUID := public.get_my_profile_id();
BEGIN
  IF v_actor_profile_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.date,
    gc.name,
    org.display_name,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'round_player_id', rp.id,
        'profile_id',      rp.profile_id,
        'name',            COALESCE(p.display_name, 'Jugador'),
        'total_strokes',   COALESCE(
          (
            -- Prefer the immutable snapshot total (respects 9H vs 18H)
            SELECT (bal->>'totalGross')::INTEGER
            FROM public.round_snapshots rs,
                 jsonb_array_elements(rs.snapshot_json->'balances') bal
            WHERE rs.round_id = r.id
              AND bal->>'playerId' = rp.id::text
            LIMIT 1
          ),
          (
            SELECT SUM(hs.strokes)::INTEGER
            FROM public.hole_scores hs
            WHERE hs.round_player_id = rp.id AND hs.confirmed = true
          ),
          0
        )
      ) ORDER BY p.display_name)
      FROM public.round_players rp
      LEFT JOIN public.profiles p ON p.id = rp.profile_id
      WHERE rp.round_id = r.id
        AND rp.profile_id IS NOT NULL
        AND rp.profile_id <> v_actor_profile_id
        AND COALESCE(p.is_ghost,false) = false
        AND rp.attested_by IS NULL
    ), '[]'::jsonb)
  FROM public.rounds r
  JOIN public.golf_courses gc ON gc.id = r.course_id
  JOIN public.profiles org    ON org.id = r.organizer_id
  WHERE r.status = 'completed'
    AND EXISTS (
      SELECT 1 FROM public.round_players rpm
      JOIN public.profiles pm ON pm.id = rpm.profile_id
      WHERE rpm.round_id = r.id
        AND rpm.profile_id = v_actor_profile_id
        AND COALESCE(pm.is_ghost,false) = false
    )
    AND EXISTS (
      SELECT 1 FROM public.round_players rpx
      JOIN public.profiles px ON px.id = rpx.profile_id
      WHERE rpx.round_id = r.id
        AND rpx.profile_id IS NOT NULL
        AND rpx.profile_id <> v_actor_profile_id
        AND COALESCE(px.is_ghost,false) = false
        AND rpx.attested_by IS NULL
    )
  ORDER BY r.date DESC, r.created_at DESC;
END;
$$;