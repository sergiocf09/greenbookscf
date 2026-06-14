CREATE TABLE IF NOT EXISTS public.pre_app_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rival_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rival_name text NOT NULL,
  year integer CHECK (year >= 1950 AND year <= 2100),
  amount numeric(10,2) NOT NULL CHECK (amount <> 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pre_app_balances TO authenticated;
GRANT ALL ON public.pre_app_balances TO service_role;

ALTER TABLE public.pre_app_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_only_select" ON public.pre_app_balances
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = owner_profile_id AND user_id = auth.uid())
  );

CREATE POLICY "owner_only_insert" ON public.pre_app_balances
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = owner_profile_id AND user_id = auth.uid())
  );

CREATE POLICY "owner_only_update" ON public.pre_app_balances
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = owner_profile_id AND user_id = auth.uid())
  );

CREATE POLICY "owner_only_delete" ON public.pre_app_balances
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = owner_profile_id AND user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.set_pre_app_balances_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_pre_app_balances_updated_at ON public.pre_app_balances;
CREATE TRIGGER trg_pre_app_balances_updated_at
  BEFORE UPDATE ON public.pre_app_balances
  FOR EACH ROW EXECUTE FUNCTION public.set_pre_app_balances_updated_at();