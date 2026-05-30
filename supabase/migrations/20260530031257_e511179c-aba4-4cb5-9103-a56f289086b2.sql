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
    COUNT(*) AS total_rounds,
    COUNT(*) FILTER (
      WHERE r.date < DATE '2026-05-25'
         OR rp.attested_by IS NOT NULL
    ) AS attested_rounds
  FROM rounds r
  JOIN round_players rp ON rp.round_id = r.id
  WHERE r.status = 'completed'
    AND rp.profile_id = p_profile_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_attestation_stats(UUID) TO authenticated;