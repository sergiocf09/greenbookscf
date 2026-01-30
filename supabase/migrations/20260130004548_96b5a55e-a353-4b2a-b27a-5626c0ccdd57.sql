-- Add course rating and slope rating columns to golf_courses table
-- These are essential for USGA handicap differential calculation
ALTER TABLE public.golf_courses 
ADD COLUMN IF NOT EXISTS course_rating numeric DEFAULT 72.0,
ADD COLUMN IF NOT EXISTS slope_rating integer DEFAULT 113;

-- Add comments explaining the fields
COMMENT ON COLUMN public.golf_courses.course_rating IS 'USGA Course Rating - typically ranges from 67 to 77';
COMMENT ON COLUMN public.golf_courses.slope_rating IS 'USGA Slope Rating - ranges from 55 to 155, standard is 113';