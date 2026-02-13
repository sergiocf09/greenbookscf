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

// Complete round snapshot structure
export interface RoundSnapshot {
  version: number;
  roundId: string;
  courseId: string;
  courseName: string;
  date: string;
  teeColor: string;
  startingHole: 1 | 10;
  
  // Players
  players: SnapshotPlayer[];
  
  // Scores per player
  scores: Record<string, SnapshotHoleScore[]>;
  
  // Bet configuration as-is
  betConfig: BetConfig;
  
  // Complete ledger of all bet transactions
  ledger: SnapshotLedgerEntry[];
  
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
  bilateralHandicaps?: Map<string, number> // key format: "playerAId::playerBId"
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
    
    // Include description AND amount to differentiate multiple entries of the same bet type
    // between the same pair (e.g., Coneja Set 1 vs Set 2 with different winners,
    // or multiple Side Bets between the same pair with different amounts)
    const pairKey = [summary.playerId, summary.vsPlayer, summary.betType, summary.segment, summary.holeNumber || 0, summary.description || '', summary.amount]
      .sort()
      .join(':');
    
    if (processedPairs.has(pairKey)) continue;
    processedPairs.add(pairKey);

    const winner = players.find(p => p.id === summary.playerId);
    const loser = players.find(p => p.id === summary.vsPlayer);
    
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

  return {
    version: 1,
    roundId,
    courseId: course.id,
    courseName: course.name,
    date,
    teeColor,
    startingHole,
    players: snapshotPlayers,
    scores: snapshotScores,
    betConfig,
    ledger,
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
