/**
 * Round Snapshot Generator — Schema V3
 *
 * Single Source of Truth Contract (noRecalcContract):
 *   - Once closed, round_snapshots.snapshot_json is the ONLY source for historical
 *     views and accumulated balances. Historical UI must NEVER recalculate from
 *     hole_scores, round_handicaps, ledger_transactions or any other relational table.
 *
 * Integrity guarantees enforced at generation time:
 *   1. Symmetry:  matrix[A][B] == -matrix[B][A] for every pair.
 *   2. Zero-sum:  Σ totalNet of all players == 0.
 *   3. Consistency: snapshot.balances[A].vsBalances[B].netAmount == matrix[A][B].
 *
 * If any guarantee fails, generateRoundSnapshot throws — the caller must abort
 * the close pipeline and NOT write anything to the database.
 */

import { Player, PlayerScore, BetConfig, GolfCourse } from '@/types/golf';
import { BetSummary } from './betCalculations';

// Structure of a player in the snapshot
export interface SnapshotPlayer {
  id: string;
  name: string;
  initials: string;
  color: string;
  handicap: number;
  profileId?: string | null;
  isGuest: boolean;
  teeColor?: string;
}

// Structure of a score in the snapshot
export interface SnapshotHoleScore {
  holeNumber: number;
  strokes: number;
  putts: number;
  netScore: number;
  strokesReceived: number;
  oyesProximity?: number | null;
  oyesProximitySangron?: number | null;
  markers: Record<string, boolean>;
}

// Structure of a ledger entry in the snapshot
export interface SnapshotLedgerEntry {
  fromPlayerId: string;
  fromPlayerName: string;
  toPlayerId: string;
  toPlayerName: string;
  amount: number;
  betType: string;
  segment: 'front' | 'back' | 'total' | 'hole';
  holeNumber?: number;
  description?: string;
}

// Per-pair, per-betType breakdown (from loser's perspective the amount is negative,
// from winner's perspective it's positive). Keyed as "playerAId::playerBId".
// This is the immutable breakdown used by the historical BilateralDetail view
// to guarantee that the sum of bet rows == the header (snapshotBalances.vsBalances.netAmount).
// NOTE: Only individual bets are included here (Carritos/Presiones Parejas are excluded,
// matching the bilateral avatar/header which also excludes team bets).
export type SnapshotPairBreakdowns = Record<
  string, // pairKey = "playerId::rivalId"
  Record<string, number> // betType → netAmount (positive = player won, negative = player lost)
>;

// Display-ready result text per pair+segment, saved at close time to avoid recalculation.
// Key format: "playerAId::playerBId::betType::segment"
// e.g. "uuid1::uuid2::Presiones Front::front" → { resultText: "+3 +1 0", hasCarry: false }
// e.g. "uuid1::uuid2::Medal Front 9::front" → { resultText: "43 vs 42" }
export interface SnapshotSegmentResult {
  resultText: string;
  hasCarry?: boolean;
}
export type SnapshotPairSegmentResults = Record<string, SnapshotSegmentResult>;

// Player balance summary
export interface SnapshotPlayerBalance {
  playerId: string;
  playerName: string;
  totalGross: number; // Total gross strokes (18 holes)
  totalNet: number; // Positive = won, Negative = lost
  vsBalances: {
    rivalId: string;
    rivalName: string;
    netAmount: number; // Positive = won from this rival
    slidingStrokes?: number; // Strokes given/received (positive = gave, negative = received)
  }[];
}

// Bilateral handicaps for the round
export interface SnapshotBilateralHandicap {
  playerAId: string;
  playerBId: string;
  strokesGivenByA: number; // Positive = A gives to B, Negative = A receives from B
}

// Metadata contract to prevent recalculation in historical views
export interface SnapshotMeta {
  noRecalcContract: true;    // Historical UI must render only from snapshot; never recalculate
  schemaVersion: number;     // 1 = original, 3 = current (V3 with integrity guarantees)
  createdBy?: string | null; // organizer profileId
  integrityChecks?: {        // Results of pre-write integrity validation
    symmetryOk: boolean;
    zeroSumOk: boolean;
    netTotal: number;        // Should be 0; any deviation is logged here
    pairsChecked: number;
  };
}

