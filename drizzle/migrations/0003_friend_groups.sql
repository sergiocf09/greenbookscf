CREATE TABLE IF NOT EXISTS public.friend_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) >= 1),
  emoji text NOT NULL DEFAULT '⛳',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.friend_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.friend_groups(id) ON DELETE CASCADE,
  friend_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, friend_profile_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.friend_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friend_group_members TO authenticated;
GRANT ALL ON public.friend_groups TO service_role;
GRANT ALL ON public.friend_group_members TO service_role;

CREATE OR REPLACE FUNCTION public.set_friend_groups_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_friend_groups_updated_at ON public.friend_groups;
CREATE TRIGGER trg_friend_groups_updated_at
  BEFORE UPDATE ON public.friend_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_friend_groups_updated_at();

ALTER TABLE public.friend_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_groups_all" ON public.friend_groups
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = owner_profile_id AND user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = owner_profile_id AND user_id = auth.uid())
  );

CREATE POLICY "owner_group_members_all" ON public.friend_group_members
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.friend_groups fg
      JOIN public.profiles p ON p.id = fg.owner_profile_id
      WHERE fg.id = group_id AND p.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.friend_groups fg
      JOIN public.profiles p ON p.id = fg.owner_profile_id
      WHERE fg.id = group_id AND p.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.get_my_friend_groups()
RETURNS TABLE (
  group_id uuid, group_name text, group_emoji text,
  member_profile_id uuid, member_display_name text, member_initials text,
  member_avatar_color text, member_handicap numeric, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile_id uuid := public.get_my_profile_id();
BEGIN
  IF v_profile_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT fg.id, fg.name, fg.emoji, p.id, p.display_name, p.initials, p.avatar_color, p.current_handicap, fg.created_at
  FROM public.friend_groups fg
  LEFT JOIN public.friend_group_members fgm ON fgm.group_id = fg.id
  LEFT JOIN public.profiles p ON p.id = fgm.friend_profile_id
  WHERE fg.owner_profile_id = v_profile_id
  ORDER BY fg.created_at ASC, p.display_name ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_friend_groups() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_friend_groups() TO authenticated;