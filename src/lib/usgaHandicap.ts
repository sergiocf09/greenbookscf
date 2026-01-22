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
