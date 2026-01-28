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
export const getSegmentHoleRanges = (startingHole: 1 | 10 = 1): { front: [number, number]; back: [number, number] } => {
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
