/**
 * Units Bet Calculator — Birdies/Eagles/Albatross bilateral comparison
 */
import { Player, PlayerScore, BetConfig, GolfCourse } from '@/types/golf';
import { resolveConfigForGroup } from '../groupBetOverrides';
import {
  BetSummary, groupPlayersByGroup, resolveParticipantsWithOneVsAll, shouldCalculatePair,
} from './shared';

export const calculateUnitsBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse
): BetSummary[] => {
  if (!config.units.enabled || config.units.valuePerPoint <= 0) return [];
  
  const summaries: BetSummary[] = [];
  
  const countUnits = (playerId: string): { positive: number; negative: number } => {
    const playerScores = scores.get(playerId) || [];
    let positive = 0;
    const negative = 0;
    
    playerScores.forEach(score => {
      if (!score.strokes || score.strokes <= 0) return;
      const holePar = course.holes[score.holeNumber - 1]?.par || 4;
      const toPar = score.strokes - holePar;
      
      if (toPar === -1) positive += 1;
      if (toPar === -2) positive += 2;
      if (toPar <= -3) positive += 3;
      
      if (score.markers?.sandyPar) positive += 1;
      if (score.markers?.aquaPar) positive += 1;
      if (score.markers?.holeOut) positive += 1;
    });
    
    return { positive, negative };
  };
  
  const playersByGroup = groupPlayersByGroup(players);
  
  playersByGroup.forEach(groupPlayers => {
    if (groupPlayers.length < 2) return;
    
    const groupId = groupPlayers[0]?.groupId;
    const resolved = resolveConfigForGroup(config, groupId);
    const participatingPlayers = resolveParticipantsWithOneVsAll(config.units, players, resolved.units.participantIds, groupPlayers);
    
    if (participatingPlayers.length < 2) return;
  
    for (let i = 0; i < participatingPlayers.length; i++) {
      for (let j = i + 1; j < participatingPlayers.length; j++) {
        const playerA = participatingPlayers[i];
        const playerB = participatingPlayers[j];
        if (playerA.groupId && playerB.groupId && playerA.groupId !== playerB.groupId) continue;
        if (!shouldCalculatePair(config.units, playerA.id, playerB.id)) continue;
        
        const unitsA = countUnits(playerA.id);
        const unitsB = countUnits(playerB.id);
        
        const netA = unitsA.positive - unitsA.negative;
        const netB = unitsB.positive - unitsB.negative;
        const diff = netA - netB;
        
        const hasAnyUnits = unitsA.positive > 0 || unitsA.negative > 0 || unitsB.positive > 0 || unitsB.negative > 0;
        
        if (diff !== 0 || hasAnyUnits) {
          const amount = diff * config.units.valuePerPoint;
          summaries.push({ playerId: playerA.id, vsPlayer: playerB.id, betType: 'Unidades', amount, segment: 'total', description: `${netA} vs ${netB} unidades (${unitsA.positive}+ ${unitsA.negative}- vs ${unitsB.positive}+ ${unitsB.negative}-)` });
          summaries.push({ playerId: playerB.id, vsPlayer: playerA.id, betType: 'Unidades', amount: -amount, segment: 'total', description: `${netB} vs ${netA} unidades (${unitsB.positive}+ ${unitsB.negative}- vs ${unitsA.positive}+ ${unitsA.negative}-)` });
        }
      }
    }
  });
  
  return summaries;
};
