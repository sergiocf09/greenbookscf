
CREATE OR REPLACE FUNCTION public.prevent_score_changes_on_completed_round()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM rounds r
    JOIN round_players rp ON rp.round_id = r.id
    WHERE rp.id = NEW.round_player_id
      AND r.status = 'completed'
  ) THEN
    RAISE EXCEPTION 'Cannot modify scores on a completed round';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_score_changes_on_completed
  BEFORE INSERT OR UPDATE ON public.hole_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_score_changes_on_completed_round();
