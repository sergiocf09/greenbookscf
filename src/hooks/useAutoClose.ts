import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { devError, devLog } from '@/lib/logger';

export interface PendingAutoCloseRound {
  round_id: string;
  round_date: string;
  course_name: string;
  organizer_name: string;
  organizer_email: string | null;
  all_players_complete: boolean;
  incomplete_player_names: string[];
}

export function useAutoClose(
  onCloseComplete?: (roundId: string, isComplete: boolean) => void
) {
  const { profile } = useAuth();
  const [pendingRounds, setPendingRounds] = useState<PendingAutoCloseRound[]>([]);
  const [processing, setProcessing] = useState(false);
  const [currentRound, setCurrentRound] = useState<PendingAutoCloseRound | null>(null);
  const executedRef = useRef(false);

  useEffect(() => {
    if (!profile || executedRef.current) return;
    executedRef.current = true;
    checkAndProcess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const checkAndProcess = async () => {
    try {
      const { data, error } = await supabase.rpc('get_my_pending_auto_close_rounds');
      if (error) throw error;
      if (!data || data.length === 0) return;

      setPendingRounds(data as PendingAutoCloseRound[]);
      setProcessing(true);

      for (const round of data as PendingAutoCloseRound[]) {
        setCurrentRound(round);
        devLog(`[AutoClose] Procesando ronda ${round.round_id} — completa: ${round.all_players_complete}`);

        if (round.all_players_complete) {
          window.dispatchEvent(new CustomEvent('greenbook:auto-close-round', {
            detail: { roundId: round.round_id, isComplete: true }
          }));
        } else {
          const { error: closeErr } = await supabase.rpc('close_round_as_incomplete', {
            p_round_id: round.round_id,
          });
          if (closeErr) {
            devError(`[AutoClose] Error cerrando ronda incompleta ${round.round_id}:`, closeErr);
          } else {
            devLog(`[AutoClose] Ronda incompleta cerrada: ${round.round_id}`);
            onCloseComplete?.(round.round_id, false);
          }
        }
      }
    } catch (err) {
      devError('[AutoClose] Error en checkAndProcess:', err);
    } finally {
      setProcessing(false);
      setCurrentRound(null);
    }
  };

  return { pendingRounds, processing, currentRound };
}
