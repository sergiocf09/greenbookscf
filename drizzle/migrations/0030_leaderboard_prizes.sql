CREATE TABLE IF NOT EXISTS public.leaderboard_prizes (
  leaderboard_id uuid PRIMARY KEY REFERENCES public.leaderboard_events(id) ON DELETE CASCADE,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  awards jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','live','final')),
  final_payouts jsonb,
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leaderboard_prizes TO authenticated;
GRANT ALL ON public.leaderboard_prizes TO service_role;
ALTER TABLE public.leaderboard_prizes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Creator or organizer can view prizes" ON public.leaderboard_prizes;
CREATE POLICY "Creator or organizer can view prizes" ON public.leaderboard_prizes FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.leaderboard_events le WHERE le.id = leaderboard_prizes.leaderboard_id AND (le.created_by = public.get_my_profile_id() OR public.is_linked_round_organizer(le.id))));
DROP POLICY IF EXISTS "Participants can view published prizes" ON public.leaderboard_prizes;
CREATE POLICY "Participants can view published prizes" ON public.leaderboard_prizes FOR SELECT TO authenticated USING (status IN ('live','final') AND public.can_view_leaderboard(leaderboard_id));
DROP POLICY IF EXISTS "Creator can insert prizes" ON public.leaderboard_prizes;
CREATE POLICY "Creator can insert prizes" ON public.leaderboard_prizes FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.leaderboard_events le WHERE le.id = leaderboard_prizes.leaderboard_id AND le.created_by = public.get_my_profile_id()));
DROP POLICY IF EXISTS "Creator can update prizes" ON public.leaderboard_prizes;
CREATE POLICY "Creator can update prizes" ON public.leaderboard_prizes FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.leaderboard_events le WHERE le.id = leaderboard_prizes.leaderboard_id AND le.created_by = public.get_my_profile_id())) WITH CHECK (EXISTS (SELECT 1 FROM public.leaderboard_events le WHERE le.id = leaderboard_prizes.leaderboard_id AND le.created_by = public.get_my_profile_id()));
DROP POLICY IF EXISTS "Creator can delete prizes" ON public.leaderboard_prizes;
CREATE POLICY "Creator can delete prizes" ON public.leaderboard_prizes FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.leaderboard_events le WHERE le.id = leaderboard_prizes.leaderboard_id AND le.created_by = public.get_my_profile_id()));
DROP TRIGGER IF EXISTS trg_leaderboard_prizes_updated_at ON public.leaderboard_prizes;
CREATE TRIGGER trg_leaderboard_prizes_updated_at BEFORE UPDATE ON public.leaderboard_prizes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();