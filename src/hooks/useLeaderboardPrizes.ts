import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { trs } from '@/i18n/tr';
import { DEFAULT_PRIZE_CONFIG, normalizePrizeConfig, normalizeSpecialAwards } from '@/lib/leaderboardPrizes';
import type { PayoutResult, PrizeConfig, SpecialAward } from '@/types/leaderboard';

export type LeaderboardPrizeStatus = 'draft' | 'live' | 'final';

export interface LeaderboardPrizesState {
  leaderboardId: string;
  config: PrizeConfig;
  awards: SpecialAward[];
  status: LeaderboardPrizeStatus;
  finalPayouts: PayoutResult | null;
  finalizedAt: string | null;
  /** false when no row exists yet (defaults returned). */
  exists: boolean;
}

const prizesKey = (id: string | null) => ['leaderboard_prizes', id] as const;

const defaultsFor = (leaderboardId: string): LeaderboardPrizesState => ({
  leaderboardId,
  config: { ...DEFAULT_PRIZE_CONFIG },
  awards: [],
  status: 'draft',
  finalPayouts: null,
  finalizedAt: null,
  exists: false,
});

export function useLeaderboardPrizes(leaderboardId: string | null) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const prizesQuery = useQuery({
    queryKey: prizesKey(leaderboardId),
    enabled: !!leaderboardId,
    staleTime: 15_000,
    queryFn: async (): Promise<LeaderboardPrizesState> => {
      const { data, error } = await supabase
        .from('leaderboard_prizes')
        .select('*')
        .eq('leaderboard_id', leaderboardId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return defaultsFor(leaderboardId!);
      const status = (['draft', 'live', 'final'].includes(data.status) ? data.status : 'draft') as LeaderboardPrizeStatus;
      return {
        leaderboardId: data.leaderboard_id,
        config: normalizePrizeConfig(data.config),
        awards: normalizeSpecialAwards(data.awards),
        status,
        finalPayouts: (data.final_payouts as unknown as PayoutResult | null) ?? null,
        finalizedAt: data.finalized_at,
        exists: true,
      };
    },
  });

  const creatorQuery = useQuery({
    queryKey: ['leaderboard_event_creator', leaderboardId],
    enabled: !!leaderboardId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leaderboard_events')
        .select('created_by')
        .eq('id', leaderboardId!)
        .maybeSingle();
      if (error) throw error;
      return data?.created_by ?? null;
    },
  });

  const isCreator = !!profile?.id && creatorQuery.data === profile.id;

  const saveMutation = useMutation({
    mutationFn: async ({ config, awards }: { config: PrizeConfig; awards: SpecialAward[] }) => {
      if (!leaderboardId) throw new Error('missing leaderboard');
      const { error } = await supabase
        .from('leaderboard_prizes')
        .upsert(
          {
            leaderboard_id: leaderboardId,
            config: config as unknown as Json,
            awards: awards as unknown as Json,
          },
          { onConflict: 'leaderboard_id' },
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: prizesKey(leaderboardId) }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ status, finalPayouts }: { status: LeaderboardPrizeStatus; finalPayouts?: PayoutResult | null }) => {
      if (!leaderboardId) throw new Error('missing leaderboard');
      const isFinal = status === 'final';
      const { error } = await supabase
        .from('leaderboard_prizes')
        .upsert(
          {
            leaderboard_id: leaderboardId,
            status,
            final_payouts: isFinal ? ((finalPayouts ?? null) as unknown as Json) : null,
            finalized_at: isFinal ? new Date().toISOString() : null,
          },
          { onConflict: 'leaderboard_id' },
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: prizesKey(leaderboardId) }),
  });

  const savePrizes = useCallback(async (params: { config: PrizeConfig; awards: SpecialAward[] }): Promise<boolean> => {
    try {
      await saveMutation.mutateAsync(params);
      return true;
    } catch (err) {
      console.error('Error saving leaderboard prizes:', err);
      toast.error(trs('No se pudieron guardar los premios. Intenta de nuevo.'));
      return false;
    }
  }, [saveMutation]);

  const setStatus = useCallback(async (status: LeaderboardPrizeStatus, finalPayouts?: PayoutResult | null): Promise<boolean> => {
    try {
      await statusMutation.mutateAsync({ status, finalPayouts });
      return true;
    } catch (err) {
      console.error('Error updating leaderboard prizes status:', err);
      toast.error(trs('No se pudo actualizar el estado de los premios. Intenta de nuevo.'));
      return false;
    }
  }, [statusMutation]);

  return {
    prizes: prizesQuery.data ?? (leaderboardId ? defaultsFor(leaderboardId) : null),
    loading: prizesQuery.isLoading,
    loadError: prizesQuery.isError,
    isCreator,
    savePrizes,
    setStatus,
    saving: saveMutation.isPending || statusMutation.isPending,
    refetch: prizesQuery.refetch,
  };
}
