-- =====================================================
-- Tabla dedicada para hándicaps bilaterales por ronda
-- Única fuente de verdad para golpes entre pares
-- =====================================================

CREATE TABLE public.round_handicaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID REFERENCES public.rounds(id) ON DELETE CASCADE NOT NULL,
  player_a_id UUID REFERENCES public.round_players(id) ON DELETE CASCADE NOT NULL,
  player_b_id UUID REFERENCES public.round_players(id) ON DELETE CASCADE NOT NULL,
  strokes_given_by_a INTEGER NOT NULL DEFAULT 0,
  -- Positive = A gives strokes to B; Negative = A receives strokes from B
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure unique pair per round (A,B) - we normalize to always store A < B alphabetically
  UNIQUE (round_id, player_a_id, player_b_id)
);

-- Enable RLS
ALTER TABLE public.round_handicaps ENABLE ROW LEVEL SECURITY;

-- Policies: Only round participants can view/manage
CREATE POLICY "Participants can view round handicaps"
  ON public.round_handicaps FOR SELECT
  USING (public.is_round_participant(round_id));

CREATE POLICY "Participants can create round handicaps"
  ON public.round_handicaps FOR INSERT
  WITH CHECK (public.is_round_participant(round_id));

CREATE POLICY "Participants can update round handicaps"
  ON public.round_handicaps FOR UPDATE
  USING (public.is_round_participant(round_id));

CREATE POLICY "Participants can delete round handicaps"
  ON public.round_handicaps FOR DELETE
  USING (public.is_round_participant(round_id));

-- Trigger for updated_at
CREATE TRIGGER update_round_handicaps_updated_at
  BEFORE UPDATE ON public.round_handicaps
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for synchronization across devices
ALTER PUBLICATION supabase_realtime ADD TABLE public.round_handicaps;

-- Index for faster lookups by round
CREATE INDEX idx_round_handicaps_round_id ON public.round_handicaps(round_id);