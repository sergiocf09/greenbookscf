REVOKE EXECUTE ON FUNCTION public.get_pending_attestations() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pending_attestations() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pending_attestations() TO authenticated;