/**
 * Sliding Calculations
 * 
 * Implements automatic sliding adjustments between logged-in players
 * based on Match Total results from Presiones (match play, not money).
 * 
 * Key rules:
 * - Only applies to logged-in players (not guests)
 * - Based on net match result (holes won), not money
 * - If Front main had carry (tie), NO sliding adjustment
 * - A wins Match Total → strokes_A_gives_B += 1
 * - B wins Match Total → strokes_A_gives_B -= 1
 * - Tie → no change
 */

import { Player, PlayerScore, GolfCourse, BetConfig, HoleInfo } from '@/types/golf';

export type MatchWinner = 'A' | 'B' | 'tie';

export interface SlidingResult {
  playerAProfileId: string;
  playerBProfileId: string;
  strokesUsed: number;
  frontMainWinner: MatchWinner;
  backMainWinner: MatchWinner;
  matchTotalWinner: MatchWinner;
  carryFrontMain: boolean;
  strokesNext: number;
}

interface HoleResult {
  holeNumber: number;
  netScoreA: number;
  netScoreB: number;
  winner: MatchWinner; // who won this hole
}

/**
 * Calculate which holes a player receives strokes on based on bilateral handicap
 * 
 * @param strokes - Number of strokes the player receives (positive) or gives (negative from their perspective)
 * @param holes - Course holes with stroke indices
 * @returns Map of hole number to strokes received on that hole
 */
function calculateStrokesPerHole(
  strokes: number,
  holes: HoleInfo[]
): Map<number, number> {
  const strokesMap = new Map<number, number>();
  
  // Initialize all holes with 0
  holes.forEach(h => strokesMap.set(h.number, 0));
  
  if (strokes === 0) return strokesMap;
  
  const absStrokes = Math.abs(strokes);
  const isReceiving = strokes > 0;
  
  // Sort holes by stroke index (handicapIndex)
  const sortedHoles = [...holes].sort((a, b) => a.handicapIndex - b.handicapIndex);
  
  // Distribute strokes
  let remainingStrokes = absStrokes;
  let round = 0;
  
  while (remainingStrokes > 0) {
    for (const hole of sortedHoles) {
      if (remainingStrokes <= 0) break;
      const current = strokesMap.get(hole.number) || 0;
      strokesMap.set(hole.number, isReceiving ? current + 1 : current - 1);
      remainingStrokes--;
    }
    round++;
    // Safety: max 3 rounds (54 strokes)
    if (round > 3) break;
  }
  
  return strokesMap;
}

/**
 * Calculate hole-by-hole match play results between two players
 */
function calculateHoleResults(
  scoresA: PlayerScore[],
  scoresB: PlayerScore[],
  strokesAGivesB: number,
  holes: HoleInfo[]
): HoleResult[] {
  const results: HoleResult[] = [];
  
  // B receives strokes if strokesAGivesB > 0
  // A receives strokes if strokesAGivesB < 0
  const strokesB = strokesAGivesB > 0 ? strokesAGivesB : 0;
  const strokesA = strokesAGivesB < 0 ? -strokesAGivesB : 0;
  
  const strokesMapA = calculateStrokesPerHole(strokesA, holes);
  const strokesMapB = calculateStrokesPerHole(strokesB, holes);
  
  for (let holeNum = 1; holeNum <= 18; holeNum++) {
    const scoreA = scoresA.find(s => s.holeNumber === holeNum);
    const scoreB = scoresB.find(s => s.holeNumber === holeNum);
    
    // Skip if either player has no score for this hole
    if (!scoreA?.strokes || !scoreB?.strokes) {
      continue;
    }
    
    const netA = scoreA.strokes - (strokesMapA.get(holeNum) || 0);
    const netB = scoreB.strokes - (strokesMapB.get(holeNum) || 0);
    
    let winner: MatchWinner = 'tie';
    if (netA < netB) winner = 'A';
    else if (netB < netA) winner = 'B';
    
    results.push({
      holeNumber: holeNum,
      netScoreA: netA,
      netScoreB: netB,
      winner,
    });
  }
  
  return results;
}

/**
 * Calculate winner of a segment (Front 1-9 or Back 10-18) by counting holes won
 */
