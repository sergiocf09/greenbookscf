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

import { Player, PlayerScore, BetConfig, GolfCourse, BilateralHandicap, RayasSegmentConfig, RayasBilateralOverride, RayasSkinVariant } from '@/types/golf';
import { BetSummary, getBilateralHandicapForPair, getAdjustedScoresForPair, shouldCalculatePair, groupPlayersByGroup, resolveParticipantsWithOneVsAll } from './betCalculations';
import { resolveConfigForGroup } from './groupBetOverrides';
import { calculateStrokesPerHole, getSegmentHoleRanges } from './handicapUtils';

/**
 * Get effective segment configuration for a pair, respecting:
 * 1. Global segment config (rayas.segments)
 * 2. Bilateral overrides from RayasConfig (rayas.bilateralOverrides)
 * 3. Amount overrides from Dashboard editing (betConfig.betOverrides)
 */
export const getEffectiveSegmentConfig = (
  config: BetConfig,
  segmentKey: 'skins' | 'units' | 'oyes' | 'medal',
  playerAId: string,
  playerBId: string
): { enabled: boolean; frontValue: number; backValue: number } => {
  const rayas = config.rayas;
  const defaultFront = rayas?.frontValue ?? 25;
  const defaultBack = rayas?.backValue ?? 50;
  
  // Get global segment config
  const globalSeg = rayas?.segments?.[segmentKey];
  const baseConfig = {
    enabled: globalSeg?.enabled ?? true,
    frontValue: globalSeg?.frontValue ?? defaultFront,
    backValue: globalSeg?.backValue ?? defaultBack,
  };
  
  // If the global segment is disabled, return immediately
  if (!baseConfig.enabled) {
    return baseConfig;
  }
  
  // Check for bilateral overrides (from either player's perspective)
  const overridesA = rayas?.bilateralOverrides?.[playerAId];
  const overrideForB = overridesA?.find(o => o.rivalId === playerBId);
  
  const overridesB = rayas?.bilateralOverrides?.[playerBId];
  const overrideForA = overridesB?.find(o => o.rivalId === playerAId);
  
  // If either player has disabled rayas with the other, the pair is disabled
  if (overrideForB?.enabled === false || overrideForA?.enabled === false) {
    return { ...baseConfig, enabled: false };
  }
  
  // Check segment-level overrides from either player
  const segOverrideFromA = overrideForB?.segments?.[segmentKey];
  const segOverrideFromB = overrideForA?.segments?.[segmentKey];
  
  // If either player disabled this segment for the pair, disable it
  if (segOverrideFromA?.enabled === false || segOverrideFromB?.enabled === false) {
    return { ...baseConfig, enabled: false };
  }
  
  // Get values: prefer bilateral overrides, then global segment values
  let frontValue = segOverrideFromA?.frontValue ?? segOverrideFromB?.frontValue ?? baseConfig.frontValue;
  let backValue = segOverrideFromA?.backValue ?? segOverrideFromB?.backValue ?? baseConfig.backValue;
  
  // Check for Dashboard amount overrides (betConfig.betOverrides)
  // These take precedence over all other values for this specific pair
  const dashboardOverrides = config.betOverrides || [];
  
  // Map segment key to bet type labels used in Dashboard
  const getBetTypeForSegment = (seg: string): string[] => {
    switch (seg) {
      case 'skins': return ['Rayas Front', 'Rayas Back']; // Skins use front/back values
      case 'oyes': return ['Rayas Front', 'Rayas Back']; // Oyes also use front/back
      case 'medal': return ['Rayas Front', 'Rayas Back', 'Rayas Medal Total'];
      case 'units': return ['Rayas Front', 'Rayas Back'];
      default: return [];
    }
  };
  
  // Find dashboard override for this pair and segment
  const findDashboardOverride = (betType: string): number | undefined => {
    const match = dashboardOverrides.find(o =>
      o.betType === betType &&
      o.enabled !== false &&
      o.amountOverride !== undefined &&
      ((o.playerAId === playerAId && o.playerBId === playerBId) ||
       (o.playerAId === playerBId && o.playerBId === playerAId))
    );
    return match?.amountOverride;
  };
  
  // Apply dashboard overrides if present
  const frontOverride = findDashboardOverride('Rayas Front');
  const backOverride = findDashboardOverride('Rayas Back');
  
  if (frontOverride !== undefined) frontValue = frontOverride;
  if (backOverride !== undefined) backValue = backOverride;
  
  return {
    enabled: baseConfig.enabled,
    frontValue,
    backValue,
  };
};

/**
 * Check if rayas bet is active between two players
 * Exported so Dashboard can filter pairs before rendering
 */
/**
 * Check if rayas bet is active between two players
 * 
 * SIMPLIFIED MODEL: A player "participates" in Rayas if they have ANY bilateral override
 * marked as enabled (or no overrides at all = participates by default).
 * 
 * If EITHER player in a pair "participates", then Rayas is active for that pair.
 * This means: if only Sergio is marked to play Rayas, then Sergio vs ALL others is active.
 * If only Toño is marked, then Toño vs ALL others is active.
 * If neither has overrides, ALL play (default behavior).
 * 
 * Exported so Dashboard can filter pairs before rendering.
 */
