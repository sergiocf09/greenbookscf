-- 1. Tabla de bitácora
CREATE TABLE public.round_audit_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id         UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  actor_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type       TEXT NOT NULL,
  target_player_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  payload          JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_round_audit_log_round ON public.round_audit_log(round_id, created_at DESC);

GRANT SELECT, INSERT ON public.round_audit_log TO authenticated;
GRANT ALL ON public.round_audit_log TO service_role;

ALTER TABLE public.round_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can read audit log"
ON public.round_audit_log
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.round_players rp
    WHERE rp.round_id = round_audit_log.round_id
      AND rp.profile_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.rounds r
    WHERE r.id = round_audit_log.round_id
      AND r.organizer_id = auth.uid()
  )
);

CREATE POLICY "Authenticated users can insert audit log"
ON public.round_audit_log
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- 2. RPC para insertar evento de auditoría
CREATE OR REPLACE FUNCTION public.log_round_event(
  p_round_id         UUID,
  p_event_type       TEXT,
  p_payload          JSONB DEFAULT '{}',
  p_target_player_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM rounds WHERE id = p_round_id AND organizer_id = auth.uid())
    OR EXISTS (SELECT 1 FROM round_players WHERE round_id = p_round_id AND profile_id = auth.uid())
  ) THEN
    RETURN;
  END IF;

  INSERT INTO round_audit_log (round_id, actor_id, event_type, target_player_id, payload)
  VALUES (p_round_id, auth.uid(), p_event_type, p_target_player_id, p_payload);
END;
$$;
GRANT EXECUTE ON FUNCTION public.log_round_event(UUID, TEXT, JSONB, UUID) TO authenticated;

-- 3. RPC para leer la bitácora
CREATE OR REPLACE FUNCTION public.get_round_audit_log(
  p_round_id UUID,
  p_limit    INT DEFAULT 100,
  p_offset   INT DEFAULT 0
)
RETURNS TABLE (
  id               UUID,
  actor_id         UUID,
  actor_name       TEXT,
  event_type       TEXT,
  target_player_id UUID,
  target_name      TEXT,
  payload          JSONB,
  created_at       TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_round_admin(p_round_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    al.id,
    al.actor_id,
    COALESCE(pa.display_name, 'Sistema') AS actor_name,
    al.event_type,
    al.target_player_id,
    pt.display_name                       AS target_name,
    al.payload,
    al.created_at
  FROM round_audit_log al
  LEFT JOIN profiles pa ON pa.id = al.actor_id
  LEFT JOIN profiles pt ON pt.id = al.target_player_id
  WHERE al.round_id = p_round_id
  ORDER BY al.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_round_audit_log(UUID, INT, INT) TO authenticated;