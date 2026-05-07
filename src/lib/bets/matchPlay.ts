/**
 * Match Play Bet Calculator
 * Individual bilateral match play — 18-hole continuo.
 * Resultado: X&Y (ej: 3&2, 4&3) o "1 UP" o "AS".
 * Se define cuando la ventaja supera los hoyos restantes,
 * o al terminar el hoyo 18 con el acumulado de hoyos ganados.
 */
import {
  Player, PlayerScore, BetConfig, GolfCourse, BilateralHandicap
} from '@/types/golf';
import { getSegmentHoleRanges } from '../handicapUtils';
import {
  BetSummary, groupPlayersByGroup,
  resolveParticipantsWithOneVsAll, shouldCalculatePair,
  getAdjustedScoresForPair, getHoleScore,
} from './shared';
import { resolveConfigForGroup, isBetEnabledAnywhere } from '../groupBetOverrides';

export const calculateMatchPlayBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  bilateralHandicaps?: BilateralHandicap[],
  startingHole: 1 | 10 = 1
): BetSummary[] => {
  if (!config.matchPlay?.enabled) return [];
  if ((config.roundHoles ?? 18) === 9) return [];
  if (!isBetEnabledAnywhere(config, 'matchPlay' as any)) return [];

  const playersByGroup = groupPlayersByGroup(players);
  const participatingPlayers = playersByGroup.flatMap(groupPlayers => {
    const groupId = groupPlayers[0]?.groupId;
    const resolved = resolveConfigForGroup(config, groupId);
    return resolveParticipantsWithOneVsAll(
      (resolved as any).matchPlay ?? config.matchPlay,
      players,
      config.matchPlay?.participantIds,
      groupPlayers
    );
  });

  const summaries: BetSummary[] = [];
  const ranges = getSegmentHoleRanges(startingHole);
  const allHoles = [
    ...Array.from({ length: 9 }, (_, i) => ranges.front[0] + i),
    ...Array.from({ length: 9 }, (_, i) => ranges.back[0] + i),
  ];

  for (let i = 0; i < participatingPlayers.length; i++) {
    for (let j = i + 1; j < participatingPlayers.length; j++) {
      const playerA = participatingPlayers[i];
      const playerB = participatingPlayers[j];
      if (
        playerA.groupId && playerB.groupId &&
        playerA.groupId !== playerB.groupId
      ) continue;

      if (!shouldCalculatePair(config.matchPlay, playerA.id, playerB.id))
        continue;

      const adjustedScores = getAdjustedScoresForPair(
        playerA, playerB, scores, course, bilateralHandicaps
      );

      // Per-pair amount override (set from BilateralDetail editor)
      const overrides = config.betOverrides;
      const overrideMatch = overrides?.find((o) => {
        const samePair =
          (o.playerAId === playerA.id && o.playerBId === playerB.id) ||
          (o.playerAId === playerB.id && o.playerBId === playerA.id);
        return samePair && o.betType?.toLowerCase() === 'match play';
      });
      const overrideAmount =
        typeof overrideMatch?.amountOverride === 'number' && Number.isFinite(overrideMatch.amountOverride)
          ? overrideMatch.amountOverride
          : undefined;
      const amount = overrideAmount ?? config.matchPlay?.amount ?? 50;

      // Hole-by-hole: track balance (positive = A leads)
      let balance = 0;
      let matchConcluded = false;
      let holesPlayed = 0;
      let concludedBalance = 0;
      let concludedRemaining = 0;

      for (let h = 0; h < allHoles.length; h++) {
        const holeNum = allHoles[h];
        const scoreA = getHoleScore(playerA.id, holeNum, adjustedScores);
        const scoreB = getHoleScore(playerB.id, holeNum, adjustedScores);
        if (scoreA === null || scoreB === null) continue;

        holesPlayed++;
        if (scoreA < scoreB) balance++;
        else if (scoreB < scoreA) balance--;

        const holesRemaining = allHoles.length - (h + 1);
        // Early win: margin > remaining holes
        if (Math.abs(balance) > holesRemaining) {
          matchConcluded = true;
          concludedBalance = balance;
          concludedRemaining = holesRemaining;
          break;
        }
      }

      // Build result description
      let descA: string;
      let descB: string;

      const finalBalance = matchConcluded ? concludedBalance : balance;
      const remaining = matchConcluded ? concludedRemaining : 0;

      if (holesPlayed === 0) {
        descA = '—';
        descB = '—';
      } else if (finalBalance === 0) {
        descA = 'AS';
        descB = 'AS';
      } else if (matchConcluded && remaining > 0) {
        const lead = Math.abs(finalBalance);
        descA = `${lead}&${remaining}`;
        descB = descA;
      } else if (holesPlayed === 18 && !matchConcluded) {
        const lead = Math.abs(finalBalance);
        if (lead === 0) {
          descA = 'AS';
          descB = 'AS';
        } else {
          descA = finalBalance > 0 ? `${lead} UP` : `${lead} DN`;
          descB = finalBalance < 0 ? `${lead} UP` : `${lead} DN`;
        }
      } else {
        // In progress
        const lead = Math.abs(finalBalance);
        descA = finalBalance > 0 ? `${lead} UP` : `${lead} DN`;
        descB = finalBalance < 0 ? `${lead} UP` : `${lead} DN`;
      }

      const matchWinner = finalBalance > 0 ? 1 : finalBalance < 0 ? -1 : 0;
      const amountA = matchWinner * amount;

      summaries.push({
        playerId: playerA.id,
        vsPlayer: playerB.id,
        betType: 'Match Play',
        amount: amountA,
        segment: 'total',
        description: descA,
        units: matchWinner,
        baseUnitAmount: amount,
        multiplier: 1,
      });
      summaries.push({
        playerId: playerB.id,
        vsPlayer: playerA.id,
        betType: 'Match Play',
        amount: -amountA,
        segment: 'total',
        description: descB,
        units: -matchWinner,
        baseUnitAmount: amount,
        multiplier: 1,
      });
    }
  }

  return summaries;
};
