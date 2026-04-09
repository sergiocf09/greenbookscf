/**
 * Pressure Evolution — hole-by-hole tooltip data for the dashboard
 */
import { Player, PlayerScore, BetConfig, GolfCourse, BilateralHandicap } from '@/types/golf';
import { getSegmentHoleRanges } from '../handicapUtils';
import { getAdjustedScoresForPair, getHoleScore } from './shared';

export interface PressureHoleState {
  holeNumber: number;
  bets: number[];
  display: string;
  /** For continua mode: true if this hole is after match concluded */
  inactive?: boolean;
}

export interface PressureEvolution {
  segment: 'front' | 'back' | 'total';
  holes: PressureHoleState[];
  finalDisplay: string;
  hasCarry: boolean;
  /** For continua mode: match concluded with "X & Y" format */
  matchResult?: string;
  matchOver?: boolean;
}

export const getPressureEvolution = (
  playerA: Player,
  playerB: Player,
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse,
  config: BetConfig,
  bilateralHandicaps?: BilateralHandicap[],
  startingHole: 1 | 10 = 1
): { front: PressureEvolution; back: PressureEvolution; total: PressureEvolution } => {
  // Resolve per-pair onlyMatch override
  const pairKey = [playerA.id, playerB.id].sort().join('_');
  const pairOverride = config.pressurePairOverrides?.[pairKey];
  const onlyMatch = pairOverride?.onlyMatch !== undefined
    ? pairOverride.onlyMatch
    : config.pressures.onlyMatch === true;
  const isContinua = onlyMatch && config.pressures.continua === true;

  const ranges = getSegmentHoleRanges(startingHole);
  const frontHoles = Array.from({ length: 9 }, (_, i) => ranges.front[0] + i);
  const backHoles = Array.from({ length: 9 }, (_, i) => ranges.back[0] + i);
  
  const adjustedScores = getAdjustedScoresForPair(playerA, playerB, scores, course, bilateralHandicaps);

  // Continua mode: single 18-hole cumulative match with match-play notation
  if (isContinua) {
    const allHoles = [...frontHoles, ...backHoles];
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
        const display = isAfterMatch ? '–' : cumBal === 0 ? 'E' : cumBal > 0 ? `${cumBal}Up` : `${Math.abs(cumBal)}Dn`;
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
        : cumBal === 0 ? 'E' : cumBal > 0 ? `${cumBal}Up` : `${Math.abs(cumBal)}Dn`;
      states.push({ holeNumber: holeNum, bets: [cumBal], display, inactive: false });
    }

    // Check if all 18 scored with no early win
    const allScored = states.every(s => !s.inactive && s.display !== '–' && s.bets.length > 0);
    const matchOver = matchConcludedAt >= 0;
    let finalDisplay: string;
    if (matchOver) {
      finalDisplay = `🏁 ${matchResult}`;
    } else if (allScored && states.length === 18) {
      finalDisplay = cumBal === 0 ? 'E' : `${Math.abs(cumBal)} Up`;
    } else {
      finalDisplay = cumBal === 0 ? 'E' : cumBal > 0 ? `${cumBal} Up` : `${Math.abs(cumBal)} Dn`;
    }

    // Split into front/back for display grid rows
    const frontStates = states.slice(0, 9);
    const backStates = states.slice(9, 18);

    const front: PressureEvolution = {
      segment: 'front',
      holes: frontStates,
      finalDisplay: '',
      hasCarry: false,
    };
    const back: PressureEvolution = {
      segment: 'back',
      holes: backStates,
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
  }

  // Standard mode (F9/B9 independent)
  const processNine = (holes: number[], segment: 'front' | 'back'): PressureEvolution => {
    const states: PressureHoleState[] = [];
    let bets: number[] = [0];
    
    holes.forEach((holeNum, holeIndex) => {
      const scoreA = getHoleScore(playerA.id, holeNum, adjustedScores);
      const scoreB = getHoleScore(playerB.id, holeNum, adjustedScores);
      
      if (scoreA === null || scoreB === null) {
        states.push({ holeNumber: holeNum, bets: [...bets], display: bets.map(b => b === 0 ? 'E' : (b > 0 ? '+' : '') + b).join(' ') });
        return;
      }
      
      let holeResult = 0;
      if (scoreA < scoreB) holeResult = 1;
      else if (scoreB < scoreA) holeResult = -1;
      
      bets = bets.map(bal => bal + holeResult);
      
      const isLastHole = holeIndex === holes.length - 1;
      if (!onlyMatch && !isLastHole) {
        const lastBetBalance = bets[bets.length - 1];
        if (Math.abs(lastBetBalance) >= 2) bets.push(0);
      }
      
      const display = bets.map(b => b === 0 ? 'E' : (b > 0 ? '+' : '') + b).join(' ');
      states.push({ holeNumber: holeNum, bets: [...bets], display });
    });
    
    const finalBets = states.length > 0 ? states[states.length - 1].bets : [0];
    const hasCarry = segment === 'front' && finalBets[0] === 0;
    const showEven = finalBets.length === 1 && finalBets[0] === 0;
    const finalDisplay = showEven ? 'Even' : finalBets.map(b => (b > 0 ? '+' : '') + b).join(' ');
    
    return { segment, holes: states, finalDisplay, hasCarry };
  };
  
  const front = processNine(frontHoles, 'front');
  const back = processNine(backHoles, 'back');

  // Compute Total 18 evolution (running cumulative across all 18 holes using main bet only)
  const frontMainBalance = front.holes.length > 0 ? front.holes[front.holes.length - 1].bets[0] : 0;
  const backMainBalance = back.holes.length > 0 ? back.holes[back.holes.length - 1].bets[0] : 0;
  const total18Balance = frontMainBalance + backMainBalance;
  const frontIsTied = frontMainBalance === 0;

  let totalDisplay: string;
  if (frontIsTied) {
    totalDisplay = 'Carry';
  } else if (total18Balance === 0) {
    totalDisplay = 'Even';
  } else {
    totalDisplay = (total18Balance > 0 ? '+' : '') + total18Balance;
  }

  const total: PressureEvolution = {
    segment: 'total',
    holes: [],
    finalDisplay: totalDisplay,
    hasCarry: frontIsTied,
  };

  return { front, back, total };
};
