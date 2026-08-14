/**
 * Medal General — Sliding (bilateral) handicap mode
 *
 * In this mode there is no single "net total" per player. Strokes come from the
 * bilateral handicap matrix (which reflects sliding adjustments), so every
 * comparison is pair-specific. A player wins the segment only if he beats
 * EVERY rival in his own bilateral comparison (strictly lower net).
 */
import { Player, PlayerScore, BetConfig, GolfCourse } from '@/types/golf';
import { calculateStrokesPerHole } from '../handicapUtils';
import { getBilateralHandicapForPair } from './shared';

const getMedalHandicap = (player: Player, config: BetConfig): number => {
  const override = (config.medalGeneral?.playerHandicaps || []).find(
    (ph) => ph.playerId === player.id
  );
  return override?.handicap ?? player.handicap;
};

/**
 * Net totals for a pair over the holes both players have confirmed,
 * using the bilateral (sliding) advantage for that specific pair.
 */
export const getMedalPairNets = (
  player: Player,
  rival: Player,
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  holeFilter: (h: number) => boolean,
  startingHole: 1 | 10 = 1
): { playerNet: number; rivalNet: number; holes: number } | null => {
  const playerScores = (scores.get(player.id) || []).filter(
    (s) => s.confirmed && s.strokes > 0 && holeFilter(s.holeNumber)
  );
  const rivalScores = (scores.get(rival.id) || []).filter(
    (s) => s.confirmed && s.strokes > 0 && holeFilter(s.holeNumber)
  );
  if (playerScores.length === 0 || rivalScores.length === 0) return null;

  const rivalByHole = new Map(rivalScores.map((s) => [s.holeNumber, s]));
  const sharedHoles = playerScores
    .filter((s) => rivalByHole.has(s.holeNumber))
    .map((s) => s.holeNumber)
    .sort((a, b) => a - b);
  if (sharedHoles.length === 0) return null;

  // Resolve per-pair strokes-per-hole arrays.
  let playerStrokes: number[];
  let rivalStrokes: number[];

  const bilateral = getBilateralHandicapForPair(
    player.id,
    rival.id,
    config.bilateralHandicaps,
    player.profileId,
    rival.profileId
  );

  if (bilateral) {
    const matchesPlayerA = (id: string) =>
      id === player.id || (player.profileId && id === player.profileId);
    const isPlayerFirst = matchesPlayerA(bilateral.playerAId);
    const playerHcp = isPlayerFirst ? bilateral.playerAHandicap : bilateral.playerBHandicap;
    const rivalHcp = isPlayerFirst ? bilateral.playerBHandicap : bilateral.playerAHandicap;
    playerStrokes = calculateStrokesPerHole(playerHcp, course, startingHole);
    rivalStrokes = calculateStrokesPerHole(rivalHcp, course, startingHole);
  } else {
    // No matrix entry (typical for guests): compute the differential on the fly.
    const playerHcp = getMedalHandicap(player, config);
    const rivalHcp = getMedalHandicap(rival, config);
    const diffStrokes = calculateStrokesPerHole(Math.abs(playerHcp - rivalHcp), course, startingHole);
    const zeros = diffStrokes.map(() => 0);
    playerStrokes = playerHcp > rivalHcp ? diffStrokes : zeros;
    rivalStrokes = rivalHcp > playerHcp ? diffStrokes : zeros;
  }

  let playerNet = 0;
  let rivalNet = 0;
  sharedHoles.forEach((hole) => {
    const p = playerScores.find((s) => s.holeNumber === hole)!;
    const r = rivalByHole.get(hole)!;
    playerNet += p.strokes - (playerStrokes[hole - 1] || 0);
    rivalNet += r.strokes - (rivalStrokes[hole - 1] || 0);
  });

  return { playerNet, rivalNet, holes: sharedHoles.length };
};

export interface MedalSlidingComparison {
  rivalId: string;
  playerNet: number;
  rivalNet: number;
  holes: number;
}

/**
 * All bilateral comparisons for a player against the rest of the pool.
 */
export const getMedalSlidingComparisons = (
  pool: Player[],
  player: Player,
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  holeFilter: (h: number) => boolean,
  startingHole: 1 | 10 = 1
): MedalSlidingComparison[] => {
  const out: MedalSlidingComparison[] = [];
  pool.forEach((rival) => {
    if (rival.id === player.id) return;
    const nets = getMedalPairNets(player, rival, scores, config, course, holeFilter, startingHole);
    if (!nets) return;
    out.push({ rivalId: rival.id, playerNet: nets.playerNet, rivalNet: nets.rivalNet, holes: nets.holes });
  });
  return out;
};

/**
 * The absolute winner of a segment in sliding mode: the only player who beats
 * every other rival (strictly) in his own bilateral comparison. Returns null
 * when nobody achieves it (nothing is paid in that case).
 */
export const getMedalSlidingAbsoluteWinner = (
  pool: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  holeFilter: (h: number) => boolean,
  startingHole: 1 | 10 = 1
): { winner: Player; rivals: Player[]; comparisons: MedalSlidingComparison[] } | null => {
  if (pool.length < 2) return null;

  for (const candidate of pool) {
    const comparisons = getMedalSlidingComparisons(
      pool,
      candidate,
      scores,
      config,
      course,
      holeFilter,
      startingHole
    );
    // Must have a valid comparison against every other player in the pool
    if (comparisons.length !== pool.length - 1) continue;
    const beatsAll = comparisons.every((c) => c.playerNet < c.rivalNet);
    if (!beatsAll) continue;
    const rivalIds = new Set(comparisons.map((c) => c.rivalId));
    return {
      winner: candidate,
      rivals: pool.filter((p) => rivalIds.has(p.id)),
      comparisons,
    };
  }

  return null;
};
