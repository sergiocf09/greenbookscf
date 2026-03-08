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
}

export interface PressureEvolution {
  segment: 'front' | 'back';
  holes: PressureHoleState[];
  finalDisplay: string;
  hasCarry: boolean;
}

export const getPressureEvolution = (
  playerA: Player,
  playerB: Player,
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse,
  config: BetConfig,
  bilateralHandicaps?: BilateralHandicap[],
  startingHole: 1 | 10 = 1
): { front: PressureEvolution; back: PressureEvolution } => {
  const onlyMatch = config.pressures.onlyMatch === true;
  const ranges = getSegmentHoleRanges(startingHole);
  const frontHoles = Array.from({ length: 9 }, (_, i) => ranges.front[0] + i);
  const backHoles = Array.from({ length: 9 }, (_, i) => ranges.back[0] + i);
  
  const adjustedScores = getAdjustedScoresForPair(playerA, playerB, scores, course, bilateralHandicaps);
  
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
  
  return { front: processNine(frontHoles, 'front'), back: processNine(backHoles, 'back') };
};
