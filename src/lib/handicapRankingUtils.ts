import type { HandicapRankingEntry } from '@/hooks/useHandicapRanking';

export type HandicapRankingSortKey = 'handicap' | 'average' | 'best';
export type HandicapRankingSortDirection = 'asc' | 'desc';

const getSortValue = (entry: HandicapRankingEntry, sortKey: HandicapRankingSortKey) => {
  if (sortKey === 'handicap') return entry.current_handicap;
  if (sortKey === 'average') return entry.avg_gross_score ?? Number.POSITIVE_INFINITY;
  return entry.best_gross_score ?? Number.POSITIVE_INFINITY;
};

export const withLiveHandicapOverride = (
  entries: HandicapRankingEntry[],
  currentProfileId: string | null,
  liveHandicap: number | null
) => {
  if (!currentProfileId || liveHandicap === null) return entries;

  return entries.map((entry) => (
    entry.profile_id === currentProfileId
      ? { ...entry, current_handicap: liveHandicap }
      : entry
  ));
};

export const sortHandicapRankingEntries = (
  entries: HandicapRankingEntry[],
  sortKey: HandicapRankingSortKey,
  direction: HandicapRankingSortDirection = 'asc'
) => [...entries]
  .sort((a, b) => {
    const diff = getSortValue(a, sortKey) - getSortValue(b, sortKey);
    const dirMul = direction === 'asc' ? 1 : -1;
    if (diff !== 0) return diff * dirMul;

    if (a.current_handicap !== b.current_handicap) {
      return (a.current_handicap - b.current_handicap) * dirMul;
    }

    return a.display_name.localeCompare(b.display_name, 'es', { sensitivity: 'base' });
  })
  .map((entry, index) => ({ ...entry, rank: index + 1 }));