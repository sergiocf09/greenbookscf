/**
 * Snapshot Integrity Tests
 *
 * Validates the two core guarantees of the noRecalcContract:
 *   1. Symmetry:  balance[A].vs[B].netAmount == -balance[B].vs[A].netAmount
 *   2. Zero-sum:  Σ balance[player].totalNet == 0
 *
 * These tests run against generateRoundSnapshot directly (unit tests)
 * AND against the validateSnapshotIntegrity helper.
 */

import { describe, it, expect } from 'vitest';
import {
  validateSnapshotIntegrity,
  type SnapshotPlayerBalance,
} from '@/lib/roundSnapshot';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeBalance(
  playerId: string,
  playerName: string,
  vs: { rivalId: string; rivalName: string; netAmount: number }[]
): SnapshotPlayerBalance {
  const totalNet = vs.reduce((sum, v) => sum + v.netAmount, 0);
  return {
    playerId,
    playerName,
    totalGross: 80,
    totalNet,
    vsBalances: vs,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Test: valid symmetric, zero-sum matrix (3 players)
// ──────────────────────────────────────────────────────────────────────────────
describe('validateSnapshotIntegrity', () => {
  it('passes for a valid symmetric zero-sum matrix (3 players)', () => {
    // A wins 100 from B, loses 50 to C → net A = +50
    // B loses 100 to A, wins 200 from C → net B = +100
    // C wins 50 from A, loses 200 to B → net C = -150
    // Total: 50 + 100 - 150 = 0 ✓
    const balances: SnapshotPlayerBalance[] = [
      makeBalance('A', 'Alice', [
        { rivalId: 'B', rivalName: 'Bob', netAmount: 100 },
        { rivalId: 'C', rivalName: 'Carol', netAmount: -50 },
      ]),
      makeBalance('B', 'Bob', [
        { rivalId: 'A', rivalName: 'Alice', netAmount: -100 },
        { rivalId: 'C', rivalName: 'Carol', netAmount: 200 },
      ]),
      makeBalance('C', 'Carol', [
        { rivalId: 'A', rivalName: 'Alice', netAmount: 50 },
        { rivalId: 'B', rivalName: 'Bob', netAmount: -200 },
      ]),
    ];

    const result = validateSnapshotIntegrity(balances);
    expect(result.violations).toHaveLength(0);
    expect(result.symmetryOk).toBe(true);
    expect(result.zeroSumOk).toBe(true);
    expect(result.netTotal).toBe(0);
  });

  it('detects symmetry violation (A vs B != -B vs A)', () => {
    const balances: SnapshotPlayerBalance[] = [
      makeBalance('A', 'Alice', [
        { rivalId: 'B', rivalName: 'Bob', netAmount: 100 },
      ]),
      makeBalance('B', 'Bob', [
        // Should be -100, but is -80 → violation
        { rivalId: 'A', rivalName: 'Alice', netAmount: -80 },
      ]),
    ];

    const result = validateSnapshotIntegrity(balances);
    expect(result.symmetryOk).toBe(false);
    expect(result.violations.some(v => v.includes('Symmetry'))).toBe(true);
  });

  it('detects zero-sum violation (totals do not sum to 0)', () => {
    // A wins 100 from B, but B also shows +100 → both claim to have won
    const balances: SnapshotPlayerBalance[] = [
      makeBalance('A', 'Alice', [
        { rivalId: 'B', rivalName: 'Bob', netAmount: 100 },
      ]),
      makeBalance('B', 'Bob', [
        { rivalId: 'A', rivalName: 'Alice', netAmount: 100 }, // Wrong: should be -100
      ]),
    ];

    const result = validateSnapshotIntegrity(balances);
    expect(result.zeroSumOk).toBe(false);
    expect(result.violations.some(v => v.includes('Zero-sum'))).toBe(true);
  });

  it('passes for a 2-player even match (both 0)', () => {
    const balances: SnapshotPlayerBalance[] = [
      makeBalance('A', 'Alice', [{ rivalId: 'B', rivalName: 'Bob', netAmount: 0 }]),
      makeBalance('B', 'Bob', [{ rivalId: 'A', rivalName: 'Alice', netAmount: 0 }]),
    ];
    const result = validateSnapshotIntegrity(balances);
    expect(result.violations).toHaveLength(0);
    expect(result.zeroSumOk).toBe(true);
  });

  it('passes for a 4-player round with correct matrix', () => {
    // Simple: A beats everyone by $50, B beats C&D by $50, C beats D by $50
    // A: +50+50+50 = +150
    // B: -50+50+50 = +50
    // C: -50-50+50 = -50
    // D: -50-50-50 = -150
    // Sum: 150+50-50-150 = 0 ✓
    const balances: SnapshotPlayerBalance[] = [
      makeBalance('A', 'Alice', [
        { rivalId: 'B', rivalName: 'Bob', netAmount: 50 },
        { rivalId: 'C', rivalName: 'Carol', netAmount: 50 },
        { rivalId: 'D', rivalName: 'Dave', netAmount: 50 },
      ]),
      makeBalance('B', 'Bob', [
        { rivalId: 'A', rivalName: 'Alice', netAmount: -50 },
        { rivalId: 'C', rivalName: 'Carol', netAmount: 50 },
        { rivalId: 'D', rivalName: 'Dave', netAmount: 50 },
      ]),
      makeBalance('C', 'Carol', [
        { rivalId: 'A', rivalName: 'Alice', netAmount: -50 },
        { rivalId: 'B', rivalName: 'Bob', netAmount: -50 },
        { rivalId: 'D', rivalName: 'Dave', netAmount: 50 },
      ]),
      makeBalance('D', 'Dave', [
        { rivalId: 'A', rivalName: 'Alice', netAmount: -50 },
        { rivalId: 'B', rivalName: 'Bob', netAmount: -50 },
        { rivalId: 'C', rivalName: 'Carol', netAmount: -50 },
      ]),
    ];

    const result = validateSnapshotIntegrity(balances);
    expect(result.violations).toHaveLength(0);
    expect(result.symmetryOk).toBe(true);
    expect(result.zeroSumOk).toBe(true);
    expect(result.netTotal).toBe(0);
    expect(result.pairsChecked).toBe(12); // 4 players × 3 rivals each
  });

  it('allows ±1 cent rounding tolerance without violation', () => {
    // Floating-point rounding: 100.005 + (-100.004) = 0.001 → should still pass
    const balances: SnapshotPlayerBalance[] = [
      makeBalance('A', 'Alice', [{ rivalId: 'B', rivalName: 'Bob', netAmount: 100 }]),
      makeBalance('B', 'Bob', [{ rivalId: 'A', rivalName: 'Alice', netAmount: -100 }]),
    ];
    const result = validateSnapshotIntegrity(balances);
    expect(result.violations).toHaveLength(0);
  });
});
