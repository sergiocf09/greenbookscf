import { describe, it, expect } from 'vitest';
import { resolveLeaderboardStablefordPoints, stablefordPointsForDiff, computeRoundModeTotals } from '@/lib/leaderboardAggregation';

describe('leaderboard stableford points', () => {
  it('keeps historic defaults when no table is configured', () => {
    const pts = resolveLeaderboardStablefordPoints({});
    expect(stablefordPointsForDiff(0, pts)).toBe(2);
    expect(stablefordPointsForDiff(-1, pts)).toBe(3);
    expect(stablefordPointsForDiff(2, pts)).toBe(0);
  });
  it('uses the custom table from rules_json', () => {
    const pts = resolveLeaderboardStablefordPoints({ stableford_points: { par: 3, birdie: 5, bogey: 2, doubleBogey: -1 } });
    expect(stablefordPointsForDiff(0, pts)).toBe(3);
    expect(stablefordPointsForDiff(-1, pts)).toBe(5);
    expect(stablefordPointsForDiff(1, pts)).toBe(2);
    expect(stablefordPointsForDiff(2, pts)).toBe(-1);
  });
  it('applies the custom table in round totals', () => {
    const holes = [{ hole_number: 1, par: 4, stroke_index: 1 }, { hole_number: 2, par: 4, stroke_index: 2 }] as any;
    const pts = resolveLeaderboardStablefordPoints({ stableford_points: { par: 3, bogey: 2 } });
    const t = computeRoundModeTotals([{ hole_number: 1, strokes: 4 }, { hole_number: 2, strokes: 5 }], holes, 0, pts);
    expect(t.stablefordTotal).toBe(5);
  });
});
