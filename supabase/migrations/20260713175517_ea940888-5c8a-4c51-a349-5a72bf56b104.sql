
DROP POLICY IF EXISTS "Participants can view round players" ON public.round_players;
CREATE POLICY "Participants can view round players" ON public.round_players
FOR SELECT USING (is_round_participant(round_id) OR is_round_organizer(round_id));

DROP POLICY IF EXISTS "Participants can view hole scores" ON public.hole_scores;
CREATE POLICY "Participants can view hole scores" ON public.hole_scores
FOR SELECT USING (
  round_player_id IN (
    SELECT rp.id FROM public.round_players rp
    WHERE is_round_participant(rp.round_id) OR is_round_organizer(rp.round_id)
  )
);

DROP POLICY IF EXISTS "Participants can view round groups" ON public.round_groups;
CREATE POLICY "Participants can view round groups" ON public.round_groups
FOR SELECT USING (is_round_participant(round_id) OR is_round_organizer(round_id));

DROP POLICY IF EXISTS "Participants can view round handicaps" ON public.round_handicaps;
CREATE POLICY "Participants can view round handicaps" ON public.round_handicaps
FOR SELECT USING (is_round_participant(round_id) OR is_round_organizer(round_id));
