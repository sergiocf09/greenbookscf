import type { MultiDayRulesJson } from '@/types/leaderboard';

export interface DayStanding {
  participantId: string;
  profile_id: string | null;
  grossTotal: number;
  netTotal: number;
  grossVsPar: number;
  netVsPar: number;
  stablefordTotal: number;
  holesPlayed: number;
  position: number;
}

export interface AccumulatedStanding {
  participantId: string;
  profile_id: string | null;
  daysPlayed: number;
  totalGross: number;
  totalNetVsPar: number;
  totalGrossVsPar: number;
  totalStableford: number;
  bestNNetVsPar?: number;
  bestNGross?: number;
  bestNStableford?: number;
  dayNetScores: number[];
  dayGrossScores: number[];
  dayStablefordScores: number[];
  position: number;
}

export function computeAccumulatedStandings(
  standingsByDay: Record<number, DayStanding[]>,
  aggregation: 'sum' | 'best_n',
  bestN?: number,
  sortMode: 'gross' | 'net' | 'stableford' = 'net',
): AccumulatedStanding[] {
  const accMap: Record<string, AccumulatedStanding> = {};

  for (const dayNum of Object.keys(standingsByDay)) {
    for (const s of standingsByDay[Number(dayNum)]) {
      if (s.holesPlayed === 0) continue;
      if (!accMap[s.participantId]) {
        accMap[s.participantId] = {
          participantId: s.participantId,
          profile_id: s.profile_id,
          daysPlayed: 0,
          totalGross: 0,
          totalNetVsPar: 0,
          totalGrossVsPar: 0,
          totalStableford: 0,
          dayNetScores: [],
          dayGrossScores: [],
          dayStablefordScores: [],
          position: 0,
        };
      }
      const e = accMap[s.participantId];
      e.daysPlayed += 1;
      e.totalGross += s.grossTotal;
      e.totalNetVsPar += s.netVsPar;
      e.totalGrossVsPar += s.grossVsPar;
      e.totalStableford += s.stablefordTotal;
      e.dayNetScores.push(s.netVsPar);
      e.dayGrossScores.push(s.grossVsPar);
      e.dayStablefordScores.push(s.stablefordTotal);
    }
  }

  const results = Object.values(accMap).map(e => {
    if (aggregation === 'best_n' && bestN) {
      const ascNet = [...e.dayNetScores].sort((a, b) => a - b).slice(0, bestN);
      const ascGross = [...e.dayGrossScores].sort((a, b) => a - b).slice(0, bestN);
      const descStb = [...e.dayStablefordScores].sort((a, b) => b - a).slice(0, bestN);
      e.bestNNetVsPar = ascNet.reduce((s, v) => s + v, 0);
      e.bestNGross = ascGross.reduce((s, v) => s + v, 0);
      e.bestNStableford = descStb.reduce((s, v) => s + v, 0);
    }
    return e;
  });

  results.sort((a, b) => {
    if (sortMode === 'stableford') {
      const av = aggregation === 'best_n' ? (a.bestNStableford ?? 0) : a.totalStableford;
      const bv = aggregation === 'best_n' ? (b.bestNStableford ?? 0) : b.totalStableford;
      return bv - av;
    }
    if (sortMode === 'gross') {
      const av = aggregation === 'best_n' ? (a.bestNGross ?? 0) : a.totalGrossVsPar;
      const bv = aggregation === 'best_n' ? (b.bestNGross ?? 0) : b.totalGrossVsPar;
      return av - bv;
    }
    const av = aggregation === 'best_n' ? (a.bestNNetVsPar ?? 0) : a.totalNetVsPar;
    const bv = aggregation === 'best_n' ? (b.bestNNetVsPar ?? 0) : b.totalNetVsPar;
    return av - bv;
  });

  return results.map((r, i) => ({ ...r, position: i + 1 }));
}

export function getDayForRoundDate(
  rules: MultiDayRulesJson,
  roundDate: string | null | undefined,
): number | null {
  if (!roundDate) return null;
  const d = rules.days?.find(d => d.date === roundDate);
  return d ? d.day_number : null;
}
