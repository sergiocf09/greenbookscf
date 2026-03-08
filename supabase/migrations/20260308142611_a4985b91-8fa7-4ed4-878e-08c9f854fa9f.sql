
ALTER TABLE public.handicap_history
  ADD COLUMN IF NOT EXISTS differential numeric,
  ADD COLUMN IF NOT EXISTS adjusted_gross_score integer,
  ADD COLUMN IF NOT EXISTS gross_score integer,
  ADD COLUMN IF NOT EXISTS course_rating numeric,
  ADD COLUMN IF NOT EXISTS slope_rating integer,
  ADD COLUMN IF NOT EXISTS tee_color text;
