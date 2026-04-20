/**
 * Match Play Evolution — hole-by-hole tooltip data for the dashboard.
 * Match Play is an INDEPENDENT bilateral bet (separate from Pressures).
 * Logic is identical to "Presiones · Match Play 18 (continua)":
 * cumulative balance hole-by-hole, with early-win when |balance| > remaining.
 */
import { Player, PlayerScore, BetConfig, GolfCourse, BilateralHandicap } from '@/types/golf';
import { getSegmentHoleRanges } from '../handicapUtils';
import { getAdjustedScoresForPair, getHoleScore } from './shared';
import { PressureHoleState, PressureEvolution } from './pressureEvolution';

export const getMatchPlayEvolution = (
  playerA: Player,
  playerB: Player,
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse,
  config: BetConfig,
  bilateralHandicaps?: BilateralHandicap[],
  startingHole: 1 | 10 = 1
): { front: PressureEvolution; back: PressureEvolution; total: PressureEvolution } => {
  const ranges = getSegmentHoleRanges(startingHole);
  const frontHoles = Array.from({ length: 9 }, (_, i) => ranges.front[0] + i);
  const backHoles = Array.from({ length: 9 }, (_, i) => ranges.back[0] + i);
  const allHoles = [...frontHoles, ...backHoles];

  const adjustedScores = getAdjustedScoresForPair(playerA, playerB, scores, course, bilateralHandicaps);

  const states: PressureHoleState[] = [];
  let cumBal = 0;
  let matchConcludedAt = -1;
  let matchResult = '';

  for (let i = 0; i < allHoles.length; i++) {
    const holeNum = allHoles[i];
    const scoreA = getHoleScore(playerA.id, holeNum, adjustedScores);
    const scoreB = getHoleScore(playerB.id, holeNum, adjustedScores);
    const isAfterMatch = matchConcludedAt >= 0;

    if (scoreA === null || scoreB === null || isAfterMatch) {
      const display = isAfterMatch ? '–' : cumBal === 0 ? 'AS' : cumBal > 0 ? `${cumBal}Up` : `${Math.abs(cumBal)}Dn`;
      states.push({ holeNumber: holeNum, bets: [cumBal], display, inactive: isAfterMatch });
      continue;
    }

    let holeResult = 0;
    if (scoreA < scoreB) holeResult = 1;
    else if (scoreB < scoreA) holeResult = -1;
    cumBal += holeResult;

    const remaining = allHoles.length - (i + 1);
    if (Math.abs(cumBal) > remaining && remaining > 0) {
      matchConcludedAt = i;
      matchResult = `${Math.abs(cumBal)} & ${remaining}`;
    }

    const display = matchConcludedAt === i
      ? matchResult
      : cumBal === 0 ? 'AS' : cumBal > 0 ? `${cumBal}Up` : `${Math.abs(cumBal)}Dn`;
    states.push({ holeNumber: holeNum, bets: [cumBal], display, inactive: false });
  }

  const allScored = states.every(s => !s.inactive && s.display !== '–' && s.bets.length > 0);
  const matchOver = matchConcludedAt >= 0;
  let finalDisplay: string;
  if (matchOver) {
    finalDisplay = `🏁 ${matchResult}`;
  } else if (allScored && states.length === 18) {
    finalDisplay = cumBal === 0 ? 'AS' : cumBal > 0 ? `${cumBal} Up` : `${Math.abs(cumBal)} Dn`;
  } else {
    finalDisplay = cumBal === 0 ? 'AS' : cumBal > 0 ? `${cumBal} Up` : `${Math.abs(cumBal)} Dn`;
  }

  const front: PressureEvolution = {
    segment: 'front',
    holes: states.slice(0, 9),
    finalDisplay: '',
    hasCarry: false,
  };
  const back: PressureEvolution = {
    segment: 'back',
    holes: states.slice(9, 18),
    finalDisplay: '',
    hasCarry: false,
  };
  const total: PressureEvolution = {
    segment: 'total',
    holes: states,
    finalDisplay,
    hasCarry: false,
    matchResult: matchOver ? matchResult : undefined,
    matchOver,
  };

  return { front, back, total };
};
