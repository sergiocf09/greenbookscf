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

import { Player, PlayerScore, BetConfig, GolfCourse } from '@/types/golf';
import { BetSummary } from './betCalculations';
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
      if (score.markers.holeOut) units += 2;
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
    .filter(s => s.holeNumber >= holeRange[0] && s.holeNumber <= holeRange[1])
    .reduce((sum, s) => sum + (s.netScore ?? s.strokes ?? 0), 0);
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
  course: GolfCourse
): RayasPairResult => {
  const details: RayaDetail[] = [];
  
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
    const netA = getHoleNetScore(playerA.id, holeNum, scores);
    const netB = getHoleNetScore(playerB.id, holeNum, scores);
    
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
    const netA = getHoleNetScore(playerA.id, holeNum, scores);
    const netB = getHoleNetScore(playerB.id, holeNum, scores);
    
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
  const frontTotalA = getSegmentNetTotal(playerA.id, scores, 'front');
  const frontTotalB = getSegmentNetTotal(playerB.id, scores, 'front');
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
  const backTotalA = getSegmentNetTotal(playerA.id, scores, 'back');
  const backTotalB = getSegmentNetTotal(playerB.id, scores, 'back');
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
  const totalA = getSegmentNetTotal(playerA.id, scores, 'total');
  const totalB = getSegmentNetTotal(playerB.id, scores, 'total');
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
  
  // Track accumulated Oyes per segment
  let frontAccumulatedOyes = 0;
  let pendingFrontOyes = 0; // Carry to back
  
  // Process each Par 3
  par3Holes.forEach(holeNum => {
    const segment = holeNum <= 9 ? 'front' : 'back';
    const valuePerRaya = segment === 'front' ? frontValue : backValue;
    
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
      if (segment === 'front') {
        frontAccumulatedOyes++;
      } else {
        pendingFrontOyes++; // This accumulates in back
      }
      return;
    }
    
    // Find the absolute closest (lowest proximity number)
    proximities.sort((a, b) => a.proximity - b.proximity);
    const closestPlayer = proximities[0];
    
    // Calculate total Oyes won (current + accumulated)
    let oyesWon = 1;
    let carriedFromFront = 0;
    
    if (segment === 'front') {
      oyesWon += frontAccumulatedOyes;
      frontAccumulatedOyes = 0;
    } else {
      // Back 9
      oyesWon += pendingFrontOyes;
      carriedFromFront = pendingFrontOyes;
      pendingFrontOyes = 0;
    }
    
    // The closest player wins rayas against ALL other players
    players.forEach(rival => {
      if (rival.id === closestPlayer.playerId) return;
      
      const pairKey = [closestPlayer.playerId, rival.id].sort().join('-');
      
      // Back Oyes
      const backOyesCount = segment === 'back' ? (oyesWon - carriedFromFront) : 0;
      if (backOyesCount > 0) {
        summaries.push({
          playerId: closestPlayer.playerId,
          vsPlayer: rival.id,
          betType: 'Rayas Oyes',
          amount: backOyesCount * backValue,
          segment: 'back',
          holeNumber: holeNum,
          description: `Oyes H${holeNum}${backOyesCount > 1 ? ` (${backOyesCount} acum)` : ''}`,
        });
        summaries.push({
          playerId: rival.id,
          vsPlayer: closestPlayer.playerId,
          betType: 'Rayas Oyes',
          amount: -backOyesCount * backValue,
          segment: 'back',
          holeNumber: holeNum,
          description: `Oyes H${holeNum}`,
        });
      }
      
      // Front Oyes (or carried from front to back)
      const frontOyesCount = segment === 'front' ? oyesWon : carriedFromFront;
      if (frontOyesCount > 0) {
        summaries.push({
          playerId: closestPlayer.playerId,
          vsPlayer: rival.id,
          betType: 'Rayas Oyes',
          amount: frontOyesCount * frontValue,
          segment: 'front',
          holeNumber: holeNum,
          description: segment === 'front' 
            ? `Oyes H${holeNum}${frontOyesCount > 1 ? ` (${frontOyesCount} acum)` : ''}`
            : `Oyes Carry del Front (${frontOyesCount})`,
        });
        summaries.push({
          playerId: rival.id,
          vsPlayer: closestPlayer.playerId,
          betType: 'Rayas Oyes',
          amount: -frontOyesCount * frontValue,
          segment: 'front',
          holeNumber: holeNum,
          description: segment === 'front' ? `Oyes H${holeNum}` : `Oyes Carry del Front`,
        });
      }
      
      // Add to details
      if (!detailsByPair.has(pairKey)) {
        detailsByPair.set(pairKey, []);
      }
      detailsByPair.get(pairKey)!.push({
        source: 'oyes',
        segment: segment,
        holeNumber: holeNum,
        description: `Oyes H${holeNum}${oyesWon > 1 ? ` (+${oyesWon - 1} acum)` : ''}`,
        rayasCount: closestPlayer.playerId < rival.id ? oyesWon : -oyesWon,
        valuePerRaya: valuePerRaya,
        appliedSegment: segment,
      });
    });
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
  course: GolfCourse
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
      
      const result = calculateRayasForPair(playerA, playerB, scores, config, course);
      
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
 */
export const getRayasDetailForPair = (
  playerA: Player,
  playerB: Player,
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse
): RayasPairResult => {
  return calculateRayasForPair(playerA, playerB, scores, config, course);
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
  players: Player[]
): { source: string; frontRayas: number; backRayas: number; totalRayas: number }[] => {
  const playerA = players.find(p => p.id === playerAId);
  const playerB = players.find(p => p.id === playerBId);
  if (!playerA || !playerB) return [];
  
  const result = calculateRayasForPair(playerA, playerB, scores, config, course);
  
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
