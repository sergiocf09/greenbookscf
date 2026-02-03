-- Add column for Sangrón proximity (separate from Acumulado)
ALTER TABLE public.hole_scores 
ADD COLUMN oyes_proximity_sangron integer NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.hole_scores.oyes_proximity IS 'Proximity ranking for Acumulado modality (can be null if player did not reach green)';
COMMENT ON COLUMN public.hole_scores.oyes_proximity_sangron IS 'Proximity ranking for Sangrón modality (must be complete when Sangrón is active)';