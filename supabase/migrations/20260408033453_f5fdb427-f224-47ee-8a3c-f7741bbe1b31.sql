
-- WOLF
CREATE TABLE IF NOT EXISTS public.wolf_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  amount_per_hole INTEGER NOT NULL DEFAULT 100,
  scoring_mode TEXT NOT NULL DEFAULT 'lowBall'
    CHECK (scoring_mode IN ('lowBall', 'lowHighBall', 'stroke')),
  use_handicap BOOLEAN NOT NULL DEFAULT true,
  timing TEXT NOT NULL DEFAULT 'B' CHECK (timing IN ('A', 'B', 'C')),
  carryover BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(round_id)
);
CREATE INDEX IF NOT EXISTS idx_wolf_config_round_id ON public.wolf_config(round_id);
ALTER TABLE public.wolf_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view wolf config" ON public.wolf_config FOR SELECT
  USING (is_round_participant(round_id) OR is_round_organizer(round_id));

CREATE POLICY "Organizer can insert wolf config" ON public.wolf_config FOR INSERT
  WITH CHECK (is_round_organizer(round_id));

CREATE POLICY "Organizer can update wolf config" ON public.wolf_config FOR UPDATE
  USING (is_round_organizer(round_id));

CREATE POLICY "Organizer can delete wolf config" ON public.wolf_config FOR DELETE
  USING (is_round_organizer(round_id));

CREATE TABLE IF NOT EXISTS public.wolf_hole_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  wolf_player_id TEXT NOT NULL,
  partner_ids TEXT[] NOT NULL DEFAULT '{}',
  went_solo BOOLEAN NOT NULL DEFAULT false,
  result TEXT CHECK (result IN ('won', 'lost', 'tied')),
  effective_amount INTEGER,
  carryover_holes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(round_id, hole_number)
);
CREATE INDEX IF NOT EXISTS idx_wolf_hole_state_round_id ON public.wolf_hole_state(round_id);
ALTER TABLE public.wolf_hole_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view wolf state" ON public.wolf_hole_state FOR SELECT
  USING (is_round_participant(round_id) OR is_round_organizer(round_id));

CREATE POLICY "Organizer can insert wolf state" ON public.wolf_hole_state FOR INSERT
  WITH CHECK (is_round_organizer(round_id));

CREATE POLICY "Organizer can update wolf state" ON public.wolf_hole_state FOR UPDATE
  USING (is_round_organizer(round_id));

CREATE POLICY "Organizer can delete wolf state" ON public.wolf_hole_state FOR DELETE
  USING (is_round_organizer(round_id));

-- SIXES
CREATE TABLE IF NOT EXISTS public.sixes_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  scoring_mode TEXT NOT NULL DEFAULT 'lowBall'
    CHECK (scoring_mode IN ('lowBall', 'lowHighBall', 'stroke')),
  cobro TEXT NOT NULL DEFAULT 'per_hole' CHECK (cobro IN ('per_hole', 'per_set')),
  amount INTEGER NOT NULL DEFAULT 100,
  use_handicap BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(round_id)
);
CREATE INDEX IF NOT EXISTS idx_sixes_config_round_id ON public.sixes_config(round_id);
ALTER TABLE public.sixes_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view sixes config" ON public.sixes_config FOR SELECT
  USING (is_round_participant(round_id) OR is_round_organizer(round_id));

CREATE POLICY "Organizer can insert sixes config" ON public.sixes_config FOR INSERT
  WITH CHECK (is_round_organizer(round_id));

CREATE POLICY "Organizer can update sixes config" ON public.sixes_config FOR UPDATE
  USING (is_round_organizer(round_id));

CREATE POLICY "Organizer can delete sixes config" ON public.sixes_config FOR DELETE
  USING (is_round_organizer(round_id));

CREATE TABLE IF NOT EXISTS public.sixes_sets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL CHECK (set_number IN (1, 2, 3)),
  team1_player1_id TEXT NOT NULL,
  team1_player2_id TEXT NOT NULL,
  team2_player1_id TEXT NOT NULL,
  team2_player2_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(round_id, set_number)
);
CREATE INDEX IF NOT EXISTS idx_sixes_sets_round_id ON public.sixes_sets(round_id);
ALTER TABLE public.sixes_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view sixes sets" ON public.sixes_sets FOR SELECT
  USING (is_round_participant(round_id) OR is_round_organizer(round_id));

CREATE POLICY "Organizer can insert sixes sets" ON public.sixes_sets FOR INSERT
  WITH CHECK (is_round_organizer(round_id));

CREATE POLICY "Organizer can update sixes sets" ON public.sixes_sets FOR UPDATE
  USING (is_round_organizer(round_id));

CREATE POLICY "Organizer can delete sixes sets" ON public.sixes_sets FOR DELETE
  USING (is_round_organizer(round_id));

-- LAS VEGAS
CREATE TABLE IF NOT EXISTS public.vegas_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  value_per_point INTEGER NOT NULL DEFAULT 10,
  use_handicap BOOLEAN NOT NULL DEFAULT false,
  birdie_multiplier BOOLEAN NOT NULL DEFAULT true,
  variant TEXT NOT NULL DEFAULT 'fixed' CHECK (variant IN ('fixed', 'rotating')),
  player_a_id TEXT,
  player_b_id TEXT,
  player_c_id TEXT,
  player_d_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(round_id)
);
CREATE INDEX IF NOT EXISTS idx_vegas_config_round_id ON public.vegas_config(round_id);
ALTER TABLE public.vegas_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view vegas config" ON public.vegas_config FOR SELECT
  USING (is_round_participant(round_id) OR is_round_organizer(round_id));

CREATE POLICY "Organizer can insert vegas config" ON public.vegas_config FOR INSERT
  WITH CHECK (is_round_organizer(round_id));

CREATE POLICY "Organizer can update vegas config" ON public.vegas_config FOR UPDATE
  USING (is_round_organizer(round_id));

CREATE POLICY "Organizer can delete vegas config" ON public.vegas_config FOR DELETE
  USING (is_round_organizer(round_id));

-- NINES
CREATE TABLE IF NOT EXISTS public.nines_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  value_per_point INTEGER NOT NULL DEFAULT 10,
  player_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(round_id)
);
CREATE INDEX IF NOT EXISTS idx_nines_config_round_id ON public.nines_config(round_id);
ALTER TABLE public.nines_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view nines config" ON public.nines_config FOR SELECT
  USING (is_round_participant(round_id) OR is_round_organizer(round_id));

CREATE POLICY "Organizer can insert nines config" ON public.nines_config FOR INSERT
  WITH CHECK (is_round_organizer(round_id));

CREATE POLICY "Organizer can update nines config" ON public.nines_config FOR UPDATE
  USING (is_round_organizer(round_id));

CREATE POLICY "Organizer can delete nines config" ON public.nines_config FOR DELETE
  USING (is_round_organizer(round_id));
