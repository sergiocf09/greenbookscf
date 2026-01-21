
-- Add missing columns to hole_scores for full persistence
ALTER TABLE public.hole_scores 
ADD COLUMN IF NOT EXISTS oyes_proximity integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS confirmed boolean NOT NULL DEFAULT false;

-- Add index for faster queries by round
CREATE INDEX IF NOT EXISTS idx_hole_scores_round_player_hole 
ON public.hole_scores(round_player_id, hole_number);
