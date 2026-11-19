import { describe, it, expect } from 'vitest';
import { leaderboardStablefordRows } from '@/components/bets/StablefordHoleDetail';

describe('leaderboardStablefordRows', () => {
  it('splits per-hole points into front 9 and back 9 totals and skips players without holes', () => {
    const rows = leaderboardStablefordRows([
      { participant: { id: 'a', initials: 'CA' }, holesPlayed: 3, stablefordHoles: [
        { holeNumber: 1, points: 2, strokesReceived: 1 },
        { holeNumber: 9, points: 3, strokesReceived: 0 },
        { holeNumber: 18, points: -1, strokesReceived: 1 },
      ] },
      { participant: { id: 'b' }, holesPlayed: 0, stablefordHoles: [] },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].pointsFront).toBe(5);
    expect(rows[0].pointsBack).toBe(-1);
  });
});
