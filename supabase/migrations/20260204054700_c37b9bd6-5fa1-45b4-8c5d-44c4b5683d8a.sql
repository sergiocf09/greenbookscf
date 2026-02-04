-- Add authentication requirement policies to prevent anonymous access
-- Using correct syntax for restrictive policies

-- profiles: Require authentication for any SELECT
CREATE POLICY "Require authentication for profiles"
ON public.profiles
AS RESTRICTIVE
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- ledger_transactions: Require authentication for any SELECT
CREATE POLICY "Require authentication for ledger_transactions"
ON public.ledger_transactions
AS RESTRICTIVE
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- rounds: Require authentication for any SELECT  
CREATE POLICY "Require authentication for rounds"
ON public.rounds
AS RESTRICTIVE
FOR SELECT
USING (auth.uid() IS NOT NULL);