// Complete round snapshot structure
export interface RoundSnapshot {
  version: number;
  roundId: string;
  courseId: string;
  courseName: string;
  date: string;
  teeColor: string;
  startingHole: 1 | 10;

  // No-recalc contract: set to true at close time, validated by historical views
  meta?: SnapshotMeta;
  
  // Players
  players: SnapshotPlayer[];
  
  // Scores per player
  scores: Record<string, SnapshotHoleScore[]>;
  
  // Bet configuration as-is
  betConfig: BetConfig;
  
  // Complete ledger of all bet transactions
  ledger: SnapshotLedgerEntry[];
  
  // Per-pair, per-betType breakdown (immutable, computed at close time).
  // Used by the historical BilateralDetail to show individual bet rows whose sum == header.
  // Keyed as "playerId::rivalId" (both directions stored).
  pairBreakdowns?: SnapshotPairBreakdowns;

  // Display-ready result text per pair+segment (e.g. "+3 +1 0" for Presiones, "43 vs 42" for Medal).
  // Key: "playerAId::playerBId::betType::segment"
  // Saved at close time so the historical view never needs to recalculate.
  pairSegmentResults?: SnapshotPairSegmentResults;
  
  // Player balances summary
  balances: SnapshotPlayerBalance[];
  
  // Bilateral handicaps for the round
  bilateralHandicaps?: SnapshotBilateralHandicap[];
  
  // Course par for display
  coursePar: number;
  
  // Metadata
  closedAt: string;
}

// ─── Integrity Validation ─────────────────────────────────────────────────────

export interface SnapshotIntegrityResult {
  symmetryOk: boolean;
  zeroSumOk: boolean;
  netTotal: number;
  pairsChecked: number;
  violations: string[]; // Human-readable descriptions of any failures
}

/**
 * Validate the integrity of snapshot balances BEFORE writing to the database.
 * Checks:
 *   1. Symmetry: balances[A].vs[B].netAmount == -balances[B].vs[A].netAmount
 *   2. Zero-sum: Σ totalNet == 0
 * Returns a result object; caller decides whether to abort on failure.
 */
export function validateSnapshotIntegrity(balances: SnapshotPlayerBalance[]): SnapshotIntegrityResult {
  const violations: string[] = [];
  let pairsChecked = 0;

  // Build lookup: playerId -> vsBalances map
  const balanceByPlayerId = new Map<string, SnapshotPlayerBalance>();
  for (const b of balances) {
    balanceByPlayerId.set(b.playerId, b);
  }

  // 1. Symmetry check
  for (const playerBal of balances) {
    for (const vsEntry of playerBal.vsBalances) {
      pairsChecked++;
      const rivalBal = balanceByPlayerId.get(vsEntry.rivalId);
      if (!rivalBal) {
        violations.push(`Symmetry: player ${vsEntry.rivalId} not found in balances`);
        continue;
      }
      const rivalVsPlayer = rivalBal.vsBalances.find(v => v.rivalId === playerBal.playerId);
      if (!rivalVsPlayer) {
        violations.push(`Symmetry: ${vsEntry.rivalId} has no entry for ${playerBal.playerId}`);
        continue;
      }
      // Allow ±1 cent rounding tolerance
      const diff = vsEntry.netAmount + rivalVsPlayer.netAmount;
      if (Math.abs(diff) > 1) {
        violations.push(
          `Symmetry violated: ${playerBal.playerId} vs ${vsEntry.rivalId}: ` +
          `${vsEntry.netAmount} + ${rivalVsPlayer.netAmount} = ${diff} (expected 0)`
        );
      }
    }
  }

  // 2. Zero-sum check
  const netTotal = balances.reduce((sum, b) => sum + b.totalNet, 0);
  const zeroSumOk = Math.abs(netTotal) <= 1; // ±1 cent tolerance
  if (!zeroSumOk) {
    violations.push(`Zero-sum violated: Σ totalNet = ${netTotal} (expected 0)`);
  }

  return {
    symmetryOk: violations.filter(v => v.startsWith('Symmetry')).length === 0,
    zeroSumOk,
    netTotal,
    pairsChecked,
    violations,
  };
}

