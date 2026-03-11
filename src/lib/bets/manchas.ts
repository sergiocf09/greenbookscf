/**
 * Manchas Bet Calculator — differential bilateral comparison
 */
import { Player, PlayerScore, BetConfig } from '@/types/golf';
import { resolveConfigForGroup } from '../groupBetOverrides';
import {
  BetSummary, groupPlayersByGroup, resolveParticipantsWithOneVsAll, shouldCalculatePair,
} from './shared';

export const calculateManchasBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig
): BetSummary[] => {
  if (!config.manchas.enabled || config.manchas.valuePerPoint <= 0) return [];
  
  const summaries: BetSummary[] = [];
  
  const manualManchaMarkers = ['ladies', 'swingBlanco', 'retruje', 'trampa', 'dobleAgua', 'dobleOB', 'par3GirMas3', 'moreliana'] as const;
  
  const countManchas = (playerId: string): number => {
    const playerScores = scores.get(playerId) || [];
    let manchas = 0;
    playerScores.forEach(score => {
      manualManchaMarkers.forEach(marker => {
        if (score.markers[marker]) manchas += 1;
      });
      if (score.strokes >= 10) manchas += 1;
      if (score.putts >= 4 || score.markers.cuatriput) manchas += 1;
    });
    return manchas;
  };
  
  const playersByGroup = groupPlayersByGroup(players);
  
  playersByGroup.forEach(groupPlayers => {
    if (groupPlayers.length < 2) return;
    
    const groupId = groupPlayers[0]?.groupId;
    const resolved = resolveConfigForGroup(config, groupId);
    const participatingPlayers = resolveParticipantsWithOneVsAll(config.manchas, players, resolved.manchas.participantIds, groupPlayers);
    
    if (participatingPlayers.length < 2) return;
  
    for (let i = 0; i < participatingPlayers.length; i++) {
      for (let j = i + 1; j < participatingPlayers.length; j++) {
        const playerA = participatingPlayers[i];
        const playerB = participatingPlayers[j];
        if (!shouldCalculatePair(config.manchas, playerA.id, playerB.id)) continue;
        
        const manchasA = countManchas(playerA.id);
        const manchasB = countManchas(playerB.id);
        const diff = manchasB - manchasA;
        
        if (diff !== 0) {
          const amount = diff * config.manchas.valuePerPoint;
          summaries.push({ playerId: playerA.id, vsPlayer: playerB.id, betType: 'Manchas', amount, segment: 'total', description: `${manchasA} vs ${manchasB} manchas`, units: Math.abs(diff), baseUnitAmount: config.manchas.valuePerPoint });
          summaries.push({ playerId: playerB.id, vsPlayer: playerA.id, betType: 'Manchas', amount: -amount, segment: 'total', description: `${manchasB} vs ${manchasA} manchas`, units: Math.abs(diff), baseUnitAmount: config.manchas.valuePerPoint });
        }
      }
    }
  });
  
  return summaries;
};
