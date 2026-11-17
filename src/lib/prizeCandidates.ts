/**
 * Pure adapters that turn leaderboard standings into PrizeCandidate[] for
 * computePrizePayouts. They never re-rank or recompute standings; they only
 * read the same values the leaderboard screens already display.
 */
import type { StandingsEntry } from '@/hooks/useLeaderboards';
import type { AccumulatedStanding, DayStanding } from '@/lib/leaderboardAggregation';
import type { MultiDayDay, PrizeCandidate } from '@/types/leaderboard';

export function singleDayCandidates(params: {
  standings: StandingsEntry[];
  expectedHoles: number;
  projection?: boolean;
}): PrizeCandidate[] {
  const { standings, expectedHoles, projection = false } = params;
  return (standings || []).map(entry => {
    const holes = Number(entry.holesPlayed) || 0;
    return {
      participantId: entry.participant.id,
      completed: projection ? holes > 0 : holes > 0 && holes >= expectedHoles,
      metrics: {
        gross: entry.grossVsPar,
        net: entry.netVsPar,
        stableford: entry.stablefordTotal,
      },
    };
  });
}

export function multiDayCandidates(params: {
  participants: { id: string }[];
  standingsByDay: Record<number, DayStanding[]>;
  rules: { days: MultiDayDay[]; aggregation: 'sum' | 'best_n'; best_n?: number };
  expectedHolesByDay: Record<number, number>;
  accumulated: AccumulatedStanding[];
  projection?: boolean;
}): PrizeCandidate[] {
  const { participants, standingsByDay, rules, expectedHolesByDay, accumulated, projection = false } = params;
  const accById = new Map(accumulated.map(a => [a.participantId, a]));
  const days = rules.days || [];
  const holesFor = (dayNumber: number, participantId: string): number => {
    const e = (standingsByDay[dayNumber] || []).find(s => s.participantId === participantId);
    return Number(e?.holesPlayed) || 0;
  };
  const bestN = rules.aggregation === 'best_n';

  return (participants || []).map(p => {
    const acc = accById.get(p.id);
    if (!acc) {
      return { participantId: p.id, completed: false, metrics: { gross: 0, net: 0, stableford: 0 } };
    }
    let completed: boolean;
    if (projection) {
      completed = days.some(d => holesFor(d.day_number, p.id) > 0);
    } else {
      completed = days.length > 0 && days.every(d => {
        const expected = expectedHolesByDay[d.day_number];
        if (!expected) return false; // day without a linked round → incomplete
        return holesFor(d.day_number, p.id) >= expected;
      });
    }
    return {
      participantId: p.id,
      completed,
      metrics: bestN
        ? { gross: acc.bestNGross ?? 0, net: acc.bestNNetVsPar ?? 0, stableford: acc.bestNStableford ?? 0 }
        : { gross: acc.totalGrossVsPar, net: acc.totalNetVsPar, stableford: acc.totalStableford },
    };
  });
}
