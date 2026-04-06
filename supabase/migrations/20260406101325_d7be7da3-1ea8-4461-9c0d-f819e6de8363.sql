
-- Delete the trigger-created duplicate profile
DELETE FROM profiles WHERE id = 'ddf5f37f-b9f5-43b8-bf6a-d07ca57ea3f6';

-- Convert the ghost profile to the real user
UPDATE profiles 
SET user_id = 'ba93b07c-f416-41c3-adb7-da1226964789', is_ghost = false
WHERE id = 'b02a8539-35e1-42a6-acef-08271ca40069';

-- Mark guest session as converted
UPDATE guest_sessions 
SET converted_profile_id = 'b02a8539-35e1-42a6-acef-08271ca40069'
WHERE id = 'ce2b87f6-132b-46f6-b36f-c1b91a5ff262';
