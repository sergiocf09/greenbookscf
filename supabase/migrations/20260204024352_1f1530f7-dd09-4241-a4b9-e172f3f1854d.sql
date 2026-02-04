-- =====================================================
-- ROUND SNAPSHOTS: Almacena el estado inmutable de rondas cerradas
-- =====================================================
CREATE TABLE IF NOT EXISTS public.round_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot_version INTEGER NOT NULL DEFAULT 1,
  -- JSON completo con: players, scores, handicaps, bet_config, ledger, totals
  snapshot_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(round_id) -- Solo un snapshot por ronda
);

-- Índice para búsqueda rápida por round_id (si no existe)
CREATE INDEX IF NOT EXISTS idx_round_snapshots_round_id ON public.round_snapshots(round_id);

-- RLS para round_snapshots
ALTER TABLE public.round_snapshots ENABLE ROW LEVEL SECURITY;

-- Los participantes pueden ver snapshots de sus rondas
DROP POLICY IF EXISTS "Participants can view round snapshots" ON public.round_snapshots;
CREATE POLICY "Participants can view round snapshots"
ON public.round_snapshots
FOR SELECT
USING (is_round_participant(round_id) OR is_round_organizer(round_id));

-- Solo el organizador puede insertar snapshots
DROP POLICY IF EXISTS "System can insert snapshots via RPC" ON public.round_snapshots;
CREATE POLICY "Organizer can insert snapshots"
ON public.round_snapshots
FOR INSERT
WITH CHECK (is_round_organizer(round_id));

-- =====================================================
-- MODIFICAR player_vs_player PARA SOPORTAR INVITADOS
-- =====================================================
-- Añadir campos para nombres (para invitados sin profile_id)
ALTER TABLE public.player_vs_player
ADD COLUMN IF NOT EXISTS player_a_name TEXT,
ADD COLUMN IF NOT EXISTS player_b_name TEXT,
ADD COLUMN IF NOT EXISTS player_a_is_guest BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS player_b_is_guest BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS last_round_id UUID REFERENCES public.rounds(id);

-- Hacer player_a_id y player_b_id nullable para soportar invitados
ALTER TABLE public.player_vs_player
ALTER COLUMN player_a_id DROP NOT NULL,
ALTER COLUMN player_b_id DROP NOT NULL;

-- Añadir constraint: debe tener profile_id O nombre (si no existen)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'player_a_identifier_check'
  ) THEN
    ALTER TABLE public.player_vs_player
    ADD CONSTRAINT player_a_identifier_check 
    CHECK (player_a_id IS NOT NULL OR player_a_name IS NOT NULL);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'player_b_identifier_check'
  ) THEN
    ALTER TABLE public.player_vs_player
    ADD CONSTRAINT player_b_identifier_check 
    CHECK (player_b_id IS NOT NULL OR player_b_name IS NOT NULL);
  END IF;
END $$;

-- Índice para búsqueda por nombre (invitados)
CREATE INDEX IF NOT EXISTS idx_player_vs_player_names 
ON public.player_vs_player(player_a_name, player_b_name) 
WHERE player_a_name IS NOT NULL OR player_b_name IS NOT NULL;

-- =====================================================
-- ACTUALIZAR RLS DE player_vs_player PARA INCLUIR INVITADOS
-- =====================================================
-- Eliminar políticas existentes restrictivas
DROP POLICY IF EXISTS "Users can view their own pvp records" ON public.player_vs_player;

-- Nueva política: usuarios pueden ver records donde participan
CREATE POLICY "Users can view their pvp records including guests"
ON public.player_vs_player
FOR SELECT
USING (
  player_a_id = get_my_profile_id() 
  OR player_b_id = get_my_profile_id()
  -- También incluir records de rondas donde el usuario participó
  OR (last_round_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.round_players rp
    JOIN public.profiles p ON p.id = rp.profile_id
    WHERE rp.round_id = player_vs_player.last_round_id
    AND p.user_id = auth.uid()
  ))
);