/**
 * Medal General Bet Calculator — group pool, lowest net wins
 * Supports segments: total-only or front/back/total
 * Supports handicap modes: 'individual' (USGA) or 'bilateral' (Sliding matrix)
 */
import { Player, PlayerScore, BetConfig, GolfCourse } from '@/types/golf';
import { calculateStrokesPerHole, getSegmentHoleRanges } from '../handicapUtils';
import { BetSummary } from './shared';
import { getMedalSlidingAbsoluteWinner } from './medalGeneralSliding';

type Segment = 'front' | 'back' | 'total';

const computeForSegment = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  amount: number,
  holeFilter: (h: number) => boolean,
  segment: Segment,
  startingHole: 1 | 10 = 1
): BetSummary[] => {
  const summaries: BetSummary[] = [];
  if (amount <= 0 || players.length < 2) return summaries;

  const segmentLabelBase = segment === 'front' ? 'F9' : segment === 'back' ? 'B9' : 'Total';

  // ── Sliding (bilateral) mode: absolute winner must beat every rival ──
  if (config.medalGeneral?.handicapMode === 'bilateral') {
    const absolute = getMedalSlidingAbsoluteWinner(
      players,
      scores,
      config,
      course,
      holeFilter,
      startingHole
    );
    if (!absolute) return summaries;

    absolute.comparisons.forEach((cmp) => {
      const desc = `${segmentLabelBase} Neto bilateral ${cmp.playerNet} vs ${cmp.rivalNet} (sliding)`;
      summaries.push({ playerId: absolute.winner.id, vsPlayer: cmp.rivalId, betType: 'Medal General', amount, segment, description: desc });
      summaries.push({ playerId: cmp.rivalId, vsPlayer: absolute.winner.id, betType: 'Medal General', amount: -amount, segment, description: `${segmentLabelBase} Neto bilateral ${cmp.rivalNet} vs ${cmp.playerNet} (sliding)` });
    });

    return summaries;
  }


  const playerHandicaps = config.medalGeneral?.playerHandicaps || [];
  const playerNetTotals: { playerId: string; netTotal: number }[] = [];

  players.forEach(player => {
    const playerScores = scores.get(player.id) || [];
    const confirmedScores = playerScores.filter(s => s.confirmed && s.strokes > 0 && holeFilter(s.holeNumber));
    if (confirmedScores.length === 0) return;

    const playerHcp = playerHandicaps.find(ph => ph.playerId === player.id);
    const handicap = playerHcp?.handicap ?? player.handicap;
    const strokesPerHole = calculateStrokesPerHole(handicap, course, startingHole);

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
  course: GolfCourse,
  startingHole: 1 | 10 = 1
): BetSummary[] => {
  if (!config.medalGeneral?.enabled || players.length < 2) return [];

  // Respect participantIds: when defined, only listed players join the pool.
  // When undefined => everyone participates (backwards compatible).
  // When an explicit empty array => no participants (bet effectively off).
  const participantIds = config.medalGeneral.participantIds;
  let participatingPlayers: Player[];
  if (participantIds === undefined) {
    participatingPlayers = players;
  } else if (participantIds.length === 0) {
    return [];
  } else {
    const idSet = new Set(participantIds);
    participatingPlayers = players.filter(
      p => idSet.has(p.id) || (p.profileId && idSet.has(p.profileId))
    );
  }
  if (participatingPlayers.length < 2) return [];

  const segmentMode = config.medalGeneral.segmentMode ?? 'total';
  const summaries: BetSummary[] = [];

  if (segmentMode === 'segments') {
    const ranges = getSegmentHoleRanges(startingHole);
    const [fs, fe] = ranges.front;
    const [bs, be] = ranges.back;
    summaries.push(...computeForSegment(participatingPlayers, scores, config, course, config.medalGeneral.frontAmount ?? 50, h => h >= fs && h <= fe, 'front', startingHole));
    summaries.push(...computeForSegment(participatingPlayers, scores, config, course, config.medalGeneral.backAmount ?? 100, h => h >= bs && h <= be, 'back', startingHole));
  }
  // Total always runs
  summaries.push(...computeForSegment(participatingPlayers, scores, config, course, config.medalGeneral.amount ?? 100, () => true, 'total', startingHole));

  return summaries;
};
