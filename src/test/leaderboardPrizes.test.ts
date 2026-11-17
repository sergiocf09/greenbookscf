import { describe, it, expect } from 'vitest';
import {
  autoAssignCategoriesByHandicap,
  computePrizePayouts,
  presetTiers,
  validatePrizeConfig,
} from '@/lib/leaderboardPrizes';
import type { PrizeCandidate, PrizeConfig, PrizePool, SpecialAward } from '@/types/leaderboard';

const cand = (id: string, net: number, opts: Partial<{ gross: number; stableford: number; completed: boolean }> = {}): PrizeCandidate => ({
  participantId: id,
  completed: opts.completed ?? true,
  metrics: { gross: opts.gross ?? net, net, stableford: opts.stableford ?? 0 },
});

const pool = (p: Partial<PrizePool> & { id: string }): PrizePool => ({
  mode: 'net', categoryId: null, label: p.id, tiers: [], excludeWinnersOf: [], ...p,
});

const cfg = (p: Partial<PrizeConfig>): PrizeConfig => ({
  totalPool: null, categories: [], assignments: {}, pools: [], manualExclusions: [], ...p,
});

const amountOf = (res: ReturnType<typeof computePrizePayouts>, poolId: string, pid: string) =>
  res.pools.find(p => p.poolId === poolId)!.rows.find(r => r.participantId === pid)?.amount ?? 0;

const tiers123 = [{ place: 1, amount: 5000 }, { place: 2, amount: 3000 }, { place: 3, amount: 2000 }];

