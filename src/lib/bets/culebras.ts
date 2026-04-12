/**
 * Culebras Bet Calculator — last culebra pays all
 */
import { Player, PlayerScore, BetConfig } from '@/types/golf';
import { resolveConfigForGroup, isBetEnabledAnywhere } from '../groupBetOverrides';
import { BetSummary, groupPlayersByGroup, resolveParticipantsForGroup } from './shared';

export const calculateCulebrasBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig
): BetSummary[] => {
  if (!isBetEnabledAnywhere(config, 'culebras')) return [];
  
  const playersByGroup = groupPlayersByGroup(players);
  const allSummaries: BetSummary[] = [];
  
  playersByGroup.forEach(groupPlayers => {
    const groupId = groupPlayers[0]?.groupId;
    const resolved = resolveConfigForGroup(config, groupId);
    if (!resolved.culebras.enabled || resolved.culebras.valuePerOccurrence <= 0) return;
    const participatingPlayers = resolveParticipantsForGroup(players, resolved.culebras.participantIds, groupPlayers);
    
    if (participatingPlayers.length < 2) return;
    
    const participantIds = new Set(participatingPlayers.map(p => p.id));
    const allCulebras: { playerId: string; holeNumber: number; putts: number }[] = [];
    
    participatingPlayers.forEach(player => {
      const playerScores = scores.get(player.id) || [];
      playerScores.forEach(score => {
        if (score.putts >= 3) {
          allCulebras.push({ playerId: player.id, holeNumber: score.holeNumber, putts: score.putts });
        }
      });
    });
    
    if (allCulebras.length === 0) return;
    
    const maxHole = Math.max(...allCulebras.map(c => c.holeNumber));
    const culebrasOnLastHole = allCulebras.filter(c => c.holeNumber === maxHole);
    
    let lastPlayerToPay: string;
    
    if (culebrasOnLastHole.length === 1) {
      lastPlayerToPay = culebrasOnLastHole[0].playerId;
    } else {
      const maxPutts = Math.max(...culebrasOnLastHole.map(c => c.putts));
      const playersWithMaxPutts = culebrasOnLastHole.filter(c => c.putts === maxPutts);
      
      if (playersWithMaxPutts.length === 1) {
        lastPlayerToPay = playersWithMaxPutts[0].playerId;
      } else {
        const rawOverride = config.culebras.tieBreakLoser;
        const [overrideHoleStr, overridePlayerId] = typeof rawOverride === 'string' ? rawOverride.split(':') : [];
        const overrideHole = Number(overrideHoleStr);
        const isOverrideForThisHole = Number.isFinite(overrideHole) && overrideHole === maxHole;
        if (isOverrideForThisHole && overridePlayerId && playersWithMaxPutts.some(c => c.playerId === overridePlayerId)) {
          lastPlayerToPay = overridePlayerId;
        } else {
          lastPlayerToPay = playersWithMaxPutts[0].playerId;
        }
      }
    }
    
    const totalCulebras = allCulebras.length;
    const amountPerPlayer = totalCulebras * resolved.culebras.valuePerOccurrence;
    
    participatingPlayers.forEach(player => {
      if (player.id === lastPlayerToPay) return;
      allSummaries.push({ playerId: lastPlayerToPay, vsPlayer: player.id, betType: 'Culebras', amount: -amountPerPlayer, segment: 'total', description: `Último en culebra - paga ${totalCulebras} culebras`, units: totalCulebras, baseUnitAmount: resolved.culebras.valuePerOccurrence });
      allSummaries.push({ playerId: player.id, vsPlayer: lastPlayerToPay, betType: 'Culebras', amount: amountPerPlayer, segment: 'total', description: `Recibe de culebras x${totalCulebras}`, units: totalCulebras, baseUnitAmount: resolved.culebras.valuePerOccurrence });
    });
  });
  
  return allSummaries;
};
