/**
 * Pressures Bet Calculator — cascading bilateral pressure system
 */
import { Player, PlayerScore, BetConfig, GolfCourse, BilateralHandicap } from '@/types/golf';
import { getSegmentHoleRanges } from '../handicapUtils';
import { resolveConfigForGroup } from '../groupBetOverrides';
import {
  BetSummary, groupPlayersByGroup, resolveParticipantsWithOneVsAll,
  shouldCalculatePair, getAdjustedScoresForPair, getHoleScore,
} from './shared';

export { type PressureHoleState, type PressureEvolution, getPressureEvolution } from './pressureEvolution';

export const calculatePressureBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  bilateralHandicaps?: BilateralHandicap[],
  startingHole: 1 | 10 = 1
): BetSummary[] => {
  if (!config.pressures.enabled) return [];

  const getPairOnlyMatch = (pA: string, pB: string): boolean => {
    const pairKey = [pA, pB].sort().join('_');
    const pairOverride = config.pressurePairOverrides?.[pairKey];
    return pairOverride?.onlyMatch !== undefined
      ? pairOverride.onlyMatch
      : config.pressures.onlyMatch === true;
  };
  
  const playersByGroup = groupPlayersByGroup(players);
  const participatingPlayers = playersByGroup.flatMap(groupPlayers => {
    const groupId = groupPlayers[0]?.groupId;
    const resolved = resolveConfigForGroup(config, groupId);
    return resolveParticipantsWithOneVsAll(config.pressures, players, resolved.pressures.participantIds, groupPlayers);
  });
  
  const summaries: BetSummary[] = [];
  const ranges = getSegmentHoleRanges(startingHole);
  const frontHoles = Array.from({ length: 9 }, (_, i) => ranges.front[0] + i);
  const backHoles = Array.from({ length: 9 }, (_, i) => ranges.back[0] + i);
  const totalMatchAmount = config.pressures.totalAmount;

  const resolveOverrideId = (pid: string): string => {
    const direct = participatingPlayers.find((p) => p.id === pid);
    if (direct) return direct.id;
    const byProfile = participatingPlayers.find((p) => p.profileId === pid);
    return byProfile?.id ?? pid;
  };

  const getPairOverrideAmount = (playerAId: string, playerBId: string, label: string): number | undefined => {
    const overrides = config.betOverrides;
    if (!overrides || overrides.length === 0) return undefined;
    const match = overrides.find((o) => {
      const aId = resolveOverrideId(o.playerAId);
      const bId = resolveOverrideId(o.playerBId);
      const matchesPair = (aId === playerAId && bId === playerBId) || (aId === playerBId && bId === playerAId);
      if (!matchesPair) return false;
      if (o.enabled === false) return false;
      return (o.betType ?? '').toLowerCase() === label.toLowerCase();
    });
    if (!match) return undefined;
    return typeof match.amountOverride === 'number' && Number.isFinite(match.amountOverride) ? match.amountOverride : undefined;
  };
  
  for (let i = 0; i < participatingPlayers.length; i++) {
    for (let j = i + 1; j < participatingPlayers.length; j++) {
      const playerA = participatingPlayers[i];
      const playerB = participatingPlayers[j];
      if (playerA.groupId && playerB.groupId && playerA.groupId !== playerB.groupId) continue;
      if (!shouldCalculatePair(config.pressures, playerA.id, playerB.id)) continue;
      
      const adjustedScores = getAdjustedScoresForPair(playerA, playerB, scores, course, bilateralHandicaps);
      const onlyMatch = getPairOnlyMatch(playerA.id, playerB.id);

      const processNine = (holes: number[]): number[] => {
        let bets: number[] = [0];
        let lastBetCanTrigger = true;
        holes.forEach((holeNum, holeIndex) => {
          const scoreA = getHoleScore(playerA.id, holeNum, adjustedScores);
          const scoreB = getHoleScore(playerB.id, holeNum, adjustedScores);
          if (scoreA === null || scoreB === null) return;
          let holeResult = 0;
          if (scoreA < scoreB) holeResult = 1;
          else if (scoreB < scoreA) holeResult = -1;
          bets = bets.map(bal => bal + holeResult);
          const isLastHole = holeIndex === holes.length - 1;
          if (!onlyMatch && !isLastHole && lastBetCanTrigger) {
            const lastBetBalance = bets[bets.length - 1];
            if (Math.abs(lastBetBalance) >= 2) bets.push(0);
          }
        });
        return bets;
      };
      
      const frontBets = processNine(frontHoles);
      const backBets = processNine(backHoles);
      const frontIsTied = frontBets[0] === 0;

      const frontUnit = getPairOverrideAmount(playerA.id, playerB.id, 'Presiones Front') ?? config.pressures.frontAmount;
      const match18Unit = getPairOverrideAmount(playerA.id, playerB.id, 'Presiones Match 18') ?? totalMatchAmount;
      const backUnit = getPairOverrideAmount(playerA.id, playerB.id, 'Presiones Back') ?? config.pressures.backAmount;
      
      const frontBetsWonA = frontBets.filter(b => b > 0).length;
      const frontBetsLostA = frontBets.filter(b => b < 0).length;
      const frontNetBets = frontBetsWonA - frontBetsLostA;
      const frontAmountA = frontNetBets * frontUnit;
      
      const formatPressureResult = (bets: number[]): string => {
        if (bets.length === 1 && bets[0] === 0) return 'Even';
        return bets.map(b => (b > 0 ? '+' : '') + b).join(' ');
      };
      
      const frontBaseStr = formatPressureResult(frontBets);
      const frontDisplayStr = frontIsTied ? `${frontBaseStr} (Carry)` : frontBaseStr;
      const frontInvertedBets = frontBets.map(b => -b);
      const frontBaseStrB = formatPressureResult(frontInvertedBets);
      const frontDisplayStrB = frontIsTied ? `${frontBaseStrB} (Carry)` : frontBaseStrB;
      
      if (frontAmountA !== 0 || frontBets.length > 0) {
        summaries.push({ playerId: playerA.id, vsPlayer: playerB.id, betType: 'Presiones Front', amount: frontAmountA, segment: 'front', description: frontDisplayStr, units: frontNetBets, baseUnitAmount: frontUnit, multiplier: 1 });
        summaries.push({ playerId: playerB.id, vsPlayer: playerA.id, betType: 'Presiones Front', amount: -frontAmountA, segment: 'front', description: frontDisplayStrB, units: -frontNetBets, baseUnitAmount: frontUnit, multiplier: 1 });
      }
      
      const effectiveBackValue = frontIsTied ? (2 * frontUnit + match18Unit) : backUnit;
      const backBetsWonA = backBets.filter(b => b > 0).length;
      const backBetsLostA = backBets.filter(b => b < 0).length;
      const backNetBets = backBetsWonA - backBetsLostA;
      const backAmountA = backNetBets * effectiveBackValue;
      const backLabel = frontIsTied ? 'Presiones Back (Carry x2+Match)' : 'Presiones Back';
      const backDisplayStr = formatPressureResult(backBets);
      const backInvertedBets = backBets.map(b => -b);
      const backDisplayStrB = formatPressureResult(backInvertedBets);
      
      if (backAmountA !== 0 || backBets.length > 0) {
        summaries.push({ playerId: playerA.id, vsPlayer: playerB.id, betType: backLabel, amount: backAmountA, segment: 'back', description: backDisplayStr, units: backNetBets, baseUnitAmount: effectiveBackValue, multiplier: 1 });
        summaries.push({ playerId: playerB.id, vsPlayer: playerA.id, betType: backLabel, amount: -backAmountA, segment: 'back', description: backDisplayStrB, units: -backNetBets, baseUnitAmount: effectiveBackValue, multiplier: 1 });
      }
      
      if (!frontIsTied && totalMatchAmount > 0) {
        const total18Balance = frontBets[0] + backBets[0];
        let matchWinner = 0;
        if (total18Balance > 0) matchWinner = 1;
        else if (total18Balance < 0) matchWinner = -1;
        const totalAmountA = matchWinner * match18Unit;
        const total18Str = total18Balance === 0 ? 'Even' : ((total18Balance >= 0 ? '+' : '') + total18Balance);
        const total18StrB = (-total18Balance) === 0 ? 'Even' : (((-total18Balance) >= 0 ? '+' : '') + (-total18Balance));
        
        if (matchWinner !== 0) {
          summaries.push({ playerId: playerA.id, vsPlayer: playerB.id, betType: 'Presiones Match 18', amount: totalAmountA, segment: 'total', description: total18Str, units: matchWinner, baseUnitAmount: match18Unit, multiplier: 1 });
          summaries.push({ playerId: playerB.id, vsPlayer: playerA.id, betType: 'Presiones Match 18', amount: -totalAmountA, segment: 'total', description: total18StrB, units: -matchWinner, baseUnitAmount: match18Unit, multiplier: 1 });
        } else {
          summaries.push({ playerId: playerA.id, vsPlayer: playerB.id, betType: 'Presiones Match 18', amount: 0, segment: 'total', description: 'Even' });
          summaries.push({ playerId: playerB.id, vsPlayer: playerA.id, betType: 'Presiones Match 18', amount: 0, segment: 'total', description: 'Even' });
        }
      } else if (frontIsTied && totalMatchAmount > 0) {
        summaries.push({ playerId: playerA.id, vsPlayer: playerB.id, betType: 'Presiones Match 18', amount: 0, segment: 'total', description: 'Carry' });
        summaries.push({ playerId: playerB.id, vsPlayer: playerA.id, betType: 'Presiones Match 18', amount: 0, segment: 'total', description: 'Carry' });
      }
    }
  }
  
  return summaries;
};
