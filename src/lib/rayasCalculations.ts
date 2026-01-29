/**
 * Rayas Calculations Engine
 * 
 * Rayas is an aggregator bet that counts events from other bets:
 * - Skins: 1 raya per hole won (with or without accumulation)
 * - Units: 1 raya per positive unit (birdie, eagle, albatross, sandyPar, aquaPar, holeOut)
 * - Oyes: The ABSOLUTE closest player wins rayas vs ALL others (non-hierarchical)
 * - Medal: 1 raya for winning Front, 1 for Back, 1 additional for Medal Total
 * 
 * Key rules:
 * - Rayas are always positive, bilateral
 * - Oyes accumulated from Front pay at Front rate when resolved in Back
 * - Skins accumulated from Front pay at Front rate when resolved in Back
 */

import { Player, PlayerScore, BetConfig, GolfCourse, BilateralHandicap } from '@/types/golf';
import { BetSummary, getBilateralHandicapForPair, getAdjustedScoresForPair } from './betCalculations';
import { calculateStrokesPerHole } from './handicapUtils';

// Detailed raya tracking for audit
export interface RayaDetail {
  source: 'skins' | 'units' | 'oyes' | 'medal';
  segment: 'front' | 'back' | 'total';
  holeNumber?: number;
  description: string;
  rayasCount: number;
  valuePerRaya: number;
  appliedSegment: 'front' | 'back' | 'total'; // Which segment's value is used (for carried items)
}

export interface RayasPairResult {
  playerAId: string;
  playerBId: string;
  frontRayasA: number;
  frontRayasB: number;
  backRayasA: number;
  backRayasB: number;
  medalTotalRayaWinner: string | null; // Who won the medal total raya
  frontAmountA: number; // Net amount for front (positive = A wins)
  backAmountA: number;
  medalTotalAmountA: number;
  totalAmountA: number;
  details: RayaDetail[];
}

/**
 * Get net score for a hole with bilateral handicap consideration
 */
const getHoleNetScore = (
  playerId: string,
  holeNumber: number,
  scores: Map<string, PlayerScore[]>
): number | null => {
  const playerScores = scores.get(playerId) || [];
  const score = playerScores.find(s => s.holeNumber === holeNumber);
  if (!score || !score.strokes) return null;
  return score.netScore ?? score.strokes;
};

/**
 * Count positive units for a player (only icon-based: birdie, eagle, albatross, sandyPar, aquaPar, holeOut)
 */
const countPositiveUnits = (
  playerId: string,
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse,
  segment: 'front' | 'back' | 'total'
): number => {
  const playerScores = scores.get(playerId) || [];
  const holeRange = segment === 'front' ? [1, 9] : segment === 'back' ? [10, 18] : [1, 18];
  
  let units = 0;
  playerScores
    .filter(s => s.holeNumber >= holeRange[0] && s.holeNumber <= holeRange[1])
    .forEach(score => {
      const holePar = course.holes[score.holeNumber - 1]?.par || 4;
      const toPar = score.strokes - holePar;
      
      // Score-based units
      if (toPar === -1) units += 1; // Birdie
      if (toPar === -2) units += 2; // Eagle
      if (toPar <= -3) units += 3; // Albatross
      
      // Marker-based units
      if (score.markers.sandyPar) units += 1;
      if (score.markers.aquaPar) units += 1;
      if (score.markers.holeOut) units += 1;
    });
  
  return units;
};

/**
 * Get segment net total for medal comparison
 */
const getSegmentNetTotal = (
  playerId: string,
  scores: Map<string, PlayerScore[]>,
  segment: 'front' | 'back' | 'total'
): number => {
  const playerScores = scores.get(playerId) || [];
  const holeRange = segment === 'front' ? [1, 9] : segment === 'back' ? [10, 18] : [1, 18];
  
  return playerScores
    // Rayas must respect confirmation rules (only confirmed holes count)
    .filter(s => s.confirmed && s.holeNumber >= holeRange[0] && s.holeNumber <= holeRange[1])
    // Avoid treating missing strokes/net as 0 (that can incorrectly create ties/wins)
    .reduce((sum, s) => {
      const v = (typeof s.netScore === 'number' ? s.netScore : (typeof s.strokes === 'number' ? s.strokes : null));
      return v === null ? sum : sum + v;
    }, 0);
};

