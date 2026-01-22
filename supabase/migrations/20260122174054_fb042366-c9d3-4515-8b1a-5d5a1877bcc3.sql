-- Allow guest (non-registered) players to be persisted in rounds

ALTER TABLE public.round_players
  ALTER COLUMN profile_id DROP NOT NULL;

-- Store guest identity details directly on round_players
ALTER TABLE public.round_players
  ADD COLUMN IF NOT EXISTS guest_name text,
  ADD COLUMN IF NOT EXISTS guest_initials text,
  ADD COLUMN IF NOT EXISTS guest_color text;

-- Reasonable defaults for guest presentation
ALTER TABLE public.round_players
  ALTER COLUMN guest_color SET DEFAULT '#3B82F6';

-- Helpful index for restore queries
CREATE INDEX IF NOT EXISTS idx_round_players_round_id ON public.round_players(round_id);

-- Note: RLS policies already gate INSERT/UPDATE/DELETE by organizer.
-- Hole scores policies already allow participants to write scores for any round_player_id in their round.
