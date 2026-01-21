-- Add Rayas bet types to the bet_type enum
ALTER TYPE public.bet_type ADD VALUE IF NOT EXISTS 'rayas_front';
ALTER TYPE public.bet_type ADD VALUE IF NOT EXISTS 'rayas_back';
ALTER TYPE public.bet_type ADD VALUE IF NOT EXISTS 'rayas_medal_total';
ALTER TYPE public.bet_type ADD VALUE IF NOT EXISTS 'rayas_oyes';

-- Add a column to rounds table for storing round-level bet configuration (like Rayas skinVariant)
ALTER TABLE public.rounds 
ADD COLUMN IF NOT EXISTS bet_config jsonb DEFAULT '{}'::jsonb;

-- Add comment explaining the bet_config structure
COMMENT ON COLUMN public.rounds.bet_config IS 'Stores round-level bet configuration like Rayas skinVariant. Structure: { "rayas": { "skinVariant": "acumulados" | "sinAcumulacion" } }';