-- =============================================
-- GOLF BETS BY SCF - COMPLETE DATABASE SCHEMA
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- ENUMS
-- =============================================

CREATE TYPE public.bet_type AS ENUM (
  'medal_front',
  'medal_back', 
  'medal_total',
  'pressure_front',
  'pressure_back',
  'skins_front',
  'skins_back',
  'caros',
  'units',
  'manchas',
  'culebras',
  'pinguinos',
  'carritos_front',
  'carritos_back',
  'carritos_total'
);

CREATE TYPE public.round_status AS ENUM (
  'setup',
  'in_progress',
  'completed'
);

CREATE TYPE public.marker_type AS ENUM (
  -- Auto-detected by score
  'birdie',
  'eagle', 
  'albatross',
  'cuatriput',
  -- Units (positive)
  'sandy_par',
  'aqua_par',
  'hole_out',
  -- Manchas (negative)
  'ladies',        -- was pinkie
  'swing_blanco',  -- was paloma
  'retruje',       -- golpe para atras
  'trampa',
  'doble_agua',
  'doble_ob',
  'par3_gir_mas_3',
  'doble_digito',
  'moreliana',
  'culebra'
);

-- =============================================
-- PROFILES TABLE
-- =============================================

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  initials TEXT NOT NULL,
  avatar_color TEXT NOT NULL DEFAULT '#3B82F6',
  current_handicap DECIMAL(4,1) NOT NULL DEFAULT 20.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- HANDICAP HISTORY
-- =============================================

CREATE TABLE public.handicap_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  handicap DECIMAL(4,1) NOT NULL,
  round_id UUID, -- Will reference rounds table
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- PLAYER STATISTICS
-- =============================================

CREATE TABLE public.player_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  rounds_played INTEGER NOT NULL DEFAULT 0,
  total_strokes INTEGER NOT NULL DEFAULT 0,
  total_putts INTEGER NOT NULL DEFAULT 0,
  fir_percentage DECIMAL(5,2) DEFAULT 0,
  gir_percentage DECIMAL(5,2) DEFAULT 0,
  average_putts DECIMAL(4,2) DEFAULT 0,
  money_won DECIMAL(10,2) NOT NULL DEFAULT 0,
  money_lost DECIMAL(10,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- GOLF COURSES
-- =============================================

CREATE TABLE public.golf_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'Mexico',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.course_holes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.golf_courses(id) ON DELETE CASCADE NOT NULL,
  hole_number INTEGER NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
  par INTEGER NOT NULL CHECK (par >= 3 AND par <= 6),
  stroke_index INTEGER NOT NULL CHECK (stroke_index >= 1 AND stroke_index <= 18),
  yards_blue INTEGER,
  yards_white INTEGER,
  yards_yellow INTEGER,
  yards_red INTEGER,
  UNIQUE (course_id, hole_number)
);

-- =============================================
-- ROUNDS
-- =============================================

CREATE TABLE public.rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  course_id UUID REFERENCES public.golf_courses(id) NOT NULL,
  tee_color TEXT NOT NULL DEFAULT 'white',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status public.round_status NOT NULL DEFAULT 'setup',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add foreign key to handicap_history
ALTER TABLE public.handicap_history 
ADD CONSTRAINT handicap_history_round_fk 
FOREIGN KEY (round_id) REFERENCES public.rounds(id) ON DELETE SET NULL;

-- =============================================
-- ROUND GROUPS (Multiple groups per round)
-- =============================================

CREATE TABLE public.round_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID REFERENCES public.rounds(id) ON DELETE CASCADE NOT NULL,
  group_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, group_number)
);

-- =============================================
-- ROUND PLAYERS
-- =============================================

CREATE TABLE public.round_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID REFERENCES public.rounds(id) ON DELETE CASCADE NOT NULL,
  group_id UUID REFERENCES public.round_groups(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  handicap_for_round DECIMAL(4,1) NOT NULL,
  is_organizer BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, profile_id)
);

-- =============================================
-- HOLE SCORES
-- =============================================

CREATE TABLE public.hole_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_player_id UUID REFERENCES public.round_players(id) ON DELETE CASCADE NOT NULL,
  hole_number INTEGER NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
  strokes INTEGER CHECK (strokes >= 1 AND strokes <= 20),
  putts INTEGER CHECK (putts >= 0 AND putts <= 10),
  strokes_received INTEGER NOT NULL DEFAULT 0,
  net_score INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_player_id, hole_number)
);

