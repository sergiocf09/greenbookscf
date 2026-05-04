
-- 1. Add is_admin column
ALTER TABLE public.round_players
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- 2. Backfill: all existing in-flight rounds keep current behavior (everyone admin)
UPDATE public.round_players rp
SET is_admin = true
WHERE rp.profile_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.rounds r
    WHERE r.id = rp.round_id
      AND r.status IN ('setup','in_progress')
  );

-- 3. Helper: is user a round admin (organizer OR is_admin in round_players)
CREATE OR REPLACE FUNCTION public.is_round_admin(p_round_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rounds r
    WHERE r.id = p_round_id
      AND r.organizer_id = public.get_my_profile_id()
  ) OR EXISTS (
    SELECT 1 FROM public.round_players rp
    WHERE rp.round_id = p_round_id
      AND rp.profile_id = public.get_my_profile_id()
      AND rp.is_admin = true
  );
$$;

-- 4. Helper: is user admin of a specific group (organizer OR is_admin in that group)
CREATE OR REPLACE FUNCTION public.is_group_admin(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.round_groups rg
    JOIN public.rounds r ON r.id = rg.round_id
    WHERE rg.id = p_group_id
      AND r.organizer_id = public.get_my_profile_id()
  ) OR EXISTS (
    SELECT 1 FROM public.round_players rp
    WHERE rp.group_id = p_group_id
      AND rp.profile_id = public.get_my_profile_id()
      AND rp.is_admin = true
  );
$$;

-- 5. hole_scores: replace participant write policies with group-admin
DROP POLICY IF EXISTS "Participants can insert hole scores" ON public.hole_scores;
DROP POLICY IF EXISTS "Participants can update hole scores" ON public.hole_scores;

CREATE POLICY "Group admins can insert hole scores"
ON public.hole_scores
FOR INSERT
WITH CHECK (
  round_player_id IN (
    SELECT rp.id FROM public.round_players rp
    WHERE public.is_group_admin(rp.group_id)
  )
);

CREATE POLICY "Group admins can update hole scores"
ON public.hole_scores
FOR UPDATE
USING (
  round_player_id IN (
    SELECT rp.id FROM public.round_players rp
    WHERE public.is_group_admin(rp.group_id)
  )
);

-- 6. hole_markers: same group-admin gate
DROP POLICY IF EXISTS "Participants can manage hole markers" ON public.hole_markers;
DROP POLICY IF EXISTS "Participants can update hole markers" ON public.hole_markers;
DROP POLICY IF EXISTS "Participants can delete hole markers" ON public.hole_markers;

CREATE POLICY "Group admins can manage hole markers"
ON public.hole_markers
FOR INSERT
WITH CHECK (
  hole_score_id IN (
    SELECT hs.id FROM public.hole_scores hs
    JOIN public.round_players rp ON rp.id = hs.round_player_id
    WHERE public.is_group_admin(rp.group_id)
  )
);

CREATE POLICY "Group admins can update hole markers"
ON public.hole_markers
FOR UPDATE
USING (
  hole_score_id IN (
    SELECT hs.id FROM public.hole_scores hs
    JOIN public.round_players rp ON rp.id = hs.round_player_id
    WHERE public.is_group_admin(rp.group_id)
  )
);

CREATE POLICY "Group admins can delete hole markers"
ON public.hole_markers
FOR DELETE
USING (
  hole_score_id IN (
    SELECT hs.id FROM public.hole_scores hs
    JOIN public.round_players rp ON rp.id = hs.round_player_id
    WHERE public.is_group_admin(rp.group_id)
  )
);

-- 7. round_handicaps: round-level admin only
DROP POLICY IF EXISTS "Participants can create round handicaps" ON public.round_handicaps;
DROP POLICY IF EXISTS "Participants can update round handicaps" ON public.round_handicaps;
DROP POLICY IF EXISTS "Participants can delete round handicaps" ON public.round_handicaps;

CREATE POLICY "Round admins can create round handicaps"
ON public.round_handicaps FOR INSERT
WITH CHECK (public.is_round_admin(round_id));

CREATE POLICY "Round admins can update round handicaps"
ON public.round_handicaps FOR UPDATE
USING (public.is_round_admin(round_id));

CREATE POLICY "Round admins can delete round handicaps"
ON public.round_handicaps FOR DELETE
USING (public.is_round_admin(round_id));

-- 8. round_players: only organizer can update is_admin flag (existing organizer-update policy already covers it; keep self tee-color policy)
-- No change required; organizer policy already permits.

-- bilateral_bets: keep open to all participants (per user request, no change).