function calculateSegmentWinner(
  holeResults: HoleResult[],
  startHole: number,
  endHole: number
): MatchWinner {
  const segmentResults = holeResults.filter(
    r => r.holeNumber >= startHole && r.holeNumber <= endHole
  );
  
  let holesWonA = 0;
  let holesWonB = 0;
  
  for (const result of segmentResults) {
    if (result.winner === 'A') holesWonA++;
    else if (result.winner === 'B') holesWonB++;
  }
  
  if (holesWonA > holesWonB) return 'A';
  if (holesWonB > holesWonA) return 'B';
  return 'tie';
}

/**
 * Calculate sliding results for all logged-in player pairs
 * 
 * @param players - All players in the round
 * @param scores - Map of player ID to their scores
 * @param betConfig - Bet configuration (to check if Presiones is active)
 * @param course - Golf course with hole data
 * @param getStrokesForPair - Function to get bilateral strokes
 */
export function calculateSlidingResults(
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  betConfig: BetConfig,
  course: GolfCourse,
  getStrokesForPair: (playerAId: string, playerBId: string) => number
): SlidingResult[] {
  const results: SlidingResult[] = [];
  
  // Check if Presiones is active
  const presionesEnabled = betConfig.pressures?.enabled === true;
  if (!presionesEnabled) {
    return results;
  }
  
  // Filter to only logged-in players (those with profileId)
  const loggedInPlayers = players.filter(p => p.profileId);
  
  // Process each unique pair
  for (let i = 0; i < loggedInPlayers.length; i++) {
    for (let j = i + 1; j < loggedInPlayers.length; j++) {
      const playerA = loggedInPlayers[i];
      const playerB = loggedInPlayers[j];
      
      // Ensure consistent ordering (smaller profileId first)
      const [orderedA, orderedB] = playerA.profileId! < playerB.profileId!
        ? [playerA, playerB]
        : [playerB, playerA];
      
      const scoresA = scores.get(orderedA.id) || [];
      const scoresB = scores.get(orderedB.id) || [];
      
      // Skip if not enough scores
      if (scoresA.length < 18 || scoresB.length < 18) {
        continue;
      }
      
      // Get bilateral strokes (A gives B)
      const strokesAGivesB = getStrokesForPair(orderedA.id, orderedB.id);
      
      // Calculate hole-by-hole results
      const holeResults = calculateHoleResults(
        scoresA,
        scoresB,
        strokesAGivesB,
        course.holes
      );
      
      // Calculate segment winners
      const frontMainWinner = calculateSegmentWinner(holeResults, 1, 9);
      const backMainWinner = calculateSegmentWinner(holeResults, 10, 18);
      const matchTotalWinner = calculateSegmentWinner(holeResults, 1, 18);
      
      // Carry in front main = front is tied
      const carryFrontMain = frontMainWinner === 'tie';
      
      // Calculate next strokes
      let strokesNext = strokesAGivesB;
      
      if (!carryFrontMain) {
        // Apply sliding adjustment based on Match Total winner
        if (matchTotalWinner === 'A') {
          strokesNext = strokesAGivesB + 1;
        } else if (matchTotalWinner === 'B') {
          strokesNext = strokesAGivesB - 1;
        }
        // If tie, no change
      }
      // If carryFrontMain, strokesNext stays the same
      
      results.push({
        playerAProfileId: orderedA.profileId!,
        playerBProfileId: orderedB.profileId!,
        strokesUsed: strokesAGivesB,
        frontMainWinner,
        backMainWinner,
        matchTotalWinner,
        carryFrontMain,
        strokesNext,
      });
    }
  }
  
  return results;
}

/**
 * Get descriptive text for sliding result
 */
export function getSlidingDescription(result: SlidingResult): string {
  const change = result.strokesNext - result.strokesUsed;
  
  if (result.carryFrontMain) {
    return 'Carry en Front → Sin ajuste';
  }
  
  if (change === 0) {
    return 'Empate Total → Sin ajuste';
  }
  
  if (change > 0) {
    return `A gana Total → +${change} golpe`;
  }
  
  return `B gana Total → ${change} golpe`;
}
