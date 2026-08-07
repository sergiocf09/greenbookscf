ALTER TABLE public.golf_courses ADD COLUMN IF NOT EXISTS source_course_key text;
UPDATE public.golf_courses SET source_course_key = source_course_id::text WHERE source_course_key IS NULL AND source_course_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS golf_courses_source_key_unique ON public.golf_courses (source, source_course_key) WHERE source_course_key IS NOT NULL;