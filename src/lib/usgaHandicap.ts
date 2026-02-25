/**
 * USGA World Handicap System utilities
 */

export const getNumDifferentialsToUse = (totalRounds: number): number => {
  if (totalRounds >= 20) return 8;
  if (totalRounds === 19) return 7;
  if (totalRounds === 18) return 7;
  if (totalRounds === 17) return 6;
  if (totalRounds === 16) return 6;
  if (totalRounds === 15) return 5;
  if (totalRounds === 14) return 5;
  if (totalRounds === 13) return 4;
  if (totalRounds === 12) return 4;
  if (totalRounds === 11) return 3;
  if (totalRounds === 10) return 3;
  if (totalRounds === 9) return 2;
  if (totalRounds === 8) return 2;
  if (totalRounds === 7) return 2;
  if (totalRounds === 6) return 1;
  if (totalRounds === 5) return 1;
  if (totalRounds === 4) return 1;
  if (totalRounds === 3) return 1;
  return 0;
};

export const calculateHandicapIndexFromDifferentials = (
  differentials: number[]
): number | null => {
  const totalRounds = differentials.length;
  const numToUse = getNumDifferentialsToUse(totalRounds);
  if (numToUse <= 0) return null;

  const best = [...differentials].sort((a, b) => a - b).slice(0, numToUse);
  if (!best.length) return null;

  const avg = best.reduce((sum, d) => sum + d, 0) / best.length;
  const handicapIndex = avg * 0.96;
  return Math.round(handicapIndex * 10) / 10;
};

/**
 * Calculate USGA Score Differential
 * Formula: (Adjusted Gross Score - Course Rating) × 113 / Slope Rating
 */
export const calculateDifferential = (
  adjustedGrossScore: number,
  courseRating: number,
  slopeRating: number
): number => {
  const differential = ((adjustedGrossScore - courseRating) * 113) / slopeRating;
  return Math.round(differential * 10) / 10;
};

/**
 * Calculate Course Handicap from Handicap Index
 * Formula: Index × (Slope / 113) + (Rating - Par)
 */
export const calculateCourseHandicap = (
  handicapIndex: number,
  slopeRating: number,
  courseRating: number,
  coursePar: number
): number => {
  return Math.round(handicapIndex * (slopeRating / 113) + (courseRating - coursePar));
};

/**
 * Net Double Bogey adjustment (WHS Rule 3.1)
 *
 * Before summing strokes for the differential, each hole's score is capped at:
 *   maximum = par + 2 + strokesReceived on that hole
 *
 * @param holeStrokes  Array of 18 raw stroke values (index 0 = hole 1)
 * @param holePars     Array of 18 par values
 * @param strokesPerHole Array of 18 strokes-received values (from handicap allocation)
 * @returns The Adjusted Gross Score (sum of capped hole scores)
 */
export const calculateAdjustedGrossScore = (
  holeStrokes: (number | null)[],
  holePars: number[],
  strokesPerHole: number[]
): number => {
  let adjustedTotal = 0;
  for (let i = 0; i < 18; i++) {
    const strokes = holeStrokes[i];
    if (strokes === null || strokes === undefined) continue;
    const par = holePars[i] ?? 4;
    const received = strokesPerHole[i] ?? 0;
    const maxScore = par + 2 + received;
    adjustedTotal += Math.min(strokes, maxScore);
  }
  return adjustedTotal;
};
