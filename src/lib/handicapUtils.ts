import { GolfCourse, Player } from '@/types/golf';

/**
 * Calculate strokes received per hole based on handicap
 * Returns an array of 18 numbers representing strokes received on each hole
 * 
 * @param handicap - Player's handicap
 * @param course - The golf course with hole info
 * @param startingHole - Which hole the round starts from (1 or 10)
 * 
 * When startingHole is 10 and handicap is odd, the extra stroke goes to the
 * first played nine (holes 10-18) rather than the physical front nine (1-9).
 */
export const calculateStrokesPerHole = (
  handicap: number,
  course: GolfCourse,
  startingHole: 1 | 10 = 1
): number[] => {
  const strokesPerHole = new Array(18).fill(0);
  const totalStrokes = Math.round(handicap);
  
  if (totalStrokes <= 0) return strokesPerHole;
  
  // Determine which holes are in the "first nine" and "second nine" based on starting hole
  const firstNineHoles = startingHole === 1 
    ? course.holes.filter(h => h.number >= 1 && h.number <= 9)
    : course.holes.filter(h => h.number >= 10 && h.number <= 18);
  
  const secondNineHoles = startingHole === 1
    ? course.holes.filter(h => h.number >= 10 && h.number <= 18)
    : course.holes.filter(h => h.number >= 1 && h.number <= 9);
  
  // Sort each nine by handicap index (stroke index)
  const sortedFirstNine = [...firstNineHoles].sort((a, b) => a.handicapIndex - b.handicapIndex);
  const sortedSecondNine = [...secondNineHoles].sort((a, b) => a.handicapIndex - b.handicapIndex);
  
  // Calculate strokes per nine
  // For odd handicaps, the first played nine gets the extra stroke
  const strokesForFirstNine = Math.ceil(totalStrokes / 2);
  const strokesForSecondNine = Math.floor(totalStrokes / 2);
  
  // Distribute strokes to first nine
  let remainingFirst = Math.min(strokesForFirstNine, 18); // Cap at 18 for very high handicaps
  for (const hole of sortedFirstNine) {
    if (remainingFirst <= 0) break;
    strokesPerHole[hole.number - 1] += 1;
    remainingFirst--;
  }
  // Second pass for handicaps > 9 (give second strokes to first nine)
  if (remainingFirst > 0) {
    for (const hole of sortedFirstNine) {
      if (remainingFirst <= 0) break;
      strokesPerHole[hole.number - 1] += 1;
      remainingFirst--;
    }
  }
  
  // Distribute strokes to second nine
  let remainingSecond = Math.min(strokesForSecondNine, 18); // Cap at 18
  for (const hole of sortedSecondNine) {
    if (remainingSecond <= 0) break;
    strokesPerHole[hole.number - 1] += 1;
    remainingSecond--;
  }
  // Second pass for handicaps > 9
  if (remainingSecond > 0) {
    for (const hole of sortedSecondNine) {
      if (remainingSecond <= 0) break;
      strokesPerHole[hole.number - 1] += 1;
      remainingSecond--;
    }
  }
  
  return strokesPerHole;
};

/**
 * Get the hole ranges for "front" and "back" based on starting hole
 * When starting at hole 1: front = 1-9, back = 10-18
 * When starting at hole 10: front = 10-18, back = 1-9
 */
export const getSegmentHoleRanges = (
  startingHole: 1 | 10 = 1,
  roundHoles: 9 | 18 = 18
): { front: [number, number]; back: [number, number] } => {
  if (roundHoles === 9) {
    // Round of 9 holes: only the played nine exists. Use an EMPTY range for
    // the inactive segment ([hi, lo] with hi<lo) so calculators that iterate
    // `for h=back[0]..back[1]` naturally skip it entirely. This prevents any
    // residual scores from a previous 18H state (e.g. switched to 9H later)
    // from leaking into Skins/Units/Medal back-9 calculations.
    const front: [number, number] = startingHole === 10 ? [10, 18] : [1, 9];
    const empty: [number, number] = [99, 0];
    return { front, back: empty };
  }
  if (startingHole === 10) {
    return {
      front: [10, 18], // First played nine
      back: [1, 9],    // Second played nine
    };
  }
  return {
    front: [1, 9],    // First played nine  
    back: [10, 18],   // Second played nine
  };
};