export const isRayasActiveForPair = (
  config: BetConfig,
  playerAId: string,
  playerBId: string
): boolean => {
  if (!config.rayas?.enabled) return false;
  
  // Check if bilateral overrides exist at all
  const hasAnyOverrides = config.rayas?.bilateralOverrides && 
    Object.keys(config.rayas.bilateralOverrides).length > 0;
  
  // If no overrides defined at all, everyone plays with everyone (default)
  if (!hasAnyOverrides) {
    return true;
  }
  
  // Check specific override between these two players (explicit disable)
  const overridesA = config.rayas?.bilateralOverrides?.[playerAId];
  const overrideForB = overridesA?.find(o => o.rivalId === playerBId);
  
  const overridesB = config.rayas?.bilateralOverrides?.[playerBId];
  const overrideForA = overridesB?.find(o => o.rivalId === playerAId);
  
  // If there's an explicit disable between these two, respect it
  if (overrideForB?.enabled === false || overrideForA?.enabled === false) {
    return false;
  }
  
  // SIMPLIFIED MODEL: Check if either player is a "Rayas participant"
  // A player "participates" if they have at least one override with enabled=true
  // OR if they have no overrides at all (default = participate)
  
  // A player "participates" if:
  // 1. They have overrides with at least one enabled, OR
  // 2. They have NO overrides at all (default = participate)
  // 3. They are referenced as a rival by someone else
  // Only explicitly disabled (all overrides disabled) means exclusion.
  
  const playerParticipates = (playerId: string): boolean => {
    const overrides = config.rayas?.bilateralOverrides?.[playerId];
    if (!overrides || overrides.length === 0) {
      // No overrides for this player = participates by default
      return true;
    }
    // Has overrides - participates if at least one is enabled
    return overrides.some(o => o.enabled !== false);
  };
  
  // Rayas is active for this pair if EITHER player participates
  return playerParticipates(playerAId) || playerParticipates(playerBId);
};

/**
 * Get amount overrides for Rayas from betConfig.betOverrides
 * This allows per-pair amount customization from the Dashboard
 */
export const getRayasAmountOverrides = (
  config: BetConfig,
  playerAId: string,
  playerBId: string
): { frontValue?: number; backValue?: number; medalTotalValue?: number } => {
  const overrides = config.betOverrides || [];
  
  const findOverride = (betType: string): number | undefined => {
    const match = overrides.find(o => 
      o.betType === betType &&
      o.enabled !== false &&
      ((o.playerAId === playerAId && o.playerBId === playerBId) ||
       (o.playerAId === playerBId && o.playerBId === playerAId))
    );
    return match?.amountOverride;
  };
  
  return {
    frontValue: findOverride('Rayas Front'),
    backValue: findOverride('Rayas Back'),
    medalTotalValue: findOverride('Rayas Medal Total'),
  };
};

/**
 * Get the Oyes modality for a specific pair of players
 * Returns 'acumulados' (default) or 'sangron' based on bilateral overrides
 */
export const getOyesModalityForPair = (
  config: BetConfig,
  playerAId: string,
  playerBId: string
): 'acumulados' | 'sangron' => {
  const overridesA = config.rayas?.bilateralOverrides?.[playerAId];
  const overrideForB = overridesA?.find(o => o.rivalId === playerBId);
  
  const overridesB = config.rayas?.bilateralOverrides?.[playerBId];
  const overrideForA = overridesB?.find(o => o.rivalId === playerAId);
  
  // Check if either player has set a modality for Oyes with the other
  const modalityFromA = overrideForB?.segments?.oyes?.modality;
  const modalityFromB = overrideForA?.segments?.oyes?.modality;
  
  // If either has set 'sangron', use that (takes precedence)
  if (modalityFromA === 'sangron' || modalityFromB === 'sangron') {
    return 'sangron';
  }
  
  return 'acumulados';
};

/**
 * Get the effective skin variant for a pair of players.
 * Priority: 1) Explicit pair override (pairSkinVariantOverrides)
 *           2) If both players agree on their playerSkinVariants, use that
 *           3) If conflict (or no per-player config), fall back to global skinVariant
 * 
 * Returns an object with the variant and whether there's an unresolved conflict.
 */
export const getPairKey = (idA: string, idB: string): string => {
  return [idA, idB].sort().join('_');
};

export const getSkinVariantConflict = (
  config: BetConfig,
  playerAId: string,
  playerBId: string
): { variant: RayasSkinVariant; hasConflict: boolean } => {
  const globalVariant = config.rayas?.skinVariant ?? 'acumulados';
  const playerVariants = config.rayas?.playerSkinVariants;
  const pairOverrides = config.rayas?.pairSkinVariantOverrides;
  
  // 1) Check explicit pair override
  const pairKey = getPairKey(playerAId, playerBId);
  if (pairOverrides?.[pairKey]) {
    return { variant: pairOverrides[pairKey], hasConflict: false };
  }
  
  // 2) Check per-player variants
  const variantA = playerVariants?.[playerAId] ?? globalVariant;
  const variantB = playerVariants?.[playerBId] ?? globalVariant;
  
  if (variantA === variantB) {
    return { variant: variantA, hasConflict: false };
  }
  
  // 3) Conflict - no pair override set yet, default to global
  return { variant: globalVariant, hasConflict: true };
};

