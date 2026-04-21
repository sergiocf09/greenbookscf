UPDATE public.rounds
SET bet_config = bet_config 
  || jsonb_build_object('betOverrides', '[]'::jsonb)
  || jsonb_build_object('carritosTeams', '[]'::jsonb)
WHERE id = '8c67a4f0-ae23-478b-b247-1da1f3e41e12';