/**
 * Calculate net score for a hole
 */
export const calculateNetScore = (
  grossScore: number,
  strokesReceived: number
): number => {
  return grossScore - strokesReceived;
};

/**
 * Calculate score relative to par
 */
export const calculateScoreToPar = (
  score: number,
  par: number
): number => {
  return score - par;
};

/**
 * Get score name based on score relative to par
 */
export const getScoreName = (scoreToPar: number): string => {
  if (scoreToPar <= -3) return 'Albatros';
  if (scoreToPar === -2) return 'Águila';
  if (scoreToPar === -1) return 'Birdie';
  if (scoreToPar === 0) return 'Par';
  if (scoreToPar === 1) return 'Bogey';
  if (scoreToPar === 2) return 'Doble';
  if (scoreToPar === 3) return 'Triple';
  return `+${scoreToPar}`;
};

/**
 * Generate all possible pairs from players for bilateral bets
 */
export const generatePlayerPairs = (
  players: Player[]
): Array<[Player, Player]> => {
  const pairs: Array<[Player, Player]> = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      pairs.push([players[i], players[j]]);
    }
  }
  return pairs;
};

/**
 * Format handicap for display
 */
export const formatHandicap = (handicap: number): string => {
  if (handicap === 0) return '0';
  return handicap > 0 ? `+${handicap}` : `${handicap}`;
};

// =====================================================
// TEAM HANDICAP MODALITY CALCULATIONS
// =====================================================

/**
 * Calculate "Diferencial de Equipo" handicap distribution.
 * Sum HCPs per team. The net difference goes to the highest-HCP player
 * on the receiving team. All others get 0.
 *
 * @param teamAIds - [playerA1Id, playerA2Id]
 * @param teamBIds - [playerB1Id, playerB2Id]
 * @param hcpMap - Map from playerId to their base handicap
 * @param recipientOverride - optional playerId to force as recipient when tied
 * @returns Record<string, number> of teamHandicaps
 */
export const calcTeamDifferential = (
  teamAIds: [string, string],
  teamBIds: [string, string],
  hcpMap: Record<string, number>,
  recipientOverride?: string,
): { diff: number; receivingTeam: 'A' | 'B' | 'none'; recipientPlayerId: string | null; teamHandicaps: Record<string, number>; needsTieBreak: boolean } => {
  const hA1 = hcpMap[teamAIds[0]] ?? 0, hA2 = hcpMap[teamAIds[1]] ?? 0;
  const hB1 = hcpMap[teamBIds[0]] ?? 0, hB2 = hcpMap[teamBIds[1]] ?? 0;
  const sumA = hA1 + hA2, sumB = hB1 + hB2;
  const diff = Math.abs(sumA - sumB);

  const result: Record<string, number> = {};
  [...teamAIds, ...teamBIds].forEach(id => { result[id] = 0; });

  if (diff === 0) {
    return { diff: 0, receivingTeam: 'none', recipientPlayerId: null, teamHandicaps: result, needsTieBreak: false };
  }

  const receivingTeam: 'A' | 'B' = sumA > sumB ? 'A' : 'B';
  const receivingIds = receivingTeam === 'A' ? teamAIds : teamBIds;
  const rH0 = hcpMap[receivingIds[0]] ?? 0, rH1 = hcpMap[receivingIds[1]] ?? 0;

  let recipientId: string | null;
  let needsTieBreak = false;

  if (recipientOverride && receivingIds.includes(recipientOverride)) {
    recipientId = recipientOverride;
  } else if (rH0 !== rH1) {
    recipientId = rH0 > rH1 ? receivingIds[0] : receivingIds[1];
  } else {
    // Tied — default to first player, but flag that tie-break needed
    recipientId = receivingIds[0];
    needsTieBreak = true;
  }

  result[recipientId] = diff;
  return { diff, receivingTeam, recipientPlayerId: recipientId, teamHandicaps: result, needsTieBreak };
};