export const getEffectiveSkinVariantForPair = (
  config: BetConfig,
  playerAId: string,
  playerBId: string
): RayasSkinVariant => {
  return getSkinVariantConflict(config, playerAId, playerBId).variant;
};

/**
 * Check if there are any pairs playing Oyes Sangrón
 * Used to determine if we need to show separate columns in score input
 */
export const hasAnySangronPairs = (
  config: BetConfig,
  players: { id: string }[]
): boolean => {
  if (!config.rayas?.enabled) return false;
  
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      if (getOyesModalityForPair(config, players[i].id, players[j].id) === 'sangron') {
        return true;
      }
    }
  }
  
  return false;
};

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
  segment: 'front' | 'back' | 'total',
  startingHole: 1 | 10 = 1
): number => {
  const playerScores = scores.get(playerId) || [];
  const ranges = getSegmentHoleRanges(startingHole);
  const holeRange = segment === 'front' ? ranges.front : segment === 'back' ? ranges.back : [1, 18] as [number, number];
  
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
  segment: 'front' | 'back' | 'total',
  startingHole: 1 | 10 = 1
): number => {
  const playerScores = scores.get(playerId) || [];
  const ranges = getSegmentHoleRanges(startingHole);
  const holeRange = segment === 'front' ? ranges.front : segment === 'back' ? ranges.back : [1, 18] as [number, number];
  
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
  bilateralHandicaps?: BilateralHandicap[],
  startingHole: 1 | 10 = 1
): RayasPairResult => {
  const details: RayaDetail[] = [];
  
  // Get adjusted scores for this pair based on bilateral handicap overrides
  const adjustedScores = getAdjustedScoresForPair(playerA, playerB, scores, course, bilateralHandicaps);
  
  let frontRayasA = 0;
  let frontRayasB = 0;
  let backRayasA = 0;
  let backRayasB = 0;
  
  // Get effective segment configurations for this pair
  const skinsConfig = getEffectiveSegmentConfig(config, 'skins', playerA.id, playerB.id);
  const unitsConfig = getEffectiveSegmentConfig(config, 'units', playerA.id, playerB.id);
  const oyesConfig = getEffectiveSegmentConfig(config, 'oyes', playerA.id, playerB.id);
  const medalConfig = getEffectiveSegmentConfig(config, 'medal', playerA.id, playerB.id);
  
  // Get medal total value with dashboard override support
  const amountOverrides = getRayasAmountOverrides(config, playerA.id, playerB.id);
  const medalTotalValue = amountOverrides.medalTotalValue ?? config.rayas?.medalTotalValue ?? 25;
  const effectiveVariant = getEffectiveSkinVariantForPair(config, playerA.id, playerB.id);
  const useAccumulation = effectiveVariant === 'acumulados';
  
  // =========== 1. SKINS RAYAS ===========
  const segRanges = getSegmentHoleRanges(startingHole);
  if (skinsConfig.enabled) {
    // Front 9 skins
    let frontAccumulated = 0;
    for (let holeNum = segRanges.front[0]; holeNum <= segRanges.front[1]; holeNum++) {
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
          valuePerRaya: skinsConfig.frontValue,
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
          valuePerRaya: skinsConfig.frontValue,
          appliedSegment: 'front',
        });
        if (useAccumulation) frontAccumulated = 0;
      }
      // Tie = accumulate if enabled
    }
    
    // Back 9 skins with potential carry from front
    let backAccumulated = 0;
    let pendingFrontCarry = useAccumulation ? frontAccumulated : 0;
    
    for (let holeNum = segRanges.back[0]; holeNum <= segRanges.back[1]; holeNum++) {
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
          valuePerRaya: skinsConfig.backValue,
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
            valuePerRaya: skinsConfig.frontValue,
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
          valuePerRaya: skinsConfig.backValue,
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
            valuePerRaya: skinsConfig.frontValue,
            appliedSegment: 'front',
          });
          pendingFrontCarry = 0;
        }
      }
    }
  }
  
  // =========== 2. UNITS RAYAS ===========
  if (unitsConfig.enabled) {
    // Count positive units per segment
    const frontUnitsA = countPositiveUnits(playerA.id, scores, course, 'front', startingHole);
    const frontUnitsB = countPositiveUnits(playerB.id, scores, course, 'front', startingHole);
    const backUnitsA = countPositiveUnits(playerA.id, scores, course, 'back', startingHole);
    const backUnitsB = countPositiveUnits(playerB.id, scores, course, 'back', startingHole);
    
    // Front units rayas
    if (frontUnitsA > frontUnitsB) {
      const diff = frontUnitsA - frontUnitsB;
      frontRayasA += diff;
      details.push({
        source: 'units',
        segment: 'front',
        description: `Unidades Front (${frontUnitsA} vs ${frontUnitsB})`,
        rayasCount: diff,
        valuePerRaya: unitsConfig.frontValue,
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
        valuePerRaya: unitsConfig.frontValue,
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
        valuePerRaya: unitsConfig.backValue,
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
        valuePerRaya: unitsConfig.backValue,
        appliedSegment: 'back',
      });
    }
  }
  
  // =========== 3. OYES RAYAS (ABSOLUTE CLOSEST) ===========
  // Only process if Oyes segment is enabled for this pair
  // Oyes are handled at the multi-player level in calculateOyesRayasForAll below
  // But the segment config must still be respected
  
  // =========== 4. MEDAL RAYAS ===========
  let medalTotalRayaWinner: string | null = null;
  let medalTotalAmountA = 0;
  
  if (medalConfig.enabled) {
    // Front medal
    const frontTotalA = getSegmentNetTotal(playerA.id, adjustedScores, 'front', startingHole);
    const frontTotalB = getSegmentNetTotal(playerB.id, adjustedScores, 'front', startingHole);
    if (frontTotalA < frontTotalB) {
      frontRayasA += 1;
      details.push({
        source: 'medal',
        segment: 'front',
        description: `Medal Front (${frontTotalA} vs ${frontTotalB})`,
        rayasCount: 1,
        valuePerRaya: medalConfig.frontValue,
        appliedSegment: 'front',
      });
    } else if (frontTotalB < frontTotalA) {
      frontRayasB += 1;
      details.push({
        source: 'medal',
        segment: 'front',
        description: `Medal Front (${frontTotalA} vs ${frontTotalB})`,
        rayasCount: -1,
        valuePerRaya: medalConfig.frontValue,
        appliedSegment: 'front',
      });
    }
    
    // Back medal
    const backTotalA = getSegmentNetTotal(playerA.id, adjustedScores, 'back', startingHole);
    const backTotalB = getSegmentNetTotal(playerB.id, adjustedScores, 'back', startingHole);
    if (backTotalA < backTotalB) {
      backRayasA += 1;
      details.push({
        source: 'medal',
        segment: 'back',
        description: `Medal Back (${backTotalA} vs ${backTotalB})`,
        rayasCount: 1,
        valuePerRaya: medalConfig.backValue,
        appliedSegment: 'back',
      });
    } else if (backTotalB < backTotalA) {
      backRayasB += 1;
      details.push({
        source: 'medal',
        segment: 'back',
        description: `Medal Back (${backTotalA} vs ${backTotalB})`,
        rayasCount: -1,
        valuePerRaya: medalConfig.backValue,
        appliedSegment: 'back',
      });
    }
    
    // Medal Total (additional raya)
    const totalA = getSegmentNetTotal(playerA.id, adjustedScores, 'total', startingHole);
    const totalB = getSegmentNetTotal(playerB.id, adjustedScores, 'total', startingHole);
    
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
  }
  
  // Calculate amounts based on segment-specific values
  // For each segment, we sum up the rayas * their specific values from the details
  let frontAmountA = 0;
  let backAmountA = 0;
  
  details.forEach(d => {
    const amount = d.rayasCount * d.valuePerRaya;
    if (d.appliedSegment === 'front') {
      frontAmountA += amount;
    } else if (d.appliedSegment === 'back') {
      backAmountA += amount;
    }
  });
  
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
 * Process Oyes for a PAIR with Sangrón modality (no accumulation)
 * Each hole is settled independently based on proximity comparison between the two players.
 * 
 * Rules:
 * - If both have a ranking: lower number wins
 * - If only one has a ranking: that player wins
 * - If neither has a ranking: tie (0 rayas)
 */
