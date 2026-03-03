
-- Add source tracking columns to golf_courses
ALTER TABLE public.golf_courses
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'official',
  ADD COLUMN IF NOT EXISTS source_course_id integer,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

-- Mark existing manual courses
UPDATE public.golf_courses SET source = 'manual' WHERE is_manual = true;

-- Create unique index on source_course_id to prevent duplicate imports
CREATE UNIQUE INDEX IF NOT EXISTS idx_golf_courses_source_course_id
  ON public.golf_courses (source_course_id)
  WHERE source_course_id IS NOT NULL;
