
-- 1. New columns on existing tables
ALTER TABLE public.leaderboard_events
  ADD COLUMN IF NOT EXISTS competition_type TEXT NOT NULL DEFAULT 'standard'
    CHECK (competition_type IN ('standard', 'teams_cup')),
  ADD COLUMN IF NOT EXISTS cup_format TEXT
    CHECK (cup_format IN ('match_individual', 'fourball'));

ALTER TABLE public.leaderboard_participants
  ADD COLUMN IF NOT EXISTS cup_team_id UUID,
  ADD COLUMN IF NOT EXISTS match_handicap INTEGER NOT NULL DEFAULT 0;

-- 2. Table cup_teams
CREATE TABLE public.cup_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leaderboard_id UUID NOT NULL
    REFERENCES public.leaderboard_events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(leaderboard_id, name)
);

ALTER TABLE public.cup_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view cup teams"
  ON public.cup_teams FOR SELECT TO authenticated USING (true);

CREATE POLICY "Creator can manage cup teams insert"
  ON public.cup_teams FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leaderboard_events le
      WHERE le.id = cup_teams.leaderboard_id
        AND le.created_by = get_my_profile_id()
    )
  );

CREATE POLICY "Creator can manage cup teams update"
  ON public.cup_teams FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leaderboard_events le
      WHERE le.id = cup_teams.leaderboard_id
        AND le.created_by = get_my_profile_id()
    )
  );

CREATE POLICY "Creator can manage cup teams delete"
  ON public.cup_teams FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leaderboard_events le
      WHERE le.id = cup_teams.leaderboard_id
        AND le.created_by = get_my_profile_id()
    )
  );

-- FK from leaderboard_participants to cup_teams
ALTER TABLE public.leaderboard_participants
  ADD CONSTRAINT leaderboard_participants_cup_team_fk
  FOREIGN KEY (cup_team_id) REFERENCES public.cup_teams(id) ON DELETE SET NULL;

-- 3. Table cup_matches
CREATE TABLE public.cup_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leaderboard_id UUID NOT NULL
    REFERENCES public.leaderboard_events(id) ON DELETE CASCADE,
  format TEXT NOT NULL DEFAULT 'match_individual'
    CHECK (format IN ('match_individual', 'fourball')),
  player_a1_id UUID REFERENCES public.leaderboard_participants(id) ON DELETE SET NULL,
  player_a2_id UUID REFERENCES public.leaderboard_participants(id) ON DELETE SET NULL,
  player_b1_id UUID REFERENCES public.leaderboard_participants(id) ON DELETE SET NULL,
  player_b2_id UUID REFERENCES public.leaderboard_participants(id) ON DELETE SET NULL,
  strokes_advantage INTEGER NOT NULL DEFAULT 0,
  advantage_side TEXT NOT NULL DEFAULT 'none'
    CHECK (advantage_side IN ('a', 'b', 'none')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'completed')),
  result_type TEXT
    CHECK (result_type IN ('a_wins', 'b_wins', 'halved')),
  result_detail TEXT,
  result_override BOOLEAN NOT NULL DEFAULT false,
  round_id UUID REFERENCES public.rounds(id) ON DELETE SET NULL,
  match_order INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cup_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view cup matches"
  ON public.cup_matches FOR SELECT TO authenticated USING (true);

CREATE POLICY "Participants can manage cup matches insert"
  ON public.cup_matches FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leaderboard_participants lp
      WHERE lp.leaderboard_id = cup_matches.leaderboard_id
        AND lp.profile_id = get_my_profile_id()
        AND lp.is_active = true
    )
  );

CREATE POLICY "Participants can manage cup matches update"
  ON public.cup_matches FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leaderboard_participants lp
      WHERE lp.leaderboard_id = cup_matches.leaderboard_id
        AND lp.profile_id = get_my_profile_id()
        AND lp.is_active = true
    )
  );

CREATE POLICY "Participants can manage cup matches delete"
  ON public.cup_matches FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leaderboard_participants lp
      WHERE lp.leaderboard_id = cup_matches.leaderboard_id
        AND lp.profile_id = get_my_profile_id()
        AND lp.is_active = true
    )
  );

CREATE TRIGGER update_cup_matches_updated_at
  BEFORE UPDATE ON public.cup_matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. RPC: get_cup_match_result
