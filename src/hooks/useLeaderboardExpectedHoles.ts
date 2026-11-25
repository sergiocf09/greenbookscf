import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MultiDayDay } from '@/types/leaderboard';

export interface ExpectedHolesInfo {
  expectedHoles: number;
  expectedHolesByDay: Record<number, number>;
  daysWithoutRound: number[];
  /** true when linked rounds could not be read (e.g. organizer not in the round); 18 is assumed. */
  unreliable: boolean;
}

/**
 * Expected holes per linked round (bet_config.roundHoles === 9 ? 9 : 18).
 * Multi-day maps rounds to days by exact date (same as dayByDate).
 */
export function useLeaderboardExpectedHoles(
  leaderboardId: string | null,
  isMultiDay: boolean,
  days?: MultiDayDay[] | null,
) {
  const dayKey = (days || []).map(d => `${d.day_number}:${d.date}`).join('|');
  const query = useQuery({
    queryKey: ['leaderboard_expected_holes', leaderboardId, isMultiDay, dayKey],
    enabled: !!leaderboardId,
    staleTime: 30_000,
    queryFn: async (): Promise<ExpectedHolesInfo> => {
      const allDays = (days || []).map(d => d.day_number);
      const assumeAll = (): ExpectedHolesInfo => ({
        expectedHoles: 18,
        expectedHolesByDay: isMultiDay ? Object.fromEntries(allDays.map(d => [d, 18])) : {},
        daysWithoutRound: [],
        unreliable: true,
      });
      try {
        const { data: rounds, error: roundsErr } = await supabase.rpc(
          'get_leaderboard_linked_rounds_meta',
          { p_leaderboard_id: leaderboardId! },
        );
        if (roundsErr) return assumeAll();
        if (!rounds || rounds.length === 0) {
          return { expectedHoles: 18, expectedHolesByDay: {}, daysWithoutRound: isMultiDay ? allDays : [], unreliable: false };
        }
        const holesOf = (n: number | null | undefined) => (Number(n) === 9 ? 9 : 18);

        if (!isMultiDay) {
          const max = Math.max(...rounds.map(r => holesOf(r.expected_holes)));
          return { expectedHoles: max, expectedHolesByDay: {}, daysWithoutRound: [], unreliable: false };
        }

        const dayByDate: Record<string, number> = {};
        for (const d of days || []) dayByDate[d.date] = d.day_number;
        const byDay: Record<number, number> = {};
        for (const r of rounds) {
          const dn = dayByDate[r.round_date];
          if (!dn) continue;
          byDay[dn] = Math.max(byDay[dn] ?? 0, holesOf(r.expected_holes));
        }
        const daysWithoutRound = allDays.filter(d => byDay[d] == null);
        return { expectedHoles: 18, expectedHolesByDay: byDay, daysWithoutRound, unreliable: false };
      } catch {
        return assumeAll();
      }
    },
  });

  return {
    expectedHoles: query.data?.expectedHoles ?? 18,
    expectedHolesByDay: query.data?.expectedHolesByDay ?? {},
    daysWithoutRound: query.data?.daysWithoutRound ?? [],
    unreliable: query.data?.unreliable ?? false,
    loading: query.isLoading,
  };
}
