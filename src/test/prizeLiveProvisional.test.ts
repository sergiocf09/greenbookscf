import { describe, it, expect } from 'vitest';
import { singleDayCandidates, withoutStaleWinners } from '@/lib/prizeCandidates';
import { computePrizePayouts } from '@/lib/leaderboardPrizes';
import type { StandingsEntry } from '@/hooks/useLeaderboards';
import type { PrizeConfig } from '@/types/leaderboard';

const entry = (id: string, holesPlayed: number, stb: number): StandingsEntry => ({
  participant: { id, leaderboard_id: 'lb', profile_id: null, guest_name: id, guest_initials: null, guest_color: null, handicap_for_leaderboard: 0, is_active: true },
  grossVsPar: 0, netVsPar: 0, stablefordTotal: stb, grossTotal: 0, netTotal: 0, holesPlayed, roundsPlayed: 1,
});

const config: PrizeConfig = {
  totalPool: null, categories: [], assignments: {}, manualExclusions: [],
  pools: [{ id: 'stb', mode: 'stableford', categoryId: null, label: 'Stableford', excludeWinnersOf: [],
    tiers: [{ place: 1, amount: 12000 }, { place: 2, amount: 10000 }] }],
};

// Mid-round: players on different holes, only confirmed holes counted.
const standings = [entry('a', 3, 7), entry('b', 1, 2), entry('c', 4, 9)];

describe('live provisional prizes', () => {
  it('shows the current leaders with confirmed holes before anyone finishes 18', () => {
    const live = computePrizePayouts({ config, awards: [], candidates: singleDayCandidates({ standings, expectedHoles: 18, projection: true }) });
    const rows = live.pools[0].rows;
    expect(rows.find(r => r.participantId === 'c')?.amount).toBe(12000);
    expect(rows.find(r => r.participantId === 'a')?.amount).toBe(10000);
  });

  it('pays nobody in the official (freeze) calculation until 18 holes are complete', () => {
    const official = computePrizePayouts({ config, awards: [], candidates: singleDayCandidates({ standings, expectedHoles: 18 }) });
    expect(official.pools[0].rows).toHaveLength(0);
  });

  it('treats a special-award winner who is no longer a participant as no winner', () => {
    const out = withoutStaleWinners(
      [{ id: 'o1', winnerParticipantId: 'gone' }, { id: 'o2', winnerParticipantId: 'a' }],
      ['a', 'b'],
    );
    expect(out[0].winnerParticipantId).toBeNull();
    expect(out[1].winnerParticipantId).toBe('a');
  });
});
