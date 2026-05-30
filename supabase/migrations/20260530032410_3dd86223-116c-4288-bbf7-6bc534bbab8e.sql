-- Normalize profile display names to Title Case
UPDATE public.profiles
SET display_name = initcap(display_name),
    updated_at = now()
WHERE display_name IS NOT NULL
  AND display_name <> initcap(display_name);

-- Normalize guest names in leaderboard_participants
UPDATE public.leaderboard_participants
SET guest_name = initcap(guest_name)
WHERE guest_name IS NOT NULL
  AND guest_name <> initcap(guest_name);