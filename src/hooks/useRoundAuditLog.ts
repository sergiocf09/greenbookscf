import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { devError } from '@/lib/logger';

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  eventType: string;
  targetPlayerId: string | null;
  targetName: string | null;
  payload: Record<string, any>;
  createdAt: string;
}

export function useRoundAuditLog(roundId: string | null, isAdmin: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['round-audit-log', roundId],
    enabled: !!roundId && isAdmin,
    staleTime: 30_000,
    queryFn: async (): Promise<AuditLogEntry[]> => {
      const { data, error } = await supabase.rpc('get_round_audit_log', {
        p_round_id: roundId!,
        p_limit: 200,
        p_offset: 0,
      });
      if (error) {
        devError('useRoundAuditLog fetch failed', error);
        return [];
      }
      return (data ?? []).map((r: any) => ({
        id: r.id,
        actorId: r.actor_id,
        actorName: r.actor_name ?? 'Sistema',
        eventType: r.event_type,
        targetPlayerId: r.target_player_id,
        targetName: r.target_name,
        payload: r.payload ?? {},
        createdAt: r.created_at,
      }));
    },
  });

  const logEvent = useCallback((
    eventType: string,
    payload: Record<string, any>,
    targetPlayerId?: string | null
  ): Promise<void> => {
    if (!roundId) return Promise.resolve();
    void Promise.resolve(supabase.rpc('log_round_event', {
        p_round_id: roundId,
        p_event_type: eventType,
        p_payload: payload,
        p_target_player_id: targetPlayerId ?? null,
      }))
      .then(({ error }) => {
        if (error) {
          devError('useRoundAuditLog logEvent failed (non-blocking)', error);
          return;
        }
        void queryClient.invalidateQueries({ queryKey: ['round-audit-log', roundId] });
      })
      .catch((err) => {
        devError('useRoundAuditLog logEvent failed (non-blocking)', err);
      });
    return Promise.resolve();
  }, [queryClient, roundId]);

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
    logEvent,
  };
}
