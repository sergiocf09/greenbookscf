ALTER TABLE public.leaderboard_events
  DROP CONSTRAINT IF EXISTS leaderboard_events_competition_type_check;

ALTER TABLE public.leaderboard_events
  ADD CONSTRAINT leaderboard_events_competition_type_check
  CHECK (competition_type IN ('standard', 'teams_cup', 'multi_day', 'league'));