/**
 * Calculate "Sliding de Equipo" handicap distribution.
 * Cross-pair sliding values divided by 2.
 *
 * @param slidings - { ac, ad, bc, bd } where positive means A-side gives to that player
 *   ac = strokes A1 gives C1, ad = strokes A1 gives D1, etc.
 *   (negative means the reverse direction)
 * @param teamAIds - [A1, A2]
 * @param teamBIds - [C1, D1]
 * @param halfPointMode - 'roundDown' or 'halfPoint'
 * @returns teamHandicaps and halfStrokeHole info
 */
export const calcSlidingTeamDifferential = (
  slidings: { ac: number; ad: number; bc: number; bd: number },
  teamAIds: [string, string],
  teamBIds: [string, string],
  hcpMap: Record<string, number>,
  halfPointMode: 'roundDown' | 'halfPoint' = 'roundDown',
): { raw: number; rounded: number; hasHalf: boolean; receivingTeam: 'A' | 'B' | 'none'; recipientPlayerId: string | null; teamHandicaps: Record<string, number> } => {
  // Total cross = sum of all slidings from A to B side
  const totalAtoB = slidings.ac + slidings.ad + slidings.bc + slidings.bd;
  // If positive, team A gives to team B overall; if negative, team B gives to team A
  const raw = Math.abs(totalAtoB) / 2;
  const rounded = Math.floor(raw);
  const hasHalf = raw % 1 !== 0;

  const result: Record<string, number> = {};
  [...teamAIds, ...teamBIds].forEach(id => { result[id] = 0; });

  const effectiveStrokes = halfPointMode === 'halfPoint' && hasHalf ? raw : rounded;

  if (effectiveStrokes === 0 && !hasHalf) {
    return { raw, rounded, hasHalf, receivingTeam: 'none', recipientPlayerId: null, teamHandicaps: result };
  }

  // Receiving team is the one that receives strokes (higher total sliding received)
  const receivingTeam: 'A' | 'B' = totalAtoB < 0 ? 'A' : 'B';
  const receivingIds = receivingTeam === 'A' ? teamAIds : teamBIds;

  // The recipient is the player with the highest received sliding total
  // For team B: check how much each received from team A
  let recipientId: string;
  if (receivingTeam === 'B') {
    const cReceived = slidings.ac + slidings.bc;
    const dReceived = slidings.ad + slidings.bd;
    recipientId = cReceived >= dReceived ? teamBIds[0] : teamBIds[1];
  } else {
    // For team A receiving from B: we need the inverse slidings
    // Since we only have A→B slidings, we infer B→A as negative
    const a1Received = -(slidings.ac + slidings.ad);
    const a2Received = -(slidings.bc + slidings.bd);
    recipientId = a1Received >= a2Received ? teamAIds[0] : teamAIds[1];
  }

  result[recipientId] = halfPointMode === 'halfPoint' ? raw : rounded;
  return { raw, rounded, hasHalf, receivingTeam, recipientPlayerId: recipientId, teamHandicaps: result };
};

/**
 * Calculate strokes per hole with half-point support.
 * The half point is assigned to the next hole in handicap index sequence
 * after the integer strokes are distributed.
 *
 * @returns strokesPerHole (integer strokes only) and halfStrokeHole (hole number where half applies, or null)
 */
export const calculateStrokesPerHoleWithHalf = (
  strokes: number,
  hasHalf: boolean,
  course: GolfCourse,
  startingHole: 1 | 10 = 1,
): { strokesPerHole: number[]; halfStrokeHole: number | null } => {
  const intStrokes = Math.floor(strokes);
  const strokesPerHole = calculateStrokesPerHole(intStrokes, course, startingHole);

  if (!hasHalf) {
    return { strokesPerHole, halfStrokeHole: null };
  }

  // Find the next hole in handicap index sequence that didn't get a stroke
  // Sort all holes by handicap index
  const allHoles = [...course.holes].sort((a, b) => a.handicapIndex - b.handicapIndex);

  // The half stroke goes to the hole with handicap index position = intStrokes + 1
  // (i.e., the first hole that would have gotten a stroke if we had one more)
  for (const hole of allHoles) {
    if (strokesPerHole[hole.number - 1] === 0) {
      return { strokesPerHole, halfStrokeHole: hole.number };
    }
  }

  return { strokesPerHole, halfStrokeHole: null };
};
