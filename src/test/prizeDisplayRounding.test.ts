import { describe, it, expect } from 'vitest';
import { roundKeepingTotal, roundPayoutForDisplay } from '@/lib/prizeDisplayRounding';
import type { PayoutResult } from '@/types/leaderboard';

describe('prize display rounding to whole pesos', () => {
  it('rounds a 3-way tie of 32,500 to whole amounts that still add up to 32,500', () => {
    const out = roundKeepingTotal([10833.33, 10833.33, 10833.34]);
    expect(out.every(Number.isInteger)).toBe(true);
    expect(out.reduce((s, v) => s + v, 0)).toBe(32500);
  });

  it('keeps each pool total and makes player totals equal their rounded rows', () => {
    const res: PayoutResult = {
      pools: [{ poolId: 'stb', allocated: 32500, unallocated: 0, rows: [
        { participantId: 'sc', rank: 1, tied: true, tiedCount: 3, amount: 10833.33 },
        { participantId: 'es', rank: 1, tied: true, tiedCount: 3, amount: 10833.34 },
        { participantId: 'ag', rank: 1, tied: true, tiedCount: 3, amount: 10833.33 },
      ] }],
      awards: [{ awardId: 'o1', participantId: 'sc', amount: 2500 }],
      byParticipant: [
        { participantId: 'sc', total: 13333.33, items: [
          { kind: 'pool', refId: 'stb', label: 'Stableford', amount: 10833.33 },
          { kind: 'award', refId: 'o1', label: 'Oyes', amount: 2500 },
        ] },
        { participantId: 'es', total: 10833.34, items: [{ kind: 'pool', refId: 'stb', label: 'Stableford', amount: 10833.34 }] },
        { participantId: 'ag', total: 10833.33, items: [{ kind: 'pool', refId: 'stb', label: 'Stableford', amount: 10833.33 }] },
      ],
      totalAllocated: 35000, totalUnallocated: 0, totalPendingAwards: 0,
    };
    const shown = roundPayoutForDisplay(res);
    expect(shown.pools[0].rows.reduce((s, r) => s + r.amount, 0)).toBe(32500);
    expect(shown.byParticipant.every(p => Number.isInteger(p.total))).toBe(true);
    expect(shown.totalAllocated).toBe(35000);
    const sc = shown.byParticipant.find(p => p.participantId === 'sc')!;
    expect(sc.total).toBe(sc.items.reduce((s, i) => s + i.amount, 0));
  });
});
