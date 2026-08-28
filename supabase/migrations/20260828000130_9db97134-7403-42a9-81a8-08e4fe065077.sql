UPDATE public.course_tees
SET course_rating = 68.9, slope_rating = 120
WHERE course_id = (SELECT id FROM public.golf_courses WHERE name ILIKE '%Tequisquiapan%' LIMIT 1)
  AND tee_color = 'white';

UPDATE public.course_tees
SET course_rating = 71.1, slope_rating = 124
WHERE course_id = (SELECT id FROM public.golf_courses WHERE name ILIKE '%Tequisquiapan%' LIMIT 1)
  AND tee_color = 'blue';

UPDATE public.course_tees
SET course_rating = 66.8, slope_rating = 116
WHERE course_id = (SELECT id FROM public.golf_courses WHERE name ILIKE '%Tequisquiapan%' LIMIT 1)
  AND tee_color = 'yellow';

UPDATE public.course_tees
SET course_rating = 69.8, slope_rating = 126
WHERE course_id = (SELECT id FROM public.golf_courses WHERE name ILIKE '%Tequisquiapan%' LIMIT 1)
  AND tee_color = 'red';