const processOyesSangronForPair = (
  playerAId: string,
  playerBId: string,
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  summaries: BetSummary[],
  detailsByPair: Map<string, RayaDetail[]>,
  startingHole: 1 | 10 = 1
): void => {
  const par3Holes = getPar3Holes(course);
  const oyesConfig = getEffectiveSegmentConfig(config, 'oyes', playerAId, playerBId);
  const segRanges = getSegmentHoleRanges(startingHole);
  
  if (!oyesConfig.enabled) return;

  const pairKey = [playerAId, playerBId].sort().join('-');
  const [idLow, idHigh] = [playerAId, playerBId].sort();
  
  par3Holes.forEach(holeNum => {
    const segment: 'front' | 'back' = holeNum >= segRanges.front[0] && holeNum <= segRanges.front[1] ? 'front' : 'back';
    const segmentValue = segment === 'front' ? oyesConfig.frontValue : oyesConfig.backValue;
    
    const scoresA = scores.get(playerAId) || [];
    const scoresB = scores.get(playerBId) || [];
    
    const scoreA = scoresA.find(s => s.holeNumber === holeNum);
    const scoreB = scoresB.find(s => s.holeNumber === holeNum);
    
    // Sangrón prefers oyesProximitySangron but falls back to oyesProximity (Acumulados)
    // This ensures that players who only have Acumulados data still count in Sangrón pairs
    const proximityA = scoreA?.oyesProximitySangron ?? scoreA?.oyesProximity ?? null;
    const proximityB = scoreB?.oyesProximitySangron ?? scoreB?.oyesProximity ?? null;
    
    let winnerId: string | null = null;
    let loserId: string | null = null;
    
    if (proximityA !== null && proximityB !== null) {
      // Both have ranking - lower wins
      if (proximityA < proximityB) {
        winnerId = playerAId;
        loserId = playerBId;
      } else if (proximityB < proximityA) {
        winnerId = playerBId;
        loserId = playerAId;
      }
      // Same ranking = tie, no winner
    } else if (proximityA !== null && proximityB === null) {
      // Only A has ranking - A wins
      winnerId = playerAId;
      loserId = playerBId;
    } else if (proximityB !== null && proximityA === null) {
      // Only B has ranking - B wins
      winnerId = playerBId;
      loserId = playerAId;
    }
    // Both null = tie (no winner)
    
    if (winnerId && loserId) {
      summaries.push({
        playerId: winnerId,
        vsPlayer: loserId,
        betType: 'Rayas Oyes',
        amount: segmentValue,
        segment: segment,
        holeNumber: holeNum,
        description: `Oyes H${holeNum} (Sangrón)`,
      });
      summaries.push({
        playerId: loserId,
        vsPlayer: winnerId,
        betType: 'Rayas Oyes',
        amount: -segmentValue,
        segment: segment,
        holeNumber: holeNum,
        description: `Oyes H${holeNum} (Sangrón)`,
      });
      
      // Add to details
      if (!detailsByPair.has(pairKey)) {
        detailsByPair.set(pairKey, []);
      }
      detailsByPair.get(pairKey)!.push({
        source: 'oyes',
        segment: segment,
        holeNumber: holeNum,
        description: `Oyes H${holeNum} (Sangrón)`,
        // IMPORTANT: store rayasCount with deterministic perspective based on sorted pair ids.
        // This prevents sign flips when different call sites pass (A,B) in different order.
        rayasCount: winnerId === idLow ? 1 : -1,
        valuePerRaya: segmentValue,
        appliedSegment: segment,
      });
    }
  });
};