/**
 * Find Par 3 holes
 */
const getPar3Holes = (course: GolfCourse): number[] => {
  return course.holes
    .filter(h => h.par === 3)
    .map(h => h.number);
};

/**
 * Calculate Rayas between a pair of players
 */
const calculateRayasForPair = (
  playerA: Player,
  playerB: Player,
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  bilateralHandicaps?: BilateralHandicap[]
): RayasPairResult => {
  const details: RayaDetail[] = [];
  
  // Get adjusted scores for this pair based on bilateral handicap overrides
  const adjustedScores = getAdjustedScoresForPair(playerA, playerB, scores, course, bilateralHandicaps);
  
  let frontRayasA = 0;
  let frontRayasB = 0;
  let backRayasA = 0;
  let backRayasB = 0;
  
  const frontValue = config.rayas.frontValue;
  const backValue = config.rayas.backValue;
  const medalTotalValue = config.rayas.medalTotalValue;
  const useAccumulation = config.rayas.skinVariant === 'acumulados';
  
  // =========== 1. SKINS RAYAS ===========
  // Front 9 skins
  let frontAccumulated = 0;
  for (let holeNum = 1; holeNum <= 9; holeNum++) {
    const netA = getHoleNetScore(playerA.id, holeNum, adjustedScores);
    const netB = getHoleNetScore(playerB.id, holeNum, adjustedScores);
    
    if (netA === null || netB === null) {
      if (useAccumulation) frontAccumulated++;
      continue;
    }
    
    if (useAccumulation) frontAccumulated++;
    
    if (netA < netB) {
      const rayasWon = useAccumulation ? frontAccumulated : 1;
      frontRayasA += rayasWon;
      details.push({
        source: 'skins',
        segment: 'front',
        holeNumber: holeNum,
        description: `Skin H${holeNum}${rayasWon > 1 ? ` (+${rayasWon - 1} acum)` : ''}`,
        rayasCount: rayasWon,
        valuePerRaya: frontValue,
        appliedSegment: 'front',
      });
      if (useAccumulation) frontAccumulated = 0;
    } else if (netB < netA) {
      const rayasWon = useAccumulation ? frontAccumulated : 1;
      frontRayasB += rayasWon;
      details.push({
        source: 'skins',
        segment: 'front',
        holeNumber: holeNum,
        description: `Skin H${holeNum}${rayasWon > 1 ? ` (+${rayasWon - 1} acum)` : ''}`,
        rayasCount: -rayasWon, // Negative indicates B won
        valuePerRaya: frontValue,
        appliedSegment: 'front',
      });
      if (useAccumulation) frontAccumulated = 0;
    }
    // Tie = accumulate if enabled
  }
  
  // Back 9 skins with potential carry from front
  let backAccumulated = 0;
  let pendingFrontCarry = useAccumulation ? frontAccumulated : 0;
  
  for (let holeNum = 10; holeNum <= 18; holeNum++) {
    const netA = getHoleNetScore(playerA.id, holeNum, adjustedScores);
    const netB = getHoleNetScore(playerB.id, holeNum, adjustedScores);
    
    if (netA === null || netB === null) {
      if (useAccumulation) backAccumulated++;
      continue;
    }
    
    if (useAccumulation) backAccumulated++;
    
    if (netA < netB) {
      // A wins this hole
      // Back rayas
      const backRayasWon = useAccumulation ? backAccumulated : 1;
      backRayasA += backRayasWon;
      details.push({
        source: 'skins',
        segment: 'back',
        holeNumber: holeNum,
        description: `Skin H${holeNum}${backRayasWon > 1 ? ` (+${backRayasWon - 1} acum)` : ''}`,
        rayasCount: backRayasWon,
        valuePerRaya: backValue,
        appliedSegment: 'back',
      });
      if (useAccumulation) backAccumulated = 0;
      
      // Carried front rayas (pay at front value)
      if (pendingFrontCarry > 0) {
        frontRayasA += pendingFrontCarry;
        details.push({
          source: 'skins',
          segment: 'front',
          holeNumber: holeNum,
          description: `Carry del Front (${pendingFrontCarry} rayas)`,
          rayasCount: pendingFrontCarry,
          valuePerRaya: frontValue,
          appliedSegment: 'front',
        });
        pendingFrontCarry = 0;
      }
    } else if (netB < netA) {
      // B wins this hole
      const backRayasWon = useAccumulation ? backAccumulated : 1;
      backRayasB += backRayasWon;
      details.push({
        source: 'skins',
        segment: 'back',
        holeNumber: holeNum,
        description: `Skin H${holeNum}${backRayasWon > 1 ? ` (+${backRayasWon - 1} acum)` : ''}`,
        rayasCount: -backRayasWon,
        valuePerRaya: backValue,
        appliedSegment: 'back',
      });
      if (useAccumulation) backAccumulated = 0;
      
      // Carried front rayas
      if (pendingFrontCarry > 0) {
        frontRayasB += pendingFrontCarry;
        details.push({
          source: 'skins',
          segment: 'front',
          holeNumber: holeNum,
          description: `Carry del Front (${pendingFrontCarry} rayas)`,
          rayasCount: -pendingFrontCarry,
          valuePerRaya: frontValue,
          appliedSegment: 'front',
        });
        pendingFrontCarry = 0;
      }
    }
  }
  
  // =========== 2. UNITS RAYAS ===========
  // Count positive units per segment
  const frontUnitsA = countPositiveUnits(playerA.id, scores, course, 'front');
  const frontUnitsB = countPositiveUnits(playerB.id, scores, course, 'front');
  const backUnitsA = countPositiveUnits(playerA.id, scores, course, 'back');
  const backUnitsB = countPositiveUnits(playerB.id, scores, course, 'back');
  
  // Front units rayas
  if (frontUnitsA > frontUnitsB) {
    const diff = frontUnitsA - frontUnitsB;
    frontRayasA += diff;
    details.push({
      source: 'units',
      segment: 'front',
      description: `Unidades Front (${frontUnitsA} vs ${frontUnitsB})`,
      rayasCount: diff,
      valuePerRaya: frontValue,
      appliedSegment: 'front',
    });
  } else if (frontUnitsB > frontUnitsA) {
    const diff = frontUnitsB - frontUnitsA;
    frontRayasB += diff;
    details.push({
      source: 'units',
      segment: 'front',
      description: `Unidades Front (${frontUnitsA} vs ${frontUnitsB})`,
      rayasCount: -diff,
      valuePerRaya: frontValue,
      appliedSegment: 'front',
    });
  }
  
  // Back units rayas
  if (backUnitsA > backUnitsB) {
    const diff = backUnitsA - backUnitsB;
    backRayasA += diff;
    details.push({
      source: 'units',
      segment: 'back',
      description: `Unidades Back (${backUnitsA} vs ${backUnitsB})`,
      rayasCount: diff,
      valuePerRaya: backValue,
      appliedSegment: 'back',
    });
  } else if (backUnitsB > backUnitsA) {
    const diff = backUnitsB - backUnitsA;
    backRayasB += diff;
    details.push({
      source: 'units',
      segment: 'back',
      description: `Unidades Back (${backUnitsA} vs ${backUnitsB})`,
      rayasCount: -diff,
      valuePerRaya: backValue,
      appliedSegment: 'back',
    });
  }
  
  // =========== 3. OYES RAYAS (ABSOLUTE CLOSEST) ===========
  // Only the ABSOLUTE closest player wins rayas vs ALL others
  // This is handled at the multi-player level, not here
  // We'll calculate this in calculateOyesRayasForAll below
  
  // =========== 4. MEDAL RAYAS ===========
  // Front medal
  const frontTotalA = getSegmentNetTotal(playerA.id, adjustedScores, 'front');
  const frontTotalB = getSegmentNetTotal(playerB.id, adjustedScores, 'front');
  if (frontTotalA < frontTotalB) {
    frontRayasA += 1;
    details.push({
      source: 'medal',
      segment: 'front',
      description: `Medal Front (${frontTotalA} vs ${frontTotalB})`,
      rayasCount: 1,
      valuePerRaya: frontValue,
      appliedSegment: 'front',
    });
  } else if (frontTotalB < frontTotalA) {
    frontRayasB += 1;
    details.push({
      source: 'medal',
      segment: 'front',
      description: `Medal Front (${frontTotalA} vs ${frontTotalB})`,
      rayasCount: -1,
      valuePerRaya: frontValue,
      appliedSegment: 'front',
    });
  }
  
  // Back medal
  const backTotalA = getSegmentNetTotal(playerA.id, adjustedScores, 'back');
  const backTotalB = getSegmentNetTotal(playerB.id, adjustedScores, 'back');
  if (backTotalA < backTotalB) {
    backRayasA += 1;
    details.push({
      source: 'medal',
      segment: 'back',
      description: `Medal Back (${backTotalA} vs ${backTotalB})`,
      rayasCount: 1,
      valuePerRaya: backValue,
      appliedSegment: 'back',
    });
  } else if (backTotalB < backTotalA) {
    backRayasB += 1;
    details.push({
      source: 'medal',
      segment: 'back',
      description: `Medal Back (${backTotalA} vs ${backTotalB})`,
      rayasCount: -1,
      valuePerRaya: backValue,
      appliedSegment: 'back',
    });
  }
  
  // Medal Total (additional raya)
  const totalA = getSegmentNetTotal(playerA.id, adjustedScores, 'total');
  const totalB = getSegmentNetTotal(playerB.id, adjustedScores, 'total');
  let medalTotalRayaWinner: string | null = null;
  let medalTotalAmountA = 0;
  
  if (totalA < totalB) {
    medalTotalRayaWinner = playerA.id;
    medalTotalAmountA = medalTotalValue;
    details.push({
      source: 'medal',
      segment: 'total',
      description: `Medal Total (${totalA} vs ${totalB})`,
      rayasCount: 1,
      valuePerRaya: medalTotalValue,
      appliedSegment: 'total',
    });
  } else if (totalB < totalA) {
    medalTotalRayaWinner = playerB.id;
    medalTotalAmountA = -medalTotalValue;
    details.push({
      source: 'medal',
      segment: 'total',
      description: `Medal Total (${totalA} vs ${totalB})`,
      rayasCount: -1,
      valuePerRaya: medalTotalValue,
      appliedSegment: 'total',
    });
  }
  
  // Calculate amounts
  const frontNetRayas = frontRayasA - frontRayasB;
  const backNetRayas = backRayasA - backRayasB;
  const frontAmountA = frontNetRayas * frontValue;
  const backAmountA = backNetRayas * backValue;
  const totalAmountA = frontAmountA + backAmountA + medalTotalAmountA;
  
  return {
    playerAId: playerA.id,
    playerBId: playerB.id,
    frontRayasA,
    frontRayasB,
    backRayasA,
    backRayasB,
    medalTotalRayaWinner,
    frontAmountA,
    backAmountA,
    medalTotalAmountA,
    totalAmountA,
    details,
  };
};

