
-- Reasignar rondas del duplicado al campo correcto
UPDATE public.rounds
SET course_id = '252ee05a-50e6-4404-a08c-0150b7f3e155'
WHERE course_id = '0eb889c9-0815-423a-9264-c3d47c6fcc7f';

-- Limpiar dependencias del duplicado
DELETE FROM public.course_tees WHERE course_id = '0eb889c9-0815-423a-9264-c3d47c6fcc7f';
DELETE FROM public.course_holes WHERE course_id = '0eb889c9-0815-423a-9264-c3d47c6fcc7f';
DELETE FROM public.course_favorites WHERE course_id = '0eb889c9-0815-423a-9264-c3d47c6fcc7f';
DELETE FROM public.course_visibility WHERE course_id = '0eb889c9-0815-423a-9264-c3d47c6fcc7f';

-- Eliminar el duplicado
DELETE FROM public.golf_courses WHERE id = '0eb889c9-0815-423a-9264-c3d47c6fcc7f';
