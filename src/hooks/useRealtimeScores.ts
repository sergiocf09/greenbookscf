import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PlayerScore, Player, GolfCourse, defaultMarkerState } from '@/types/golf';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { toast } from 'sonner';

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

      // Update confirmed holes if needed
      if (record.confirmed) {
        setConfirmedHoles(prev => {
          const newSet = new Set(prev);
          newSet.add(record.hole_number);
          return newSet;
        });
      }
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
          console.log('Realtime score update:', payload);
          handleScoreChange(payload);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Subscribed to realtime scores for round:', roundId);
        }
      });

    // Cleanup subscription on unmount
    return () => {
      console.log('Unsubscribing from realtime scores');
      supabase.removeChannel(channel);
    };
  }, [roundId, roundPlayerIds, handleScoreChange]);

  return null;
};