/**
 * Hook for managing bilateral handicaps between player pairs
 * Source of truth: round_handicaps table with realtime sync
 */
import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
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
  // For guests, localId === round_player_id, so check if ID exists as value too
  const toRoundPlayerId = useCallback((localId: string): string | null => {
    // First check if it's a direct key match (profile_id for registered users, or id for guests)
    const directMatch = roundPlayerIds.get(localId);
    if (directMatch) return directMatch;
    
    // For guests restored from DB, their player.id IS the round_player_id
    // Check if localId exists as a value in the map (meaning it's already a round_player_id)
    const values = Array.from(roundPlayerIds.values());
    if (values.includes(localId)) {
      return localId;
    }
    
    devLog('toRoundPlayerId: no mapping found for', localId, 'Map size:', roundPlayerIds.size, 'Keys:', Array.from(roundPlayerIds.keys()).slice(0, 5));
    return null;
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

  /**
   * Initialize bilateral handicaps for a new player against all existing players.
   * Calculates default strokes based on the difference between player handicaps.
   * 
   * @param newPlayerId - The round_player_id of the new player
   * @param newPlayerHandicap - The handicap of the new player
   * @param existingPlayerIds - Array of round_player_ids for existing players
   * @param existingPlayerHandicaps - Map from round_player_id to handicap
   */
  const initializeHandicapsForNewPlayer = useCallback(
    async (
      newPlayerId: string,
      newPlayerHandicap: number,
      existingPlayerIds: string[],
      existingPlayerHandicaps: Map<string, number>
    ): Promise<boolean> => {
      if (!roundId) return false;

      devLog('Initializing handicaps for new player:', newPlayerId, 'hcp:', newPlayerHandicap);
      devLog('Against', existingPlayerIds.length, 'existing players');

      const insertRecords: {
        round_id: string;
        player_a_id: string;
        player_b_id: string;
        strokes_given_by_a: number;
      }[] = [];

      for (const existingId of existingPlayerIds) {
        if (existingId === newPlayerId) continue;

        const existingHcp = existingPlayerHandicaps.get(existingId) ?? 0;
        
        // Calculate strokes: positive = player A gives strokes to B
        // The player with higher handicap receives strokes
        const strokeDiff = Math.round(newPlayerHandicap - existingHcp);
        
        // Normalize the pair (alphabetically smaller ID first)
        const [normA, normB] = newPlayerId < existingId 
          ? [newPlayerId, existingId] 
          : [existingId, newPlayerId];
        
        // Check if pair already exists
        const key = `${normA}-${normB}`;
        if (handicaps.has(key)) {
          devLog('Handicap already exists for pair:', key);
          continue;
        }

        // If new player is normA, strokes_given_by_a = strokeDiff
        // If new player is normB, we need to invert the sign
        const strokesGivenByA = newPlayerId === normA ? strokeDiff : -strokeDiff;

        insertRecords.push({
          round_id: roundId,
          player_a_id: normA,
          player_b_id: normB,
          strokes_given_by_a: strokesGivenByA,
        });
      }

      if (insertRecords.length === 0) {
        devLog('No new handicap records to insert');
        return true;
      }

      try {
        const { error } = await supabase
          .from('round_handicaps')
          .insert(insertRecords);

        if (error) throw error;

        devLog('Initialized', insertRecords.length, 'bilateral handicap(s) for new player');
        return true;
      } catch (err) {
        devError('Error initializing handicaps for new player:', err);
        return false;
      }
    },
    [roundId, handicaps]
  );

  /**
   * Convert round_handicaps data to BilateralHandicap[] format for the calculation engine.
   * Uses local player IDs (not round_player_ids).
   * 
   * The engine expects absolute handicaps (playerAHandicap, playerBHandicap).
   * We convert strokes_given_by_a to:
   * - If A gives strokes to B: A has handicap 0, B has handicap = |strokes|
   * - If A receives strokes from B: A has handicap = |strokes|, B has handicap 0
   */
  const getBilateralHandicapsForEngine = useCallback((): { 
    playerAId: string; 
    playerBId: string; 
    playerAHandicap: number; 
    playerBHandicap: number; 
  }[] => {
    const result: { 
      playerAId: string; 
      playerBId: string; 
      playerAHandicap: number; 
      playerBHandicap: number; 
    }[] = [];
    
    handicaps.forEach((h) => {
      // Convert round_player_ids back to local ids
      const localAId = players.find(p => roundPlayerIds.get(p.id) === h.playerAId)?.id;
      const localBId = players.find(p => roundPlayerIds.get(p.id) === h.playerBId)?.id;
      
      if (!localAId || !localBId) return;
      
      // strokes_given_by_a > 0 means A gives strokes TO B (A is stronger)
      // strokes_given_by_a < 0 means A receives strokes FROM B (B is stronger)
      // For the engine: the player who RECEIVES strokes has the higher "handicap"
      const strokes = h.strokesGivenByA;
      
      if (strokes >= 0) {
        // A gives strokes to B → B is weaker → B gets handicap = strokes, A = 0
        result.push({
          playerAId: localAId,
          playerBId: localBId,
          playerAHandicap: 0,
          playerBHandicap: strokes,
        });
      } else {
        // A receives strokes from B → A is weaker → A gets handicap = |strokes|, B = 0
        result.push({
          playerAId: localAId,
          playerBId: localBId,
          playerAHandicap: Math.abs(strokes),
          playerBHandicap: 0,
        });
      }
    });
    
    return result;
  }, [handicaps, players, roundPlayerIds]);

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
    initializeHandicapsForNewPlayer,
    getBilateralHandicapsForEngine,
  };
};
