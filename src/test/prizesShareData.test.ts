import { describe, it, expect } from 'vitest';
import { buildPrizesSharePayouts, sharePayoutsFromSnapshot } from '@/lib/prizesShareData';
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
    expect(out.awards).toEqual([{ label: 'Oyes · Hoyo 3', winnerName: null, amount: 500 }]);
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
