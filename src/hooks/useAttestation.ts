import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { devError } from '@/lib/logger';

export interface AttestationRound {
  roundId: string;
  roundDate: string;
  courseName: string;
  organizerName: string;
  playerNames: string[];
  myTotalStrokes: number;
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
        playerNames: r.player_names ?? [],
        myTotalStrokes: r.my_total_strokes ?? 0,
      }));
    },
  });

  const mutation = useMutation({
    mutationFn: async (roundId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('attest_round', { p_round_id: roundId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-attestations', profileId] });
      queryClient.invalidateQueries({ queryKey: ['handicap-history-materialized', profileId] });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      devError('useAttestation: attest_round failed', err);
    },
  });

  return {
    pendingRounds: query.data ?? [],
    isLoading: query.isLoading,
    attestRound: mutation.mutateAsync,
    isAttesting: mutation.isPending,
    attestError: mutation.error,
  };
}