/**
 * Process a single Oyes hole and return results
 */
const processOyesHole = (
  holeNum: number,
  segment: 'front' | 'back',
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  accumulatedOyes: number,
  segmentValue: number,
  summaries: BetSummary[],
  detailsByPair: Map<string, RayaDetail[]>,
  carriedFromFront: number = 0,
  frontValue: number = 0
): { won: boolean; winnerId: string | null } => {
  // Find who has proximity numbers on this hole
  const proximities: { playerId: string; proximity: number }[] = [];
  
  players.forEach(player => {
    const playerScores = scores.get(player.id) || [];
    const holeScore = playerScores.find(s => s.holeNumber === holeNum);
    if (holeScore?.oyesProximity) {
      proximities.push({ playerId: player.id, proximity: holeScore.oyesProximity });
    }
  });
  
  if (proximities.length === 0) {
    // Nobody on the green - accumulate
    return { won: false, winnerId: null };
  }
  
  // Find the absolute closest (lowest proximity number)
  proximities.sort((a, b) => a.proximity - b.proximity);
  const closestPlayer = proximities[0];
  
  // Calculate Oyes won: 1 (current) + accumulated for this segment
  const currentSegmentOyes = 1 + accumulatedOyes;
  
  // The closest player wins rayas against ALL other players
  players.forEach(rival => {
    if (rival.id === closestPlayer.playerId) return;
    
    const pairKey = [closestPlayer.playerId, rival.id].sort().join('-');
    
    // Current segment Oyes
    if (currentSegmentOyes > 0) {
      summaries.push({
        playerId: closestPlayer.playerId,
        vsPlayer: rival.id,
        betType: 'Rayas Oyes',
        amount: currentSegmentOyes * segmentValue,
        segment: segment,
        holeNumber: holeNum,
        description: `Oyes H${holeNum}${currentSegmentOyes > 1 ? ` (${currentSegmentOyes} acum)` : ''}`,
      });
      summaries.push({
        playerId: rival.id,
        vsPlayer: closestPlayer.playerId,
        betType: 'Rayas Oyes',
        amount: -currentSegmentOyes * segmentValue,
        segment: segment,
        holeNumber: holeNum,
        description: `Oyes H${holeNum}`,
      });
    }
    
    // Carried Front Oyes
    // NOTE: For Rayas display/settlement we treat carried Oyes as part of the Back segment
    // so the Back total rayas & amount reflect the full count (e.g., 12 × $50 = $600).
    if (segment === 'back' && carriedFromFront > 0) {
      summaries.push({
        playerId: closestPlayer.playerId,
        vsPlayer: rival.id,
        betType: 'Rayas Oyes',
        amount: carriedFromFront * segmentValue,
        segment: 'back',
        holeNumber: holeNum,
        description: `Oyes Carry del Front (${carriedFromFront})`,
      });
      summaries.push({
        playerId: rival.id,
        vsPlayer: closestPlayer.playerId,
        betType: 'Rayas Oyes',
        amount: -carriedFromFront * segmentValue,
        segment: 'back',
        holeNumber: holeNum,
        description: `Oyes Carry del Front`,
      });
    }
    
    // Add to details for audit
    const totalOyesWon = currentSegmentOyes + (segment === 'back' ? carriedFromFront : 0);
    if (!detailsByPair.has(pairKey)) {
      detailsByPair.set(pairKey, []);
    }
    detailsByPair.get(pairKey)!.push({
      source: 'oyes',
      segment: segment,
      holeNumber: holeNum,
      description: `Oyes H${holeNum}${totalOyesWon > 1 ? ` (+${totalOyesWon - 1} acum)` : ''}`,
      rayasCount: closestPlayer.playerId < rival.id ? totalOyesWon : -totalOyesWon,
      valuePerRaya: segmentValue,
      appliedSegment: segment,
    });
  });
  
  return { won: true, winnerId: closestPlayer.playerId };
};

