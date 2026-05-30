CREATE OR REPLACE FUNCTION public.get_attestation_stats(p_profile_id UUID)
RETURNS TABLE (
  total_rounds    BIGINT,
  attested_rounds BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)                                              AS total_rounds,
    COUNT(*) FILTER (WHERE r.attested_by IS NOT NULL)    AS attested_rounds
  FROM rounds r
  JOIN round_players rp ON rp.round_id = r.id
  JOIN profiles p ON p.id = rp.profile_id
  WHERE r.status = 'completed'
    AND rp.profile_id = p_profile_id
    AND p.is_ghost = false;
$$;

GRANT EXECUTE ON FUNCTION public.get_attestation_stats(UUID) TO authenticated;