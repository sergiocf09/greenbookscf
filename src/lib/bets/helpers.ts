/**
 * Balance and summary helpers for bet results
 */
import { Player, PlayerScore, GolfCourse } from '@/types/golf';
import { BetSummary } from './shared';

export const getPlayerBalance = (playerId: string, summaries: BetSummary[]): number => {
  return Math.round(summaries
    .filter(s => s.playerId === playerId)
    .reduce((sum, s) => sum + s.amount, 0));
};

export const getBilateralBalance = (
  playerId: string,
  vsPlayerId: string,
  summaries: BetSummary[]
): number => {
  return Math.round(summaries
    .filter(s => s.playerId === playerId && s.vsPlayer === vsPlayerId)
    .reduce((sum, s) => sum + s.amount, 0));
};

export const groupSummariesByType = (
  playerId: string,
  vsPlayerId: string,
  summaries: BetSummary[]
): Record<string, { total: number; details: BetSummary[] }> => {
  const filtered = summaries.filter(
    s => s.playerId === playerId && s.vsPlayer === vsPlayerId
  );
  return filtered.reduce((acc, s) => {
    const key = s.betType.replace(/ H\d+$/, '');
    if (!acc[key]) acc[key] = { total: 0, details: [] };
    acc[key].total += s.amount;
    acc[key].details.push(s);
    return acc;
  }, {} as Record<string, { total: number; details: BetSummary[] }>);
};

export interface TieResolution {
  type: 'culebra' | 'pinguino';
  holeNumber: number;
  players: string[];
}

export const detectTiesNeedingResolution = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse
): TieResolution[] => {
  const ties: TieResolution[] = [];

  // Check culebras
  const allCulebras: { playerId: string; holeNumber: number; putts: number }[] = [];
  players.forEach(player => {
    const playerScores = scores.get(player.id) || [];
    playerScores.forEach(score => {
      if (score.putts >= 3) allCulebras.push({ playerId: player.id, holeNumber: score.holeNumber, putts: score.putts });
    });
  });
  if (allCulebras.length > 0) {
    const maxHole = Math.max(...allCulebras.map(c => c.holeNumber));
    const culebrasOnLastHole = allCulebras.filter(c => c.holeNumber === maxHole);
    const maxPutts = Math.max(...culebrasOnLastHole.map(c => c.putts));
    const tied = culebrasOnLastHole.filter(c => c.putts === maxPutts);
    if (tied.length > 1) ties.push({ type: 'culebra', holeNumber: maxHole, players: tied.map(t => t.playerId) });
  }

  // Check pinguinos
  const allPinguinos: { playerId: string; holeNumber: number; overPar: number }[] = [];
  players.forEach(player => {
    const playerScores = scores.get(player.id) || [];
    playerScores.forEach(score => {
      const holePar = course.holes[score.holeNumber - 1]?.par || 4;
      const overPar = score.strokes - holePar;
      if (overPar >= 3) allPinguinos.push({ playerId: player.id, holeNumber: score.holeNumber, overPar });
    });
  });
  if (allPinguinos.length > 0) {
    const maxHole = Math.max(...allPinguinos.map(p => p.holeNumber));
    const pinguinosOnLastHole = allPinguinos.filter(p => p.holeNumber === maxHole);
    const maxOverPar = Math.max(...pinguinosOnLastHole.map(p => p.overPar));
    const tied = pinguinosOnLastHole.filter(p => p.overPar === maxOverPar);
    if (tied.length > 1) ties.push({ type: 'pinguino', holeNumber: maxHole, players: tied.map(t => t.playerId) });
  }

  return ties;
};
