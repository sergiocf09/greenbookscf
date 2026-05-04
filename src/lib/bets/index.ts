/**
 * Barrel re-export for src/lib/bets/
 * All bet modules are re-exported here for clean imports.
 */

// Shared utilities & types
export * from './shared';

// Individual bet calculators
export { calculateMedalBets } from './medal';
export { calculatePressureBets, getPressureEvolution, type PressureHoleState, type PressureEvolution } from './pressures';
export { calculateMatchPlayBets } from './matchPlay';
export { calculateBloquesBets, calculateBloquesForPair, type BloqueResult } from './bloques';
export { calculateUnitsBets } from './units';
export { calculateManchasBets } from './manchas';
export { calculateCulebrasBets } from './culebras';
export { calculatePinguinosBets } from './pinguinos';
export { calculateMedalGeneralBets } from './medalGeneral';
export { calculatePuttsGeneralBets } from './puttsGeneral';
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

// Sprint 3 new bets
export { calculateWolfBets, getWolfPlayerId, computeEffectiveAmount, resolveWolfHole, isWolfCarryoverHole, buildWolfHoleDetails } from './wolf';
export { calculateSixesBets, buildSixesSetResults } from './sixes';
export { calculateVegasBets, buildVegasSetResults, formVegasNumber } from './vegas';
export { calculateNinesBets, buildNinesHoleDetails, calculateNinesPlayerSummaries, distributeNinesPoints } from './nines';
