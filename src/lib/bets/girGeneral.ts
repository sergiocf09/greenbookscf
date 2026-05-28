/**
 * GIR General Bet Calculator — group pool, most Greens In Regulation wins
 * GIR = (strokes - putts) <= (holePar - 2)
 * No handicap applied. Requires putts != null to count a hole.
 * Supports segments: total-only or front/back/total
 */
import { Player, PlayerScore, BetConfig, GolfCourse } from '@/types/golf';
import { getSegmentHoleRanges } from '../handicapUtils';
import { BetSummary } from './shared';

type Segment = 'front' | 'back' | 'total';

const computeForSegment = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse,
  amount: number,
  holeFilter: (h: number) => boolean,
  segment: Segment
): BetSummary[] => {
  const summaries: BetSummary[] = [];
  if (amount <= 0 || players.length < 2) return summaries;

  const playerGIRs: { playerId: string; total: number }[] = [];
  const holeMap = new Map(course.holes.map(h => [h.number, h.par]));

  players.forEach(player => {
    const ps = scores.get(player.id) || [];
    const confirmed = ps.filter(
      s => s.confirmed && s.strokes > 0 && s.putts != null && holeFilter(s.holeNumber)
    );
    if (confirmed.length === 0) return;
    const total = confirmed.reduce((sum, s) => {
      const par = holeMap.get(s.holeNumber) ?? 4;
      const isGIR = (s.strokes - (s.putts ?? 0)) <= (par - 2);
      return sum + (isGIR ? 1 : 0);
    }, 0);
    playerGIRs.push({ playerId: player.id, total });
  });

  if (playerGIRs.length < 2) return summaries;

  const max = Math.max(...playerGIRs.map(p => p.total));
  const winners = playerGIRs.filter(p => p.total === max);
  const losers = playerGIRs.filter(p => p.total !== max);
  if (losers.length === 0) return summaries;

  const segmentLabel = segment === 'front' ? 'F9' : segment === 'back' ? 'B9' : 'Total';

  losers.forEach(loser => {
    const perWinner = Math.round(amount / winners.length);
    winners.forEach(winner => {
      summaries.push({
        playerId: loser.playerId,
        vsPlayer: winner.playerId,
        betType: 'GIR General',
        amount: -perWinner,
        segment,
        description: `${segmentLabel} GIR ${loser.total} vs ${winner.total}${winners.length > 1 ? ' (empate dividido)' : ''}`,
      });
      summaries.push({
        playerId: winner.playerId,
        vsPlayer: loser.playerId,
        betType: 'GIR General',
        amount: perWinner,
        segment,
        description: `${segmentLabel} GIR ${winner.total} vs ${loser.total}${winners.length > 1 ? ' (empate dividido)' : ''}`,
      });
    });
  });

  return summaries;
};

export const calculateGIRGeneralBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  startingHole: 1 | 10 = 1
): BetSummary[] => {
  const cfg = (config as any).girGeneral;
  if (!cfg?.enabled || players.length < 2) return [];

  const segmentMode = cfg.segmentMode ?? 'total';
  const summaries: BetSummary[] = [];

  if (segmentMode === 'segments') {
    const ranges = getSegmentHoleRanges(startingHole);
    const [fs, fe] = ranges.front;
    const [bs, be] = ranges.back;
    summaries.push(...computeForSegment(players, scores, course, cfg.frontAmount ?? 0, h => h >= fs && h <= fe, 'front'));
    summaries.push(...computeForSegment(players, scores, course, cfg.backAmount ?? 0, h => h >= bs && h <= be, 'back'));
  }
  summaries.push(...computeForSegment(players, scores, course, cfg.amount ?? 100, () => true, 'total'));

  return summaries;
};
