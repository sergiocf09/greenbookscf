REVOKE ALL ON FUNCTION public.rebuild_all_pvp_from_snapshots() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rebuild_snapshot_balances_from_ledger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rebuild_all_missing_sliding_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rebuild_snapshot_bilateral_handicaps() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_abandoned_setup_rounds() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_expired_guest_sessions() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.rebuild_all_pvp_from_snapshots() TO service_role;
GRANT EXECUTE ON FUNCTION public.rebuild_snapshot_balances_from_ledger() TO service_role;
GRANT EXECUTE ON FUNCTION public.rebuild_all_missing_sliding_history() TO service_role;
GRANT EXECUTE ON FUNCTION public.rebuild_snapshot_bilateral_handicaps() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_abandoned_setup_rounds() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_guest_sessions() TO service_role;

DROP POLICY IF EXISTS "Authenticated users can create rounds" ON public.rounds;
CREATE POLICY "Authenticated users can create rounds"
ON public.rounds FOR INSERT TO authenticated
WITH CHECK (is_own_profile(organizer_id) AND public.can_create_round_as_organizer());