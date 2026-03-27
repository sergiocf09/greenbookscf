/**
 * Caros Bet Calculator — configurable hole range (default 15-18) special bet
 */
import { Player, PlayerScore, BetConfig, GolfCourse, BilateralHandicap } from '@/types/golf';
import { resolveConfigForGroup, isBetEnabledAnywhere } from '../groupBetOverrides';
import {
  BetSummary,
  groupPlayersByGroup,
  resolveParticipantsWithOneVsAll,
  shouldCalculatePair,
  getAdjustedScoresForPair,
  getHoleScore,
} from './shared';

export const calculateCarosBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  bilateralHandicaps?: BilateralHandicap[],
  startingHole: 1 | 10 = 1
): BetSummary[] => {
  if (!isBetEnabledAnywhere(config, 'caros')) return [];

  const playersByGroup = groupPlayersByGroup(players);
  const participatingPlayers = playersByGroup.flatMap(groupPlayers => {
    const groupId = groupPlayers[0]?.groupId;
    const resolved = resolveConfigForGroup(config, groupId);
    if (!resolved.caros.enabled || resolved.caros.amount <= 0) return [];
    return resolveParticipantsWithOneVsAll(resolved.caros, players, resolved.caros.participantIds, groupPlayers);
  });

  const summaries: BetSummary[] = [];

  for (let i = 0; i < participatingPlayers.length; i++) {
    for (let j = i + 1; j < participatingPlayers.length; j++) {
      const playerA = participatingPlayers[i];
      const playerB = participatingPlayers[j];
      if (playerA.groupId && playerB.groupId && playerA.groupId !== playerB.groupId) continue;
      
      // Resolve group-specific config for this pair
      const pairGroupId = playerA.groupId || playerB.groupId;
      const rc = resolveConfigForGroup(config, pairGroupId);
      if (!rc.caros.enabled || rc.caros.amount <= 0) continue;
      if (!shouldCalculatePair(rc.caros, playerA.id, playerB.id)) continue;

      const startHole = rc.caros.startHole ?? 15;
      const endHole = rc.caros.endHole ?? 18;
      const caroHoles = Array.from({ length: endHole - startHole + 1 }, (_, i) => startHole + i);

      const adjustedScores = getAdjustedScoresForPair(playerA, playerB, scores, course, bilateralHandicaps);

      let totalA = 0, totalB = 0, played = 0;
      caroHoles.forEach(holeNum => {
        const scoreA = getHoleScore(playerA.id, holeNum, adjustedScores);
        const scoreB = getHoleScore(playerB.id, holeNum, adjustedScores);
        if (scoreA === null || scoreB === null) return;
        played += 1;
        totalA += scoreA;
        totalB += scoreB;
      });

      if (played === 0) continue;

      if (totalA < totalB) {
        summaries.push({ playerId: playerA.id, vsPlayer: playerB.id, betType: 'Caros', amount: rc.caros.amount, segment: 'back', description: `${totalA} vs ${totalB} (${played}/${caroHoles.length})` });
        summaries.push({ playerId: playerB.id, vsPlayer: playerA.id, betType: 'Caros', amount: -rc.caros.amount, segment: 'back', description: `${totalB} vs ${totalA} (${played}/${caroHoles.length})` });
      } else if (totalB < totalA) {
        summaries.push({ playerId: playerB.id, vsPlayer: playerA.id, betType: 'Caros', amount: rc.caros.amount, segment: 'back', description: `${totalB} vs ${totalA} (${played}/${caroHoles.length})` });
        summaries.push({ playerId: playerA.id, vsPlayer: playerB.id, betType: 'Caros', amount: -rc.caros.amount, segment: 'back', description: `${totalA} vs ${totalB} (${played}/${caroHoles.length})` });
      }
    }
  }

  return summaries;
};