/**
 * Process Oyes for a PAIR with Acumulados modality
 * 
 * CORRECTED CARRY LOGIC (segmented by vuelta):
 * - carry_front[pair]: accumulates ONLY in Front Par 3s
 * - carry_back[pair]: accumulates ONLY in Back Par 3s
 * 
 * When a winner is determined in Back:
 * 1. First liquidate any pending front carry (at FRONT value, attributed to FRONT segment)
 * 2. Then liquidate back carry + current hole (at BACK value, attributed to BACK segment)
 * 
 * This ensures dashboard displays correct values per segment.
 */
const processOyesAcumuladosForPair = (
  playerAId: string,
  playerBId: string,
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  summaries: BetSummary[],
  detailsByPair: Map<string, RayaDetail[]>,
  startingHole: 1 | 10 = 1
): void => {
  const par3Holes = getPar3Holes(course);
  const oyesConfig = getEffectiveSegmentConfig(config, 'oyes', playerAId, playerBId);
  
  if (!oyesConfig.enabled) return;
  
  const pairKey = [playerAId, playerBId].sort().join('-');
  const [idLow, idHigh] = [playerAId, playerBId].sort();
  
  // Separate par 3s by segment using dynamic ranges
  const segRanges = getSegmentHoleRanges(startingHole);
  const frontPar3s = par3Holes.filter(h => h >= segRanges.front[0] && h <= segRanges.front[1]);
  const backPar3s = par3Holes.filter(h => h >= segRanges.back[0] && h <= segRanges.back[1]);
  
  // Track carry SEPARATELY per segment
  let carryFront = 0; // Accumulates only from Front holes where nobody won
  let carryBack = 0;  // Accumulates only from Back holes where nobody won
  
  // Helper to determine winner for a hole
  const getOyesWinner = (holeNum: number): { winnerId: string | null; loserId: string | null } => {
    const scoresA = scores.get(playerAId) || [];
    const scoresB = scores.get(playerBId) || [];
    
    const scoreA = scoresA.find(s => s.holeNumber === holeNum);
    const scoreB = scoresB.find(s => s.holeNumber === holeNum);
    
    const proximityA = scoreA?.oyesProximity ?? null;
    const proximityB = scoreB?.oyesProximity ?? null;
    
    if (proximityA === null && proximityB === null) {
      // Neither has ranking - will accumulate
      return { winnerId: null, loserId: null };
    } else if (proximityA !== null && proximityB === null) {
      return { winnerId: playerAId, loserId: playerBId };
    } else if (proximityB !== null && proximityA === null) {
      return { winnerId: playerBId, loserId: playerAId };
    } else {
      // Both have ranking - lower wins
      if (proximityA! < proximityB!) {
        return { winnerId: playerAId, loserId: playerBId };
      } else if (proximityB! < proximityA!) {
        return { winnerId: playerBId, loserId: playerAId };
      }
      // Same ranking = tie
      return { winnerId: null, loserId: null };
    }
  };
  
  // Process Front 9 Par 3s
  frontPar3s.forEach(holeNum => {
    const { winnerId, loserId } = getOyesWinner(holeNum);
    
    if (!winnerId) {
      // No winner - accumulate in front carry
      carryFront += 1;
      return;
    }
    
    // Winner found - pay front carry + this hole
    const rayasWon = carryFront + 1;
    carryFront = 0;
    
    summaries.push({
      playerId: winnerId,
      vsPlayer: loserId!,
      betType: 'Rayas Oyes',
      amount: rayasWon * oyesConfig.frontValue,
      segment: 'front',
      holeNumber: holeNum,
      description: `Oyes H${holeNum}${rayasWon > 1 ? ` (${rayasWon} acum)` : ''}`,
    });
    summaries.push({
      playerId: loserId!,
      vsPlayer: winnerId,
      betType: 'Rayas Oyes',
      amount: -rayasWon * oyesConfig.frontValue,
      segment: 'front',
      holeNumber: holeNum,
      description: `Oyes H${holeNum}`,
    });
    
    if (!detailsByPair.has(pairKey)) {
      detailsByPair.set(pairKey, []);
    }
    detailsByPair.get(pairKey)!.push({
      source: 'oyes',
      segment: 'front',
      holeNumber: holeNum,
      description: `Oyes H${holeNum}${rayasWon > 1 ? ` (+${rayasWon - 1} acum)` : ''}`,
      // Deterministic perspective by sorted pair ids
      rayasCount: winnerId === idLow ? rayasWon : -rayasWon,
      valuePerRaya: oyesConfig.frontValue,
      appliedSegment: 'front',
    });
  });
  
  // After Front 9 processing, any remaining carryFront needs to be paid
  // when there's a winner in Back 9
  const pendingFrontCarry = carryFront;
  let frontCarrySettled = false;
  
  // Process Back 9 Par 3s
  backPar3s.forEach(holeNum => {
    const { winnerId, loserId } = getOyesWinner(holeNum);
    
    if (!winnerId) {
      // No winner - accumulate in back carry
      carryBack += 1;
      return;
    }
    
    // Winner found!
    // Step 1: If there's pending front carry, settle it FIRST (at front value, attributed to front segment)
    if (!frontCarrySettled && pendingFrontCarry > 0) {
      frontCarrySettled = true;
      
      summaries.push({
        playerId: winnerId,
        vsPlayer: loserId!,
        betType: 'Rayas Oyes',
        amount: pendingFrontCarry * oyesConfig.frontValue,
        segment: 'front', // Attributed to FRONT segment
        holeNumber: holeNum,
        description: `Oyes Carry del Front (${pendingFrontCarry} rayas)`,
      });
      summaries.push({
        playerId: loserId!,
        vsPlayer: winnerId,
        betType: 'Rayas Oyes',
        amount: -pendingFrontCarry * oyesConfig.frontValue,
        segment: 'front', // Attributed to FRONT segment
        holeNumber: holeNum,
        description: `Oyes Carry del Front`,
      });
      
      if (!detailsByPair.has(pairKey)) {
        detailsByPair.set(pairKey, []);
      }
      detailsByPair.get(pairKey)!.push({
        source: 'oyes',
        segment: 'front', // Attributed to FRONT for dashboard
        holeNumber: holeNum,
        description: `Carry Front (${pendingFrontCarry} rayas pagadas en H${holeNum})`,
        // Deterministic perspective by sorted pair ids
        rayasCount: winnerId === idLow ? pendingFrontCarry : -pendingFrontCarry,
        valuePerRaya: oyesConfig.frontValue,
        appliedSegment: 'front', // Front value applies
      });
    }
    
    // Step 2: Pay back carry + this hole (at back value, attributed to back segment)
    const backRayasWon = carryBack + 1;
    carryBack = 0;
    
    summaries.push({
      playerId: winnerId,
      vsPlayer: loserId!,
      betType: 'Rayas Oyes',
      amount: backRayasWon * oyesConfig.backValue,
      segment: 'back',
      holeNumber: holeNum,
      description: `Oyes H${holeNum}${backRayasWon > 1 ? ` (${backRayasWon} acum)` : ''}`,
    });
    summaries.push({
      playerId: loserId!,
      vsPlayer: winnerId,
      betType: 'Rayas Oyes',
      amount: -backRayasWon * oyesConfig.backValue,
      segment: 'back',
      holeNumber: holeNum,
      description: `Oyes H${holeNum}`,
    });
    
    if (!detailsByPair.has(pairKey)) {
      detailsByPair.set(pairKey, []);
    }
    detailsByPair.get(pairKey)!.push({
      source: 'oyes',
      segment: 'back',
      holeNumber: holeNum,
      description: `Oyes H${holeNum}${backRayasWon > 1 ? ` (+${backRayasWon - 1} acum)` : ''}`,
      // Deterministic perspective by sorted pair ids
      rayasCount: winnerId === idLow ? backRayasWon : -backRayasWon,
      valuePerRaya: oyesConfig.backValue,
      appliedSegment: 'back',
    });
  });
};

