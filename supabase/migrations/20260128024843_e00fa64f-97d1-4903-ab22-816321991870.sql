-- Add starting_hole column to rounds table
-- This stores whether the round starts on hole 1 or hole 10
ALTER TABLE public.rounds 
ADD COLUMN starting_hole integer NOT NULL DEFAULT 1 
CHECK (starting_hole IN (1, 10));