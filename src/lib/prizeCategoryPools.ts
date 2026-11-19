/**
 * Pure helper: turns one "all players" prize pool into one pool per category.
 * No React, no Supabase. Amounts are handled in integer cents so a split is exact.
 */
import type { PrizeCategory, PrizeConfig, PrizePool } from '@/types/leaderboard';

/** copy = same amounts in every category; split = current amounts divided; empty = amounts at 0. */
export type CategorySplitMode = 'copy' | 'split' | 'empty';

const toCents = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

export function splitPoolByCategories(params: {
  config: PrizeConfig;
  poolId: string;
  mode: CategorySplitMode;
  /** Label for the new pool of a category (the dialog keeps its default-label rule). */
  labelFor: (pool: PrizePool, category: PrizeCategory) => string;
  newId: (category: PrizeCategory, index: number) => string;
}): PrizeConfig {
  const { config, poolId, mode, labelFor, newId } = params;
  const idx = config.pools.findIndex(p => p.id === poolId);
  const pool = config.pools[idx];
  const cats = config.categories;
  if (idx < 0 || !pool || pool.categoryId != null || cats.length === 0) return config;

  const n = cats.length;
  const created: PrizePool[] = cats.map((cat, ci) => ({
    ...pool,
    id: newId(cat, ci),
    categoryId: cat.id,
    label: labelFor(pool, cat),
    excludeWinnersOf: [...pool.excludeWinnersOf],
    tiers: pool.tiers.map(t => {
      if (mode === 'empty') return { ...t, amount: 0 };
      if (mode === 'copy') return { ...t };
      const c = toCents(t.amount);
      const base = Math.floor(c / n);
      // The first category absorbs the leftover cents so the total stays exact.
      return { ...t, amount: (base + (ci === 0 ? c - base * n : 0)) / 100 };
    }),
  }));
  const newIds = created.map(p => p.id);

  const pools = [
    ...config.pools.slice(0, idx),
    ...created,
    ...config.pools.slice(idx + 1).map(p => (p.excludeWinnersOf.includes(poolId)
      ? { ...p, excludeWinnersOf: [...p.excludeWinnersOf.filter(x => x !== poolId), ...newIds] }
      : p)),
  ];
  const manualExclusions = config.manualExclusions.flatMap(e =>
    e.poolId === poolId ? newIds.map(id => ({ ...e, poolId: id })) : [e]);
  return { ...config, pools, manualExclusions };
}
