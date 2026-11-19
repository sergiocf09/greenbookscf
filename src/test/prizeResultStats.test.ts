import { describe, it, expect } from 'vitest';
import { multiDayResultStats, singleDayResultStats, summarizePrizeItems } from '@/lib/prizeResultStats';
import { sharePayoutsFromSnapshot } from '@/lib/prizesShareData';
import type { StandingsEntry } from '@/hooks/useLeaderboards';
import type { AccumulatedStanding } from '@/lib/leaderboardAggregation';
import type { FinalPayoutsSnapshot } from '@/types/leaderboard';

describe('player prize summary', () => {
  it('counts Oyes awards regardless of place and shows the pool place', () => {
    const chips = summarizePrizeItems([
      { kind: 'award', label: 'Oyes · Hoyo 5' },
      { kind: 'pool', label: 'Stableford', place: 1 },
      { kind: 'award', label: 'Oyes · Hoyo 7 · 2º' },
      { kind: 'award', label: 'Oyes · Hoyo 12 · 3º' },
    ]);
    expect(chips).toEqual([
      { kind: 'pool', key: 'p-1', label: 'Stableford', place: 1, tied: false },
      { kind: 'award', key: 'a-Oyes', label: 'Oyes', count: 3 },
    ]);
  });
});

describe('pool result stats', () => {
  it('single day shows leaderboard HCP, gross and net strokes and Stableford points', () => {
    const stats = singleDayResultStats([{
      participant: { id: 'p1', handicap_for_leaderboard: 12 },
      grossTotal: 86, netTotal: 74, stablefordTotal: 38, holesPlayed: 18,
    } as unknown as StandingsEntry]);
    expect(stats.p1).toEqual({ hcp: 12, results: { gross: '86', net: '74', stableford: '38' } });
  });

  it('multi day shows accumulated values vs par and points', () => {
    const stats = multiDayResultStats({
      participants: [{ id: 'p1', handicap_for_leaderboard: 9 }],
      accumulated: [{ participantId: 'p1', daysPlayed: 2, totalGrossVsPar: 20, totalNetVsPar: 2, totalStableford: 70 } as AccumulatedStanding],
      aggregation: 'sum',
    });
    expect(stats.p1).toEqual({ hcp: 9, results: { gross: '+20', net: '+2', stableford: '70' } });
  });

  it('final share image reads HCP and result only from the frozen snapshot', () => {
    const snap = {
      frozenAt: '2026-11-19T00:00:00Z',
      participants: { a: { name: 'Ana', initials: 'A', color: '#111', hcp: 14, results: { stableford: '40', net: '70' } } },
      byParticipant: [],
      pools: [{ poolId: 's', id: 's', label: 'Stableford', mode: 'stableford', categoryName: 'A', allocated: 100, unallocated: 0,
        rows: [{ participantId: 'a', rank: 1, tied: false, tiedCount: 1, amount: 100 }] }],
      awards: [], totalAllocated: 100, totalUnallocated: 0, totalPendingAwards: 0,
    } as unknown as FinalPayoutsSnapshot;
    const out = sharePayoutsFromSnapshot(snap, 'Jugador');
    expect(out.pools[0]).toMatchObject({ categoryName: 'A', rows: [{ hcp: 14, result: '40' }] });
  });
});
