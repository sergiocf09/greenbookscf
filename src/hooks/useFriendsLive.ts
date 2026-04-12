import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface FriendLiveRound {
  profileId: string;
  displayName: string;
  initials: string;
  avatarColor: string;
  roundId: string;
  courseName: string;
  holesPlayed: number;
  grossVsPar: number;
}

export function useFriendsLive() {
  const { profile } = useAuth();
  const [liveRounds, setLiveRounds] = useState<FriendLiveRound[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_friends_live_rounds');
      if (error) throw error;
      setLiveRounds((data || []).map((r: any) => ({
        profileId: r.profile_id,
        displayName: r.display_name,
        initials: r.initials,
        avatarColor: r.avatar_color,
        roundId: r.round_id,
        courseName: r.course_name,
        holesPlayed: r.holes_played ?? 0,
        grossVsPar: r.gross_vs_par ?? 0,
      })));
    } catch (e) {
      console.error('useFriendsLive error:', e);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    fetch();
    const interval = setInterval(fetch, 90_000);
    return () => clearInterval(interval);
  }, [fetch]);

  return { liveRounds, loading, refresh: fetch };
}