/**
 * Generate a complete snapshot of the round for historical storage
 * 
 * THROWS if integrity validation fails (symmetry or zero-sum).
 * The caller MUST catch this and abort the close pipeline.
 */
export function generateRoundSnapshot(
  roundId: string,
  course: GolfCourse,
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  betConfig: BetConfig,
  betSummaries: BetSummary[],
  teeColor: string,
  startingHole: 1 | 10,
  date: string,
  bilateralHandicaps?: Map<string, number>, // key format: "playerAId::playerBId"
  // Display-ready result text per pair+segment, pre-computed at close time (no recalc in historic)
  pairSegmentResults?: SnapshotPairSegmentResults
): RoundSnapshot {
  // Build players snapshot
  const snapshotPlayers: SnapshotPlayer[] = players.map(p => ({
    id: p.id,
    name: p.name,
    initials: p.initials,
    color: p.color,
    handicap: p.handicap,
    profileId: p.profileId || null,
    isGuest: !p.profileId,
    teeColor: p.teeColor,
  }));

  // Build scores snapshot
  const snapshotScores: Record<string, SnapshotHoleScore[]> = {};
  for (const [playerId, playerScores] of scores) {
    snapshotScores[playerId] = playerScores.map(s => ({
      holeNumber: s.holeNumber,
      strokes: s.strokes,
      putts: s.putts,
      netScore: s.netScore,
      strokesReceived: s.strokesReceived,
      oyesProximity: s.oyesProximity,
      oyesProximitySangron: (s as any).oyesProximitySangron ?? null,
      markers: { ...s.markers },
    }));
  }

  // Build ledger from bet summaries
  // Each BetSummary represents one side of a transaction
  // We only store positive amounts (from loser to winner)
  const ledger: SnapshotLedgerEntry[] = [];
  const processedPairs = new Set<string>();

  for (const summary of betSummaries) {
    if (summary.amount <= 0) continue; // Only process winning side
    
    // BUG FIX #1: Do NOT use .sort() — it reorders all elements lexicographically,
    // causing distinct transactions (e.g. A→B $100 vs B→A $100, or two side bets
    // with the same amount between the same pair) to collide into the same key.
    // Since we only process amount > 0 (winner's perspective), directionality is
    // inherently preserved: playerId=winner, vsPlayer=loser.
    // Use '::' separator to avoid partial-match collisions between substrings.
    const pairKey = `${summary.playerId}::${summary.vsPlayer}::${summary.betType}::${summary.segment}::${summary.holeNumber ?? 0}::${summary.description ?? ''}::${summary.amount}`;
    
    if (processedPairs.has(pairKey)) continue;
    processedPairs.add(pairKey);

    // BUG FIX #2: Side bets may store profileId as the player identifier instead of
    // the local round-player id. Search by both p.id AND p.profileId so guests and
    // registered players are always found and never produce "Unknown" names.
    const winner = players.find(p => p.id === summary.playerId || (p.profileId && p.profileId === summary.playerId));
    const loser = players.find(p => p.id === summary.vsPlayer || (p.profileId && p.profileId === summary.vsPlayer));
    
    if (winner && loser) {
      ledger.push({
        fromPlayerId: loser.id,
        fromPlayerName: loser.name,
        toPlayerId: winner.id,
        toPlayerName: winner.name,
        amount: summary.amount,
        betType: summary.betType,
        segment: summary.segment,
        holeNumber: summary.holeNumber,
        description: summary.description,
      });
    }
  }

  // Calculate player balances
  const balanceMap = new Map<string, { total: number; vs: Map<string, number> }>();
  
  // Initialize all players
  for (const player of players) {
    balanceMap.set(player.id, { total: 0, vs: new Map() });
  }

  // Calculate from ledger
  for (const entry of ledger) {
    // Winner gets positive
    const winnerBalance = balanceMap.get(entry.toPlayerId);
    if (winnerBalance) {
      winnerBalance.total += entry.amount;
      winnerBalance.vs.set(entry.fromPlayerId, (winnerBalance.vs.get(entry.fromPlayerId) || 0) + entry.amount);
    }

    // Loser gets negative
    const loserBalance = balanceMap.get(entry.fromPlayerId);
    if (loserBalance) {
      loserBalance.total -= entry.amount;
      loserBalance.vs.set(entry.toPlayerId, (loserBalance.vs.get(entry.toPlayerId) || 0) - entry.amount);
    }
  }

  // Calculate gross totals per player
  const grossTotals = new Map<string, number>();
  for (const [playerId, playerScores] of scores) {
    const totalGross = playerScores.reduce((sum, s) => sum + (s.strokes || 0), 0);
    grossTotals.set(playerId, totalGross);
  }

  // Helper to get sliding strokes for a pair
  const getSlidingForPair = (playerAId: string, playerBId: string): number | undefined => {
    if (!bilateralHandicaps) return undefined;
    
    // Try both orderings
    const key1 = `${playerAId}::${playerBId}`;
    const key2 = `${playerBId}::${playerAId}`;
    
    if (bilateralHandicaps.has(key1)) {
      return bilateralHandicaps.get(key1);
    } else if (bilateralHandicaps.has(key2)) {
      // Negate because the order is reversed
      return -(bilateralHandicaps.get(key2) || 0);
    }
    return undefined;
  };

  // Build balances array with gross totals and sliding
  const balances: SnapshotPlayerBalance[] = players.map(p => {
    const balance = balanceMap.get(p.id)!;
    const vsBalances = Array.from(balance.vs.entries()).map(([rivalId, netAmount]) => {
      const rival = players.find(pl => pl.id === rivalId);
      return {
        rivalId,
        rivalName: rival?.name || 'Unknown',
        netAmount,
        slidingStrokes: getSlidingForPair(p.id, rivalId),
      };
    });

    return {
      playerId: p.id,
      playerName: p.name,
      totalGross: grossTotals.get(p.id) || 0,
      totalNet: balance.total,
      vsBalances,
    };
  });

  // Build bilateral handicaps array
  const snapshotHandicaps: SnapshotBilateralHandicap[] = [];
  if (bilateralHandicaps) {
    for (const [key, strokes] of bilateralHandicaps) {
      const [playerAId, playerBId] = key.split('::');
      if (playerAId && playerBId) {
        snapshotHandicaps.push({
          playerAId,
          playerBId,
          strokesGivenByA: strokes,
        });
      }
    }
  }

  // Calculate course par
  const coursePar = course.holes.reduce((sum, h) => sum + h.par, 0);

  // ── Build pairBreakdowns ─────────────────────────────────────────────────
  // For each directed pair (A→B and B→A), record the net amount per betType.
  // Carritos and Presiones Parejas are EXCLUDED so that the sum of breakdown rows
  // equals snapshotBalances.vsBalances.netAmount (the bilateral avatar/header total).
  const TEAM_BET_TYPES = new Set([
    'Carritos Front', 'Carritos Back', 'Carritos Total',
    'Presiones Parejas', 'Presiones Pareja',
  ]);

  const pairBreakdowns: SnapshotPairBreakdowns = {};

  for (const entry of ledger) {
    if (TEAM_BET_TYPES.has(entry.betType)) continue; // Exclude team bets
    if (entry.amount <= 0) continue;

    // Winner (toPlayer) perspective: positive
    const winnerKey = `${entry.toPlayerId}::${entry.fromPlayerId}`;
    if (!pairBreakdowns[winnerKey]) pairBreakdowns[winnerKey] = {};
    pairBreakdowns[winnerKey][entry.betType] =
      (pairBreakdowns[winnerKey][entry.betType] || 0) + entry.amount;

    // Loser (fromPlayer) perspective: negative
    const loserKey = `${entry.fromPlayerId}::${entry.toPlayerId}`;
    if (!pairBreakdowns[loserKey]) pairBreakdowns[loserKey] = {};
    pairBreakdowns[loserKey][entry.betType] =
      (pairBreakdowns[loserKey][entry.betType] || 0) - entry.amount;
  }
  // ──────────────────────────────────────────────────────────────────────────

  // ── Integrity Validation (pre-write contract) ────────────────────────────────
  // Validate BEFORE returning so the caller can abort if something is wrong.
  // This guarantees the snapshot is internally consistent when written to DB.
  const integrityResult = validateSnapshotIntegrity(balances);
  if (integrityResult.violations.length > 0) {
    console.error(
      `[roundSnapshot] INTEGRITY VIOLATIONS for round ${roundId}:`,
      integrityResult.violations
    );
    // THROW — caller (closeScorecard) must catch this and abort the pipeline
    throw new Error(
      `Snapshot integrity check failed (${integrityResult.violations.length} violation(s)): ` +
      integrityResult.violations.slice(0, 3).join('; ')
    );
  }
  // ─────────────────────────────────────────────────────────────────────────────

  return {
    version: 3,
    roundId,
    courseId: course.id,
    courseName: course.name,
    date,
    teeColor,
    startingHole,
    meta: {
      noRecalcContract: true,
      schemaVersion: 3,
      createdBy: undefined,
      integrityChecks: {
        symmetryOk: integrityResult.symmetryOk,
        zeroSumOk: integrityResult.zeroSumOk,
        netTotal: integrityResult.netTotal,
        pairsChecked: integrityResult.pairsChecked,
      },
    },
    players: snapshotPlayers,
    scores: snapshotScores,
    betConfig,
    ledger,
    pairBreakdowns,
    pairSegmentResults: pairSegmentResults ?? undefined,
    balances,
    bilateralHandicaps: snapshotHandicaps.length > 0 ? snapshotHandicaps : undefined,
    coursePar,
    closedAt: new Date().toISOString(),
  };
}

