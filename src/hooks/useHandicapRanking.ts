import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { RankingPeriod } from '@/hooks/useMoneyRankings';

export interface HandicapRankingEntry {
  profile_id: string;
  display_name: string;
  initials: string;
  avatar_color: string;
  current_handicap: number;
  avg_gross_score: number | null;
  best_gross_score: number | null;
  rounds_played: number;
  handicap_trend: number | null;
  rank?: number;
}

export type HandicapRankingScope = 'global' | 'group';

export function useHandicapRanking(roundId: string | null, scope: HandicapRankingScope) {
  const [entries, setEntries] = useState<HandicapRankingEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchGlobal = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_friend_handicap_ranking_stats');
      if (error) throw error;
      setEntries((data || []).map((e: any, idx: number) => ({
        profile_id: e.profile_id,
        display_name: e.display_name,
        initials: e.initials,
        avatar_color: e.avatar_color,
        current_handicap: Number(e.current_handicap),
        avg_gross_score: e.avg_gross_score != null ? Number(e.avg_gross_score) : null,
        best_gross_score: e.best_gross_score != null ? Number(e.best_gross_score) : null,
        rounds_played: Number(e.rounds_played),
        handicap_trend: e.handicap_trend != null ? Number(e.handicap_trend) : null,
        rank: idx + 1,
      })));
    } catch (err) {
      console.error('Error fetching global handicap ranking:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchGroup = useCallback(async () => {
    if (!roundId) { setEntries([]); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_round_handicap_ranking_stats', { p_round_id: roundId });
      if (error) throw error;
      setEntries((data || []).map((e: any, idx: number) => ({
        profile_id: e.profile_id,
        display_name: e.display_name,
        initials: e.initials,
        avatar_color: e.avatar_color,
        current_handicap: Number(e.current_handicap),
        avg_gross_score: e.avg_gross_score != null ? Number(e.avg_gross_score) : null,
        best_gross_score: e.best_gross_score != null ? Number(e.best_gross_score) : null,
        rounds_played: Number(e.rounds_played),
        handicap_trend: e.handicap_trend != null ? Number(e.handicap_trend) : null,
        rank: idx + 1,
      })));
    } catch (err) {
      console.error('Error fetching group handicap ranking:', err);
    } finally {
      setLoading(false);
    }
  }, [roundId]);

  useEffect(() => {
    if (scope === 'global') fetchGlobal();
    else fetchGroup();
  }, [scope, fetchGlobal, fetchGroup]);

  return { entries, loading };
}

/**
 * Hook for fetching handicap ranking for members of a money ranking.
 * Uses the secure RPC that calculates stats server-side.
 */
export function useHandicapRankingByIds(
  rankingId: string | null,
  period: RankingPeriod = 'all',
  customDateFrom?: string,
  customDateTo?: string
) {
  const [entries, setEntries] = useState<HandicapRankingEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!rankingId) { setEntries([]); return; }
    setLoading(true);
    try {
      const params: any = { p_ranking_id: rankingId, p_period: period };
      if (period === 'custom' && customDateFrom) {
        params.p_date_from = new Date(customDateFrom).toISOString();
        params.p_date_to = customDateTo ? new Date(customDateTo + 'T23:59:59').toISOString() : new Date().toISOString();
      }
      const { data, error } = await supabase.rpc('get_money_ranking_handicap_stats', params);
      if (error) throw error;
      setEntries((data || []).map((e: any, idx: number) => ({
        profile_id: e.profile_id,
        display_name: e.display_name,
        initials: e.initials,
        avatar_color: e.avatar_color,
        current_handicap: Number(e.current_handicap),
        avg_gross_score: e.avg_gross_score != null ? Number(e.avg_gross_score) : null,
        best_gross_score: e.best_gross_score != null ? Number(e.best_gross_score) : null,
        rounds_played: Number(e.rounds_played),
        handicap_trend: e.handicap_trend != null ? Number(e.handicap_trend) : null,
        rank: idx + 1,
      })));
    } catch (err) {
      console.error('Error fetching ranking handicap stats:', err);
    } finally {
      setLoading(false);
    }
  }, [rankingId, period, customDateFrom, customDateTo]);

  useEffect(() => { fetch(); }, [fetch]);

  return { entries, loading };
}
