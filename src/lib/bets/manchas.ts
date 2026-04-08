/**
 * Manchas Bet Calculator — differential bilateral comparison
 */
import { Player, PlayerScore, BetConfig } from '@/types/golf';
import { resolveConfigForGroup, isBetEnabledAnywhere } from '../groupBetOverrides';
import {
  BetSummary, groupPlayersByGroup, resolveParticipantsWithOneVsAll, shouldCalculatePair,
} from './shared';

export const calculateManchasBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig
): BetSummary[] => {
  if (!isBetEnabledAnywhere(config, 'manchas')) return [];

  const summaries: BetSummary[] = [];

  const manualManchaMarkers = [
    'ladies', 'swingBlanco', 'retruje', 'trampa',
    'dobleAgua', 'dobleOB', 'par3GirMas3', 'moreliana',
  ] as const;

  const countStandardManchas = (playerId: string): number => {
    const playerScores = (scores.get(playerId) || []).filter(s => s.confirmed);
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

  const countGenericManchas = (playerId: string): number => {
    const playerScores = (scores.get(playerId) || []).filter(s => s.confirmed);
    return playerScores.reduce((sum, score) => sum + (score.markers.manchaGenerica ?? 0), 0);
  };

  const playersByGroup = groupPlayersByGroup(players);

  playersByGroup.forEach(groupPlayers => {
    if (groupPlayers.length < 2) return;

    const groupId = groupPlayers[0]?.groupId;
    const resolved = resolveConfigForGroup(config, groupId);
    if (!resolved.manchas.enabled || resolved.manchas.valuePerPoint <= 0) return;

    const participatingPlayers = resolveParticipantsWithOneVsAll(
      resolved.manchas, players, resolved.manchas.participantIds, groupPlayers
    );
    if (participatingPlayers.length < 2) return;

    const valueStandard = resolved.manchas.valuePerPoint;
    const valueGeneric = resolved.manchas.valuePerGenericMancha ?? valueStandard;

    for (let i = 0; i < participatingPlayers.length; i++) {
      for (let j = i + 1; j < participatingPlayers.length; j++) {
        const playerA = participatingPlayers[i];
        const playerB = participatingPlayers[j];
        if (!shouldCalculatePair(resolved.manchas, playerA.id, playerB.id)) continue;

        // Manchas estándar
        const stdA = countStandardManchas(playerA.id);
        const stdB = countStandardManchas(playerB.id);
        const diffStd = stdB - stdA;
        if (diffStd !== 0) {
          const amount = diffStd * valueStandard;
          summaries.push({ playerId: playerA.id, vsPlayer: playerB.id, betType: 'Manchas', amount, segment: 'total', description: `${stdA} vs ${stdB} manchas`, units: Math.abs(diffStd), baseUnitAmount: valueStandard });
          summaries.push({ playerId: playerB.id, vsPlayer: playerA.id, betType: 'Manchas', amount: -amount, segment: 'total', description: `${stdB} vs ${stdA} manchas`, units: Math.abs(diffStd), baseUnitAmount: valueStandard });
        }

        // Manchas genéricas (BetSummary separado si valor diferente)
        const genA = countGenericManchas(playerA.id);
        const genB = countGenericManchas(playerB.id);
        const diffGen = genB - genA;
        if (diffGen !== 0) {
          const amountGen = diffGen * valueGeneric;
          summaries.push({ playerId: playerA.id, vsPlayer: playerB.id, betType: 'Manchas', amount: amountGen, segment: 'total', description: `${genA} vs ${genB} manchas genéricas`, units: Math.abs(diffGen), baseUnitAmount: valueGeneric });
          summaries.push({ playerId: playerB.id, vsPlayer: playerA.id, betType: 'Manchas', amount: -amountGen, segment: 'total', description: `${genB} vs ${genA} manchas genéricas`, units: Math.abs(diffGen), baseUnitAmount: valueGeneric });
        }
      }
    }
  });

  return summaries;
};
