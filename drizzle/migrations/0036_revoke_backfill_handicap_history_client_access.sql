REVOKE EXECUTE ON FUNCTION public.backfill_handicap_history_from_rounds() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_handicap_history_from_rounds() TO service_role;