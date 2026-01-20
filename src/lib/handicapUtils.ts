import { GolfCourse, Player } from '@/types/golf';

/**
 * Calculate strokes received per hole based on handicap
 * Returns an array of 18 numbers representing strokes received on each hole
 */
export const calculateStrokesPerHole = (
  handicap: number,
  course: GolfCourse
): number[] => {
  const strokesPerHole = new Array(18).fill(0);
  
  // Sort holes by handicap index (stroke index)
  const sortedHoles = [...course.holes].sort((a, b) => a.handicapIndex - b.handicapIndex);
  
  let remainingStrokes = Math.round(handicap);
  
  // First pass: distribute one stroke per hole in order of difficulty
  for (const hole of sortedHoles) {
    if (remainingStrokes <= 0) break;
    strokesPerHole[hole.number - 1] += 1;
    remainingStrokes--;
  }
  
  // Second pass: if handicap > 18, distribute additional strokes
  for (const hole of sortedHoles) {
    if (remainingStrokes <= 0) break;
    strokesPerHole[hole.number - 1] += 1;
    remainingStrokes--;
  }
  
  return strokesPerHole;
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
