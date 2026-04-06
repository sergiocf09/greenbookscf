import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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

function mapEntry(e: any, idx: number): HandicapRankingEntry {
  return {
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
  };
}

export function useHandicapRanking(
  roundId: string | null,
  scope: HandicapRankingScope
) {
  const { data: entries = [], isLoading: loading } = useQuery({
    queryKey: ['handicap_ranking', scope, roundId],
    staleTime: 60_000,
    enabled: scope === 'global' ? true : !!roundId,
    queryFn: async () => {
      if (scope === 'global') {
        const { data, error } = await supabase
          .rpc('get_friend_handicap_ranking_stats');
        if (error) throw error;
        return (data || []).map(mapEntry);
      } else {
        const { data, error } = await supabase
          .rpc('get_round_handicap_ranking_stats', { p_round_id: roundId! });
        if (error) throw error;
        return (data || []).map(mapEntry);
      }
    },
  });

  return { entries, loading };
}

export function useHandicapRankingByIds(
  rankingId: string | null,
  period: RankingPeriod = 'all',
  customDateFrom?: string,
  customDateTo?: string
) {
  const { data: entries = [], isLoading: loading } = useQuery({
    queryKey: ['handicap_ranking_by_ids', rankingId, period, customDateFrom, customDateTo],
    staleTime: 60_000,
    enabled: !!rankingId,
    queryFn: async () => {
      const params: any = { p_ranking_id: rankingId!, p_period: period };
      if (period === 'custom' && customDateFrom) {
        params.p_date_from = new Date(customDateFrom).toISOString();
        params.p_date_to = customDateTo
          ? new Date(customDateTo + 'T23:59:59').toISOString()
          : new Date().toISOString();
      }
      const { data, error } = await supabase
        .rpc('get_money_ranking_handicap_stats', params);
      if (error) throw error;
      return (data || []).map(mapEntry);
    },
  });

  return { entries, loading };
}