/**
 * Process Oyes for Single Winner mode
 * The absolute closest player (#1) wins 1 raya vs ALL other active players on that hole
 */
const processOyesSingleWinner = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  summaries: BetSummary[],
  detailsByPair: Map<string, RayaDetail[]>,
  startingHole: 1 | 10 = 1
): void => {
  const par3Holes = getPar3Holes(course);
  const segRanges = getSegmentHoleRanges(startingHole);
  const frontPar3s = par3Holes.filter(h => h >= segRanges.front[0] && h <= segRanges.front[1]);
  const backPar3s = par3Holes.filter(h => h >= segRanges.back[0] && h <= segRanges.back[1]);

  // Track carry per pair, segmented by vuelta (Front/Back)
  // key = sorted pair key, value = { front: number, back: number }
  const pairCarry = new Map<string, { front: number; back: number }>();

  const getOrCreateCarry = (pairKey: string) => {
    if (!pairCarry.has(pairKey)) pairCarry.set(pairKey, { front: 0, back: 0 });
    return pairCarry.get(pairKey)!;
  };

  // Initialize carry entries for all active pairs
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      if (!isRayasActiveForPair(config, players[i].id, players[j].id)) continue;
      if (!shouldCalculatePair(config.rayas, players[i].id, players[j].id)) continue;
      const oyesCfg = getEffectiveSegmentConfig(config, 'oyes', players[i].id, players[j].id);
      if (!oyesCfg.enabled) continue;
      const pk = [players[i].id, players[j].id].sort().join('-');
      getOrCreateCarry(pk);
    }
  }

  const processHole = (holeNum: number, segment: 'front' | 'back') => {
    // Find the absolute closest player (ranking = 1)
    let closestPlayerId: string | null = null;

    for (const player of players) {
      const playerScores = scores.get(player.id) || [];
      const holeScore = playerScores.find(s => s.holeNumber === holeNum);
      const proximity = holeScore?.oyesProximity ?? holeScore?.oyesProximitySangron ?? null;

      if (proximity === 1) {
        closestPlayerId = player.id;
        break;
      }
    }

    if (!closestPlayerId) {
      // No winner on this hole — accumulate carry for every active pair
      pairCarry.forEach((carry) => {
        carry[segment] += 1;
      });
      return;
    }

    // Winner found — settle carry + current hole for each rival
    players.forEach(rival => {
      if (rival.id === closestPlayerId) return;

      if (!isRayasActiveForPair(config, closestPlayerId!, rival.id)) return;
      if (!shouldCalculatePair(config.rayas, closestPlayerId!, rival.id)) return;

      const oyesConfig = getEffectiveSegmentConfig(config, 'oyes', closestPlayerId!, rival.id);
      if (!oyesConfig.enabled) return;

      const pairKey = [closestPlayerId!, rival.id].sort().join('-');
      const [idLow] = [closestPlayerId!, rival.id].sort();
      const carry = getOrCreateCarry(pairKey);

      // Step 1: If resolving in Back and there's pending Front carry, settle at Front value
      if (segment === 'back' && carry.front > 0) {
        const frontCarryCount = carry.front;
        carry.front = 0;

        summaries.push({
          playerId: closestPlayerId!,
          vsPlayer: rival.id,
          betType: 'Rayas Oyes',
          amount: frontCarryCount * oyesConfig.frontValue,
          segment: 'front',
          holeNumber: holeNum,
          description: `Oyes Carry del Front (${frontCarryCount} rayas)`,
        });
        summaries.push({
          playerId: rival.id,
          vsPlayer: closestPlayerId!,
          betType: 'Rayas Oyes',
          amount: -frontCarryCount * oyesConfig.frontValue,
          segment: 'front',
          holeNumber: holeNum,
          description: `Oyes Carry del Front`,
        });

        if (!detailsByPair.has(pairKey)) detailsByPair.set(pairKey, []);
        detailsByPair.get(pairKey)!.push({
          source: 'oyes',
          segment: 'front',
          holeNumber: holeNum,
          description: `Carry Front (${frontCarryCount} rayas pagadas en H${holeNum})`,
          rayasCount: closestPlayerId! === idLow ? frontCarryCount : -frontCarryCount,
          valuePerRaya: oyesConfig.frontValue,
          appliedSegment: 'front',
        });
      }

      // Step 2: Settle current segment carry + this hole
      const segmentCarryCount = carry[segment] + 1;
      carry[segment] = 0;

      const segmentValue = segment === 'front' ? oyesConfig.frontValue : oyesConfig.backValue;

      summaries.push({
        playerId: closestPlayerId!,
        vsPlayer: rival.id,
        betType: 'Rayas Oyes',
        amount: segmentCarryCount * segmentValue,
        segment: segment,
        holeNumber: holeNum,
        description: `Oyes H${holeNum}${segmentCarryCount > 1 ? ` (${segmentCarryCount} acum)` : ''} (ganador único)`,
      });
      summaries.push({
        playerId: rival.id,
        vsPlayer: closestPlayerId!,
        betType: 'Rayas Oyes',
        amount: -segmentCarryCount * segmentValue,
        segment: segment,
        holeNumber: holeNum,
        description: `Oyes H${holeNum} (ganador único)`,
      });

      if (!detailsByPair.has(pairKey)) detailsByPair.set(pairKey, []);
      detailsByPair.get(pairKey)!.push({
        source: 'oyes',
        segment: segment,
        holeNumber: holeNum,
        description: `Oyes H${holeNum}${segmentCarryCount > 1 ? ` (+${segmentCarryCount - 1} acum)` : ''} (ganador único)`,
        rayasCount: closestPlayerId! === idLow ? segmentCarryCount : -segmentCarryCount,
        valuePerRaya: segmentValue,
        appliedSegment: segment,
      });
    });
  };

  // Process Front 9 Par 3s
  frontPar3s.forEach(h => processHole(h, 'front'));

  // Process Back 9 Par 3s
  backPar3s.forEach(h => processHole(h, 'back'));
};

