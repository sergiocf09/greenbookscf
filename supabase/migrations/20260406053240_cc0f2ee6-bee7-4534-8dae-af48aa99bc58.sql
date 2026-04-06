
CREATE OR REPLACE FUNCTION public._calc_handicap_index(diffs numeric[])
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  n int := array_length(diffs, 1);
  num_to_use int;
  sorted numeric[];
  total numeric := 0;
  i int;
BEGIN
  IF n IS NULL OR n < 3 THEN RETURN NULL; END IF;
  
  IF n >= 20 THEN num_to_use := 8;
  ELSIF n >= 19 THEN num_to_use := 7;
  ELSIF n >= 17 THEN num_to_use := 6;
  ELSIF n >= 15 THEN num_to_use := 5;
  ELSIF n >= 13 THEN num_to_use := 4;
  ELSIF n >= 11 THEN num_to_use := 3;
  ELSIF n >= 7 THEN num_to_use := 2;
  ELSIF n >= 3 THEN num_to_use := 1;
  ELSE RETURN NULL;
  END IF;
  
  sorted := ARRAY(SELECT unnest(diffs) ORDER BY 1 ASC);
  
  FOR i IN 1..num_to_use LOOP
    total := total + sorted[i];
  END LOOP;
  
  RETURN LEAST(ROUND((total / num_to_use * 0.96)::numeric, 1), 54.0);
END;
$$;