describe('computePrizePayouts', () => {
  it('(a) pays 1st to 3rd in net', () => {
    const res = computePrizePayouts({
      config: cfg({ pools: [pool({ id: 'net', tiers: tiers123 })] }),
      awards: [],
      candidates: [cand('a', 2), cand('b', -1), cand('c', 5), cand('d', 0)],
    });
    expect(amountOf(res, 'net', 'b')).toBe(5000);
    expect(amountOf(res, 'net', 'd')).toBe(3000);
    expect(amountOf(res, 'net', 'a')).toBe(2000);
    expect(amountOf(res, 'net', 'c')).toBe(0);
    expect(res.pools[0].allocated).toBe(10000);
    expect(res.pools[0].unallocated).toBe(0);
  });

  it('(b) tie for 2nd/3rd with 3000 + 2000 pays 2500 each; 4th gets nothing', () => {
    const res = computePrizePayouts({
      config: cfg({ pools: [pool({ id: 'net', tiers: tiers123 })] }),
      awards: [],
      candidates: [cand('a', -3), cand('b', 1), cand('c', 1), cand('d', 4)],
    });
    const rows = res.pools[0].rows;
    expect(amountOf(res, 'net', 'b')).toBe(2500);
    expect(amountOf(res, 'net', 'c')).toBe(2500);
    expect(rows.find(r => r.participantId === 'b')).toMatchObject({ rank: 2, tied: true, tiedCount: 2 });
    expect(rows.find(r => r.participantId === 'd')).toBeUndefined();
  });

  it('(c) three tied for 1st split 10000 as 3333.33 with leftover cent to the first by id', () => {
    const res = computePrizePayouts({
      config: cfg({ pools: [pool({ id: 'net', tiers: tiers123 })] }),
      awards: [],
      candidates: [cand('z', 0), cand('m', 0), cand('b', 0)],
    });
    expect(amountOf(res, 'net', 'b')).toBe(3333.34);
    expect(amountOf(res, 'net', 'm')).toBe(3333.33);
    expect(amountOf(res, 'net', 'z')).toBe(3333.33);
    expect(res.pools[0].allocated).toBe(10000);
    expect(res.pools[0].rows.every(r => r.rank === 1 && r.tied && r.tiedCount === 3)).toBe(true);
  });

  it('(d) players who did not complete never collect', () => {
    const res = computePrizePayouts({
      config: cfg({ pools: [pool({ id: 'net', tiers: tiers123 })] }),
      awards: [],
      candidates: [cand('a', -10, { completed: false }), cand('b', 0), cand('c', 1), cand('d', 2)],
    });
    expect(amountOf(res, 'net', 'a')).toBe(0);
    expect(amountOf(res, 'net', 'b')).toBe(5000);
    expect(res.byParticipant.some(p => p.participantId === 'a')).toBe(false);
  });

  it('(e) stableford ranks highest points first', () => {
    const res = computePrizePayouts({
      config: cfg({ pools: [pool({ id: 'stb', mode: 'stableford', tiers: tiers123 })] }),
      awards: [],
      candidates: [cand('a', 0, { stableford: 30 }), cand('b', 0, { stableford: 38 }), cand('c', 0, { stableford: 34 })],
    });
    expect(amountOf(res, 'stb', 'b')).toBe(5000);
    expect(amountOf(res, 'stb', 'c')).toBe(3000);
    expect(amountOf(res, 'stb', 'a')).toBe(2000);
  });

  it('(f) categories rank separately; uncategorized players only enter the general pool', () => {
    const config = cfg({
      categories: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }],
      assignments: { a1: 'A', a2: 'A', b1: 'B', b2: 'B' },
      pools: [
        pool({ id: 'catA', categoryId: 'A', tiers: [{ place: 1, amount: 1000 }, { place: 2, amount: 500 }] }),
        pool({ id: 'catB', categoryId: 'B', tiers: [{ place: 1, amount: 800 }] }),
        pool({ id: 'gen', tiers: [{ place: 1, amount: 2000 }] }),
      ],
    });
    const res = computePrizePayouts({
      config, awards: [],
      candidates: [cand('a1', 3), cand('a2', 1), cand('b1', 6), cand('b2', 2), cand('x', -5)],
    });
    expect(amountOf(res, 'catA', 'a2')).toBe(1000);
    expect(amountOf(res, 'catA', 'a1')).toBe(500);
    expect(amountOf(res, 'catB', 'b2')).toBe(800);
    expect(amountOf(res, 'catB', 'b1')).toBe(0);
    expect(res.pools.find(p => p.poolId === 'catA')!.rows.some(r => r.participantId === 'x')).toBe(false);
    expect(res.pools.find(p => p.poolId === 'catB')!.rows.some(r => r.participantId === 'x')).toBe(false);
    expect(amountOf(res, 'gen', 'x')).toBe(2000);
  });

  it('(g) excludeWinnersOf: gross winner cannot win net and the next player moves up', () => {
    const config = cfg({
      pools: [
        pool({ id: 'gross', mode: 'gross', tiers: [{ place: 1, amount: 3000 }] }),
        pool({ id: 'net', mode: 'net', tiers: [{ place: 1, amount: 2000 }, { place: 2, amount: 1000 }], excludeWinnersOf: ['gross'] }),
      ],
    });
    const res = computePrizePayouts({
      config, awards: [],
      candidates: [cand('a', -4, { gross: 1 }), cand('b', -2, { gross: 8 }), cand('c', 0, { gross: 10 })],
    });
    expect(amountOf(res, 'gross', 'a')).toBe(3000);
    expect(amountOf(res, 'net', 'a')).toBe(0);
    expect(res.pools[1].rows.find(r => r.participantId === 'b')).toMatchObject({ rank: 1, amount: 2000 });
    expect(amountOf(res, 'net', 'c')).toBe(1000);
  });

  it('(h) manualExclusions removes a player from that pool only', () => {
    const config = cfg({
      pools: [pool({ id: 'net', tiers: [{ place: 1, amount: 1000 }] }), pool({ id: 'gross', mode: 'gross', tiers: [{ place: 1, amount: 500 }] })],
      manualExclusions: [{ poolId: 'net', participantId: 'a' }],
    });
    const res = computePrizePayouts({ config, awards: [], candidates: [cand('a', -5), cand('b', 0)] });
    expect(amountOf(res, 'net', 'a')).toBe(0);
    expect(amountOf(res, 'net', 'b')).toBe(1000);
    expect(amountOf(res, 'gross', 'a')).toBe(500);
  });

  it('(i) fewer eligible players than prizes leaves the rest unallocated', () => {
    const res = computePrizePayouts({
      config: cfg({ pools: [pool({ id: 'net', tiers: tiers123 })] }),
      awards: [],
      candidates: [cand('a', 0), cand('b', 1)],
    });
    expect(res.pools[0].allocated).toBe(8000);
    expect(res.pools[0].unallocated).toBe(2000);
    expect(res.totalUnallocated).toBe(2000);
  });

  it('(j) awards: player winning two pools and an oyes sums and itemizes; unassigned award is pending', () => {
    const config = cfg({
      pools: [
        pool({ id: 'gross', mode: 'gross', label: 'Gross', tiers: [{ place: 1, amount: 3000 }] }),
        pool({ id: 'net', mode: 'net', label: 'Neto', tiers: [{ place: 1, amount: 2000 }] }),
      ],
    });
    const awards: SpecialAward[] = [
      { id: 'oyes7', label: 'Oyes H7', holeNumber: 7, amount: 500, winnerParticipantId: 'a' },
      { id: 'long', label: 'Drive largo', amount: 400, winnerParticipantId: null },
      { id: 'out', label: 'Oyes H12', amount: 300, winnerParticipantId: 'ghost' },
    ];
    const res = computePrizePayouts({ config, awards, candidates: [cand('a', -3, { gross: 0 }), cand('b', 1, { gross: 6 })] });
    const a = res.byParticipant.find(p => p.participantId === 'a')!;
    expect(a.total).toBe(5500);
    expect(a.items.map(i => [i.kind, i.refId, i.amount])).toEqual([
      ['pool', 'gross', 3000], ['pool', 'net', 2000], ['award', 'oyes7', 500],
    ]);
    expect(res.byParticipant[0].participantId).toBe('a');
    expect(res.byParticipant.find(p => p.participantId === 'ghost')!.total).toBe(300);
    expect(res.byParticipant.some(p => p.participantId === 'b')).toBe(false);
    expect(res.totalPendingAwards).toBe(400);
    expect(res.awards.find(x => x.awardId === 'long')).toEqual({ awardId: 'long', participantId: null, amount: 400 });
    expect(res.totalAllocated).toBe(5800);
  });
});

