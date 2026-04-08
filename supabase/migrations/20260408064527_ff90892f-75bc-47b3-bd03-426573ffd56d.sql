-- Fix: Restrict ghost profile creation to authenticated users only
-- The join_round_as_guest RPC uses SECURITY DEFINER and bypasses RLS,
-- so this policy is only needed as a fallback for authenticated users.
-- Removing anon access prevents unauthenticated spam.

DROP POLICY IF EXISTS "Anyone can create ghost profiles" ON public.profiles;

CREATE POLICY "Authenticated users can create ghost profiles"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK ((is_ghost = true) AND (user_id IS NULL));