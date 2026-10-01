CREATE TABLE public.round_exited_by_profile (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  exited_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, round_id)
);
GRANT SELECT, INSERT, DELETE ON public.round_exited_by_profile TO authenticated;
GRANT ALL ON public.round_exited_by_profile TO service_role;
ALTER TABLE public.round_exited_by_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own exits select" ON public.round_exited_by_profile FOR SELECT TO authenticated USING (public.is_own_profile(profile_id));
CREATE POLICY "own exits insert" ON public.round_exited_by_profile FOR INSERT TO authenticated WITH CHECK (public.is_own_profile(profile_id));
CREATE POLICY "own exits delete" ON public.round_exited_by_profile FOR DELETE TO authenticated USING (public.is_own_profile(profile_id));

CREATE OR REPLACE FUNCTION public.clear_round_exits_on_reopen()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'completed' AND NEW.status <> 'completed' THEN
    DELETE FROM public.round_exited_by_profile WHERE round_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_clear_round_exits_on_reopen AFTER UPDATE OF status ON public.rounds
FOR EACH ROW EXECUTE FUNCTION public.clear_round_exits_on_reopen();