
-- Bet templates table for saving/loading bet configurations
CREATE TABLE public.bet_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  template_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_favorite boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  last_used_at timestamp with time zone
);

-- Unique constraint: one name per user
CREATE UNIQUE INDEX idx_bet_templates_owner_name ON public.bet_templates (owner_profile_id, name);

-- Index for fast listing
CREATE INDEX idx_bet_templates_owner ON public.bet_templates (owner_profile_id);

-- Enable RLS
ALTER TABLE public.bet_templates ENABLE ROW LEVEL SECURITY;

-- Users can only see their own templates
CREATE POLICY "Users can view own templates"
  ON public.bet_templates FOR SELECT
  USING (owner_profile_id = get_my_profile_id());

CREATE POLICY "Users can create own templates"
  ON public.bet_templates FOR INSERT
  WITH CHECK (owner_profile_id = get_my_profile_id());

CREATE POLICY "Users can update own templates"
  ON public.bet_templates FOR UPDATE
  USING (owner_profile_id = get_my_profile_id());

CREATE POLICY "Users can delete own templates"
  ON public.bet_templates FOR DELETE
  USING (owner_profile_id = get_my_profile_id());
