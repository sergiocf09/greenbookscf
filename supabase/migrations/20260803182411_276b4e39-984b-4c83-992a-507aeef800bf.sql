
-- USGA helpers
CREATE OR REPLACE FUNCTION public.usga_num_differentials(total_rounds int)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN total_rounds >= 20 THEN 8
    WHEN total_rounds >= 18 THEN 7
    WHEN total_rounds >= 16 THEN 6
    WHEN total_rounds >= 14 THEN 5
    WHEN total_rounds >= 12 THEN 4
    WHEN total_rounds >= 10 THEN 3
    WHEN total_rounds >= 7  THEN 2
    WHEN total_rounds >= 3  THEN 1
    ELSE 0 END;
$$;

CREATE OR REPLACE FUNCTION public.usga_index_from_differentials(diffs numeric[])
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
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
  RETURN LEAST(ROUND(avg_best * 0.96, 1), 54.0);
END;
$$;

-- Tee color normalization (es/en)
CREATE OR REPLACE FUNCTION public.normalize_tee_color(c text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN lower(coalesce(c,'')) IN ('white','blanco','blancas','blancos') THEN 'white'
    WHEN lower(coalesce(c,'')) IN ('blue','azul','azules') THEN 'blue'
    WHEN lower(coalesce(c,'')) IN ('gold','yellow','dorado','doradas','dorados','amarillo','amarillas') THEN 'gold'
    WHEN lower(coalesce(c,'')) IN ('red','rojo','rojas','rojos') THEN 'red'
    WHEN lower(coalesce(c,'')) IN ('black','negro','negras','negros','championship') THEN 'black'
    WHEN lower(coalesce(c,'')) IN ('silver','plata','plateado') THEN 'silver'
    ELSE lower(coalesce(c,''))
  END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_handicap_history_from_rounds()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prof uuid;
  v_rec record;
  v_diffs numeric[];
  v_idx numeric;
  v_inserted int := 0;
  v_profiles int := 0;
  v_last numeric;
BEGIN
  FOR v_prof IN
    SELECT DISTINCT rp.profile_id
    FROM public.round_players rp
    JOIN public.rounds r ON r.id = rp.round_id
    WHERE rp.profile_id IS NOT NULL AND r.status = 'completed'
  LOOP
    v_diffs := ARRAY[]::numeric[];
    v_last := NULL;
    v_profiles := v_profiles + 1;

    FOR v_rec IN
      WITH plays AS (
        SELECT rp.id AS rp_id, rp.round_id, r.date, r.course_id,
               public.normalize_tee_color(COALESCE(rp.tee_color, r.tee_color, 'white')) AS tee,
               COALESCE(rp.handicap_for_round, 0)::numeric AS hcp,
               COALESCE(rp.tee_color, r.tee_color, 'white') AS raw_tee
        FROM public.round_players rp
        JOIN public.rounds r ON r.id = rp.round_id
        WHERE rp.profile_id = v_prof AND r.status = 'completed'
      ), scored AS (
        SELECT p.*,
               (SELECT count(*) FROM public.hole_scores hs
                 WHERE hs.round_player_id = p.rp_id AND hs.confirmed AND hs.strokes IS NOT NULL) AS n_holes,
               (SELECT sum(hs.strokes) FROM public.hole_scores hs
                 WHERE hs.round_player_id = p.rp_id AND hs.confirmed AND hs.strokes IS NOT NULL) AS gross,
               (SELECT sum(LEAST(hs.strokes,
                   COALESCE(ch.par,4) + 2 +
                   COALESCE(hs.strokes_received,
                     FLOOR(p.hcp/18)::int + CASE WHEN COALESCE(ch.stroke_index,18) <= (p.hcp::int % 18) THEN 1 ELSE 0 END)))
                 FROM public.hole_scores hs
                 LEFT JOIN public.course_holes ch
                   ON ch.course_id = p.course_id AND ch.hole_number = hs.hole_number
                 WHERE hs.round_player_id = p.rp_id AND hs.confirmed AND hs.strokes IS NOT NULL) AS ags,
               (SELECT ct.course_rating FROM public.course_tees ct
                 WHERE ct.course_id = p.course_id
                   AND public.normalize_tee_color(ct.tee_color) = p.tee LIMIT 1) AS cr,
               (SELECT ct.slope_rating FROM public.course_tees ct
                 WHERE ct.course_id = p.course_id
                   AND public.normalize_tee_color(ct.tee_color) = p.tee LIMIT 1) AS sl
        FROM plays p
      )
      SELECT s.*,
             COALESCE(s.cr, 72)::numeric AS cr_f,
             COALESCE(s.sl, 113)::int AS sl_f,
             EXISTS (SELECT 1 FROM public.handicap_history hh
                     WHERE hh.profile_id = v_prof AND hh.round_id = s.round_id) AS has_hist
      FROM scored s
      WHERE s.n_holes >= 18
      ORDER BY s.date ASC, s.round_id ASC
    LOOP
      -- differential for this round
      DECLARE
        v_diff numeric := ROUND(((v_rec.ags - v_rec.cr_f) * 113) / NULLIF(v_rec.sl_f,0), 1);
      BEGIN
        v_diffs := v_diffs || v_diff;
        v_idx := public.usga_index_from_differentials(
          (SELECT array_agg(d) FROM (
             SELECT d FROM unnest(v_diffs) WITH ORDINALITY AS t(d, ord)
             ORDER BY ord DESC LIMIT 20) x)
        );

        IF v_idx IS NOT NULL THEN
          v_last := v_idx;
        END IF;

        IF NOT v_rec.has_hist AND v_idx IS NOT NULL THEN
          INSERT INTO public.handicap_history
            (profile_id, handicap, round_id, recorded_at, differential,
             adjusted_gross_score, gross_score, course_rating, slope_rating, tee_color, is_attested)
          VALUES
            (v_prof, v_idx, v_rec.round_id,
             COALESCE(v_rec.date::timestamptz, now()), v_diff,
             v_rec.ags, v_rec.gross, v_rec.cr_f, v_rec.sl_f, v_rec.raw_tee, false);
          v_inserted := v_inserted + 1;
        END IF;
      END;
    END LOOP;

    IF v_last IS NOT NULL THEN
      UPDATE public.profiles
      SET current_handicap = v_last, updated_at = now()
      WHERE id = v_prof AND (current_handicap IS NULL OR current_handicap IS DISTINCT FROM v_last);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('profiles_scanned', v_profiles, 'rows_inserted', v_inserted);
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_handicap_history_from_rounds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_handicap_history_from_rounds() TO service_role;

SELECT public.backfill_handicap_history_from_rounds();