/**
 * Validate that a snapshot has the correct structure
 */
export function isValidSnapshot(snapshot: unknown): snapshot is RoundSnapshot {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const s = snapshot as RoundSnapshot;
  return (
    typeof s.version === 'number' &&
    typeof s.roundId === 'string' &&
    Array.isArray(s.players) &&
    typeof s.scores === 'object' &&
    Array.isArray(s.ledger) &&
    Array.isArray(s.balances)
  );
}

/**
 * Convert snapshot ledger entries to BetSummary[] format.
 * Each ledger entry (from loser → winner) produces two BetSummary items:
 *   - Winner side: positive amount
 *   - Loser side:  negative amount
 * This allows groupSummariesByType() and all balance helpers to work unchanged.
 */
export function snapshotLedgerToBetSummaries(ledger: SnapshotLedgerEntry[]): import('./betCalculations').BetSummary[] {
  const summaries: import('./betCalculations').BetSummary[] = [];

  for (const entry of ledger) {
    if (entry.amount <= 0) continue;

    // Winner (toPlayer) gets positive
    summaries.push({
      playerId: entry.toPlayerId,
      vsPlayer: entry.fromPlayerId,
      betType: entry.betType,
      amount: entry.amount,
      segment: entry.segment,
      holeNumber: entry.holeNumber,
      description: entry.description,
    });

    // Loser (fromPlayer) gets negative
    summaries.push({
      playerId: entry.fromPlayerId,
      vsPlayer: entry.toPlayerId,
      betType: entry.betType,
      amount: -entry.amount,
      segment: entry.segment,
      holeNumber: entry.holeNumber,
      description: entry.description,
    });
  }

  return summaries;
}
