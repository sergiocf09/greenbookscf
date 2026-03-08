/**
 * Skins Bet Calculator — bilateral accumulated/sinAcumular with carry-over and zapato
 */
import { Player, PlayerScore, BetConfig, GolfCourse, BilateralHandicap } from '@/types/golf';
import { resolveConfigForGroup } from '../groupBetOverrides';
import { getSegmentHoleRanges } from '../handicapUtils';
import {
  BetSummary,
  groupPlayersByGroup,
  resolveParticipantsWithOneVsAll,
  shouldCalculatePair,
  getAdjustedScoresForPair,
  getHoleScore,
} from './shared';

export const calculateSkinsBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  bilateralHandicaps?: BilateralHandicap[],
  startingHole: 1 | 10 = 1
): BetSummary[] => {
  if (!config.skins.enabled) return [];

  const playersByGroup = groupPlayersByGroup(players);
  const participatingPlayers = playersByGroup.flatMap(groupPlayers => {
    const groupId = groupPlayers[0]?.groupId;
    const resolved = resolveConfigForGroup(config, groupId);
    return resolveParticipantsWithOneVsAll(config.skins, players, resolved.skins.participantIds, groupPlayers);
  });

  const summaries: BetSummary[] = [];

  const getEffectiveSkinsModality = (playerAId: string, playerBId: string): 'acumulados' | 'sinAcumular' => {
    const globalModality = config.skins.modality ?? 'acumulados';
    const pairOverrides = config.skins.pairSkinVariantOverrides;
    const playerVariants = config.skins.playerSkinVariants;
    const pairKey = [playerAId, playerBId].sort().join('_');
    if (pairOverrides?.[pairKey]) return pairOverrides[pairKey];
    const variantA = playerVariants?.[playerAId] ?? globalModality;
    const variantB = playerVariants?.[playerBId] ?? globalModality;
    if (variantA === variantB) return variantA;
    return globalModality;
  };

  for (let i = 0; i < participatingPlayers.length; i++) {
    for (let j = i + 1; j < participatingPlayers.length; j++) {
      const playerA = participatingPlayers[i];
      const playerB = participatingPlayers[j];
      if (playerA.groupId && playerB.groupId && playerA.groupId !== playerB.groupId) continue;
      if (!shouldCalculatePair(config.skins, playerA.id, playerB.id)) continue;

      const pairModality = getEffectiveSkinsModality(playerA.id, playerB.id);
      const adjustedScores = getAdjustedScoresForPair(playerA, playerB, scores, course, bilateralHandicaps);

      if (pairModality === 'sinAcumular') {
        const calcNine = (
          pA: Player, pB: Player, adjScores: Map<string, PlayerScore[]>,
          start: number, end: number, value: number,
          betType: 'Skins Front' | 'Skins Back', segment: 'front' | 'back'
        ) => {
          if (value <= 0) return;
          let winsA = 0, winsB = 0;
          for (let holeNum = start; holeNum <= end; holeNum++) {
            const scoreA = getHoleScore(pA.id, holeNum, adjScores);
            const scoreB = getHoleScore(pB.id, holeNum, adjScores);
            if (scoreA === null || scoreB === null) continue;
            if (scoreA < scoreB) winsA += 1;
            else if (scoreB < scoreA) winsB += 1;
          }
          const net = winsA - winsB;
          if (net === 0) return;
          const perfectSweepA = winsA === 9 && winsB === 0;
          const perfectSweepB = winsB === 9 && winsA === 0;
          const multiplier = net > 0 ? (perfectSweepA ? 2 : 1) : (perfectSweepB ? 2 : 1);
          const amount = net * value * multiplier;
          const doubleLabel = multiplier === 2 ? ' (x2)' : '';
          summaries.push({ playerId: pA.id, vsPlayer: pB.id, betType, amount, segment, description: `${winsA} vs ${winsB} skins${doubleLabel} (sin acumular)` });
          summaries.push({ playerId: pB.id, vsPlayer: pA.id, betType, amount: -amount, segment, description: `${winsB} vs ${winsA} skins${doubleLabel} (sin acumular)` });
        };
        const sinAcumRanges = getSegmentHoleRanges(startingHole);
        calcNine(playerA, playerB, adjustedScores, sinAcumRanges.front[0], sinAcumRanges.front[1], config.skins.frontValue, 'Skins Front', 'front');
        calcNine(playerA, playerB, adjustedScores, sinAcumRanges.back[0], sinAcumRanges.back[1], config.skins.backValue, 'Skins Back', 'back');
        continue;
      }

      // Acumulados mode
      let frontSkinsABase = 0, frontSkinsBBase = 0, frontAccumulated = 0, frontCarryToBack = 0;
      let frontHolesWonByA = 0, frontHolesWonByB = 0;
      let frontHole9Tied = false, frontTiedHoles = 0;

      for (let holeNum = 1; holeNum <= 9; holeNum++) {
        const scoreA = getHoleScore(playerA.id, holeNum, adjustedScores);
        const scoreB = getHoleScore(playerB.id, holeNum, adjustedScores);
        if (scoreA === null || scoreB === null) { frontAccumulated++; continue; }
        frontAccumulated++;
        if (scoreA < scoreB) { frontSkinsABase += frontAccumulated; frontAccumulated = 0; frontHolesWonByA++; }
        else if (scoreB < scoreA) { frontSkinsBBase += frontAccumulated; frontAccumulated = 0; frontHolesWonByB++; }
        else { frontTiedHoles++; if (holeNum === 9) frontHole9Tied = true; }
      }

      if (config.skins.carryOver) { frontCarryToBack = frontAccumulated; frontAccumulated = 0; }

      let backSkinsA = 0, backSkinsB = 0, carriedSkinsWonByA = 0, carriedSkinsWonByB = 0;
      let backAccumulated = 0, pendingCarrySkins = frontCarryToBack;
      let backHolesWonByA = 0, backHolesWonByB = 0;
      let backHole18Tied = false, backTiedHoles = 0;

      for (let holeNum = 10; holeNum <= 18; holeNum++) {
        const scoreA = getHoleScore(playerA.id, holeNum, adjustedScores);
        const scoreB = getHoleScore(playerB.id, holeNum, adjustedScores);
        if (scoreA === null || scoreB === null) { backAccumulated++; continue; }
        backAccumulated++;
        if (scoreA < scoreB) {
          if (pendingCarrySkins > 0) { carriedSkinsWonByA += pendingCarrySkins; pendingCarrySkins = 0; }
          backSkinsA += backAccumulated; backAccumulated = 0; backHolesWonByA++;
        } else if (scoreB < scoreA) {
          if (pendingCarrySkins > 0) { carriedSkinsWonByB += pendingCarrySkins; pendingCarrySkins = 0; }
          backSkinsB += backAccumulated; backAccumulated = 0; backHolesWonByB++;
        } else { backTiedHoles++; if (holeNum === 18) backHole18Tied = true; }
      }

      const frontSkinsA = frontSkinsABase + carriedSkinsWonByA;
      const frontSkinsB = frontSkinsBBase + carriedSkinsWonByB;

      const skinsZapatoEnabled = config.skins.zapatoEnabled !== false;
      const hasZapatoFront = skinsZapatoEnabled && !frontHole9Tied &&
        ((frontSkinsA > 0 && frontSkinsB === 0) || (frontSkinsB > 0 && frontSkinsA === 0));
      const hasZapatoBack = skinsZapatoEnabled && !backHole18Tied &&
        ((backSkinsA > 0 && backSkinsB === 0) || (backSkinsB > 0 && backSkinsA === 0));

      const frontPerfectSweepA = frontHolesWonByA === 9 && frontHolesWonByB === 0;
      const frontPerfectSweepB = frontHolesWonByB === 9 && frontHolesWonByA === 0;
      const backPerfectSweepA = backHolesWonByA === 9 && backHolesWonByB === 0;
      const backPerfectSweepB = backHolesWonByB === 9 && backHolesWonByA === 0;

      const frontDoubleMultiplierA = (frontPerfectSweepA || hasZapatoFront) ? 2 : 1;
      const frontDoubleMultiplierB = (frontPerfectSweepB || hasZapatoFront) ? 2 : 1;
      const backDoubleMultiplierA = (backPerfectSweepA || hasZapatoBack) ? 2 : 1;
      const backDoubleMultiplierB = (backPerfectSweepB || hasZapatoBack) ? 2 : 1;

      const netSkinsFront = frontSkinsA - frontSkinsB;
      if (netSkinsFront !== 0 && config.skins.frontValue > 0) {
        const multiplier = netSkinsFront > 0 ? frontDoubleMultiplierA : frontDoubleMultiplierB;
        const frontAmount = netSkinsFront * config.skins.frontValue * multiplier;
        const shoeLabel = multiplier === 2 ? ' 🥾' : '';
        const doubleLabel = multiplier === 2 ? ` (x2)${shoeLabel}` : '';
        const hasCarried = carriedSkinsWonByA > 0 || carriedSkinsWonByB > 0;
        const descA = hasCarried
          ? `${frontSkinsA} vs ${frontSkinsB} skins${doubleLabel} (inc. ${frontCarryToBack} carry)`
          : `${frontSkinsA} vs ${frontSkinsB} skins${doubleLabel}`;
        const descB = hasCarried
          ? `${frontSkinsB} vs ${frontSkinsA} skins${doubleLabel} (inc. ${frontCarryToBack} carry)`
          : `${frontSkinsB} vs ${frontSkinsA} skins${doubleLabel}`;
        summaries.push({ playerId: playerA.id, vsPlayer: playerB.id, betType: 'Skins Front', amount: frontAmount, segment: 'front', description: descA, units: netSkinsFront, baseUnitAmount: config.skins.frontValue, multiplier });
        summaries.push({ playerId: playerB.id, vsPlayer: playerA.id, betType: 'Skins Front', amount: -frontAmount, segment: 'front', description: descB, units: -netSkinsFront, baseUnitAmount: config.skins.frontValue, multiplier });
      }

      const netPureBackSkins = backSkinsA - backSkinsB;
      if (netPureBackSkins !== 0 && config.skins.backValue > 0) {
        const pureBackMultiplier = netPureBackSkins > 0 ? backDoubleMultiplierA : backDoubleMultiplierB;
        const backAmount = netPureBackSkins * config.skins.backValue * pureBackMultiplier;
        const shoeLabel = pureBackMultiplier === 2 ? ' 🥾' : '';
        const doubleLabel = pureBackMultiplier === 2 ? ` (x2)${shoeLabel}` : '';
        summaries.push({ playerId: playerA.id, vsPlayer: playerB.id, betType: 'Skins Back', amount: backAmount, segment: 'back', description: `${backSkinsA} vs ${backSkinsB} skins${doubleLabel}`, units: netPureBackSkins, baseUnitAmount: config.skins.backValue, multiplier: pureBackMultiplier });
        summaries.push({ playerId: playerB.id, vsPlayer: playerA.id, betType: 'Skins Back', amount: -backAmount, segment: 'back', description: `${backSkinsB} vs ${backSkinsA} skins${doubleLabel}`, units: -netPureBackSkins, baseUnitAmount: config.skins.backValue, multiplier: pureBackMultiplier });
      }
    }
  }

  return summaries;
};
