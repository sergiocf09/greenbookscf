
-- 1. Add is_ghost column to profiles
ALTER TABLE public.profiles
  ADD COLUMN is_ghost boolean NOT NULL DEFAULT false;

-- 2. Make user_id nullable for ghost profiles
ALTER TABLE public.profiles
  ALTER COLUMN user_id DROP NOT NULL;

-- 3. Add unique constraint only for non-null user_ids
-- (drop existing unique constraint first if any, then re-add as partial)
DO $$
BEGIN
  -- Drop existing unique constraint on user_id if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_user_id_key' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_user_id_key;
  END IF;
END$$;

CREATE UNIQUE INDEX profiles_user_id_unique ON public.profiles (user_id) WHERE user_id IS NOT NULL;

-- 4. Create guest_sessions table
CREATE TABLE public.guest_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id              uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  ghost_profile_id      uuid NOT NULL REFERENCES public.profiles(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  conversion_deadline   timestamptz,
  converted_profile_id  uuid REFERENCES public.profiles(id)
);

ALTER TABLE public.guest_sessions ENABLE ROW LEVEL SECURITY;

-- Guest sessions need public access (no auth for guests)
CREATE POLICY "Anyone can view guest sessions"
  ON public.guest_sessions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can create guest sessions"
  ON public.guest_sessions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update guest sessions"
  ON public.guest_sessions FOR UPDATE
  TO anon, authenticated
  USING (true);

-- 5. RLS: Allow viewing ghost profiles publicly
CREATE POLICY "Anyone can view ghost profiles"
  ON public.profiles FOR SELECT
  TO anon, authenticated
  USING (is_ghost = true);

-- 6. RLS: Allow creating ghost profiles without auth
CREATE POLICY "Anyone can create ghost profiles"
  ON public.profiles FOR INSERT
  TO anon, authenticated
  WITH CHECK (is_ghost = true AND user_id IS NULL);

-- 7. RPC: join_round_as_guest — atomic creation of ghost + session + round_player
CREATE OR REPLACE FUNCTION public.join_round_as_guest(
  p_round_id uuid,
  p_display_name text,
  p_group_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_initials text;
  v_avatar_color text;
  v_ghost_profile_id uuid;
  v_session_id uuid;
  v_round_player_id uuid;
  v_target_group_id uuid;
  v_colors text[] := ARRAY['#3B82F6','#EF4444','#10B981','#F59E0B','#8B5CF6','#EC4899','#06B6D4','#F97316'];
BEGIN
  -- Validate round exists and is not completed
  IF NOT EXISTS (SELECT 1 FROM rounds WHERE id = p_round_id AND status != 'completed') THEN
    RAISE EXCEPTION 'Ronda no encontrada o ya finalizada';
  END IF;

  -- Calculate initials (first letter of first two words)
  v_initials := upper(
    left(split_part(trim(p_display_name), ' ', 1), 1) ||
    COALESCE(NULLIF(left(split_part(trim(p_display_name), ' ', 2), 1), ''), '')
  );

  -- Random color
  v_avatar_color := v_colors[1 + floor(random() * array_length(v_colors, 1))::int];

  -- Determine target group
  IF p_group_id IS NOT NULL THEN
    v_target_group_id := p_group_id;
  ELSE
    SELECT id INTO v_target_group_id FROM round_groups WHERE round_id = p_round_id ORDER BY group_number LIMIT 1;
  END IF;

  IF v_target_group_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró grupo para la ronda';
  END IF;

  -- 1. Create ghost profile
  INSERT INTO profiles (display_name, initials, avatar_color, user_id, is_ghost, current_handicap)
  VALUES (p_display_name, v_initials, v_avatar_color, NULL, true, 20.0)
  RETURNING id INTO v_ghost_profile_id;

  -- 2. Create guest session
  INSERT INTO guest_sessions (round_id, ghost_profile_id)
  VALUES (p_round_id, v_ghost_profile_id)
  RETURNING id INTO v_session_id;

  -- 3. Create round_player
  INSERT INTO round_players (round_id, group_id, profile_id, guest_name, guest_initials, guest_color, handicap_for_round, is_organizer)
  VALUES (p_round_id, v_target_group_id, v_ghost_profile_id, p_display_name, v_initials, v_avatar_color, 20.0, false)
  RETURNING id INTO v_round_player_id;

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'ghost_profile_id', v_ghost_profile_id,
    'round_player_id', v_round_player_id
  );
END;
$$;

-- 8. RPC: convert_ghost_to_profile
CREATE OR REPLACE FUNCTION public.convert_ghost_to_profile(
  p_session_id uuid,
  p_auth_uid uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session guest_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM guest_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesión no encontrada'; END IF;
  IF v_session.converted_profile_id IS NOT NULL THEN
    RAISE EXCEPTION 'Sesión ya convertida';
  END IF;
  IF v_session.conversion_deadline IS NOT NULL AND v_session.conversion_deadline < now() THEN
    RAISE EXCEPTION 'Período de conversión expirado';
  END IF;

  -- Link ghost to real auth user
  UPDATE profiles
  SET user_id = p_auth_uid, is_ghost = false
  WHERE id = v_session.ghost_profile_id AND is_ghost = true;

  -- Mark session as converted
  UPDATE guest_sessions
  SET converted_profile_id = v_session.ghost_profile_id
  WHERE id = p_session_id;

  RETURN v_session.ghost_profile_id;
END;
$$;

-- 9. RPC: cleanup_expired_guest_sessions
CREATE OR REPLACE FUNCTION public.cleanup_expired_guest_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM guest_sessions
  WHERE conversion_deadline < now()
    AND converted_profile_id IS NULL;
END;
$$;

-- 10. Allow anon to insert round_players via the RPC (the RPC is SECURITY DEFINER so this is handled)
-- But we need anon to be able to read round info for the join page
-- The get_round_invite_info RPC is already SECURITY DEFINER, so anon can call it

-- 11. Grant execute on new functions to anon
GRANT EXECUTE ON FUNCTION public.join_round_as_guest(uuid, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_ghost_to_profile(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_guest_sessions() TO authenticated;
