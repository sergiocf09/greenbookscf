ALTER TABLE public.hole_markers
  ADD COLUMN IF NOT EXISTS marker_count INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.hole_markers
  DROP CONSTRAINT IF EXISTS hole_markers_hole_score_id_marker_type_key;

ALTER TABLE public.hole_markers
  ADD CONSTRAINT hole_markers_hole_score_id_marker_type_key
  UNIQUE (hole_score_id, marker_type);