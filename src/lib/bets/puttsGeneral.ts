/**
 * Putts General Bet Calculator — group pool, lowest putt total wins
 * Supports segments: total-only or front/back/total
 */
import { Player, PlayerScore, BetConfig, GolfCourse } from '@/types/golf';
import { BetSummary } from './shared';

type Segment = 'front' | 'back' | 'total';

const computeForSegment = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  amount: number,
  holeFilter: (h: number) => boolean,
  segment: Segment
): BetSummary[] => {
  const summaries: BetSummary[] = [];
  if (amount <= 0 || players.length < 2) return summaries;

  const playerPutts: { playerId: string; total: number }[] = [];

  players.forEach(player => {
    const ps = scores.get(player.id) || [];
    const confirmed = ps.filter(s => s.confirmed && s.strokes > 0 && holeFilter(s.holeNumber) && s.putts != null);
    if (confirmed.length === 0) return;
    const total = confirmed.reduce((sum, s) => sum + (s.putts ?? 0), 0);
    playerPutts.push({ playerId: player.id, total });
  });

  if (playerPutts.length < 2) return summaries;

  const min = Math.min(...playerPutts.map(p => p.total));
  const winners = playerPutts.filter(p => p.total === min);
  const losers = playerPutts.filter(p => p.total !== min);
  if (losers.length === 0) return summaries;

  losers.forEach(loser => {
    const perWinner = Math.round(amount / winners.length);
    winners.forEach(winner => {
      summaries.push({ playerId: loser.playerId, vsPlayer: winner.playerId, betType: 'Putts General', amount: -perWinner, segment, description: `Putts ${loser.total} vs ${winner.total}${winners.length > 1 ? ' (empate dividido)' : ''}` });
      summaries.push({ playerId: winner.playerId, vsPlayer: loser.playerId, betType: 'Putts General', amount: perWinner, segment, description: `Putts ${winner.total} vs ${loser.total}${winners.length > 1 ? ' (empate dividido)' : ''}` });
    });
  });

  return summaries;
};

export const calculatePuttsGeneralBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  _course: GolfCourse
): BetSummary[] => {
  const cfg = (config as any).puttsGeneral;
  if (!cfg?.enabled || players.length < 2) return [];

  const segmentMode = cfg.segmentMode ?? 'total';
  const summaries: BetSummary[] = [];

  if (segmentMode === 'segments') {
    summaries.push(...computeForSegment(players, scores, cfg.frontAmount ?? 0, h => h >= 1 && h <= 9, 'front'));
    summaries.push(...computeForSegment(players, scores, cfg.backAmount ?? 0, h => h >= 10 && h <= 18, 'back'));
  }
  // Total always runs
  summaries.push(...computeForSegment(players, scores, cfg.amount ?? 100, () => true, 'total'));

  return summaries;
};