CREATE OR REPLACE FUNCTION public.get_cup_match_result(p_match_id UUID)
RETURNS TABLE (
  holes_played      INT,
  holes_remaining   INT,
  side_a_holes_won  INT,
  side_b_holes_won  INT,
  current_standing  TEXT,
  result_type       TEXT,
  match_closed      BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_match       RECORD;
  v_rp_a1       UUID; v_rp_a2 UUID;
  v_rp_b1       UUID; v_rp_b2 UUID;
  v_played      INT := 0;
  v_a_wins      INT := 0;
  v_b_wins      INT := 0;
  v_hole        RECORD;
  v_net_a       NUMERIC; v_net_b NUMERIC;
  v_remaining   INT; v_diff INT;
  v_closed      BOOLEAN := false;
  v_rtype       TEXT := 'in_progress';
  v_standing    TEXT;
BEGIN
  SELECT * INTO v_match FROM public.cup_matches WHERE id = p_match_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_match.result_override AND v_match.result_type IS NOT NULL THEN
    RETURN QUERY SELECT
      18, 0,
      CASE WHEN v_match.result_type = 'a_wins' THEN 1 ELSE 0 END,
      CASE WHEN v_match.result_type = 'b_wins' THEN 1 ELSE 0 END,
      COALESCE(v_match.result_detail, v_match.result_type),
      v_match.result_type, true;
    RETURN;
  END IF;

  IF v_match.round_id IS NULL THEN
    RETURN QUERY SELECT 0,18,0,0,'Pendiente'::TEXT,'pending'::TEXT,false;
    RETURN;
  END IF;

  SELECT rp.id INTO v_rp_a1
    FROM round_players rp JOIN leaderboard_participants lp ON lp.id = v_match.player_a1_id
    WHERE rp.round_id = v_match.round_id AND rp.profile_id = lp.profile_id LIMIT 1;

  SELECT rp.id INTO v_rp_b1
    FROM round_players rp JOIN leaderboard_participants lp ON lp.id = v_match.player_b1_id
    WHERE rp.round_id = v_match.round_id AND rp.profile_id = lp.profile_id LIMIT 1;

  IF v_match.player_a2_id IS NOT NULL THEN
    SELECT rp.id INTO v_rp_a2
      FROM round_players rp JOIN leaderboard_participants lp ON lp.id = v_match.player_a2_id
      WHERE rp.round_id = v_match.round_id AND rp.profile_id = lp.profile_id LIMIT 1;
  END IF;

  IF v_match.player_b2_id IS NOT NULL THEN
    SELECT rp.id INTO v_rp_b2
      FROM round_players rp JOIN leaderboard_participants lp ON lp.id = v_match.player_b2_id
      WHERE rp.round_id = v_match.round_id AND rp.profile_id = lp.profile_id LIMIT 1;
  END IF;

  IF v_rp_a1 IS NULL OR v_rp_b1 IS NULL THEN
    RETURN QUERY SELECT 0,18,0,0,'Sin scores'::TEXT,'pending'::TEXT,false;
    RETURN;
  END IF;

  FOR v_hole IN
    SELECT ch.hole_number, ch.par, ch.stroke_index
    FROM course_holes ch
    JOIN rounds r ON r.course_id = ch.course_id AND r.id = v_match.round_id
    ORDER BY ch.hole_number
  LOOP
    DECLARE
      v_gross_a1 INT; v_gross_a2 INT := 99;
      v_gross_b1 INT; v_gross_b2 INT := 99;
    BEGIN
      SELECT strokes INTO v_gross_a1 FROM hole_scores
        WHERE round_player_id = v_rp_a1 AND hole_number = v_hole.hole_number
          AND strokes IS NOT NULL LIMIT 1;
      SELECT strokes INTO v_gross_b1 FROM hole_scores
        WHERE round_player_id = v_rp_b1 AND hole_number = v_hole.hole_number
          AND strokes IS NOT NULL LIMIT 1;

      IF v_rp_a2 IS NOT NULL THEN
        SELECT strokes INTO v_gross_a2 FROM hole_scores
          WHERE round_player_id = v_rp_a2 AND hole_number = v_hole.hole_number
            AND strokes IS NOT NULL LIMIT 1;
        v_gross_a2 := COALESCE(v_gross_a2, 99);
      END IF;
      IF v_rp_b2 IS NOT NULL THEN
        SELECT strokes INTO v_gross_b2 FROM hole_scores
          WHERE round_player_id = v_rp_b2 AND hole_number = v_hole.hole_number
            AND strokes IS NOT NULL LIMIT 1;
        v_gross_b2 := COALESCE(v_gross_b2, 99);
      END IF;

      IF v_gross_a1 IS NULL OR v_gross_b1 IS NULL THEN CONTINUE; END IF;

      v_net_a := LEAST(COALESCE(v_gross_a1,99), v_gross_a2);
      v_net_b := LEAST(COALESCE(v_gross_b1,99), v_gross_b2);

      IF v_match.strokes_advantage > 0 THEN
        IF v_match.advantage_side = 'a'
           AND v_hole.stroke_index <= v_match.strokes_advantage THEN
          v_net_a := v_net_a - 1;
        ELSIF v_match.advantage_side = 'b'
           AND v_hole.stroke_index <= v_match.strokes_advantage THEN
          v_net_b := v_net_b - 1;
        END IF;
      END IF;

      v_played := v_played + 1;
      IF v_net_a < v_net_b THEN v_a_wins := v_a_wins + 1;
      ELSIF v_net_b < v_net_a THEN v_b_wins := v_b_wins + 1;
      END IF;
    END;
  END LOOP;

  v_remaining := 18 - v_played;
  v_diff := v_a_wins - v_b_wins;

  IF v_played = 0 THEN
    RETURN QUERY SELECT 0,18,0,0,'Sin scores'::TEXT,'pending'::TEXT,false;
    RETURN;
  END IF;

  IF ABS(v_diff) > v_remaining OR v_played = 18 THEN
    v_closed := true;
    IF v_diff > 0 THEN
      v_rtype := 'a_wins';
      v_standing := CASE WHEN v_remaining > 0
        THEN 'A ' || v_diff || '&' || v_remaining
        ELSE 'A 1UP' END;
    ELSIF v_diff < 0 THEN
      v_rtype := 'b_wins';
      v_standing := CASE WHEN v_remaining > 0
        THEN 'B ' || ABS(v_diff) || '&' || v_remaining
        ELSE 'B 1UP' END;
    ELSE
      v_rtype := 'halved'; v_standing := 'AS';
    END IF;
  ELSE
    v_rtype := 'in_progress';
    IF v_diff > 0 THEN v_standing := 'A ' || v_diff || 'UP';
    ELSIF v_diff < 0 THEN v_standing := 'B ' || ABS(v_diff) || 'UP';
    ELSE v_standing := 'AS';
    END IF;
  END IF;

  RETURN QUERY SELECT v_played, v_remaining, v_a_wins, v_b_wins,
    v_standing, v_rtype, v_closed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cup_match_result(UUID) TO authenticated;
