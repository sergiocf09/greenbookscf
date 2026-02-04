-- Create sliding_history table to store sliding snapshots per closed round
CREATE TABLE public.sliding_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  player_a_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  player_b_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  strokes_a_gives_b_used INTEGER NOT NULL DEFAULT 0,
  front_main_winner TEXT NOT NULL CHECK (front_main_winner IN ('A', 'B', 'tie')),
  back_main_winner TEXT NOT NULL CHECK (back_main_winner IN ('A', 'B', 'tie')),
  match_total_winner TEXT NOT NULL CHECK (match_total_winner IN ('A', 'B', 'tie')),
  carry_front_main BOOLEAN NOT NULL DEFAULT false,
  strokes_a_gives_b_next INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure player_a_profile_id < player_b_profile_id for normalization
  CONSTRAINT sliding_history_player_order CHECK (player_a_profile_id < player_b_profile_id),
  -- Unique per round and player pair
  CONSTRAINT sliding_history_unique_pair UNIQUE (round_id, player_a_profile_id, player_b_profile_id)
);

-- Create sliding_current table to store current suggested strokes per pair
CREATE TABLE public.sliding_current (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player_a_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  player_b_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  strokes_a_gives_b_current INTEGER NOT NULL DEFAULT 0,
  last_round_id UUID REFERENCES public.rounds(id) ON DELETE SET NULL,
  last_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure player_a_profile_id < player_b_profile_id for normalization
  CONSTRAINT sliding_current_player_order CHECK (player_a_profile_id < player_b_profile_id),
  -- Unique per player pair
  CONSTRAINT sliding_current_unique_pair UNIQUE (player_a_profile_id, player_b_profile_id)
);

-- Enable RLS
ALTER TABLE public.sliding_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sliding_current ENABLE ROW LEVEL SECURITY;

-- RLS policies for sliding_history
CREATE POLICY "Users can view their own sliding history"
ON public.sliding_history
FOR SELECT
USING (
  player_a_profile_id = get_my_profile_id() 
  OR player_b_profile_id = get_my_profile_id()
);

CREATE POLICY "Organizers can insert sliding history"
ON public.sliding_history
FOR INSERT
WITH CHECK (is_round_organizer(round_id));

-- RLS policies for sliding_current
CREATE POLICY "Users can view their own sliding current"
ON public.sliding_current
FOR SELECT
USING (
  player_a_profile_id = get_my_profile_id() 
  OR player_b_profile_id = get_my_profile_id()
);

CREATE POLICY "Users can insert their own sliding current"
ON public.sliding_current
FOR INSERT
WITH CHECK (
  player_a_profile_id = get_my_profile_id() 
  OR player_b_profile_id = get_my_profile_id()
);

CREATE POLICY "Users can update their own sliding current"
ON public.sliding_current
FOR UPDATE
USING (
  player_a_profile_id = get_my_profile_id() 
  OR player_b_profile_id = get_my_profile_id()
);

-- Create indexes for performance
CREATE INDEX idx_sliding_history_round ON public.sliding_history(round_id);
CREATE INDEX idx_sliding_history_players ON public.sliding_history(player_a_profile_id, player_b_profile_id);
CREATE INDEX idx_sliding_current_players ON public.sliding_current(player_a_profile_id, player_b_profile_id);