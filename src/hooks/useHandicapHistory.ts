import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  calculateHandicapIndexFromDifferentials,
  getNumDifferentialsToUse,
} from '@/lib/usgaHandicap';

export interface HandicapHistoryEntry {
  roundId: string;
  date: string;
  courseName: string;
  teeColor: string;
  totalStrokes: number;
  adjustedGrossScore: number;
  courseRating: number;
  slopeRating: number;
  differential: number;
  handicapAtTime: number;
}

export interface HandicapHistoryResult {
  handicapIndex: number | null;
  entries: HandicapHistoryEntry[];
  roundsUsed: number;
  totalRounds: number;
  minimumRoundsNeeded: number;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Lightweight hook that reads materialized data from handicap_history table.
 * Single query instead of 61 sequential requests.
 */
export const useHandicapHistory = (profileId: string | null) => {
  const query = useQuery({
    queryKey: ['handicap-history-materialized', profileId],
    queryFn: async (): Promise<Omit<HandicapHistoryResult, 'isLoading' | 'error'>> => {
      if (!profileId) {
        return { handicapIndex: null, entries: [], roundsUsed: 0, totalRounds: 0, minimumRoundsNeeded: 3 };
      }

      // Single query with joins — replaces 61 sequential queries
      const { data, error } = await supabase
        .from('handicap_history')
        .select(`
          id, handicap, round_id, recorded_at, differential,
          adjusted_gross_score, gross_score, course_rating, slope_rating, tee_color,
          rounds!handicap_history_round_fk (
            id, date,
            golf_courses!inner ( name )
          )
        `)
        .eq('profile_id', profileId)
        .not('round_id', 'is', null)
        .not('differential', 'is', null)
        .order('recorded_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      if (!data?.length) {
        return { handicapIndex: null, entries: [], roundsUsed: 0, totalRounds: 0, minimumRoundsNeeded: 3 };
      }

      const entries: HandicapHistoryEntry[] = data
        .filter((row: any) => row.rounds && row.differential != null)
        .map((row: any) => ({
          roundId: row.round_id,
          date: row.rounds.date,
          courseName: row.rounds.golf_courses?.name || 'Desconocido',
          teeColor: row.tee_color || 'white',
          totalStrokes: row.gross_score || 0,
          adjustedGrossScore: row.adjusted_gross_score || row.gross_score || 0,
          courseRating: Number(row.course_rating) || 72,
          slopeRating: Number(row.slope_rating) || 113,
          differential: Number(row.differential),
          handicapAtTime: Number(row.handicap),
        }));

      const differentialValues = entries.map(e => e.differential);
      const handicapIndex = calculateHandicapIndexFromDifferentials(differentialValues);
      const roundsUsed = getNumDifferentialsToUse(entries.length);

      return {
        handicapIndex,
        entries,
        roundsUsed,
        totalRounds: entries.length,
        minimumRoundsNeeded: 3,
      };
    },
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    handicapIndex: query.data?.handicapIndex ?? null,
    entries: query.data?.entries ?? [],
    roundsUsed: query.data?.roundsUsed ?? 0,
    totalRounds: query.data?.totalRounds ?? 0,
    minimumRoundsNeeded: query.data?.minimumRoundsNeeded ?? 3,
    isLoading: query.isLoading,
    error: query.error,
  };
};
