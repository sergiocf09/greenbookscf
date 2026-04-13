
DO $$
DECLARE
  v_rid          uuid;
  v_snapshot     jsonb;
  v_players      jsonb;
  v_ledger       jsonb;
  v_entry        jsonb;
  v_from_profile uuid;
  v_to_profile   uuid;
  v_amount       numeric;
  v_raw_bet_type text;
  v_mapped       text;
  v_segment      text;
  v_inserted     int := 0;
BEGIN
  FOR v_rid IN
    SELECT r.id
    FROM public.rounds r
    WHERE r.status = 'completed'
      AND NOT EXISTS (
        SELECT 1 FROM public.ledger_transactions lt WHERE lt.round_id = r.id
      )
    ORDER BY r.date
  LOOP
    SELECT rs.snapshot_json INTO v_snapshot
    FROM public.round_snapshots rs WHERE rs.round_id = v_rid;
    IF v_snapshot IS NULL THEN CONTINUE; END IF;

    v_players := COALESCE(v_snapshot -> 'players', '[]'::jsonb);
    v_ledger  := COALESCE(v_snapshot -> 'ledger',  '[]'::jsonb);
    IF jsonb_typeof(v_ledger) <> 'array' THEN CONTINUE; END IF;

    FOR v_entry IN SELECT value FROM jsonb_array_elements(v_ledger) t(value)
    LOOP
      v_amount := NULLIF(v_entry ->> 'amount', '')::numeric;
      IF v_amount IS NULL OR v_amount <= 0 THEN CONTINUE; END IF;

      SELECT (p ->> 'profileId')::uuid INTO v_from_profile
      FROM jsonb_array_elements(v_players) p
      WHERE p ->> 'id' = (v_entry ->> 'fromPlayerId') LIMIT 1;

      SELECT (p ->> 'profileId')::uuid INTO v_to_profile
      FROM jsonb_array_elements(v_players) p
      WHERE p ->> 'id' = (v_entry ->> 'toPlayerId') LIMIT 1;

      IF v_from_profile IS NULL OR v_to_profile IS NULL THEN CONTINUE; END IF;
      IF v_from_profile = v_to_profile THEN CONTINUE; END IF;

      IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_from_profile) THEN CONTINUE; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_to_profile) THEN CONTINUE; END IF;

      v_raw_bet_type := v_entry ->> 'betType';
      v_mapped := CASE v_raw_bet_type
        WHEN 'Medal Front 9'                      THEN 'medal_front'
        WHEN 'Medal Back 9'                       THEN 'medal_back'
        WHEN 'Medal Total'                        THEN 'medal_total'
        WHEN 'Medal General'                      THEN 'medal_total'
        WHEN 'Presiones Front'                    THEN 'pressure_front'
        WHEN 'Presiones Back'                     THEN 'pressure_back'
        WHEN 'Presiones Back (Carry x2+Match)'    THEN 'pressure_back'
        WHEN 'Presiones Match 18'                 THEN 'pressure_back'
        WHEN 'Skins Front'                        THEN 'skins_front'
        WHEN 'Skins Back'                         THEN 'skins_back'
        WHEN 'Caros'                              THEN 'caros'
        WHEN 'Unidades'                           THEN 'units'
        WHEN 'Manchas'                            THEN 'manchas'
        WHEN 'Culebras'                           THEN 'culebras'
        WHEN 'Pingüinos'                          THEN 'pinguinos'
        WHEN 'Carritos Front'                     THEN 'carritos_front'
        WHEN 'Carritos Back'                      THEN 'carritos_back'
        WHEN 'Carritos Total'                     THEN 'carritos_total'
        WHEN 'Rayas Front'                        THEN 'rayas_front'
        WHEN 'Rayas Back'                         THEN 'rayas_back'
        WHEN 'Rayas Medal Total'                  THEN 'rayas_medal_total'
        WHEN 'Rayas Oyes'                         THEN 'rayas_oyes'
        WHEN 'Oyes'                               THEN 'rayas_oyes'
        WHEN 'Coneja'                             THEN 'coneja'
        WHEN 'Putts Front 9'                      THEN 'medal_front'
        WHEN 'Putts Back 9'                       THEN 'medal_back'
        WHEN 'Putts Total'                        THEN 'medal_total'
        WHEN 'Side Bet'                           THEN 'medal_total'
        WHEN 'Nines'                              THEN 'medal_total'
        WHEN 'Wolf'                               THEN 'medal_total'
        WHEN 'Sixes'                              THEN 'medal_total'
        WHEN 'Las Vegas'                          THEN 'medal_total'
        ELSE NULL
      END;
      IF v_mapped IS NULL THEN CONTINUE; END IF;

      v_segment := COALESCE(v_entry ->> 'segment', 'total');
      IF v_segment NOT IN ('front', 'back', 'total', 'hole') THEN
        v_segment := 'total';
      END IF;

      BEGIN
        INSERT INTO public.ledger_transactions(
          round_id, from_profile_id, to_profile_id, amount,
          bet_type, segment, hole_number, description
        ) VALUES (
          v_rid,
          v_from_profile,
          v_to_profile,
          v_amount,
          v_mapped::public.bet_type,
          v_segment,
          NULLIF(v_entry ->> 'holeNumber', '')::int,
          NULLIF(v_entry ->> 'description', '')
        )
        ON CONFLICT DO NOTHING;
        v_inserted := v_inserted + 1;
      EXCEPTION WHEN OTHERS THEN
        CONTINUE;
      END;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Backfill completado: % transacciones insertadas', v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_fn_auto_ledger_on_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot     jsonb;
  v_players      jsonb;
  v_ledger       jsonb;
  v_entry        jsonb;
  v_from_profile uuid;
  v_to_profile   uuid;
  v_amount       numeric;
  v_raw_bet_type text;
  v_mapped       text;
  v_segment      text;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ledger_transactions WHERE round_id = NEW.id LIMIT 1
  ) THEN
    RETURN NEW;
  END IF;

  SELECT rs.snapshot_json INTO v_snapshot
  FROM public.round_snapshots rs WHERE rs.round_id = NEW.id;
  IF v_snapshot IS NULL THEN RETURN NEW; END IF;

  v_players := COALESCE(v_snapshot -> 'players', '[]'::jsonb);
  v_ledger  := COALESCE(v_snapshot -> 'ledger',  '[]'::jsonb);
  IF jsonb_typeof(v_ledger) <> 'array' THEN RETURN NEW; END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_ledger) t(value)
  LOOP
    v_amount := NULLIF(v_entry ->> 'amount', '')::numeric;
    IF v_amount IS NULL OR v_amount <= 0 THEN CONTINUE; END IF;

    SELECT (p ->> 'profileId')::uuid INTO v_from_profile
    FROM jsonb_array_elements(v_players) p
    WHERE p ->> 'id' = (v_entry ->> 'fromPlayerId') LIMIT 1;

    SELECT (p ->> 'profileId')::uuid INTO v_to_profile
    FROM jsonb_array_elements(v_players) p
    WHERE p ->> 'id' = (v_entry ->> 'toPlayerId') LIMIT 1;

    IF v_from_profile IS NULL OR v_to_profile IS NULL THEN CONTINUE; END IF;
    IF v_from_profile = v_to_profile THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_from_profile) THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_to_profile) THEN CONTINUE; END IF;

    v_raw_bet_type := v_entry ->> 'betType';
    v_mapped := CASE v_raw_bet_type
      WHEN 'Medal Front 9'                    THEN 'medal_front'
      WHEN 'Medal Back 9'                     THEN 'medal_back'
      WHEN 'Medal Total'                      THEN 'medal_total'
      WHEN 'Medal General'                    THEN 'medal_total'
      WHEN 'Presiones Front'                  THEN 'pressure_front'
      WHEN 'Presiones Back'                   THEN 'pressure_back'
      WHEN 'Presiones Back (Carry x2+Match)'  THEN 'pressure_back'
      WHEN 'Presiones Match 18'               THEN 'pressure_back'
      WHEN 'Skins Front'                      THEN 'skins_front'
      WHEN 'Skins Back'                       THEN 'skins_back'
      WHEN 'Caros'                            THEN 'caros'
      WHEN 'Unidades'                         THEN 'units'
      WHEN 'Manchas'                          THEN 'manchas'
      WHEN 'Culebras'                         THEN 'culebras'
      WHEN 'Pingüinos'                        THEN 'pinguinos'
      WHEN 'Carritos Front'                   THEN 'carritos_front'
      WHEN 'Carritos Back'                    THEN 'carritos_back'
      WHEN 'Carritos Total'                   THEN 'carritos_total'
      WHEN 'Rayas Front'                      THEN 'rayas_front'
      WHEN 'Rayas Back'                       THEN 'rayas_back'
      WHEN 'Rayas Medal Total'                THEN 'rayas_medal_total'
      WHEN 'Rayas Oyes'                       THEN 'rayas_oyes'
      WHEN 'Oyes'                             THEN 'rayas_oyes'
      WHEN 'Coneja'                           THEN 'coneja'
      WHEN 'Putts Front 9'                    THEN 'medal_front'
      WHEN 'Putts Back 9'                     THEN 'medal_back'
      WHEN 'Putts Total'                      THEN 'medal_total'
      WHEN 'Side Bet'                         THEN 'medal_total'
      WHEN 'Nines'                            THEN 'medal_total'
      WHEN 'Wolf'                             THEN 'medal_total'
      WHEN 'Sixes'                            THEN 'medal_total'
      WHEN 'Las Vegas'                        THEN 'medal_total'
      ELSE NULL
    END;
    IF v_mapped IS NULL THEN CONTINUE; END IF;

    v_segment := COALESCE(v_entry ->> 'segment', 'total');
    IF v_segment NOT IN ('front', 'back', 'total', 'hole') THEN
      v_segment := 'total';
    END IF;

    BEGIN
      INSERT INTO public.ledger_transactions(
        round_id, from_profile_id, to_profile_id, amount,
        bet_type, segment, hole_number, description
      ) VALUES (
        NEW.id,
        v_from_profile,
        v_to_profile,
        v_amount,
        v_mapped::public.bet_type,
        v_segment,
        NULLIF(v_entry ->> 'holeNumber', '')::int,
        NULLIF(v_entry ->> 'description', '')
      )
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_ledger_on_close ON public.rounds;

CREATE TRIGGER trg_auto_ledger_on_close
  AFTER UPDATE OF status ON public.rounds
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_auto_ledger_on_close();
