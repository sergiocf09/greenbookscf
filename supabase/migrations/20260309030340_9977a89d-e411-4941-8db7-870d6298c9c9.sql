
-- ============================================================
-- LEADERBOARD MODULE — Phase 1: Single-day events
-- ============================================================

-- 1) leaderboard_events
CREATE TABLE public.leaderboard_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'single_day', -- single_day, tournament, league
  status text NOT NULL DEFAULT 'active', -- active, completed, cancelled
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  scoring_modes jsonb NOT NULL DEFAULT '["gross","net"]'::jsonb, -- array of: gross, net, stableford
  rules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  code text NOT NULL DEFAULT left(replace(gen_random_uuid()::text, '-', ''), 6),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX leaderboard_events_code_idx ON public.leaderboard_events(code);

ALTER TABLE public.leaderboard_events ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can see active leaderboards (they need to discover them by code)
CREATE POLICY "Anyone authenticated can view leaderboard events"
  ON public.leaderboard_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Creator can insert leaderboard events"
  ON public.leaderboard_events FOR INSERT
  TO authenticated
  WITH CHECK (created_by = public.get_my_profile_id());

CREATE POLICY "Creator can update leaderboard events"
  ON public.leaderboard_events FOR UPDATE
  TO authenticated
  USING (created_by = public.get_my_profile_id());

CREATE POLICY "Creator can delete leaderboard events"
  ON public.leaderboard_events FOR DELETE
  TO authenticated
  USING (created_by = public.get_my_profile_id());

-- 2) leaderboard_rounds (links rounds to events)
CREATE TABLE public.leaderboard_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leaderboard_id uuid NOT NULL REFERENCES public.leaderboard_events(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  added_by uuid NOT NULL REFERENCES public.profiles(id),
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(leaderboard_id, round_id)
);

ALTER TABLE public.leaderboard_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view leaderboard rounds"
  ON public.leaderboard_rounds FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Round organizer or event creator can add rounds"
  ON public.leaderboard_rounds FOR INSERT
  TO authenticated
  WITH CHECK (
    added_by = public.get_my_profile_id()
    AND (
      public.is_round_organizer(round_id)
      OR EXISTS (SELECT 1 FROM public.leaderboard_events le WHERE le.id = leaderboard_id AND le.created_by = public.get_my_profile_id())
    )
  );

CREATE POLICY "Event creator can remove rounds"
  ON public.leaderboard_rounds FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.leaderboard_events le WHERE le.id = leaderboard_id AND le.created_by = public.get_my_profile_id())
  );

-- 3) leaderboard_participants (players in the event, with independent handicap)
CREATE TABLE public.leaderboard_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leaderboard_id uuid NOT NULL REFERENCES public.leaderboard_events(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id),
  guest_name text,
  guest_initials text,
  guest_color text DEFAULT '#3B82F6',
  handicap_for_leaderboard numeric NOT NULL DEFAULT 0,
  source_round_id uuid REFERENCES public.rounds(id),
  is_active boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(leaderboard_id, profile_id)
);

ALTER TABLE public.leaderboard_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view leaderboard participants"
  ON public.leaderboard_participants FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Event creator or self can insert participants"
  ON public.leaderboard_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.leaderboard_events le WHERE le.id = leaderboard_id AND le.created_by = public.get_my_profile_id())
    OR profile_id = public.get_my_profile_id()
  );

CREATE POLICY "Event creator can update participants"
  ON public.leaderboard_participants FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.leaderboard_events le WHERE le.id = leaderboard_id AND le.created_by = public.get_my_profile_id())
  );

CREATE POLICY "Event creator can delete participants"
  ON public.leaderboard_participants FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.leaderboard_events le WHERE le.id = leaderboard_id AND le.created_by = public.get_my_profile_id())
  );

-- 4) leaderboard_scores (materialized per-round scores per participant)
CREATE TABLE public.leaderboard_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leaderboard_id uuid NOT NULL REFERENCES public.leaderboard_events(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.leaderboard_participants(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  gross_total integer,
  net_total integer,
  stableford_total integer,
  gross_vs_par integer,
  net_vs_par integer,
  holes_played integer NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(leaderboard_id, participant_id, round_id)
);

ALTER TABLE public.leaderboard_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view leaderboard scores"
  ON public.leaderboard_scores FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Event creator can manage leaderboard scores"
  ON public.leaderboard_scores FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.leaderboard_events le WHERE le.id = leaderboard_id AND le.created_by = public.get_my_profile_id())
  );

CREATE POLICY "Event creator can update leaderboard scores"
  ON public.leaderboard_scores FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.leaderboard_events le WHERE le.id = leaderboard_id AND le.created_by = public.get_my_profile_id())
  );

CREATE POLICY "Event creator can delete leaderboard scores"
  ON public.leaderboard_scores FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.leaderboard_events le WHERE le.id = leaderboard_id AND le.created_by = public.get_my_profile_id())
  );

-- Helper function: resolve leaderboard by code
CREATE OR REPLACE FUNCTION public.resolve_leaderboard_by_code(p_code text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.leaderboard_events
  WHERE lower(code) = lower(trim(p_code))
    AND status = 'active'
  LIMIT 1;
$$;
