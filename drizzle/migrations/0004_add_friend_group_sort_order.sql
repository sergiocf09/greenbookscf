ALTER TABLE public.friend_groups
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY owner_profile_id
    ORDER BY created_at ASC, id ASC
  ) - 1 AS position
  FROM public.friend_groups
)
UPDATE public.friend_groups AS fg
SET sort_order = ranked.position
FROM ranked
WHERE fg.id = ranked.id;

CREATE INDEX IF NOT EXISTS idx_friend_groups_owner_sort
  ON public.friend_groups (owner_profile_id, sort_order, created_at);

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
  ORDER BY fg.sort_order ASC, fg.created_at ASC, p.display_name ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_friend_groups() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_friend_groups() TO authenticated;