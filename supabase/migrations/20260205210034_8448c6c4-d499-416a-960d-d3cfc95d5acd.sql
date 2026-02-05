-- Fix 1: Block all write operations on course_holes (read-only reference data)
CREATE POLICY "Block course hole inserts" 
ON public.course_holes 
FOR INSERT 
WITH CHECK (false);

CREATE POLICY "Block course hole updates" 
ON public.course_holes 
FOR UPDATE 
USING (false);

CREATE POLICY "Block course hole deletes" 
ON public.course_holes 
FOR DELETE 
USING (false);

-- Fix 2: Remove overly permissive authentication-only policy on profiles
-- The existing "Users can view their own profile" and "Users can view profiles of round participants" 
-- policies provide appropriate access control
DROP POLICY IF EXISTS "Require authentication for profiles" ON public.profiles;

-- Fix 3: Remove overly permissive authentication-only policy on ledger_transactions
-- The existing "Users can view their own transactions" policy provides appropriate access control
DROP POLICY IF EXISTS "Require authentication for ledger_transactions" ON public.ledger_transactions;

-- Fix 4: Remove overly permissive authentication-only policy on rounds
-- The existing "Participants can view their rounds" policy provides appropriate access control
DROP POLICY IF EXISTS "Require authentication for rounds" ON public.rounds;