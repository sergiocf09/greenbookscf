import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PlayerScore, Player, GolfCourse, defaultMarkerState, MarkerState } from '@/types/golf';
import { getManualStainMarkers, getManualUnitMarkers } from '@/lib/scoreDetection';
import { markerDbToKey } from '@/lib/markerTypeMapping';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';

interface UseScorePersistenceProps {
  roundId: string | null;
  players: Player[];
  course: GolfCourse | null;
  scores: Map<string, PlayerScore[]>;
  setScores: React.Dispatch<React.SetStateAction<Map<string, PlayerScore[]>>>;
  confirmedHoles: Set<number>;
  setConfirmedHoles: React.Dispatch<React.SetStateAction<Set<number>>>;
  roundPlayerIds: Map<string, string>; // playerId -> round_player_id
}

export const useScorePersistence = ({
  roundId,
  players,
  course,
  scores,
  setScores,
  confirmedHoles,
  setConfirmedHoles,
  roundPlayerIds,
}: UseScorePersistenceProps) => {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>('');

  // Load scores from database
  const loadScores = useCallback(async () => {
    if (!roundId || !course || roundPlayerIds.size === 0) return;

    try {
      // Get all round_player_ids for this round
      const rpIds = Array.from(roundPlayerIds.values());
      
      const { data: holeScores, error } = await supabase
        .from('hole_scores')
        .select('*')
        .in('round_player_id', rpIds);

      if (error) {
        console.error('Error loading scores:', error);
        return;
      }

      if (!holeScores || holeScores.length === 0) {
        console.log('No saved scores found, using defaults');
        return;
      }

      // Load markers (units/manchas/etc) for the loaded hole scores
      const holeScoreIds = (holeScores || []).map((hs: any) => hs.id).filter(Boolean);
      let markersByHoleScoreId: Map<string, MarkerState> = new Map();
      if (holeScoreIds.length) {
        const { data: holeMarkers, error: markersErr } = await supabase
          .from('hole_markers')
          .select('hole_score_id, marker_type')
          .in('hole_score_id', holeScoreIds);

        if (!markersErr && holeMarkers?.length) {
          const allowedKeys = new Set<string>([...getManualUnitMarkers(), ...getManualStainMarkers()].map(String));
          markersByHoleScoreId = new Map();
          for (const m of holeMarkers as any[]) {
            const prev = markersByHoleScoreId.get(m.hole_score_id) ?? { ...defaultMarkerState };
            const key = markerDbToKey(m.marker_type);
            if (key && allowedKeys.has(String(key)) && key in prev) {
              (prev as any)[key] = true;
            }
            markersByHoleScoreId.set(m.hole_score_id, prev);
          }
        }
      }

      // Build scores map from database
      const newScores = new Map<string, PlayerScore[]>();
      const confirmedHoleNumbers = new Set<number>();

      // Initialize with defaults first
      players.forEach(player => {
        const rpId = roundPlayerIds.get(player.id);
        const strokesPerHole = calculateStrokesPerHole(player.handicap, course);
        
        const playerScores: PlayerScore[] = Array.from({ length: 18 }, (_, i) => {
          const holePar = course.holes[i]?.par || 4;
          const dbScore = holeScores.find(
            hs => hs.round_player_id === rpId && hs.hole_number === i + 1
          );

          if (dbScore) {
            // Track confirmed holes
            if (dbScore.confirmed) {
              confirmedHoleNumbers.add(dbScore.hole_number);
            }

            return {
              playerId: player.id,
              holeNumber: i + 1,
              strokes: dbScore.strokes ?? holePar,
              putts: dbScore.putts ?? 2,
              markers: markersByHoleScoreId.get(dbScore.id) ?? { ...defaultMarkerState },
              strokesReceived: dbScore.strokes_received ?? strokesPerHole[i],
              netScore: dbScore.net_score ?? (dbScore.strokes ?? holePar) - strokesPerHole[i],
              oyesProximity: dbScore.oyes_proximity ?? null,
              confirmed: dbScore.confirmed ?? false,
            };
          }

          return {
            playerId: player.id,
            holeNumber: i + 1,
            strokes: holePar,
            putts: 2,
            markers: { ...defaultMarkerState },
            strokesReceived: strokesPerHole[i],
            netScore: holePar - strokesPerHole[i],
            confirmed: false,
          };
        });

        newScores.set(player.id, playerScores);
      });

      setScores(newScores);
      setConfirmedHoles(confirmedHoleNumbers);
      console.log('Scores loaded from database:', holeScores.length, 'records');
    } catch (err) {
      console.error('Error in loadScores:', err);
    }
  }, [roundId, course, players, roundPlayerIds, setScores, setConfirmedHoles]);

  // Save a single score to database (debounced)
  const saveScore = useCallback(async (playerId: string, holeNumber: number, score: Partial<PlayerScore>) => {
    const rpId = roundPlayerIds.get(playerId);
    if (!rpId) {
      console.warn('No round_player_id for player:', playerId);
      return;
    }

    try {
      // Upsert the score
      const { error } = await supabase
        .from('hole_scores')
        .upsert({
          round_player_id: rpId,
          hole_number: holeNumber,
          strokes: score.strokes,
          putts: score.putts,
          net_score: score.netScore,
          strokes_received: score.strokesReceived,
          oyes_proximity: score.oyesProximity ?? null,
          confirmed: score.confirmed ?? false,
        }, {
          onConflict: 'round_player_id,hole_number',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error('Error saving score:', error);
      }
    } catch (err) {
      console.error('Error in saveScore:', err);
    }
  }, [roundPlayerIds]);

  // Save all scores for a hole (when confirming)
  const saveHoleScores = useCallback(async (holeNumber: number) => {
    if (!roundId || roundPlayerIds.size === 0) return;

    const promises: Promise<void>[] = [];

    players.forEach(player => {
      const playerScores = scores.get(player.id) || [];
      const holeScore = playerScores.find(s => s.holeNumber === holeNumber);
      
      if (holeScore) {
        promises.push(saveScore(player.id, holeNumber, { ...holeScore, confirmed: true }));
      }
    });

    await Promise.all(promises);
    console.log('Saved hole', holeNumber, 'scores for all players');
  }, [roundId, players, scores, roundPlayerIds, saveScore]);

  // Debounced save on score change
  const debouncedSave = useCallback((playerId: string, holeNumber: number, score: Partial<PlayerScore>) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveScore(playerId, holeNumber, score);
    }, 500); // 500ms debounce
  }, [saveScore]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    loadScores,
    saveScore,
    saveHoleScores,
    debouncedSave,
  };
};
