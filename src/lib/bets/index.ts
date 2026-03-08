/**
 * Barrel re-export for src/lib/bets/
 * All bet modules are re-exported here for clean imports.
 */

// Shared utilities & types
export * from './shared';

// Individual bet calculators
export { calculateMedalBets } from './medal';
export { calculatePressureBets } from './pressures';
export { calculateUnitsBets } from './units';
export { calculateManchasBets } from './manchas';
export { calculateCulebrasBets } from './culebras';
export { calculatePinguinosBets } from './pinguinos';
export { calculateMedalGeneralBets } from './medalGeneral';
export { calculatePuttsBets } from './putts';
export { calculateSideBets } from './sideBets';
export { calculateStablefordBets } from './stableford';

// Evolution / tooltip helpers
export { getPressureEvolution, type PressureHoleState, type PressureEvolution } from './pressureEvolution';
export { getSkinsEvolution, type SkinsHoleState, type SkinsEvolution } from './skinsEvolution';