/**
 * Calculate Oyes rayas for all players (absolute closest wins vs ALL)
 * Returns additional BetSummary entries for Oyes rayas
 */
const calculateOyesRayasForAll = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse
): { summaries: BetSummary[]; details: Map<string, RayaDetail[]> } => {
  const summaries: BetSummary[] = [];
  const detailsByPair = new Map<string, RayaDetail[]>();
  
  const par3Holes = getPar3Holes(course);
  const frontValue = config.rayas.frontValue;
  const backValue = config.rayas.backValue;
  
  // Separate Par 3s by segment
  const frontPar3s = par3Holes.filter(h => h <= 9);
  const backPar3s = par3Holes.filter(h => h > 9);
  
  // Track accumulated Oyes per segment
  let frontAccumulatedOyes = 0;
  let backAccumulatedOyes = 0;
  
  // Process Front 9 Par 3s first
  frontPar3s.forEach(holeNum => {
    const result = processOyesHole(holeNum, 'front', players, scores, frontAccumulatedOyes, frontValue, summaries, detailsByPair);
    if (result.won) {
      frontAccumulatedOyes = 0;
    } else {
      frontAccumulatedOyes++;
    }
  });
  
  // Carry any unresolved Front Oyes to Back
  const pendingFrontCarry = frontAccumulatedOyes;
  
  // Process Back 9 Par 3s
  let frontCarryUsed = false;
  backPar3s.forEach(holeNum => {
    const carryToApply = !frontCarryUsed ? pendingFrontCarry : 0;
    const result = processOyesHole(holeNum, 'back', players, scores, backAccumulatedOyes, backValue, summaries, detailsByPair, carryToApply, frontValue);
    if (result.won) {
      backAccumulatedOyes = 0;
      if (!frontCarryUsed) frontCarryUsed = true;
    } else {
      backAccumulatedOyes++;
    }
  });
  
  return { summaries, details: detailsByPair };
};