-- =============================================
-- HOLE MARKERS (Units & Manchas)
-- =============================================

CREATE TABLE public.hole_markers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hole_score_id UUID REFERENCES public.hole_scores(id) ON DELETE CASCADE NOT NULL,
  marker_type public.marker_type NOT NULL,
  is_auto_detected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hole_score_id, marker_type)
);

-- =============================================
-- BILATERAL BETS (Between pairs of players)
-- =============================================

CREATE TABLE public.bilateral_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID REFERENCES public.rounds(id) ON DELETE CASCADE NOT NULL,
  player_a_id UUID REFERENCES public.round_players(id) ON DELETE CASCADE NOT NULL,
  player_b_id UUID REFERENCES public.round_players(id) ON DELETE CASCADE NOT NULL,
  bet_type public.bet_type NOT NULL,
  amount DECIMAL(8,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  handicap_a_override DECIMAL(4,1),
  handicap_b_override DECIMAL(4,1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, player_a_id, player_b_id, bet_type)
);

-- =============================================
-- TEAM BETS (Carritos)
-- =============================================

CREATE TABLE public.team_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID REFERENCES public.rounds(id) ON DELETE CASCADE NOT NULL,
  team_a_player1_id UUID REFERENCES public.round_players(id) ON DELETE CASCADE NOT NULL,
  team_a_player2_id UUID REFERENCES public.round_players(id) ON DELETE CASCADE NOT NULL,
  team_b_player1_id UUID REFERENCES public.round_players(id) ON DELETE CASCADE NOT NULL,
  team_b_player2_id UUID REFERENCES public.round_players(id) ON DELETE CASCADE NOT NULL,
  bet_type public.bet_type NOT NULL,
  amount DECIMAL(8,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  team_a_handicap DECIMAL(4,1),
  team_b_handicap DECIMAL(4,1),
  scoring_type TEXT NOT NULL DEFAULT 'lowBall',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- LEDGER TRANSACTIONS (Source of truth)
-- =============================================

CREATE TABLE public.ledger_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID REFERENCES public.rounds(id) ON DELETE CASCADE NOT NULL,
  from_profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  to_profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  bet_type public.bet_type NOT NULL,
  segment TEXT NOT NULL, -- 'front', 'back', 'total', 'hole_X'
  hole_number INTEGER,
  amount DECIMAL(8,2) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- PLAYER VS PLAYER HISTORY (Aggregated)
-- =============================================

CREATE TABLE public.player_vs_player (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_a_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  player_b_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  rounds_played INTEGER NOT NULL DEFAULT 0,
  total_won_by_a DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_won_by_b DECIMAL(10,2) NOT NULL DEFAULT 0,
  last_played_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_a_id, player_b_id)
);

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Get profile ID from auth.uid()
CREATE OR REPLACE FUNCTION public.get_my_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid()
$$;

-- Check if user is participant in a round
CREATE OR REPLACE FUNCTION public.is_round_participant(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.round_players rp
    JOIN public.profiles p ON p.id = rp.profile_id
    WHERE rp.round_id = p_round_id
    AND p.user_id = auth.uid()
  )
$$;

-- Check if user is organizer of a round
CREATE OR REPLACE FUNCTION public.is_round_organizer(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rounds r
    JOIN public.profiles p ON p.id = r.organizer_id
    WHERE r.id = p_round_id
    AND p.user_id = auth.uid()
  )
$$;

-- Check if user owns this profile
CREATE OR REPLACE FUNCTION public.is_own_profile(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_profile_id
    AND user_id = auth.uid()
  )
$$;

-- Update timestamps trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- TRIGGERS
-- =============================================

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rounds_updated_at
  BEFORE UPDATE ON public.rounds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_hole_scores_updated_at
  BEFORE UPDATE ON public.hole_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bilateral_bets_updated_at
  BEFORE UPDATE ON public.bilateral_bets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_team_bets_updated_at
  BEFORE UPDATE ON public.team_bets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_player_statistics_updated_at
  BEFORE UPDATE ON public.player_statistics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_player_vs_player_updated_at
  BEFORE UPDATE ON public.player_vs_player
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, initials, avatar_color)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    UPPER(LEFT(COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), 2)),
    '#' || LPAD(TO_HEX((RANDOM() * 16777215)::INT), 6, '0')
  );
  
  -- Also create statistics record
  INSERT INTO public.player_statistics (profile_id)
  SELECT id FROM public.profiles WHERE user_id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handicap_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_holes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hole_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hole_markers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bilateral_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_vs_player ENABLE ROW LEVEL SECURITY;

