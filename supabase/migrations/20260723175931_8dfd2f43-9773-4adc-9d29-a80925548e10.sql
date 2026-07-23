
CREATE OR REPLACE FUNCTION public.enforce_round_players_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Organizers bypass this restriction
  IF public.is_round_organizer(NEW.round_id) THEN
    RETURN NEW;
  END IF;

  -- Non-organizer self-update: only tee_color may change
  IF NEW.profile_id IS DISTINCT FROM OLD.profile_id
     OR NEW.round_id IS DISTINCT FROM OLD.round_id
     OR NEW.group_id IS DISTINCT FROM OLD.group_id
     OR NEW.handicap_for_round IS DISTINCT FROM OLD.handicap_for_round
     OR NEW.is_organizer IS DISTINCT FROM OLD.is_organizer
     OR NEW.is_admin IS DISTINCT FROM OLD.is_admin
     OR NEW.guest_name IS DISTINCT FROM OLD.guest_name
     OR NEW.guest_initials IS DISTINCT FROM OLD.guest_initials
     OR NEW.guest_color IS DISTINCT FROM OLD.guest_color
     OR NEW.cross_bet_id IS DISTINCT FROM OLD.cross_bet_id
  THEN
    RAISE EXCEPTION 'Only tee_color can be updated by non-organizer participants';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_round_players_self_update_trg ON public.round_players;
CREATE TRIGGER enforce_round_players_self_update_trg
BEFORE UPDATE ON public.round_players
FOR EACH ROW
EXECUTE FUNCTION public.enforce_round_players_self_update();

DROP POLICY IF EXISTS "Participants can update their own tee color" ON public.round_players;
CREATE POLICY "Participants can update their own tee color"
ON public.round_players
FOR UPDATE
USING ((profile_id = get_my_profile_id()) AND is_round_participant(round_id))
WITH CHECK ((profile_id = get_my_profile_id()) AND is_round_participant(round_id));
