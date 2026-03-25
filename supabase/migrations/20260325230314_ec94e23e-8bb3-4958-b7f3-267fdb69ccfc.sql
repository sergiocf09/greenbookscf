-- Delete duplicate profile for Jorge Zerecero (no activity, created second)
-- Keep: a309f211-9e75-4c5f-ae59-4cf7cd864cbb (has round data, ledger, sliding, pvp)
-- Delete: 2556c0c1-4745-4a95-88c4-508f5b6c3001 (no activity at all)

DELETE FROM friendships WHERE owner_profile_id = '2556c0c1-4745-4a95-88c4-508f5b6c3001' OR friend_profile_id = '2556c0c1-4745-4a95-88c4-508f5b6c3001';
DELETE FROM profiles WHERE id = '2556c0c1-4745-4a95-88c4-508f5b6c3001';