/**
 * Calculate Oyes rayas for all players
 * 
 * Handles TWO main modes based on config.rayas.oyesMode:
 * 
 * 1. "singleWinner": The absolute closest (#1) wins rayas vs ALL other players
 *    - Simple: whoever is #1 on a Par 3 wins 1 raya vs everyone else
 *    - No accumulation, no modality distinction
 * 
 * 2. "allVsAll": Each pair is compared independently
 *    - Respects per-pair modality (Acumulados vs Sangrón)
 *    - Acumulados: accumulates when neither has ranking
 *    - Sangrón: direct comparison, no accumulation
 */
const calculateOyesRayasForAll = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  startingHole: 1 | 10 = 1
): { summaries: BetSummary[]; details: Map<string, RayaDetail[]> } => {
  const summaries: BetSummary[] = [];
  const detailsByPair = new Map<string, RayaDetail[]>();
  
  // Check if oyes segment is globally disabled
  const oyesSegmentEnabled = config.rayas?.segments?.oyes?.enabled ?? true;
  if (!oyesSegmentEnabled) {
    return { summaries, details: detailsByPair };
  }
  
  const oyesMode = (config.rayas as any)?.oyesMode ?? 'allVsAll';
  
  if (oyesMode === 'singleWinner') {
    // Mode A: Un solo ganador - #1 beats all
    processOyesSingleWinner(players, scores, config, course, summaries, detailsByPair, startingHole);
  } else {
    // Mode B: Todos vs Todos - compare by pair with modality
    const processedPairs = new Set<string>();
    
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const playerA = players[i];
        const playerB = players[j];
        const pairKey = [playerA.id, playerB.id].sort().join('-');
        
        if (processedPairs.has(pairKey)) continue;
        if (!isRayasActiveForPair(config, playerA.id, playerB.id)) continue;
        if (!shouldCalculatePair(config.rayas, playerA.id, playerB.id)) continue;
        
        const modality = getOyesModalityForPair(config, playerA.id, playerB.id);
        
        if (modality === 'sangron') {
          processOyesSangronForPair(playerA.id, playerB.id, scores, config, course, summaries, detailsByPair, startingHole);
        } else {
          processOyesAcumuladosForPair(playerA.id, playerB.id, scores, config, course, summaries, detailsByPair, startingHole);
        }
        
        processedPairs.add(pairKey);
      }
    }
  }
  
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
  
  // Filter players by participantIds, respecting oneVsAll mode
  // CRITICAL: Use resolveParticipantsWithOneVsAll (not resolveParticipantsForGroup)
  // so that in oneVsAll mode (where participantIds contains only the anchor),
  // ALL group players are returned and pair filtering is done by shouldCalculatePair.
  const playersByGroup = groupPlayersByGroup(players);
  const participatingPlayers = playersByGroup.flatMap(groupPlayers => {
    const groupId = groupPlayers[0]?.groupId;
    const resolved = resolveConfigForGroup(config, groupId);
    return resolveParticipantsWithOneVsAll(config.rayas, players, resolved.rayas?.participantIds, groupPlayers);
  });
  
  const summaries: BetSummary[] = [];
  
  // Calculate Oyes rayas (absolute closest) — only among participating players
  const { summaries: oyesSummaries } = calculateOyesRayasForAll(participatingPlayers, scores, config, course, startingHole);
  summaries.push(...oyesSummaries);
  
  // Calculate bilateral rayas (skins, units, medal)
  for (let i = 0; i < participatingPlayers.length; i++) {
    for (let j = i + 1; j < participatingPlayers.length; j++) {
      const playerA = participatingPlayers[i];
      const playerB = participatingPlayers[j];
      
      // Check if rayas is active for this pair (respects bilateral overrides)
      if (!isRayasActiveForPair(config, playerA.id, playerB.id)) {
        continue;
      }
      // Skip non-anchor pairs in oneVsAll mode
      if (!shouldCalculatePair(config.rayas, playerA.id, playerB.id)) continue;
      
      const result = calculateRayasForPair(playerA, playerB, scores, config, course, bilateralHandicaps, startingHole);
      
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
  allPlayers?: Player[],
  startingHole: 1 | 10 = 1
): RayasPairResult => {
  const bilateralResult = calculateRayasForPair(playerA, playerB, scores, config, course, bilateralHandicaps, startingHole);
  
  // Check if Oyes segment is enabled for THIS SPECIFIC PAIR (bilateral override)
  const oyesConfig = getEffectiveSegmentConfig(config, 'oyes', playerA.id, playerB.id);
  
  // If we have all players and Oyes is enabled for this pair, calculate Oyes details
  if (allPlayers && allPlayers.length > 0 && oyesConfig.enabled) {
    const { details: oyesDetailsByPair } = calculateOyesRayasForAll(allPlayers, scores, config, course, startingHole);
    
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
    
    // Use bilateral override values for Oyes if available
    const frontValue = oyesConfig.frontValue;
    const backValue = oyesConfig.backValue;
    
    // Sum up Oyes amounts for this pair using the correct values
    let oyesFrontAmountA = 0;
    let oyesBackAmountA = 0;
    normalizedOyesDetails.forEach(d => {
      // Override the valuePerRaya with the pair-specific value
      const correctedValue = d.appliedSegment === 'front' ? frontValue : backValue;
      if (d.appliedSegment === 'front') {
        oyesFrontAmountA += d.rayasCount * correctedValue;
      } else if (d.appliedSegment === 'back') {
        oyesBackAmountA += d.rayasCount * correctedValue;
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
  bilateralHandicaps?: BilateralHandicap[],
  startingHole: 1 | 10 = 1
): { source: string; frontRayas: number; backRayas: number; totalRayas: number }[] => {
  const playerA = players.find(p => p.id === playerAId);
  const playerB = players.find(p => p.id === playerBId);
  if (!playerA || !playerB) return [];
  
  const result = calculateRayasForPair(playerA, playerB, scores, config, course, bilateralHandicaps, startingHole);
  
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
