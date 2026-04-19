-- Deduplicate handicap_history rows: keep the most recent (and most complete) row per (profile_id, round_id)
WITH ranked AS (
  SELECT
    id,
    profile_id,
    round_id,
    ROW_NUMBER() OVER (
      PARTITION BY profile_id, round_id
      ORDER BY
        (CASE WHEN differential IS NOT NULL THEN 0 ELSE 1 END),
        recorded_at DESC,
        id DESC
    ) AS rn
  FROM public.handicap_history
  WHERE round_id IS NOT NULL
)
DELETE FROM public.handicap_history hh
USING ranked r
WHERE hh.id = r.id
  AND r.rn > 1;

-- Prevent future duplicates at DB level
CREATE UNIQUE INDEX IF NOT EXISTS handicap_history_profile_round_uniq
  ON public.handicap_history (profile_id, round_id)
  WHERE round_id IS NOT NULL;