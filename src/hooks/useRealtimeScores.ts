import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PlayerScore, Player, GolfCourse, defaultMarkerState } from '@/types/golf';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { toast } from 'sonner';
import { isAutoDetectedMarker } from '@/lib/scoreDetection';
import { markerDbToKey } from '@/lib/markerTypeMapping';
import { devError, devLog } from '@/lib/logger';

interface UseRealtimeScoresProps {
  roundId: string | null;
  players: Player[];
  course: GolfCourse | null;
  roundPlayerIds: Map<string, string>; // playerId -> round_player_id
  setScores: React.Dispatch<React.SetStateAction<Map<string, PlayerScore[]>>>;
  setConfirmedHoles: React.Dispatch<React.SetStateAction<Set<number>>>;
}

export const useRealtimeScores = ({
  roundId,
  players,
  course,
  roundPlayerIds,
  setScores,
  setConfirmedHoles,
}: UseRealtimeScoresProps) => {
  const holeScoreIdToPlayerHoleRef = useRef<Map<string, { playerId: string; holeNumber: number }>>(new Map());
  
  // Build reverse map: round_player_id -> playerId
  const getReverseMap = useCallback(() => {
    const reverseMap = new Map<string, string>();
    roundPlayerIds.forEach((rpId, playerId) => {
      reverseMap.set(rpId, playerId);
    });
    return reverseMap;
  }, [roundPlayerIds]);

  // Handle realtime score updates
  const handleScoreChange = useCallback((payload: any) => {
    if (!course || players.length === 0) return;

    const reverseMap = getReverseMap();
    const { eventType, new: newRecord, old: oldRecord } = payload;

    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      const record = newRecord;
      const playerId = reverseMap.get(record.round_player_id);
      
      if (!playerId) return;

      const player = players.find(p => p.id === playerId);
      if (!player) return;

      const strokesPerHole = calculateStrokesPerHole(player.handicap, course);
      const holeIndex = record.hole_number - 1;
      const holePar = course.holes[holeIndex]?.par || 4;

      setScores(prev => {
        const newScores = new Map(prev);
        const playerScores = [...(newScores.get(playerId) || [])];
        
        // Find and update the specific hole
        const scoreIndex = playerScores.findIndex(s => s.holeNumber === record.hole_number);
        
        const updatedScore: PlayerScore = {
          playerId,
          holeNumber: record.hole_number,
          strokes: record.strokes ?? holePar,
          putts: record.putts ?? 2,
          markers: playerScores[scoreIndex]?.markers || { ...defaultMarkerState },
          strokesReceived: record.strokes_received ?? strokesPerHole[holeIndex],
          netScore: record.net_score ?? (record.strokes ?? holePar) - strokesPerHole[holeIndex],
          oyesProximity: record.oyes_proximity ?? null,
          confirmed: record.confirmed ?? false,
        };

        if (scoreIndex >= 0) {
          playerScores[scoreIndex] = updatedScore;
        } else {
          playerScores.push(updatedScore);
          playerScores.sort((a, b) => a.holeNumber - b.holeNumber);
        }

        newScores.set(playerId, playerScores);
        return newScores;
      });

      // Update confirmed holes (global set used by UI)
      setConfirmedHoles((prev) => {
        const next = new Set(prev);
        if (record.confirmed) next.add(record.hole_number);
        else next.delete(record.hole_number);
        return next;
      });
    }
  }, [course, players, getReverseMap, setScores, setConfirmedHoles]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!roundId || roundPlayerIds.size === 0) return;

    const rpIds = Array.from(roundPlayerIds.values());
    
    // Create channel for hole_scores changes
    const channel = supabase
      .channel(`scores-${roundId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hole_scores',
          filter: `round_player_id=in.(${rpIds.join(',')})`,
        },
        (payload) => {
          devLog('Realtime score update:', payload);
          handleScoreChange(payload);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          devLog('Subscribed to realtime scores for round:', roundId);
        }
      });

    // Markers realtime: we first map hole_score_id -> (playerId, holeNumber)
    // then subscribe to hole_markers changes for those ids.
    let markersChannel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const setupMarkersRealtime = async () => {
      try {
        const { data: holeScoreRows, error } = await supabase
          .from('hole_scores')
          .select('id, round_player_id, hole_number')
          .in('round_player_id', rpIds);

        if (cancelled) return;
        if (error) {
          devError('Error mapping hole_score ids for markers realtime:', error);
          return;
        }

        const reverseMap = getReverseMap();
        const mapById = new Map<string, { playerId: string; holeNumber: number }>();
        for (const row of (holeScoreRows || []) as any[]) {
          const playerId = reverseMap.get(row.round_player_id);
          if (!playerId) continue;
          mapById.set(row.id, { playerId, holeNumber: row.hole_number });
        }
        holeScoreIdToPlayerHoleRef.current = mapById;

        const holeScoreIds = Array.from(mapById.keys());
        if (!holeScoreIds.length) return;

        markersChannel = supabase
          .channel(`markers-${roundId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'hole_markers',
              filter: `hole_score_id=in.(${holeScoreIds.join(',')})`,
            },
            (payload: any) => {
              const { eventType, new: newRec, old: oldRec } = payload;
              const rec = eventType === 'DELETE' ? oldRec : newRec;
              if (!rec?.hole_score_id) return;
              if (rec.is_auto_detected) return;

              const key = markerDbToKey(rec.marker_type);
              if (!key) return;
              // Sync any non-auto marker (unidades/manchas/etc)
              if (isAutoDetectedMarker(key as any)) return;

              const mapped = holeScoreIdToPlayerHoleRef.current.get(rec.hole_score_id);
              if (!mapped) return;

              const { playerId, holeNumber } = mapped;
              setScores((prev) => {
                const next = new Map(prev);
                const playerScores = [...(next.get(playerId) || [])];
                const idx = playerScores.findIndex((s) => s.holeNumber === holeNumber);
                if (idx < 0) return prev;

                const currentMarkers = playerScores[idx].markers || { ...defaultMarkerState };
                const updatedMarkers = {
                  ...currentMarkers,
                  [key]: eventType !== 'DELETE',
                } as any;

                playerScores[idx] = { ...playerScores[idx], markers: updatedMarkers };
                next.set(playerId, playerScores);
                return next;
              });
            }
          )
          .subscribe();
      } catch (e) {
        devError('Error setting up markers realtime:', e);
      }
    };

    void setupMarkersRealtime();

    // Cleanup subscription on unmount
    return () => {
      cancelled = true;
      devLog('Unsubscribing from realtime scores');
      supabase.removeChannel(channel);
      if (markersChannel) supabase.removeChannel(markersChannel);
    };
  }, [roundId, roundPlayerIds, handleScoreChange]);

  return null;
};