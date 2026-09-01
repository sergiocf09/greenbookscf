import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PlayerScore, Player, GolfCourse, defaultMarkerState, MarkerState } from '@/types/golf';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { restoreMarkerStateFromRows } from '@/lib/markerPersistence';
import { devError, devLog, devWarn } from '@/lib/logger';

interface UseScorePersistenceProps {
  roundId: string | null;
  players: Player[];
  course: GolfCourse | null;
  scores: Map<string, PlayerScore[]>;
  setScores: React.Dispatch<React.SetStateAction<Map<string, PlayerScore[]>>>;
  confirmedHoles: Set<number>;
  setConfirmedHoles: React.Dispatch<React.SetStateAction<Set<number>>>;
  roundPlayerIds: Map<string, string>; // playerId -> round_player_id
  logEvent?: (eventType: string, payload: Record<string, any>, targetPlayerId?: string | null) => Promise<void>;
  actorProfileId?: string | null;
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
  logEvent,
  actorProfileId,
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
        devError('Error loading scores:', error);
        return;
      }

      if (!holeScores || holeScores.length === 0) {
        devLog('No saved scores found, using defaults');
        return;
      }

      // Load markers (units/manchas/etc) for the loaded hole scores
      const holeScoreIds = (holeScores || []).map((hs: any) => hs.id).filter(Boolean);
      let markersByHoleScoreId: Map<string, MarkerState> = new Map();
      if (holeScoreIds.length) {
        const { data: holeMarkers, error: markersErr } = await supabase
          .from('hole_markers')
          .select('hole_score_id, marker_type, marker_count')
          .in('hole_score_id', holeScoreIds);

        if (!markersErr && holeMarkers?.length) {
          markersByHoleScoreId = new Map();
          const rowsByHoleScoreId = new Map<string, any[]>();
          for (const m of holeMarkers as any[]) {
            const bucket = rowsByHoleScoreId.get(m.hole_score_id) ?? [];
            bucket.push(m);
            rowsByHoleScoreId.set(m.hole_score_id, bucket);
          }
          for (const [holeScoreId, rows] of rowsByHoleScoreId.entries()) {
            markersByHoleScoreId.set(holeScoreId, restoreMarkerStateFromRows(rows));
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
              oyesProximitySangron: (dbScore as any).oyes_proximity_sangron ?? null,
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
      devLog('Scores loaded from database:', holeScores.length, 'records');
    } catch (err) {
      devError('Error in loadScores:', err);
    }
  }, [roundId, course, players, roundPlayerIds, setScores, setConfirmedHoles]);

  // Save a single score to database (debounced)
  const saveScore = useCallback(async (playerId: string, holeNumber: number, score: Partial<PlayerScore>) => {
    const rpId = roundPlayerIds.get(playerId);
    if (!rpId) {
      devWarn('No round_player_id for player:', playerId);
      return;
    }

    try {
      // IMPORTANT:
      // Only persist fields that are explicitly provided in this partial update.
      // Otherwise we can accidentally overwrite other columns with null/false
      // (e.g. saving oyesProximity would wipe oyes_proximity_sangron, or reset confirmed).
      const payload: any = {
        round_player_id: rpId,
        hole_number: holeNumber,
      };

      if (Object.prototype.hasOwnProperty.call(score, 'strokes')) payload.strokes = score.strokes;
      if (Object.prototype.hasOwnProperty.call(score, 'putts')) payload.putts = score.putts;
      if (Object.prototype.hasOwnProperty.call(score, 'netScore')) payload.net_score = score.netScore;
      if (Object.prototype.hasOwnProperty.call(score, 'strokesReceived')) payload.strokes_received = score.strokesReceived;
      if (Object.prototype.hasOwnProperty.call(score, 'oyesProximity')) payload.oyes_proximity = score.oyesProximity;
      if (Object.prototype.hasOwnProperty.call(score, 'oyesProximitySangron')) payload.oyes_proximity_sangron = score.oyesProximitySangron;
      if (Object.prototype.hasOwnProperty.call(score, 'confirmed')) {
        payload.confirmed = score.confirmed;
      } else if (
        Object.prototype.hasOwnProperty.call(score, 'strokes') &&
        typeof score.strokes === 'number' &&
        confirmedHoles.has(holeNumber)
      ) {
        // The hole is already confirmed for the round (e.g. player added mid-round):
        // persist their score as confirmed so team/bilateral bets include them.
        payload.confirmed = true;
      }

      const { error } = await supabase
        .from('hole_scores')
        .upsert(payload, {
          onConflict: 'round_player_id,hole_number',
          ignoreDuplicates: false,
        });

      if (error) {

        devError('Error saving score:', error);
      } else if (logEvent && roundId) {
        const isConfirmEvent = Object.prototype.hasOwnProperty.call(score, 'confirmed') && score.confirmed;
        const prevScore = scores.get(playerId)?.find(s => s.holeNumber === holeNumber);
        const prevStrokes = prevScore?.strokes;
        const prevPutts = prevScore?.putts;
        const newStrokes = score.strokes ?? prevStrokes;
        const newPutts = score.putts ?? prevPutts;
        const player = players.find(p => p.id === playerId);

        if (isConfirmEvent) {
          // On confirm, always emit per-player capture/modification event so the bitácora reflects the actual score.
          const wasConfirmed = !!prevScore?.confirmed;
          const isModification = wasConfirmed && prevStrokes !== undefined && newStrokes !== undefined && prevStrokes !== newStrokes;
          const eventType = isModification ? 'score_modified' : 'score_captured';
          const auditPayload: Record<string, any> = { hole_number: holeNumber };
          if (isModification) {
            auditPayload.prev_strokes = prevStrokes;
            auditPayload.new_strokes = newStrokes;
            if (prevPutts !== undefined) auditPayload.prev_putts = prevPutts;
            if (newPutts !== undefined) auditPayload.new_putts = newPutts;
          } else if (newStrokes !== undefined) {
            auditPayload.strokes = newStrokes;
            if (newPutts !== undefined) auditPayload.putts = newPutts;
          }
          logEvent(eventType, auditPayload, player?.profileId ?? null);
        } else if (score.strokes !== undefined) {
          const isModification = prevScore?.confirmed && prevStrokes !== undefined && prevStrokes !== score.strokes;
          const eventType = isModification ? 'score_modified' : 'score_captured';
          const auditPayload: Record<string, any> = { hole_number: holeNumber };
          if (isModification) {
            auditPayload.prev_strokes = prevStrokes;
            auditPayload.new_strokes = score.strokes;
            if (prevPutts !== undefined) auditPayload.prev_putts = prevPutts;
            if (score.putts !== undefined) auditPayload.new_putts = score.putts;
          } else {
            auditPayload.strokes = score.strokes;
            if (score.putts !== undefined) auditPayload.putts = score.putts;
          }
          logEvent(eventType, auditPayload, player?.profileId ?? null);
        }
      }
    } catch (err) {
      devError('Error in saveScore:', err);
    }
  }, [roundPlayerIds, logEvent, roundId, scores, players]);



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
    if (logEvent) {
      logEvent('hole_confirmed', { hole_number: holeNumber });
    }
    devLog('Saved hole', holeNumber, 'scores for all players');
  }, [roundId, players, scores, roundPlayerIds, saveScore, logEvent]);


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
