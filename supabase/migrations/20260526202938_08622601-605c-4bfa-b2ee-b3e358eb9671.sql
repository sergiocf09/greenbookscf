
DROP POLICY IF EXISTS "Participants can manage cup matches insert" ON public.cup_matches;
DROP POLICY IF EXISTS "Participants can manage cup matches update" ON public.cup_matches;
DROP POLICY IF EXISTS "Participants can manage cup matches delete" ON public.cup_matches;

CREATE POLICY "Creator or participants can insert cup matches"
  ON public.cup_matches FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.leaderboard_events le
            WHERE le.id = cup_matches.leaderboard_id
              AND le.created_by = get_my_profile_id())
    OR EXISTS (SELECT 1 FROM public.leaderboard_participants lp
               WHERE lp.leaderboard_id = cup_matches.leaderboard_id
                 AND lp.profile_id = get_my_profile_id()
                 AND lp.is_active = true)
  );

CREATE POLICY "Creator or participants can update cup matches"
  ON public.cup_matches FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.leaderboard_events le
            WHERE le.id = cup_matches.leaderboard_id
              AND le.created_by = get_my_profile_id())
    OR EXISTS (SELECT 1 FROM public.leaderboard_participants lp
               WHERE lp.leaderboard_id = cup_matches.leaderboard_id
                 AND lp.profile_id = get_my_profile_id()
                 AND lp.is_active = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.leaderboard_events le
            WHERE le.id = cup_matches.leaderboard_id
              AND le.created_by = get_my_profile_id())
    OR EXISTS (SELECT 1 FROM public.leaderboard_participants lp
               WHERE lp.leaderboard_id = cup_matches.leaderboard_id
                 AND lp.profile_id = get_my_profile_id()
                 AND lp.is_active = true)
  );

CREATE POLICY "Creator or participants can delete cup matches"
  ON public.cup_matches FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.leaderboard_events le
            WHERE le.id = cup_matches.leaderboard_id
              AND le.created_by = get_my_profile_id())
    OR EXISTS (SELECT 1 FROM public.leaderboard_participants lp
               WHERE lp.leaderboard_id = cup_matches.leaderboard_id
                 AND lp.profile_id = get_my_profile_id()
                 AND lp.is_active = true)
  );
