/**
 * Pingüinos Bet Calculator — last triple-bogey-or-worse pays all
 */
import { Player, PlayerScore, BetConfig, GolfCourse } from '@/types/golf';
import { resolveConfigForGroup } from '../groupBetOverrides';
import { BetSummary, groupPlayersByGroup, resolveParticipantsForGroup } from './shared';

export const calculatePinguinosBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse
): BetSummary[] => {
  if (!config.pinguinos.enabled || config.pinguinos.valuePerOccurrence <= 0) return [];
  
  const playersByGroup = groupPlayersByGroup(players);
  const allSummaries: BetSummary[] = [];
  
  playersByGroup.forEach(groupPlayers => {
    const groupId = groupPlayers[0]?.groupId;
    const resolved = resolveConfigForGroup(config, groupId);
    const participatingPlayers = resolveParticipantsForGroup(players, resolved.pinguinos.participantIds, groupPlayers);
    
    if (participatingPlayers.length < 2) return;
    
    const groupPlayerIds = new Set(participatingPlayers.map(p => p.id));
    const allPinguinos: { playerId: string; holeNumber: number; overPar: number }[] = [];
    
    groupPlayers.forEach(player => {
      const playerScores = scores.get(player.id) || [];
      playerScores.forEach(score => {
        const holePar = course.holes[score.holeNumber - 1]?.par || 4;
        const overPar = score.strokes - holePar;
        if (groupPlayerIds.has(player.id) && overPar >= 3) {
          allPinguinos.push({ playerId: player.id, holeNumber: score.holeNumber, overPar });
        }
      });
    });
    
    if (allPinguinos.length === 0) return;
    
    const maxHole = Math.max(...allPinguinos.map(p => p.holeNumber));
    const pinguinosOnLastHole = allPinguinos.filter(p => p.holeNumber === maxHole);
    
    let lastPlayerToPay: string;
    
    if (pinguinosOnLastHole.length === 1) {
      lastPlayerToPay = pinguinosOnLastHole[0].playerId;
    } else {
      const maxOverPar = Math.max(...pinguinosOnLastHole.map(p => p.overPar));
      const playersWithWorst = pinguinosOnLastHole.filter(p => p.overPar === maxOverPar);
      
      if (playersWithWorst.length === 1) {
        lastPlayerToPay = playersWithWorst[0].playerId;
      } else {
        const rawOverride = config.pinguinos.tieBreakLoser;
        const [overrideHoleStr, overridePlayerId] = typeof rawOverride === 'string' ? rawOverride.split(':') : [];
        const overrideHole = Number(overrideHoleStr);
        const isOverrideForThisHole = Number.isFinite(overrideHole) && overrideHole === maxHole;
        if (isOverrideForThisHole && overridePlayerId && playersWithWorst.some(p => p.playerId === overridePlayerId)) {
          lastPlayerToPay = overridePlayerId;
        } else {
          lastPlayerToPay = playersWithWorst[0].playerId;
        }
      }
    }
    
    const totalPinguinos = allPinguinos.length;
    const amountPerPlayer = totalPinguinos * config.pinguinos.valuePerOccurrence;
    
    groupPlayers.forEach(player => {
      if (player.id === lastPlayerToPay) return;
      allSummaries.push({ playerId: lastPlayerToPay, vsPlayer: player.id, betType: 'Pingüinos', amount: -amountPerPlayer, segment: 'total', description: `Último en pingüino - paga ${totalPinguinos} pingüinos` });
      allSummaries.push({ playerId: player.id, vsPlayer: lastPlayerToPay, betType: 'Pingüinos', amount: amountPerPlayer, segment: 'total', description: `Recibe de pingüinos x${totalPinguinos}` });
    });
  });
  
  return allSummaries;
};
