
ALTER TABLE public.round_players DISABLE TRIGGER enforce_round_players_self_update_trg;
ALTER TABLE public.round_players DISABLE TRIGGER prevent_round_player_escalation;

UPDATE public.round_players
SET profile_id = '3f80ca81-275f-43d3-9302-8559899568d1',
    guest_name = NULL, guest_initials = NULL, guest_color = NULL
WHERE id IN ('bf594605-003f-4725-9e1f-aa25313e6f2f','b76b7f83-1be5-495d-90b4-06d26028e8da','20432fcc-6caa-42ee-8527-7fa0bcba3212');

ALTER TABLE public.round_players ENABLE TRIGGER enforce_round_players_self_update_trg;
ALTER TABLE public.round_players ENABLE TRIGGER prevent_round_player_escalation;

UPDATE public.round_snapshots SET snapshot_json = replace(snapshot_json::text,'bf594605-003f-4725-9e1f-aa25313e6f2f','3f80ca81-275f-43d3-9302-8559899568d1')::jsonb
WHERE round_id = '9f78ecf3-0aca-4c7b-a511-6d225f3ddd17';
UPDATE public.round_snapshots SET snapshot_json = replace(snapshot_json::text,'b76b7f83-1be5-495d-90b4-06d26028e8da','3f80ca81-275f-43d3-9302-8559899568d1')::jsonb
WHERE round_id = '2c140e52-16a8-459b-acc8-6e0dc8887ded';
UPDATE public.round_snapshots SET snapshot_json = replace(snapshot_json::text,'20432fcc-6caa-42ee-8527-7fa0bcba3212','3f80ca81-275f-43d3-9302-8559899568d1')::jsonb
WHERE round_id = 'd1c4b4d1-82b4-4a5a-9320-d15625681c55';
