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
  totalNet: number; // Positive = won, Negative = lost
  vsBalances: {
    rivalId: string;
    rivalName: string;
    netAmount: number; // Positive = won from this rival
  }[];
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
  date: string
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
    
    const pairKey = [summary.playerId, summary.vsPlayer, summary.betType, summary.segment, summary.holeNumber || 0]
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

  // Build balances array
  const balances: SnapshotPlayerBalance[] = players.map(p => {
    const balance = balanceMap.get(p.id)!;
    const vsBalances = Array.from(balance.vs.entries()).map(([rivalId, netAmount]) => {
      const rival = players.find(pl => pl.id === rivalId);
      return {
        rivalId,
        rivalName: rival?.name || 'Unknown',
        netAmount,
      };
    });

    return {
      playerId: p.id,
      playerName: p.name,
      totalNet: balance.total,
      vsBalances,
    };
  });

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
