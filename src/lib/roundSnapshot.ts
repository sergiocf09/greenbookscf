/**
 * Round Snapshot Generator
 * 
 * Creates an immutable snapshot of a completed round containing:
 * - All players (registered + guests)
 * - All hole scores with markers
 * - Handicaps used
 * - Bet configuration
 * - Full ledger of bet results
 * - Player totals
 * 
 * This snapshot is stored in round_snapshots and used for historical views.
 * Once saved, it should NEVER be recalculated.
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
  schemaVersion: number;     // 1 = original, future versions bump this
  createdBy?: string | null; // organizer profileId
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

/**
 * Generate a complete snapshot of the round for historical storage
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

  return {
    version: 1,
    roundId,
    courseId: course.id,
    courseName: course.name,
    date,
    teeColor,
    startingHole,
    meta: {
      noRecalcContract: true,
      schemaVersion: 1,
      createdBy: undefined,
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