/**
 * Main entry point: Calculate all Rayas bets
 */
export const calculateRayasBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  bilateralHandicaps?: BilateralHandicap[],
  startingHole: 1 | 10 = 1
): BetSummary[] => {
  if (!config.rayas?.enabled) return [];
  
  const summaries: BetSummary[] = [];
  
  // Calculate Oyes rayas (absolute closest)
  const { summaries: oyesSummaries } = calculateOyesRayasForAll(players, scores, config, course);
  summaries.push(...oyesSummaries);
  
  // Calculate bilateral rayas (skins, units, medal)
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const playerA = players[i];
      const playerB = players[j];
      
      const result = calculateRayasForPair(playerA, playerB, scores, config, course, bilateralHandicaps);
      
      // Front rayas
      if (result.frontAmountA !== 0) {
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: 'Rayas Front',
          amount: result.frontAmountA,
          segment: 'front',
          description: `${result.frontRayasA} vs ${result.frontRayasB} rayas`,
        });
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Rayas Front',
          amount: -result.frontAmountA,
          segment: 'front',
          description: `${result.frontRayasB} vs ${result.frontRayasA} rayas`,
        });
      }
      
      // Back rayas
      if (result.backAmountA !== 0) {
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: 'Rayas Back',
          amount: result.backAmountA,
          segment: 'back',
          description: `${result.backRayasA} vs ${result.backRayasB} rayas`,
        });
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Rayas Back',
          amount: -result.backAmountA,
          segment: 'back',
          description: `${result.backRayasB} vs ${result.backRayasA} rayas`,
        });
      }
      
      // Medal Total raya
      if (result.medalTotalAmountA !== 0) {
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: 'Rayas Medal Total',
          amount: result.medalTotalAmountA,
          segment: 'total',
          description: result.medalTotalRayaWinner === playerA.id ? 'Ganador Medal Total' : '',
        });
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Rayas Medal Total',
          amount: -result.medalTotalAmountA,
          segment: 'total',
          description: result.medalTotalRayaWinner === playerB.id ? 'Ganador Medal Total' : '',
        });
      }
    }
  }
  
  return summaries;
};

