ALTER TABLE public.wolf_config
ADD COLUMN player_handicaps jsonb DEFAULT '[]'::jsonb;