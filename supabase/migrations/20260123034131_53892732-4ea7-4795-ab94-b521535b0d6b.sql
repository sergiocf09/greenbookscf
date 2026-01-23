-- Secure ledger_transactions against client-side fabrication
ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;

-- Replace/ensure explicit deny INSERT policy
DROP POLICY IF EXISTS "No direct inserts into ledger_transactions" ON public.ledger_transactions;
CREATE POLICY "No direct inserts into ledger_transactions"
ON public.ledger_transactions
FOR INSERT
WITH CHECK (false);