-- PROFILES POLICIES
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can view profiles of round participants"
  ON public.profiles FOR SELECT
  USING (
    id IN (
      SELECT rp.profile_id FROM public.round_players rp
      WHERE rp.round_id IN (
        SELECT rp2.round_id FROM public.round_players rp2
        JOIN public.profiles p ON p.id = rp2.profile_id
        WHERE p.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (user_id = auth.uid());

-- HANDICAP HISTORY POLICIES
CREATE POLICY "Users can view their own handicap history"
  ON public.handicap_history FOR SELECT
  USING (public.is_own_profile(profile_id));

CREATE POLICY "Users can insert their own handicap history"
  ON public.handicap_history FOR INSERT
  WITH CHECK (public.is_own_profile(profile_id));

-- PLAYER STATISTICS POLICIES
CREATE POLICY "Users can view their own statistics"
  ON public.player_statistics FOR SELECT
  USING (public.is_own_profile(profile_id));

CREATE POLICY "Users can view statistics of round participants"
  ON public.player_statistics FOR SELECT
  USING (
    profile_id IN (
      SELECT rp.profile_id FROM public.round_players rp
      WHERE rp.round_id IN (
        SELECT rp2.round_id FROM public.round_players rp2
        JOIN public.profiles p ON p.id = rp2.profile_id
        WHERE p.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update their own statistics"
  ON public.player_statistics FOR UPDATE
  USING (public.is_own_profile(profile_id));

-- GOLF COURSES POLICIES (Public read)
CREATE POLICY "Anyone can view golf courses"
  ON public.golf_courses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can view course holes"
  ON public.course_holes FOR SELECT
  TO authenticated
  USING (true);

-- ROUNDS POLICIES
CREATE POLICY "Participants can view their rounds"
  ON public.rounds FOR SELECT
  USING (public.is_round_participant(id) OR public.is_round_organizer(id));

CREATE POLICY "Authenticated users can create rounds"
  ON public.rounds FOR INSERT
  TO authenticated
  WITH CHECK (
    organizer_id = public.get_my_profile_id()
  );

CREATE POLICY "Organizers can update their rounds"
  ON public.rounds FOR UPDATE
  USING (public.is_round_organizer(id));

CREATE POLICY "Organizers can delete their rounds"
  ON public.rounds FOR DELETE
  USING (public.is_round_organizer(id));

-- ROUND GROUPS POLICIES
CREATE POLICY "Participants can view round groups"
  ON public.round_groups FOR SELECT
  USING (public.is_round_participant(round_id));

CREATE POLICY "Organizers can manage round groups"
  ON public.round_groups FOR INSERT
  WITH CHECK (public.is_round_organizer(round_id));

CREATE POLICY "Organizers can update round groups"
  ON public.round_groups FOR UPDATE
  USING (public.is_round_organizer(round_id));

CREATE POLICY "Organizers can delete round groups"
  ON public.round_groups FOR DELETE
  USING (public.is_round_organizer(round_id));

-- ROUND PLAYERS POLICIES
CREATE POLICY "Participants can view round players"
  ON public.round_players FOR SELECT
  USING (public.is_round_participant(round_id));

CREATE POLICY "Organizers can add players"
  ON public.round_players FOR INSERT
  WITH CHECK (public.is_round_organizer(round_id));

CREATE POLICY "Organizers can update players"
  ON public.round_players FOR UPDATE
  USING (public.is_round_organizer(round_id));

CREATE POLICY "Organizers can remove players"
  ON public.round_players FOR DELETE
  USING (public.is_round_organizer(round_id));

-- HOLE SCORES POLICIES
CREATE POLICY "Participants can view hole scores"
  ON public.hole_scores FOR SELECT
  USING (
    round_player_id IN (
      SELECT id FROM public.round_players WHERE public.is_round_participant(round_id)
    )
  );

CREATE POLICY "Participants can insert hole scores"
  ON public.hole_scores FOR INSERT
  WITH CHECK (
    round_player_id IN (
      SELECT id FROM public.round_players WHERE public.is_round_participant(round_id)
    )
  );

CREATE POLICY "Participants can update hole scores"
  ON public.hole_scores FOR UPDATE
  USING (
    round_player_id IN (
      SELECT id FROM public.round_players WHERE public.is_round_participant(round_id)
    )
  );

-- HOLE MARKERS POLICIES
CREATE POLICY "Participants can view hole markers"
  ON public.hole_markers FOR SELECT
  USING (
    hole_score_id IN (
      SELECT hs.id FROM public.hole_scores hs
      JOIN public.round_players rp ON rp.id = hs.round_player_id
      WHERE public.is_round_participant(rp.round_id)
    )
  );

CREATE POLICY "Participants can manage hole markers"
  ON public.hole_markers FOR INSERT
  WITH CHECK (
    hole_score_id IN (
      SELECT hs.id FROM public.hole_scores hs
      JOIN public.round_players rp ON rp.id = hs.round_player_id
      WHERE public.is_round_participant(rp.round_id)
    )
  );

CREATE POLICY "Participants can update hole markers"
  ON public.hole_markers FOR UPDATE
  USING (
    hole_score_id IN (
      SELECT hs.id FROM public.hole_scores hs
      JOIN public.round_players rp ON rp.id = hs.round_player_id
      WHERE public.is_round_participant(rp.round_id)
    )
  );

CREATE POLICY "Participants can delete hole markers"
  ON public.hole_markers FOR DELETE
  USING (
    hole_score_id IN (
      SELECT hs.id FROM public.hole_scores hs
      JOIN public.round_players rp ON rp.id = hs.round_player_id
      WHERE public.is_round_participant(rp.round_id)
    )
  );

-- BILATERAL BETS POLICIES
CREATE POLICY "Participants can view bilateral bets"
  ON public.bilateral_bets FOR SELECT
  USING (public.is_round_participant(round_id));

CREATE POLICY "Participants can create bilateral bets"
  ON public.bilateral_bets FOR INSERT
  WITH CHECK (public.is_round_participant(round_id));

CREATE POLICY "Participants can update bilateral bets"
  ON public.bilateral_bets FOR UPDATE
  USING (public.is_round_participant(round_id));

-- TEAM BETS POLICIES
CREATE POLICY "Participants can view team bets"
  ON public.team_bets FOR SELECT
  USING (public.is_round_participant(round_id));

CREATE POLICY "Participants can create team bets"
  ON public.team_bets FOR INSERT
  WITH CHECK (public.is_round_participant(round_id));

CREATE POLICY "Participants can update team bets"
  ON public.team_bets FOR UPDATE
  USING (public.is_round_participant(round_id));

-- LEDGER TRANSACTIONS POLICIES
CREATE POLICY "Users can view their own transactions"
  ON public.ledger_transactions FOR SELECT
  USING (
    from_profile_id = public.get_my_profile_id() OR 
    to_profile_id = public.get_my_profile_id()
  );

CREATE POLICY "Participants can insert ledger transactions"
  ON public.ledger_transactions FOR INSERT
  WITH CHECK (public.is_round_participant(round_id));

-- PLAYER VS PLAYER POLICIES
CREATE POLICY "Users can view their own pvp records"
  ON public.player_vs_player FOR SELECT
  USING (
    player_a_id = public.get_my_profile_id() OR 
    player_b_id = public.get_my_profile_id()
  );

CREATE POLICY "System can manage pvp records"
  ON public.player_vs_player FOR INSERT
  WITH CHECK (
    player_a_id = public.get_my_profile_id() OR 
    player_b_id = public.get_my_profile_id()
  );

CREATE POLICY "System can update pvp records"
  ON public.player_vs_player FOR UPDATE
  USING (
    player_a_id = public.get_my_profile_id() OR 
    player_b_id = public.get_my_profile_id()
  );

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_handicap_history_profile ON public.handicap_history(profile_id);
CREATE INDEX idx_round_players_round ON public.round_players(round_id);
CREATE INDEX idx_round_players_profile ON public.round_players(profile_id);
CREATE INDEX idx_hole_scores_round_player ON public.hole_scores(round_player_id);
CREATE INDEX idx_hole_markers_score ON public.hole_markers(hole_score_id);
CREATE INDEX idx_bilateral_bets_round ON public.bilateral_bets(round_id);
CREATE INDEX idx_team_bets_round ON public.team_bets(round_id);
CREATE INDEX idx_ledger_round ON public.ledger_transactions(round_id);
CREATE INDEX idx_ledger_from ON public.ledger_transactions(from_profile_id);
CREATE INDEX idx_ledger_to ON public.ledger_transactions(to_profile_id);
CREATE INDEX idx_course_holes_course ON public.course_holes(course_id);