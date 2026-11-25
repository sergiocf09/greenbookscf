import type { LeagueRulesJson } from '@/components/leaderboards/CreateLeagueDialog';

export interface ParticipantJornadaItem {
  date: string;
  pointsEarned: number | null;
  scoreValue: number;
}

export interface CountedRoundsSummary {
  countedDates: Set<string>;
  countedCount: number;
  totalCount: number;
  isBestN: boolean;
  bestN: number | null;
}

type CountedRules = Pick<LeagueRulesJson, 'scoring_system' | 'score_basis' | 'aggregation' | 'best_n'>;

/**
 * Determines which jornada dates count toward a participant's standings total,
 * mirroring the ordering in `get_league_accumulated_standings`.
 */
export function computeCountedJornadaDates(
  items: ParticipantJornadaItem[],
  rules: CountedRules,
): CountedRoundsSummary {
  const bestN = rules.aggregation === 'best_n' && typeof rules.best_n === 'number' && rules.best_n > 0
    ? Math.floor(rules.best_n)
    : null;

  if (bestN === null) {
    return {
      countedDates: new Set(items.map((i) => i.date)),
      countedCount: items.length,
      totalCount: items.length,
      isBestN: false,
      bestN: null,
    };
  }

  const higherScoreIsBetter = rules.scoring_system === 'stableford' || rules.score_basis === 'stableford';

  const sorted = [...items].sort((a, b) => {
    if (rules.scoring_system === 'points') {
      const pa = a.pointsEarned ?? Number.NEGATIVE_INFINITY;
      const pb = b.pointsEarned ?? Number.NEGATIVE_INFINITY;
      if (pb !== pa) return pb - pa;
    }
    if (a.scoreValue !== b.scoreValue) {
      return higherScoreIsBetter ? b.scoreValue - a.scoreValue : a.scoreValue - b.scoreValue;
    }
    return b.date.localeCompare(a.date);
  });

  const kept = sorted.slice(0, Math.min(bestN, sorted.length));
  return {
    countedDates: new Set(kept.map((i) => i.date)),
    countedCount: kept.length,
    totalCount: items.length,
    isBestN: true,
    bestN,
  };
}