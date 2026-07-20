
-- 1) Actualizar ratings/slopes oficiales (fuente: tarjeta Grint) para Club de Golf Juriquilla
UPDATE public.course_tees SET course_rating = 72.3, slope_rating = 137
  WHERE course_id = '252ee05a-50e6-4404-a08c-0150b7f3e155' AND tee_color = 'blue';

UPDATE public.course_tees SET course_rating = 69.9, slope_rating = 127
  WHERE course_id = '252ee05a-50e6-4404-a08c-0150b7f3e155' AND tee_color = 'white';

UPDATE public.course_tees SET course_rating = 69.1, slope_rating = 125
  WHERE course_id = '252ee05a-50e6-4404-a08c-0150b7f3e155' AND tee_color = 'yellow';

UPDATE public.course_tees SET course_rating = 69.3, slope_rating = 128
  WHERE course_id = '252ee05a-50e6-4404-a08c-0150b7f3e155' AND tee_color = 'red';

-- 2) Ocultar duplicado renombrándolo (tiene 5 rondas cerradas, no se puede eliminar sin romper FK)
UPDATE public.golf_courses
  SET name = '[NO USAR] Golf Juriquilla (duplicado)'
  WHERE id = '0eb889c9-0815-423a-9264-c3d47c6fcc7f';
