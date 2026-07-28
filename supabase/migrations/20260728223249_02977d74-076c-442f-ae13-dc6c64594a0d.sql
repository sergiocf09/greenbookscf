ALTER TABLE public.cup_matches
  ADD COLUMN IF NOT EXISTS day_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS session_number integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS cup_matches_lb_day_session_order_idx
  ON public.cup_matches (leaderboard_id, day_number, session_number, match_order);