/**
 * Sliding Persistence Hook
 * 
 * Handles saving and loading sliding data to/from Supabase.
 */

import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SlidingResult } from '@/lib/slidingCalculations';
import { devLog, devError } from '@/lib/logger';

export interface SlidingCurrentEntry {
  playerAProfileId: string;
  playerBProfileId: string;
  strokesAGivesBCurrent: number;
  lastRoundId: string | null;
  lastUpdatedAt: string;
}

export function useSlidingPersistence() {
  /**
   * Save sliding history after round closure
   */
  const saveSlidingHistory = useCallback(async (
    roundId: string,
    results: SlidingResult[]
  ): Promise<boolean> => {
    if (results.length === 0) {
      devLog('No sliding results to save');
      return true;
    }

    try {
      // Prepare history records
      const historyRecords = results.map(r => ({
        round_id: roundId,
        player_a_profile_id: r.playerAProfileId,
        player_b_profile_id: r.playerBProfileId,
        strokes_a_gives_b_used: r.strokesUsed,
        front_main_winner: r.frontMainWinner,
        back_main_winner: r.backMainWinner,
        match_total_winner: r.matchTotalWinner,
        carry_front_main: r.carryFrontMain,
        strokes_a_gives_b_next: r.strokesNext,
      }));

      // Insert history records
      const { error: historyError } = await supabase
        .from('sliding_history')
        .insert(historyRecords);

      if (historyError) {
        devError('Error saving sliding history:', historyError);
        return false;
      }

      // Update or insert sliding_current for each pair
      for (const result of results) {
        const { error: upsertError } = await supabase
          .from('sliding_current')
          .upsert({
            player_a_profile_id: result.playerAProfileId,
            player_b_profile_id: result.playerBProfileId,
            strokes_a_gives_b_current: result.strokesNext,
            last_round_id: roundId,
            last_updated_at: new Date().toISOString(),
          }, {
            onConflict: 'player_a_profile_id,player_b_profile_id',
          });

        if (upsertError) {
          devError('Error upserting sliding_current:', upsertError);
          // Continue with other pairs even if one fails
        }
      }

      devLog(`Saved sliding history for ${results.length} pairs`);
      return true;
    } catch (error) {
      devError('Exception saving sliding history:', error);
      return false;
    }
  }, []);

  /**
   * Load current sliding suggestions for player pairs
   */
  const loadSlidingCurrent = useCallback(async (
    profileIds: string[]
  ): Promise<SlidingCurrentEntry[]> => {
    if (profileIds.length < 2) {
      return [];
    }

    try {
      // Query for all pairs where either player is in our list
      // We need to search both columns to find all relevant pairs
      const orConditions = [
        ...profileIds.map(id => `player_a_profile_id.eq.${id}`),
        ...profileIds.map(id => `player_b_profile_id.eq.${id}`)
      ].join(',');
      
      const { data, error } = await supabase
        .from('sliding_current')
        .select('*')
        .or(orConditions);

      if (error) {
        devError('Error loading sliding_current:', error);
        return [];
      }

      // Filter to only include pairs where BOTH players are in our list
      const profileIdSet = new Set(profileIds);
      const filtered = (data || []).filter(entry =>
        profileIdSet.has(entry.player_a_profile_id) &&
        profileIdSet.has(entry.player_b_profile_id)
      );

      return filtered.map(entry => ({
        playerAProfileId: entry.player_a_profile_id,
        playerBProfileId: entry.player_b_profile_id,
        strokesAGivesBCurrent: entry.strokes_a_gives_b_current,
        lastRoundId: entry.last_round_id,
        lastUpdatedAt: entry.last_updated_at,
      }));
    } catch (error) {
      devError('Exception loading sliding_current:', error);
      return [];
    }
  }, []);

  /**
   * Get suggested strokes for a specific pair
   * Returns null if no sliding history exists
   */
  const getSuggestedStrokes = useCallback(async (
    profileAId: string,
    profileBId: string
  ): Promise<number | null> => {
    // Normalize order
    const [orderedA, orderedB] = profileAId < profileBId
      ? [profileAId, profileBId]
      : [profileBId, profileAId];

    try {
      const { data, error } = await supabase
        .from('sliding_current')
        .select('strokes_a_gives_b_current')
        .eq('player_a_profile_id', orderedA)
        .eq('player_b_profile_id', orderedB)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No row found - this is expected for first-time pairs
          return null;
        }
        devError('Error getting suggested strokes:', error);
        return null;
      }

      // If the query was with swapped order, negate the result
      if (profileAId > profileBId) {
        return -data.strokes_a_gives_b_current;
      }

      return data.strokes_a_gives_b_current;
    } catch (error) {
      devError('Exception getting suggested strokes:', error);
      return null;
    }
  }, []);

  return {
    saveSlidingHistory,
    loadSlidingCurrent,
    getSuggestedStrokes,
  };
}
