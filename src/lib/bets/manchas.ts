/**
 * Manchas Bet Calculator — differential bilateral comparison
 */
import { Player, PlayerScore, BetConfig } from '@/types/golf';
import { resolveConfigForGroup, isBetEnabledAnywhere } from '../groupBetOverrides';
import {
  BetSummary, groupPlayersByGroup, resolveParticipantsWithOneVsAll, shouldCalculatePair,
} from './shared';

/**
 * Shared mancha counting helpers (used by the individual Manchas bet, the
 * foursome sub-modality and the Bet Dashboard breakdown).
 */
export const MANCHA_MANUAL_MARKERS = [
  'ladies', 'swingBlanco', 'retruje', 'trampa',
  'dobleAgua', 'dobleOB', 'par3GirMas3', 'moreliana',
] as const;

export interface ManchaHit {
  holeNumber: number;
  playerId: string;
  reason: string;
}

/** Standard manchas (manual markers + 10 strokes + 4 putts/cuatriput) with detail. */
export const collectStandardManchaHits = (
  playerId: string,
  scores: Map<string, PlayerScore[]>
): ManchaHit[] => {
  const hits: ManchaHit[] = [];
  (scores.get(playerId) || []).filter(s => s.confirmed).forEach(score => {
    MANCHA_MANUAL_MARKERS.forEach(marker => {
      if (score.markers?.[marker]) hits.push({ holeNumber: score.holeNumber, playerId, reason: marker });
    });
    if (score.strokes >= 10) hits.push({ holeNumber: score.holeNumber, playerId, reason: 'dobleDigito' });
    if (score.putts >= 4 || score.markers?.cuatriput) hits.push({ holeNumber: score.holeNumber, playerId, reason: 'cuatriput' });
  });
  return hits.sort((a, b) => a.holeNumber - b.holeNumber);
};

/** Generic incremental manchas (⬛) with detail (one entry per occurrence). */
export const collectGenericManchaHits = (
  playerId: string,
  scores: Map<string, PlayerScore[]>
): ManchaHit[] => {
  const hits: ManchaHit[] = [];
  (scores.get(playerId) || []).filter(s => s.confirmed).forEach(score => {
    const count = score.markers?.manchaGenerica ?? 0;
    for (let i = 0; i < count; i++) {
      hits.push({ holeNumber: score.holeNumber, playerId, reason: 'manchaGenerica' });
    }
  });
  return hits.sort((a, b) => a.holeNumber - b.holeNumber);
};

export const calculateManchasBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig
): BetSummary[] => {
  if (!isBetEnabledAnywhere(config, 'manchas')) return [];

  const summaries: BetSummary[] = [];

  const countStandardManchas = (playerId: string): number =>
    collectStandardManchaHits(playerId, scores).length;

  const countGenericManchas = (playerId: string): number =>
    collectGenericManchaHits(playerId, scores).length;

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