/**
 * Get detailed rayas breakdown for a pair (for dashboard audit)
 * Includes bilateral rayas (skins, units, medal) AND Oyes rayas for this pair
 */
export const getRayasDetailForPair = (
  playerA: Player,
  playerB: Player,
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  bilateralHandicaps?: BilateralHandicap[],
  allPlayers?: Player[]
): RayasPairResult => {
  const bilateralResult = calculateRayasForPair(playerA, playerB, scores, config, course, bilateralHandicaps);
  
  // If we have all players, calculate Oyes details for this pair
  if (allPlayers && allPlayers.length > 0) {
    const { details: oyesDetailsByPair } = calculateOyesRayasForAll(allPlayers, scores, config, course);
    
    // Get Oyes details for this specific pair
    const pairKey = [playerA.id, playerB.id].sort().join('-');
    const oyesDetails = oyesDetailsByPair.get(pairKey) || [];
    
    // Merge Oyes details into the result
    // Normalize rayasCount perspective to match playerA
    const normalizedOyesDetails: RayaDetail[] = oyesDetails.map(d => {
      // If the detail was stored with the opposite perspective, flip the sign
      const isPlayerAFirst = playerA.id < playerB.id;
      const needsFlip = !isPlayerAFirst;
      return {
        ...d,
        rayasCount: needsFlip ? -d.rayasCount : d.rayasCount,
      };
    });
    
    // Merge details
    const mergedDetails = [...bilateralResult.details, ...normalizedOyesDetails];
    
    // Recalculate amounts including Oyes
    const frontValue = config.rayas?.frontValue || 0;
    const backValue = config.rayas?.backValue || 0;
    
    // Sum up Oyes amounts for this pair
    let oyesFrontAmountA = 0;
    let oyesBackAmountA = 0;
    normalizedOyesDetails.forEach(d => {
      if (d.appliedSegment === 'front') {
        oyesFrontAmountA += d.rayasCount * d.valuePerRaya;
      } else if (d.appliedSegment === 'back') {
        oyesBackAmountA += d.rayasCount * d.valuePerRaya;
      }
    });
    
    return {
      ...bilateralResult,
      frontAmountA: bilateralResult.frontAmountA + oyesFrontAmountA,
      backAmountA: bilateralResult.backAmountA + oyesBackAmountA,
      totalAmountA: bilateralResult.totalAmountA + oyesFrontAmountA + oyesBackAmountA,
      details: mergedDetails,
    };
  }
  
  return bilateralResult;
};

