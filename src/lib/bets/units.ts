/**
 * Units Bet Calculator — Birdies/Eagles/Albatross bilateral comparison
 */
import { Player, PlayerScore, BetConfig, GolfCourse } from '@/types/golf';
import { resolveConfigForGroup, isBetEnabledAnywhere } from '../groupBetOverrides';
import {
  BetSummary, groupPlayersByGroup, resolveParticipantsWithOneVsAll, shouldCalculatePair,
} from './shared';

export const calculateUnitsBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse
): BetSummary[] => {
  if (!isBetEnabledAnywhere(config, 'units')) return [];

  const summaries: BetSummary[] = [];

  const countStandardUnits = (playerId: string): number => {
    const playerScores = scores.get(playerId) || [];
    let positive = 0;
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
    return positive;
  };

  const countGenericUnits = (playerId: string): number => {
    const playerScores = scores.get(playerId) || [];
    return playerScores.reduce((sum, score) => sum + (score.markers.unidadGenerica ?? 0), 0);
  };

  // Read units advantage from betOverride for a given pair.
  // Positive return = pAId gives advantage to pBId (pAId starts "owing" N units).
  const getUnitsAdvantage = (pAId: string, pBId: string): number => {
    const overrides = config.betOverrides;
    if (!overrides?.length) return 0;
    const match = overrides.find(o =>
      o.betType === 'Unidades' &&
      ((o.playerAId === pAId && o.playerBId === pBId) ||
       (o.playerAId === pBId && o.playerBId === pAId))
    );
    if (!match || !match.unitsAdvantage) return 0;
    // If override stored with reversed order, negate
    if (match.playerAId === pBId) return -match.unitsAdvantage;
    return match.unitsAdvantage;
  };

  const playersByGroup = groupPlayersByGroup(players);

  playersByGroup.forEach(groupPlayers => {
    if (groupPlayers.length < 2) return;

    const groupId = groupPlayers[0]?.groupId;
    const resolved = resolveConfigForGroup(config, groupId);
    if (!resolved.units.enabled || resolved.units.valuePerPoint <= 0) return;
    const participatingPlayers = resolveParticipantsWithOneVsAll(resolved.units, players, resolved.units.participantIds, groupPlayers);

    if (participatingPlayers.length < 2) return;

    const valueStandard = resolved.units.valuePerPoint;
    const valueGeneric = resolved.units.valuePerGenericUnit ?? valueStandard;

    for (let i = 0; i < participatingPlayers.length; i++) {
      for (let j = i + 1; j < participatingPlayers.length; j++) {
        const playerA = participatingPlayers[i];
        const playerB = participatingPlayers[j];
        if (playerA.groupId && playerB.groupId && playerA.groupId !== playerB.groupId) continue;
        if (!shouldCalculatePair(resolved.units, playerA.id, playerB.id)) continue;

        const unitsAdv = getUnitsAdvantage(playerA.id, playerB.id);

        // Unidades estándar
        const stdA = countStandardUnits(playerA.id);
        const stdB = countStandardUnits(playerB.id);
        // unitsAdv positive = A gives advantage to B → subtract from (A - B)
        const diffStd = (stdA - stdB) - unitsAdv;
        if (diffStd !== 0) {
          const amount = diffStd * valueStandard;
          const advSuffixA = unitsAdv !== 0
            ? ` (ventaja: ${Math.abs(unitsAdv)} → ${unitsAdv > 0 ? 'rival' : 'tú'})`
            : '';
          const advSuffixB = unitsAdv !== 0
            ? ` (ventaja: ${Math.abs(unitsAdv)} → ${unitsAdv > 0 ? 'tú' : 'rival'})`
            : '';
          summaries.push({ playerId: playerA.id, vsPlayer: playerB.id, betType: 'Unidades', amount, segment: 'total', description: `${stdA} vs ${stdB} unidades${advSuffixA}`, units: Math.abs(diffStd), baseUnitAmount: valueStandard });
          summaries.push({ playerId: playerB.id, vsPlayer: playerA.id, betType: 'Unidades', amount: -amount, segment: 'total', description: `${stdB} vs ${stdA} unidades${advSuffixB}`, units: Math.abs(diffStd), baseUnitAmount: valueStandard });
        }

        // Unidades genéricas
        const genA = countGenericUnits(playerA.id);
        const genB = countGenericUnits(playerB.id);
        const diffGen = (genA - genB) - unitsAdv;
        if (diffGen !== 0) {
          const amountGen = diffGen * valueGeneric;
          const advSuffixA = unitsAdv !== 0
            ? ` (ventaja: ${Math.abs(unitsAdv)} → ${unitsAdv > 0 ? 'rival' : 'tú'})`
            : '';
          const advSuffixB = unitsAdv !== 0
            ? ` (ventaja: ${Math.abs(unitsAdv)} → ${unitsAdv > 0 ? 'tú' : 'rival'})`
            : '';
          summaries.push({ playerId: playerA.id, vsPlayer: playerB.id, betType: 'Unidades', amount: amountGen, segment: 'total', description: `${genA} vs ${genB} unidades genéricas${advSuffixA}`, units: Math.abs(diffGen), baseUnitAmount: valueGeneric });
          summaries.push({ playerId: playerB.id, vsPlayer: playerA.id, betType: 'Unidades', amount: -amountGen, segment: 'total', description: `${genB} vs ${genA} unidades genéricas${advSuffixB}`, units: Math.abs(diffGen), baseUnitAmount: valueGeneric });
        }
      }
    }
  });

  return summaries;
};
