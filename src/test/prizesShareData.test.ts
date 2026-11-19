import { describe, it, expect } from 'vitest';
import { buildPrizesSharePayouts, buildShareAwardBlocks, poolShareTitle, sharePayoutsFromSnapshot } from '@/lib/prizesShareData';
import type { FinalPayoutsSnapshot } from '@/types/leaderboard';

const snap = {
  frozenAt: '2026-11-17T23:00:00Z',
  participants: { a: { name: 'Ana Frozen', initials: 'AF', color: '#111' } },
  byParticipant: [{ participantId: 'a', total: 5000, items: [{ kind: 'pool', refId: 'p1', label: 'Neto', place: 1, amount: 5000 }] }],
  pools: [{ poolId: 'p1', id: 'p1', label: 'Neto', mode: 'net', allocated: 5000, unallocated: 0, rows: [
    { participantId: 'a', rank: 1, tied: false, tiedCount: 1, amount: 5000 },
    { participantId: 'b', rank: 4, tied: false, tiedCount: 1, amount: 100 },
  ] }],
  awards: [{ awardId: 'o1', id: 'o1', label: 'Oyes · Hoyo 3', amount: 500, participantId: null }],
  totalAllocated: 5000, totalUnallocated: 0, totalPendingAwards: 500,
} as unknown as FinalPayoutsSnapshot;

describe('prizes share data', () => {
  it('final share uses only snapshot names, fallback for unknown players', () => {
    const out = sharePayoutsFromSnapshot(snap, 'Jugador');
    expect(out.byParticipant[0]).toMatchObject({ name: 'Ana Frozen', initials: 'AF', total: 5000 });
    expect(out.awards).toEqual([{ label: 'Oyes · Hoyo 3', winnerName: null, amount: 500, id: 'o1', groupId: null, place: null }]);
  });

  it('pool block lists only places 1–3', () => {
    const out = sharePayoutsFromSnapshot(snap, 'Jugador');
    expect(out.pools[0].rows.map(r => r.rank)).toEqual([1]);
  });

  it('live share maps award winners through the name resolver', () => {
    const out = buildPrizesSharePayouts({
      result: { byParticipant: [], pools: [], awards: [{ awardId: 'o1', participantId: 'x', amount: 500 }] },
      pools: [],
      awards: [{ id: 'o1', label: 'Oyes · Hoyo 3', amount: 500 }],
      nameOf: () => ({ name: 'Live Name', initials: 'LN', color: '#222' }),
    });
    expect(out.awards[0].winnerName).toBe('Live Name');
  });
});


describe('buildShareAwardBlocks', () => {
  it('shows the Oyes heading once and one card per hole with places 1º, 2º, 3º in order', () => {
    const blocks = buildShareAwardBlocks([
      { id: 'h5', label: 'Oyes · Hoyo 5', winnerName: 'Cynthia', amount: 2000 },
      { id: 'h5-p3', label: 'Oyes · Hoyo 5 · 3º', winnerName: 'Sergio F', amount: 500, groupId: 'h5', place: 3 },
      { id: 'h5-p2', label: 'Oyes · Hoyo 5 · 2º', winnerName: 'Sergio D', amount: 1000, groupId: 'h5', place: 2 },
      { id: 'h7', label: 'Oyes · Hoyo 7', winnerName: 'Sergio D', amount: 2000 },
    ], 'Premios especiales');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].heading).toBe('Oyes');
    expect(blocks[0].cards.map(c => c.title)).toEqual(['Hoyo 5', 'Hoyo 7']);
    expect(blocks[0].cards[0].rows.map(r => [r.place, r.winnerName, r.amount])).toEqual([
      [1, 'Cynthia', 2000], [2, 'Sergio D', 1000], [3, 'Sergio F', 500],
    ]);
  });

  it('groups frozen snapshot extras by the -p<n> id and gathers unprefixed awards under one block', () => {
    const blocks = buildShareAwardBlocks([
      { id: 'd1', label: 'Drive largo', winnerName: 'Ana', amount: 300 },
      { id: 'd1-p2', label: 'Drive largo · 2º', winnerName: 'Luis', amount: 100 },
      { id: 'c1', label: 'Más cerca', winnerName: null, amount: 200 },
    ], 'Premios especiales');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].heading).toBe('Premios especiales');
    expect(blocks[0].cards.map(c => [c.title, c.rows.length])).toEqual([['Drive largo', 2], ['Más cerca', 1]]);
  });
});

describe('poolShareTitle', () => {
  it('does not repeat a category the pool label already carries', () => {
    expect(poolShareTitle('Stableford · Cat. A', 'Cat. A', 'A')).toBe('Stableford · Cat. A');
    expect(poolShareTitle('Gross · Cat. B', 'Cat. B', 'B')).toBe('Gross · Cat. B');
  });

  it('appends the category when the label omits it', () => {
    expect(poolShareTitle('Gross', 'Cat. B', 'B')).toBe('Gross · Cat. B');
    expect(poolShareTitle('Bolsa', 'Cat. A', 'A')).toBe('Bolsa · Cat. A');
  });

  it('treats a bare category word in the label as already shown', () => {
    expect(poolShareTitle('Stableford · A', 'Cat. A', 'A')).toBe('Stableford · A');
  });

  it('keeps the label untouched without a category', () => {
    expect(poolShareTitle('Neto', null, null)).toBe('Neto');
    expect(poolShareTitle('Neto', '', '')).toBe('Neto');
    expect(poolShareTitle('', 'Cat. A', 'A')).toBe('Cat. A');
  });
});
