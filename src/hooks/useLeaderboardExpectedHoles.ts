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

const holesOf = (betConfig: unknown): number =>
  Number((betConfig as { roundHoles?: unknown } | null)?.roundHoles) === 9 ? 9 : 18;

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
        const { data: linked, error: linkedErr } = await supabase
          .from('leaderboard_rounds')
          .select('round_id')
          .eq('leaderboard_id', leaderboardId!);
        if (linkedErr) return assumeAll();
        const roundIds = (linked || []).map(l => l.round_id);
        if (roundIds.length === 0) {
          return { expectedHoles: 18, expectedHolesByDay: {}, daysWithoutRound: isMultiDay ? allDays : [], unreliable: false };
        }
        const { data: rounds, error: roundsErr } = await supabase
          .from('rounds')
          .select('id, date, bet_config')
          .in('id', roundIds);
        if (roundsErr || !rounds || rounds.length === 0) return assumeAll();
        const unreliable = rounds.length < roundIds.length;

        if (!isMultiDay) {
          let max = Math.max(...rounds.map(r => holesOf(r.bet_config)));
          if (unreliable) max = 18;
          return { expectedHoles: max, expectedHolesByDay: {}, daysWithoutRound: [], unreliable };
        }

        const dayByDate: Record<string, number> = {};
        for (const d of days || []) dayByDate[d.date] = d.day_number;
        const byDay: Record<number, number> = {};
        for (const r of rounds) {
          const dn = dayByDate[r.date];
          if (!dn) continue;
          byDay[dn] = Math.max(byDay[dn] ?? 0, holesOf(r.bet_config));
        }
        let daysWithoutRound = allDays.filter(d => byDay[d] == null);
        if (unreliable) {
          // Unreadable rounds could belong to any day: assume 18 instead of flagging them.
          for (const d of daysWithoutRound) byDay[d] = 18;
          daysWithoutRound = [];
        }
        return { expectedHoles: 18, expectedHolesByDay: byDay, daysWithoutRound, unreliable };
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
