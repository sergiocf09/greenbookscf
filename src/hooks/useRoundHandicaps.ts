/**
 * Hook for managing bilateral handicaps between player pairs
 * Source of truth: round_handicaps table with realtime sync
 */
import { useCallback, useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Player } from '@/types/golf';
import { devError, devLog } from '@/lib/logger';

export interface RoundHandicap {
  id: string;
  roundId: string;
  playerAId: string;
  playerBId: string;
  strokesGivenByA: number; // Positive = A gives to B, Negative = A receives from B
  createdAt: string;
  updatedAt: string;
}

export interface HandicapPair {
  playerAId: string;
  playerBId: string;
  strokesGivenByA: number;
}

interface UseRoundHandicapsProps {
  roundId: string | null;
  players: Player[];
  roundPlayerIds: Map<string, string>; // Local player ID -> round_player ID
}

/**
 * Normalize a pair so playerA is always the "smaller" ID alphabetically
 * This ensures consistent storage and lookup
 */
const normalizePair = (idA: string, idB: string): [string, string, boolean] => {
  if (idA < idB) {
    return [idA, idB, false]; // A is already smaller
  }
  return [idB, idA, true]; // Swap: B becomes A, A becomes B
};

export const useRoundHandicaps = ({
  roundId,
  players,
  roundPlayerIds,
}: UseRoundHandicapsProps) => {
  const [handicaps, setHandicaps] = useState<Map<string, RoundHandicap>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Generate a key for the handicap map
  const getKey = useCallback((playerAId: string, playerBId: string): string => {
    const [normA, normB] = normalizePair(playerAId, playerBId);
    return `${normA}-${normB}`;
  }, []);

  // Convert local player ID to round_player ID
  const toRoundPlayerId = useCallback((localId: string): string | null => {
    return roundPlayerIds.get(localId) || null;
  }, [roundPlayerIds]);

  // Load handicaps from database
  const loadHandicaps = useCallback(async () => {
    if (!roundId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('round_handicaps')
        .select('*')
        .eq('round_id', roundId);

      if (error) throw error;

      const newMap = new Map<string, RoundHandicap>();
      (data || []).forEach((row: any) => {
        const handicap: RoundHandicap = {
          id: row.id,
          roundId: row.round_id,
          playerAId: row.player_a_id,
          playerBId: row.player_b_id,
          strokesGivenByA: row.strokes_given_by_a,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
        const key = getKey(row.player_a_id, row.player_b_id);
        newMap.set(key, handicap);
      });

      setHandicaps(newMap);
      setIsLoaded(true);
      devLog('Loaded', newMap.size, 'bilateral handicaps');
    } catch (err) {
      devError('Error loading round handicaps:', err);
    } finally {
      setIsLoading(false);
    }
  }, [roundId, getKey]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!roundId) return;

    // Initial load
    void loadHandicaps();

    // Setup realtime subscription
    const channel = supabase
      .channel(`round_handicaps:${roundId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'round_handicaps',
          filter: `round_id=eq.${roundId}`,
        },
        (payload) => {
          devLog('Round handicaps realtime event:', payload.eventType);

          if (payload.eventType === 'DELETE') {
            const old = payload.old as any;
            if (old?.player_a_id && old?.player_b_id) {
              const key = getKey(old.player_a_id, old.player_b_id);
              setHandicaps((prev) => {
                const next = new Map(prev);
                next.delete(key);
                return next;
              });
            }
          } else {
            const row = payload.new as any;
            if (row?.player_a_id && row?.player_b_id) {
              const key = getKey(row.player_a_id, row.player_b_id);
              const handicap: RoundHandicap = {
                id: row.id,
                roundId: row.round_id,
                playerAId: row.player_a_id,
                playerBId: row.player_b_id,
                strokesGivenByA: row.strokes_given_by_a,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
              };
              setHandicaps((prev) => new Map(prev).set(key, handicap));
            }
          }
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [roundId, loadHandicaps, getKey]);

  // Get strokes for a specific pair (using round_player IDs)
  const getStrokesForPair = useCallback(
    (rpIdA: string, rpIdB: string): number => {
      const [normA, normB, swapped] = normalizePair(rpIdA, rpIdB);
      const key = `${normA}-${normB}`;
      const handicap = handicaps.get(key);

      if (!handicap) return 0;

      // If swapped, invert the strokes
      return swapped ? -handicap.strokesGivenByA : handicap.strokesGivenByA;
    },
    [handicaps]
  );

  // Get strokes using local player IDs (convenience wrapper)
  const getStrokesForLocalPair = useCallback(
    (localIdA: string, localIdB: string): number => {
      const rpIdA = toRoundPlayerId(localIdA);
      const rpIdB = toRoundPlayerId(localIdB);

      if (!rpIdA || !rpIdB) return 0;

      return getStrokesForPair(rpIdA, rpIdB);
    },
    [toRoundPlayerId, getStrokesForPair]
  );

  // Set strokes for a pair (using round_player IDs)
  const setStrokesForPair = useCallback(
    async (rpIdA: string, rpIdB: string, strokesGivenByA: number): Promise<boolean> => {
      if (!roundId) return false;

      const [normA, normB, swapped] = normalizePair(rpIdA, rpIdB);
      const actualStrokes = swapped ? -strokesGivenByA : strokesGivenByA;
      const key = `${normA}-${normB}`;
      const existing = handicaps.get(key);

      try {
        if (existing) {
          // Update existing
          const { error } = await supabase
            .from('round_handicaps')
            .update({ strokes_given_by_a: actualStrokes })
            .eq('id', existing.id);

          if (error) throw error;
        } else {
          // Insert new
          const { error } = await supabase
            .from('round_handicaps')
            .insert({
              round_id: roundId,
              player_a_id: normA,
              player_b_id: normB,
              strokes_given_by_a: actualStrokes,
            });

          if (error) throw error;
        }

        devLog('Saved handicap:', normA, 'gives', actualStrokes, 'to', normB);
        return true;
      } catch (err) {
        devError('Error saving round handicap:', err);
        return false;
      }
    },
    [roundId, handicaps]
  );

  // Set strokes using local player IDs (convenience wrapper)
  const setStrokesForLocalPair = useCallback(
    async (localIdA: string, localIdB: string, strokesGivenByA: number): Promise<boolean> => {
      const rpIdA = toRoundPlayerId(localIdA);
      const rpIdB = toRoundPlayerId(localIdB);

      if (!rpIdA || !rpIdB) {
        devError('Cannot save handicap: missing round_player IDs for', localIdA, localIdB);
        return false;
      }

      return setStrokesForPair(rpIdA, rpIdB, strokesGivenByA);
    },
    [toRoundPlayerId, setStrokesForPair]
  );

  // Get all handicap pairs for display (returns data using round_player IDs)
  const getAllHandicapPairs = useCallback((): HandicapPair[] => {
    return Array.from(handicaps.values()).map((h) => ({
      playerAId: h.playerAId,
      playerBId: h.playerBId,
      strokesGivenByA: h.strokesGivenByA,
    }));
  }, [handicaps]);

  // Delete a specific handicap pair
  const deleteHandicapPair = useCallback(
    async (rpIdA: string, rpIdB: string): Promise<boolean> => {
      if (!roundId) return false;

      const [normA, normB] = normalizePair(rpIdA, rpIdB);
      const key = `${normA}-${normB}`;
      const existing = handicaps.get(key);

      if (!existing) return true; // Already doesn't exist

      try {
        const { error } = await supabase
          .from('round_handicaps')
          .delete()
          .eq('id', existing.id);

        if (error) throw error;
        return true;
      } catch (err) {
        devError('Error deleting round handicap:', err);
        return false;
      }
    },
    [roundId, handicaps]
  );

  return {
    handicaps,
    isLoading,
    isLoaded,
    loadHandicaps,
    getStrokesForPair,
    getStrokesForLocalPair,
    setStrokesForPair,
    setStrokesForLocalPair,
    getAllHandicapPairs,
    deleteHandicapPair,
    toRoundPlayerId,
  };
};