describe('validatePrizeConfig', () => {
  it('(k) flags every invalid case', () => {
    const config = cfg({
      totalPool: 1000,
      categories: [{ id: 'A', name: 'A' }],
      assignments: { p1: 'A', p2: 'Z' },
      pools: [
        pool({ id: 'p1', label: 'Uno', tiers: [{ place: 1, amount: 500 }, { place: 1, amount: 200 }], excludeWinnersOf: ['p2'] }),
        pool({ id: 'p2', label: 'Dos', categoryId: 'Q', tiers: [{ place: 1, amount: -50 }], excludeWinnersOf: ['nope'] }),
      ],
    });
    const errs = validatePrizeConfig(config, [{ id: 'aw', label: 'Oyes', amount: 400, winnerParticipantId: null }]);
    const has = (re: RegExp) => errs.some(e => re.test(e));
    expect(has(/"Uno".*lugar 1 repetido/)).toBe(true);
    expect(has(/"Dos".*monto negativo/)).toBe(true);
    expect(has(/"Uno".*bolsas anteriores/)).toBe(true);
    expect(has(/"Dos" excluye ganadores de una bolsa que no existe/)).toBe(true);
    expect(has(/"Dos" usa una categoría que no existe/)).toBe(true);
    expect(has(/asignado a una categoría que no existe/)).toBe(true);
    expect(has(/supera la bolsa total/)).toBe(true);
  });

  it('(k) a valid config has no errors', () => {
    const config = cfg({
      totalPool: 10000,
      categories: [{ id: 'A', name: 'A' }],
      assignments: { x: 'A' },
      pools: [pool({ id: 'g', tiers: tiers123 }), pool({ id: 'n', categoryId: 'A', tiers: [], excludeWinnersOf: ['g'] })],
    });
    expect(validatePrizeConfig(config, [])).toEqual([]);
  });
});

describe('presetTiers', () => {
  it('(l) sums exactly to the total', () => {
    const t = presetTiers(10001, [50, 30, 20]);
    expect(t).toEqual([{ place: 1, amount: 5001 }, { place: 2, amount: 3000 }, { place: 3, amount: 2000 }]);
    expect(t.reduce((s, x) => s + x.amount, 0)).toBe(10001);
    const odd = presetTiers(1000, [33.3, 33.3, 33.4]);
    expect(odd.reduce((s, x) => s + x.amount, 0)).toBe(1000);
  });
});

describe('autoAssignCategoriesByHandicap', () => {
  it('(m) inclusive ranges, unbounded ends and no match', () => {
    const cats = [
      { id: 'A', name: 'A', hcpMin: null, hcpMax: 10 },
      { id: 'B', name: 'B', hcpMin: 11, hcpMax: 20 },
      { id: 'C', name: 'C', hcpMin: 25, hcpMax: null },
    ];
    const out = autoAssignCategoriesByHandicap(
      [{ id: 'p0', handicap: 0 }, { id: 'p10', handicap: 10 }, { id: 'p11', handicap: 11 }, { id: 'p20', handicap: 20 }, { id: 'p22', handicap: 22 }, { id: 'p36', handicap: 36 }],
      cats,
    );
    expect(out).toEqual({ p0: 'A', p10: 'A', p11: 'B', p20: 'B', p36: 'C' });
  });
});
