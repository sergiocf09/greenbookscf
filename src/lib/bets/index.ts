/**
 * Barrel re-export for src/lib/bets/
 * All bet modules are re-exported here for clean imports.
 */

// Shared utilities & types
export * from './shared';

// Individual bet calculators
export { calculateMedalBets } from './medal';
export { calculatePressureBets, getPressureEvolution, type PressureHoleState, type PressureEvolution } from './pressures';
export { calculateUnitsBets } from './units';
export { calculateManchasBets } from './manchas';
export { calculateCulebrasBets } from './culebras';
export { calculatePinguinosBets } from './pinguinos';
export { calculateMedalGeneralBets } from './medalGeneral';
export { calculatePuttsBets } from './putts';
export { calculateSideBets } from './sideBets';
export { calculateStablefordBets } from './stableford';
export { calculateSkinsBets } from './skins';
export { calculateCarosBets } from './caros';
export { calculateCarritosBets } from './carritos';
export { calculateTeamPressuresBets } from './teamPressures';
export { calculateZoologicoBets, calculateZoologicoAnimalResult, type ZoologicoAnimalResult } from './zoologico';

// Evolution / tooltip helpers
export { getSkinsEvolution, type SkinsHoleState, type SkinsEvolution } from './skinsEvolution';

// Balance and summary helpers
export { getPlayerBalance, getBilateralBalance, groupSummariesByType, detectTiesNeedingResolution, type TieResolution } from './helpers';
