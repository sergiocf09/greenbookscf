DO $$
DECLARE
  v_course_id uuid;
BEGIN
  INSERT INTO public.golf_courses (
    name, location, country, source, is_manual,
    course_rating, slope_rating
  ) VALUES (
    'Ventanas de San Miguel Golf & Resort',
    'San Miguel de Allende, Gto.',
    'MX',
    'manual',
    false,
    70.5,
    129
  ) RETURNING id INTO v_course_id;

  INSERT INTO public.course_holes (course_id, hole_number, par, stroke_index, yards_blue, yards_white, yards_red) VALUES
    (v_course_id, 1, 5, 11, 556, 523, 428),
    (v_course_id, 2, 4,  3, 421, 397, 340),
    (v_course_id, 3, 3, 13, 181, 156, 125),
    (v_course_id, 4, 4,  5, 377, 336, 268),
    (v_course_id, 5, 3,  9, 187, 166, 138),
    (v_course_id, 6, 5,  1, 639, 603, 523),
    (v_course_id, 7, 5, 15, 447, 411, 371),
    (v_course_id, 8, 4,  7, 388, 340, 295),
    (v_course_id, 9, 3, 17, 136, 119, 100),
    (v_course_id, 10, 4, 14, 344, 319, 281),
    (v_course_id, 11, 4,  8, 407, 361, 329),
    (v_course_id, 12, 3, 18, 126, 114,  97),
    (v_course_id, 13, 4,  6, 427, 392, 348),
    (v_course_id, 14, 5,  4, 603, 559, 521),
    (v_course_id, 15, 4, 16, 327, 290, 266),
    (v_course_id, 16, 4, 12, 388, 344, 317),
    (v_course_id, 17, 3, 10, 153, 133, 113),
    (v_course_id, 18, 4,  2, 508, 474, 408);

  INSERT INTO public.course_tees (course_id, tee_color, course_rating, slope_rating) VALUES
    (v_course_id, 'negro',   71.9, 139),
    (v_course_id, 'azul',    70.5, 129),
    (v_course_id, 'blanco',  67.0, 124),
    (v_course_id, 'dorado',  65.0, 122),
    (v_course_id, 'rojo',    69.0, 132);
END $$;