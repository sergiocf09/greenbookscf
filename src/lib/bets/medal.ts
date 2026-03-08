/**
 * Medal Bet Calculator — bilateral net total comparison per segment
 */
import { Player, PlayerScore, BetConfig, GolfCourse, BilateralHandicap } from '@/types/golf';
import { resolveConfigForGroup } from '../groupBetOverrides';
import {
  BetSummary, groupPlayersByGroup, resolveParticipantsWithOneVsAll,
  shouldCalculatePair, getAdjustedScoresForPair, getSegmentNetTotal,
} from './shared';

export const calculateMedalBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  bilateralHandicaps?: BilateralHandicap[],
  startingHole: 1 | 10 = 1
): BetSummary[] => {
  if (!config.medal.enabled) return [];
  
  const playersByGroup = groupPlayersByGroup(players);
  const participatingPlayers = playersByGroup.flatMap(groupPlayers => {
    const groupId = groupPlayers[0]?.groupId;
    const resolved = resolveConfigForGroup(config, groupId);
    return resolveParticipantsWithOneVsAll(config.medal, players, resolved.medal.participantIds, groupPlayers);
  });
  
  const summaries: BetSummary[] = [];
  
  const segments: Array<{ key: 'front' | 'back' | 'total'; amount: number; label: string }> = [
    { key: 'front', amount: config.medal.frontAmount, label: 'Medal Front 9' },
    { key: 'back', amount: config.medal.backAmount, label: 'Medal Back 9' },
    { key: 'total', amount: config.medal.totalAmount, label: 'Medal Total' },
  ];
  
  for (let i = 0; i < participatingPlayers.length; i++) {
    for (let j = i + 1; j < participatingPlayers.length; j++) {
      const playerA = participatingPlayers[i];
      const playerB = participatingPlayers[j];

      if (playerA.groupId && playerB.groupId && playerA.groupId !== playerB.groupId) continue;
      if (!shouldCalculatePair(config.medal, playerA.id, playerB.id)) continue;
      
      const adjustedScores = getAdjustedScoresForPair(playerA, playerB, scores, course, bilateralHandicaps);
      
      segments.forEach(({ key, amount, label }) => {
        if (amount <= 0) return;

        const netA = getSegmentNetTotal(playerA.id, adjustedScores, key, startingHole);
        const netB = getSegmentNetTotal(playerB.id, adjustedScores, key, startingHole);
        
        if (netA < netB) {
          summaries.push({ playerId: playerA.id, vsPlayer: playerB.id, betType: label, amount, segment: key, description: `${netA} vs ${netB}` });
          summaries.push({ playerId: playerB.id, vsPlayer: playerA.id, betType: label, amount: -amount, segment: key, description: `${netB} vs ${netA}` });
        } else if (netB < netA) {
          summaries.push({ playerId: playerB.id, vsPlayer: playerA.id, betType: label, amount, segment: key, description: `${netB} vs ${netA}` });
          summaries.push({ playerId: playerA.id, vsPlayer: playerB.id, betType: label, amount: -amount, segment: key, description: `${netA} vs ${netB}` });
        }
      });
    }
  }
  
  return summaries;
};
