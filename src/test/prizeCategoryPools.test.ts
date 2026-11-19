import { describe, it, expect } from 'vitest';
import { splitPoolByCategories } from '@/lib/prizeCategoryPools';
import { computePrizePayouts } from '@/lib/leaderboardPrizes';
import type { PrizeConfig } from '@/types/leaderboard';

const base: PrizeConfig = {
  totalPool: null,
  categories: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }],
  assignments: { p1: 'A', p2: 'A', p3: 'B' },
  pools: [{ id: 'st', mode: 'stableford', categoryId: null, label: 'Stableford', excludeWinnersOf: [],
    tiers: [{ place: 1, amount: 6000 }, { place: 2, amount: 3600 }, { place: 3, amount: 2400 }] }],
  manualExclusions: [],
};
const run = (mode: 'copy' | 'split' | 'empty') => splitPoolByCategories({
  config: base, poolId: 'st', mode,
  labelFor: (p, c) => `${p.label} · Cat. ${c.name}`, newId: c => `st-${c.id}`,
});

describe('split pool by category', () => {
  it('same amounts: each category gets 6000/3600/2400', () => {
    const out = run('copy');
    expect(out.pools.map(p => [p.categoryId, p.tiers.map(t => t.amount)])).toEqual([
      ['A', [6000, 3600, 2400]], ['B', [6000, 3600, 2400]],
    ]);
  });

  it('divided amounts keep the original total exactly', () => {
    const out = run('split');
    expect(out.pools.map(p => p.tiers.map(t => t.amount))).toEqual([[3000, 1800, 1200], [3000, 1800, 1200]]);
  });

  it('category pools only pay players of that category', () => {
    const cfg = run('copy');
    const res = computePrizePayouts({ config: cfg, awards: [], candidates: [
      { participantId: 'p1', completed: true, metrics: { gross: 0, net: 0, stableford: 26 } },
      { participantId: 'p2', completed: true, metrics: { gross: 0, net: 0, stableford: 30 } },
      { participantId: 'p3', completed: true, metrics: { gross: 0, net: 0, stableford: 20 } },
    ] });
    expect(res.pools[0].rows.map(r => [r.participantId, r.rank])).toEqual([['p2', 1], ['p1', 2]]);
    expect(res.pools[1].rows.map(r => [r.participantId, r.rank])).toEqual([['p3', 1]]);
  });
});
