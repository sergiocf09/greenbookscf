UPDATE public.rounds
SET bet_config = bet_config 
  || jsonb_build_object(
       'carritos', (bet_config->'carritos') || jsonb_build_object('enabled', false),
       'teamPressures', jsonb_build_object('enabled', false, 'bets', '[]'::jsonb),
       'pressurePairOverrides', '{}'::jsonb,
       'carritosTeams', '[]'::jsonb,
       'betOverrides', '[]'::jsonb
     )
WHERE id = '8c67a4f0-ae23-478b-b247-1da1f3e41e12';