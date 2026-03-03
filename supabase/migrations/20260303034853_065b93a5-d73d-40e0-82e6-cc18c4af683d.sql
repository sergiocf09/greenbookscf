
-- 1) Extend golf_courses with manual course support
ALTER TABLE public.golf_courses
  ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2) Create course_visibility table
CREATE TABLE public.course_visibility (
  course_id uuid NOT NULL REFERENCES public.golf_courses(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, profile_id)
);

ALTER TABLE public.course_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own visibility"
  ON public.course_visibility FOR SELECT
  USING (profile_id = get_my_profile_id());

CREATE POLICY "Users can insert their own visibility"
  ON public.course_visibility FOR INSERT
  WITH CHECK (profile_id = get_my_profile_id());

CREATE POLICY "Organizer can insert visibility for participants"
  ON public.course_visibility FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rounds r
      WHERE r.organizer_id = get_my_profile_id()
        AND r.course_id = course_visibility.course_id
    )
  );

CREATE POLICY "Users can delete their own visibility"
  ON public.course_visibility FOR DELETE
  USING (profile_id = get_my_profile_id());

-- 3) Create course_favorites table
CREATE TABLE public.course_favorites (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.golf_courses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, course_id)
);

ALTER TABLE public.course_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own favorites"
  ON public.course_favorites FOR SELECT
  USING (profile_id = get_my_profile_id());

CREATE POLICY "Users can insert their own favorites"
  ON public.course_favorites FOR INSERT
  WITH CHECK (profile_id = get_my_profile_id());

CREATE POLICY "Users can delete their own favorites"
  ON public.course_favorites FOR DELETE
  USING (profile_id = get_my_profile_id());

-- 4) Update golf_courses RLS: allow INSERT for manual courses
CREATE POLICY "Users can insert manual courses"
  ON public.golf_courses FOR INSERT
  WITH CHECK (is_manual = true AND created_by_profile_id = get_my_profile_id());

-- 5) Update golf_courses SELECT to include manual courses visible to user
-- Drop existing SELECT policy and replace with visibility-aware one
DROP POLICY IF EXISTS "Authenticated users can view golf courses" ON public.golf_courses;

CREATE POLICY "Users can view official and visible manual courses"
  ON public.golf_courses FOR SELECT
  USING (
    is_manual = false
    OR created_by_profile_id = get_my_profile_id()
    OR EXISTS (
      SELECT 1 FROM public.course_visibility cv
      WHERE cv.course_id = golf_courses.id
        AND cv.profile_id = get_my_profile_id()
    )
  );

-- 6) Allow INSERT on course_holes for manual course creators
DROP POLICY IF EXISTS "Block course hole inserts" ON public.course_holes;

CREATE POLICY "Creator can insert holes for manual courses"
  ON public.course_holes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.golf_courses gc
      WHERE gc.id = course_holes.course_id
        AND gc.is_manual = true
        AND gc.created_by_profile_id = get_my_profile_id()
    )
  );

-- Keep the block for non-manual (re-add restrictive for official)
-- Actually the new policy already restricts to manual courses only, so official courses remain protected.

-- 7) Allow INSERT on course_tees for manual course creators
CREATE POLICY "Creator can insert tees for manual courses"
  ON public.course_tees FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.golf_courses gc
      WHERE gc.id = course_tees.course_id
        AND gc.is_manual = true
        AND gc.created_by_profile_id = get_my_profile_id()
    )
  );

-- 8) Auto-seed favorites: add all existing official courses to all existing profiles
INSERT INTO public.course_favorites (profile_id, course_id)
SELECT p.id, gc.id
FROM public.profiles p
CROSS JOIN public.golf_courses gc
WHERE gc.is_manual = false
ON CONFLICT DO NOTHING;
