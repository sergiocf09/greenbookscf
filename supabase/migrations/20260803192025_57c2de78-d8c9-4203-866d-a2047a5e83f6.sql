UPDATE public.round_snapshots s
SET snapshot_json = jsonb_set(
  s.snapshot_json,
  '{players}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN (sp->>'profileId') IS NULL
             AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id::text = sp->>'id')
        THEN sp || jsonb_build_object('profileId', sp->>'id', 'isGuest', false)
        ELSE sp
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(s.snapshot_json->'players') WITH ORDINALITY AS t(sp, ord)
  )
)
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(s.snapshot_json->'players') sp
  JOIN public.profiles pr ON pr.id::text = sp->>'id'
  WHERE (sp->>'profileId') IS NULL
);