import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { calculateHandicapIndexForProfile } from '@/lib/usgaHandicap';

export const useLiveHandicap = (
  profileId: string | null,
  persistedHandicap?: number | null
) => {
  const syncedValueRef = useRef<number | null>(null);

  const query = useQuery({
    queryKey: ['live-handicap', profileId],
    queryFn: async () => {
      if (!profileId) return null;
      return calculateHandicapIndexForProfile(profileId);
    },
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    syncedValueRef.current = null;
  }, [profileId]);

  useEffect(() => {
    const liveHandicap = query.data;

    if (!profileId || liveHandicap === null || liveHandicap === undefined) return;
    if (persistedHandicap === null || persistedHandicap === undefined) return;
    if (Math.abs(liveHandicap - persistedHandicap) < 0.05) return;
    if (syncedValueRef.current !== null && Math.abs(syncedValueRef.current - liveHandicap) < 0.05) return;

    syncedValueRef.current = liveHandicap;

    supabase
      .from('profiles')
      .update({ current_handicap: liveHandicap })
      .eq('id', profileId)
      .then(({ error }) => {
        if (error) {
          syncedValueRef.current = null;
          console.error('Error syncing live handicap to profile:', error);
        }
      });
  }, [profileId, persistedHandicap, query.data]);

  return {
    liveHandicapIndex: query.data ?? null,
    loadingLiveHandicap: query.isLoading,
  };
};