/**
 * Get aggregated rayas count by source for display
 */
export const getRayasSummaryBySource = (
  playerAId: string,
  playerBId: string,
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  players: Player[],
  bilateralHandicaps?: BilateralHandicap[]
): { source: string; frontRayas: number; backRayas: number; totalRayas: number }[] => {
  const playerA = players.find(p => p.id === playerAId);
  const playerB = players.find(p => p.id === playerBId);
  if (!playerA || !playerB) return [];
  
  const result = calculateRayasForPair(playerA, playerB, scores, config, course, bilateralHandicaps);
  
  const sources: Record<string, { front: number; back: number; total: number }> = {
    skins: { front: 0, back: 0, total: 0 },
    units: { front: 0, back: 0, total: 0 },
    medal: { front: 0, back: 0, total: 0 },
    oyes: { front: 0, back: 0, total: 0 },
  };
  
  result.details.forEach(d => {
    const count = d.rayasCount > 0 ? d.rayasCount : 0; // Only count A's perspective
    if (d.appliedSegment === 'front') {
      sources[d.source].front += count;
    } else if (d.appliedSegment === 'back') {
      sources[d.source].back += count;
    } else {
      sources[d.source].total += count;
    }
  });
  
  return Object.entries(sources).map(([source, counts]) => ({
    source,
    frontRayas: counts.front,
    backRayas: counts.back,
    totalRayas: counts.front + counts.back + counts.total,
  }));
};
