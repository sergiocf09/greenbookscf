import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { devError } from '@/lib/logger';

export interface PendingPlayer {
  roundPlayerId: string;
  profileId: string;
  name: string;
  totalStrokes: number;
}

export interface AttestationRound {
  roundId: string;
  roundDate: string;
  courseName: string;
  organizerName: string;
  pendingPlayers: PendingPlayer[];
}

export function useAttestation(profileId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['pending-attestations', profileId],
    enabled: !!profileId,
    staleTime: 60_000,
    queryFn: async (): Promise<AttestationRound[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('get_pending_attestations');
      if (error) {
        devError('useAttestation: get_pending_attestations failed', error);
        return [];
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map((r) => ({
        roundId: r.round_id,
        roundDate: r.round_date,
        courseName: r.course_name,
        organizerName: r.organizer_name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pendingPlayers: ((r.pending_players ?? []) as any[]).map((pp) => ({
          roundPlayerId: pp.round_player_id,
          profileId: pp.profile_id,
          name: pp.name,
          totalStrokes: pp.total_strokes ?? 0,
        })),
      }));
    },
  });

  const mutation = useMutation({
    mutationFn: async (roundPlayerId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('attest_round_player', {
        p_round_player_id: roundPlayerId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-attestations', profileId] });
      queryClient.invalidateQueries({ queryKey: ['handicap-history-materialized', profileId] });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      devError('useAttestation: attest_round_player failed', err);
    },
  });

  // Total pending players across all rounds (used for header badge).
  const pendingPlayersCount = (query.data ?? []).reduce(
    (sum, r) => sum + r.pendingPlayers.length,
    0,
  );

  return {
    pendingRounds: query.data ?? [],
    pendingPlayersCount,
    isLoading: query.isLoading,
    attestPlayer: mutation.mutateAsync,
    isAttesting: mutation.isPending,
    attestError: mutation.error,
  };
}
