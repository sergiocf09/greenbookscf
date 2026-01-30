-- Create course_tees table for rating/slope per tee color
CREATE TABLE public.course_tees (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES public.golf_courses(id) ON DELETE CASCADE,
  tee_color text NOT NULL,
  course_rating numeric NOT NULL DEFAULT 72.0,
  slope_rating integer NOT NULL DEFAULT 113,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(course_id, tee_color)
);

-- Enable RLS
ALTER TABLE public.course_tees ENABLE ROW LEVEL SECURITY;

-- Anyone can view course tees (read-only like golf_courses)
CREATE POLICY "Anyone can view course tees" 
ON public.course_tees 
FOR SELECT 
USING (true);

-- Add tee_color column to round_players for per-player tee selection
ALTER TABLE public.round_players 
ADD COLUMN IF NOT EXISTS tee_color text DEFAULT NULL;

COMMENT ON COLUMN public.round_players.tee_color IS 'Tee color selected by this player. NULL means use round default.';

-- Insert default tee data for existing courses
-- Club de Golf Juriquilla
INSERT INTO public.course_tees (course_id, tee_color, course_rating, slope_rating)
SELECT id, 'white', 71.5, 125 FROM public.golf_courses WHERE name ILIKE '%Juriquilla%'
ON CONFLICT (course_id, tee_color) DO NOTHING;

INSERT INTO public.course_tees (course_id, tee_color, course_rating, slope_rating)
SELECT id, 'blue', 73.0, 130 FROM public.golf_courses WHERE name ILIKE '%Juriquilla%'
ON CONFLICT (course_id, tee_color) DO NOTHING;

INSERT INTO public.course_tees (course_id, tee_color, course_rating, slope_rating)
SELECT id, 'yellow', 69.5, 120 FROM public.golf_courses WHERE name ILIKE '%Juriquilla%'
ON CONFLICT (course_id, tee_color) DO NOTHING;

INSERT INTO public.course_tees (course_id, tee_color, course_rating, slope_rating)
SELECT id, 'red', 67.0, 115 FROM public.golf_courses WHERE name ILIKE '%Juriquilla%'
ON CONFLICT (course_id, tee_color) DO NOTHING;

-- Club de Golf Vallescondido
INSERT INTO public.course_tees (course_id, tee_color, course_rating, slope_rating)
SELECT id, 'white', 71.0, 124 FROM public.golf_courses WHERE name ILIKE '%Vallescondido%'
ON CONFLICT (course_id, tee_color) DO NOTHING;

INSERT INTO public.course_tees (course_id, tee_color, course_rating, slope_rating)
SELECT id, 'blue', 72.5, 128 FROM public.golf_courses WHERE name ILIKE '%Vallescondido%'
ON CONFLICT (course_id, tee_color) DO NOTHING;

INSERT INTO public.course_tees (course_id, tee_color, course_rating, slope_rating)
SELECT id, 'yellow', 69.0, 118 FROM public.golf_courses WHERE name ILIKE '%Vallescondido%'
ON CONFLICT (course_id, tee_color) DO NOTHING;

INSERT INTO public.course_tees (course_id, tee_color, course_rating, slope_rating)
SELECT id, 'red', 66.5, 113 FROM public.golf_courses WHERE name ILIKE '%Vallescondido%'
ON CONFLICT (course_id, tee_color) DO NOTHING;

-- Club de Golf Tequisquiapan
INSERT INTO public.course_tees (course_id, tee_color, course_rating, slope_rating)
SELECT id, 'white', 71.2, 126 FROM public.golf_courses WHERE name ILIKE '%Tequisquiapan%'
ON CONFLICT (course_id, tee_color) DO NOTHING;

INSERT INTO public.course_tees (course_id, tee_color, course_rating, slope_rating)
SELECT id, 'blue', 73.5, 132 FROM public.golf_courses WHERE name ILIKE '%Tequisquiapan%'
ON CONFLICT (course_id, tee_color) DO NOTHING;

INSERT INTO public.course_tees (course_id, tee_color, course_rating, slope_rating)
SELECT id, 'yellow', 68.8, 119 FROM public.golf_courses WHERE name ILIKE '%Tequisquiapan%'
ON CONFLICT (course_id, tee_color) DO NOTHING;

INSERT INTO public.course_tees (course_id, tee_color, course_rating, slope_rating)
SELECT id, 'red', 66.0, 112 FROM public.golf_courses WHERE name ILIKE '%Tequisquiapan%'
ON CONFLICT (course_id, tee_color) DO NOTHING;

-- El Jaguar / Yucatán Country Club  
INSERT INTO public.course_tees (course_id, tee_color, course_rating, slope_rating)
SELECT id, 'white', 71.8, 127 FROM public.golf_courses WHERE name ILIKE '%Jaguar%' OR name ILIKE '%Yucat%'
ON CONFLICT (course_id, tee_color) DO NOTHING;

INSERT INTO public.course_tees (course_id, tee_color, course_rating, slope_rating)
SELECT id, 'blue', 74.0, 135 FROM public.golf_courses WHERE name ILIKE '%Jaguar%' OR name ILIKE '%Yucat%'
ON CONFLICT (course_id, tee_color) DO NOTHING;

INSERT INTO public.course_tees (course_id, tee_color, course_rating, slope_rating)
SELECT id, 'yellow', 69.2, 121 FROM public.golf_courses WHERE name ILIKE '%Jaguar%' OR name ILIKE '%Yucat%'
ON CONFLICT (course_id, tee_color) DO NOTHING;

INSERT INTO public.course_tees (course_id, tee_color, course_rating, slope_rating)
SELECT id, 'red', 67.5, 116 FROM public.golf_courses WHERE name ILIKE '%Jaguar%' OR name ILIKE '%Yucat%'
ON CONFLICT (course_id, tee_color) DO NOTHING;