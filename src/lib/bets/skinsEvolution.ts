/**
 * Skins Evolution — hole-by-hole tooltip data for the dashboard
 */
import { Player, PlayerScore, BetConfig, GolfCourse, BilateralHandicap } from '@/types/golf';
import { getSegmentHoleRanges } from '../handicapUtils';
import { getAdjustedScoresForPair, getHoleScore } from './shared';

export interface SkinsHoleState {
  holeNumber: number;
  accumulated: number;
  winner: 'A' | 'B' | null;
  skinsWon: number;
  display: string;
}

export interface SkinsEvolution {
  segment: 'front' | 'back';
  holes: SkinsHoleState[];
  totalSkinsA: number;
  totalSkinsB: number;
  hasZapato: boolean;
}

export const getSkinsEvolution = (
  playerA: Player,
  playerB: Player,
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse,
  config: BetConfig,
  bilateralHandicaps?: BilateralHandicap[],
  startingHole: 1 | 10 = 1
): { front: SkinsEvolution; back: SkinsEvolution } => {
  const ranges = getSegmentHoleRanges(startingHole);
  const frontHoles = Array.from({ length: 9 }, (_, i) => ranges.front[0] + i);
  const backHoles = Array.from({ length: 9 }, (_, i) => ranges.back[0] + i);
  
  const adjustedScores = getAdjustedScoresForPair(playerA, playerB, scores, course, bilateralHandicaps);
  const isAccumulated = (config.skins.modality ?? 'acumulados') === 'acumulados';
  
  const processNine = (holes: number[], segment: 'front' | 'back'): SkinsEvolution => {
    const states: SkinsHoleState[] = [];
    let accumulated = 0;
    let totalSkinsA = 0;
    let totalSkinsB = 0;
    let holesWonByA = 0;
    let holesWonByB = 0;
    let tiedHoles = 0;
    
    holes.forEach(holeNum => {
      const scoreA = getHoleScore(playerA.id, holeNum, adjustedScores);
      const scoreB = getHoleScore(playerB.id, holeNum, adjustedScores);
      
      if (scoreA === null || scoreB === null) {
        if (isAccumulated) accumulated++;
        states.push({ holeNumber: holeNum, accumulated, winner: null, skinsWon: 0, display: '-' });
        return;
      }
      
      if (isAccumulated) accumulated++;
      
      let winner: 'A' | 'B' | null = null;
      let skinsWon = 0;
      let display = '•';
      
      if (scoreA < scoreB) {
        winner = 'A'; skinsWon = isAccumulated ? accumulated : 1; totalSkinsA += skinsWon; holesWonByA++; display = '+' + skinsWon;
        if (isAccumulated) accumulated = 0;
      } else if (scoreB < scoreA) {
        winner = 'B'; skinsWon = isAccumulated ? accumulated : 1; totalSkinsB += skinsWon; holesWonByB++; display = '-' + skinsWon;
        if (isAccumulated) accumulated = 0;
      } else {
        tiedHoles++;
      }
      
      states.push({ holeNumber: holeNum, accumulated: isAccumulated ? accumulated : 0, winner, skinsWon, display });
    });
    
    const hasZapato = tiedHoles === 0 && ((holesWonByA > 0 && holesWonByB === 0) || (holesWonByB > 0 && holesWonByA === 0));
    
    return { segment, holes: states, totalSkinsA, totalSkinsB, hasZapato };
  };
  
  return { front: processNine(frontHoles, 'front'), back: processNine(backHoles, 'back') };
};
