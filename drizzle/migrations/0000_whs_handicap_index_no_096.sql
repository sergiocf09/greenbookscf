-- Align handicap index math with official WHS (2020+):
-- plain average of best N differentials (no 0.96 factor) + lookup adjustment.

CREATE OR REPLACE FUNCTION public.usga_num_differentials(total_rounds integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN total_rounds >= 20 THEN 8
    WHEN total_rounds >= 19 THEN 7
    WHEN total_rounds >= 17 THEN 6
    WHEN total_rounds >= 15 THEN 5
    WHEN total_rounds >= 12 THEN 4
    WHEN total_rounds >= 9  THEN 3
    WHEN total_rounds >= 6  THEN 2
    WHEN total_rounds >= 3  THEN 1
    ELSE 0 END;
$function$;

CREATE OR REPLACE FUNCTION public.usga_whs_adjustment(total_rounds integer)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN total_rounds = 3 THEN -2.0
    WHEN total_rounds = 4 THEN -1.0
    WHEN total_rounds = 6 THEN -1.0
    ELSE 0 END::numeric;
$function$;

CREATE OR REPLACE FUNCTION public.usga_index_from_differentials(diffs numeric[])
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  n int := COALESCE(array_length(diffs,1),0);
  k int := public.usga_num_differentials(LEAST(n,20));
  avg_best numeric;
BEGIN
  IF k <= 0 THEN RETURN NULL; END IF;
  SELECT avg(d) INTO avg_best FROM (
    SELECT d FROM unnest(diffs) AS t(d) ORDER BY d ASC LIMIT k
  ) s;
  IF avg_best IS NULL THEN RETURN NULL; END IF;
  RETURN LEAST(ROUND(avg_best + public.usga_whs_adjustment(n), 1), 54.0);
END;
$function$;

CREATE OR REPLACE FUNCTION public._calc_handicap_index(diffs numeric[])
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  n int := array_length(diffs, 1);
  num_to_use int;
  sorted numeric[];
  total numeric := 0;
  i int;
BEGIN
  IF n IS NULL OR n < 3 THEN RETURN NULL; END IF;

  num_to_use := public.usga_num_differentials(LEAST(n, 20));
  IF num_to_use <= 0 THEN RETURN NULL; END IF;

  sorted := ARRAY(SELECT unnest(diffs) ORDER BY 1 ASC);

  FOR i IN 1..num_to_use LOOP
    total := total + sorted[i];
  END LOOP;

  RETURN LEAST(ROUND((total / num_to_use + public.usga_whs_adjustment(n))::numeric, 1), 54.0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.usga_whs_adjustment(integer) TO authenticated, anon, service_role;