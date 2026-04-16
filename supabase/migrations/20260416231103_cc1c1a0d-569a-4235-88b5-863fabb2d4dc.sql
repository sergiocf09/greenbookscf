ALTER TABLE public.cup_matches
  ADD COLUMN IF NOT EXISTS stroke_receiver_player_id uuid NULL
  REFERENCES public.leaderboard_participants(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.cup_matches.stroke_receiver_player_id IS
  'In Fourball, the specific player in the receiving pair that gets the strokes (defaults to the higher-HCP player of that pair).';