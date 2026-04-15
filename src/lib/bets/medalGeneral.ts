/**
 * Medal General Bet Calculator — group pool, lowest net wins
 * Supports segments: total-only or front/back/total
 */
import { Player, PlayerScore, BetConfig, GolfCourse } from '@/types/golf';
import { calculateStrokesPerHole } from '../handicapUtils';
import { BetSummary } from './shared';

type Segment = 'front' | 'back' | 'total';

const computeForSegment = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  amount: number,
  holeFilter: (h: number) => boolean,
  segment: Segment
): BetSummary[] => {
  const summaries: BetSummary[] = [];
  if (amount <= 0 || players.length < 2) return summaries;

  const playerHandicaps = config.medalGeneral?.playerHandicaps || [];
  const playerNetTotals: { playerId: string; netTotal: number }[] = [];

  players.forEach(player => {
    const playerScores = scores.get(player.id) || [];
    const confirmedScores = playerScores.filter(s => s.confirmed && s.strokes > 0 && holeFilter(s.holeNumber));
    if (confirmedScores.length === 0) return;

    const playerHcp = playerHandicaps.find(ph => ph.playerId === player.id);
    const handicap = playerHcp?.handicap ?? player.handicap;
    const strokesPerHole = calculateStrokesPerHole(handicap, course);

    const netTotal = confirmedScores.reduce((sum, s) => {
      const received = strokesPerHole[s.holeNumber - 1] || 0;
      return sum + (s.strokes - received);
    }, 0);

    playerNetTotals.push({ playerId: player.id, netTotal });
  });

  if (playerNetTotals.length < 2) return summaries;

  const minNetTotal = Math.min(...playerNetTotals.map(p => p.netTotal));
  const winners = playerNetTotals.filter(p => p.netTotal === minNetTotal);
  const losers = playerNetTotals.filter(p => p.netTotal !== minNetTotal);
  if (losers.length === 0) return summaries;

  const segmentLabel = segment === 'front' ? 'F9' : segment === 'back' ? 'B9' : 'Total';

  losers.forEach(loser => {
    const amountToPayPerWinner = Math.round(amount / winners.length);
    winners.forEach(winner => {
      summaries.push({ playerId: loser.playerId, vsPlayer: winner.playerId, betType: 'Medal General', amount: -amountToPayPerWinner, segment, description: `${segmentLabel} Neto ${loser.netTotal} vs ${winner.netTotal}${winners.length > 1 ? ' (empate dividido)' : ''}` });
      summaries.push({ playerId: winner.playerId, vsPlayer: loser.playerId, betType: 'Medal General', amount: amountToPayPerWinner, segment, description: `${segmentLabel} Neto ${winner.netTotal} vs ${loser.netTotal}${winners.length > 1 ? ' (empate dividido)' : ''}` });
    });
  });

  return summaries;
};

export const calculateMedalGeneralBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse
): BetSummary[] => {
  if (!config.medalGeneral?.enabled || players.length < 2) return [];

  const segmentMode = config.medalGeneral.segmentMode ?? 'total';
  const summaries: BetSummary[] = [];

  if (segmentMode === 'segments') {
    summaries.push(...computeForSegment(players, scores, config, course, config.medalGeneral.frontAmount ?? 0, h => h >= 1 && h <= 9, 'front'));
    summaries.push(...computeForSegment(players, scores, config, course, config.medalGeneral.backAmount ?? 0, h => h >= 10 && h <= 18, 'back'));
  }
  // Total always runs
  summaries.push(...computeForSegment(players, scores, config, course, config.medalGeneral.amount ?? 100, () => true, 'total'));

  return summaries;
};
