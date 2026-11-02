DO $$ DECLARE definition text; BEGIN
SELECT pg_get_functiondef('public.finalize_round_bets(uuid,jsonb)'::regprocedure) INTO definition;
IF position('IF EXISTS (SELECT 1 FROM public.ledger_transactions WHERE round_id = p_round_id)' IN definition)=0 THEN RAISE EXCEPTION 'unexpected_finalize_definition'; END IF;
definition:=replace(definition,'IF EXISTS (SELECT 1 FROM public.ledger_transactions WHERE round_id = p_round_id)','IF EXISTS (SELECT 1 FROM public.ledger_transactions WHERE round_id = p_round_id AND cross_bet_id IS NULL AND (description IS NULL OR description NOT LIKE ''Cruce%''))');
EXECUTE definition;
END $$;