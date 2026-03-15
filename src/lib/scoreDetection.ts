import { MarkerState } from '@/types/golf';

/**
 * Auto-detect score-based markers
 * Returns partial MarkerState with auto-detected values
 */
export const detectScoreBasedMarkers = (
  strokes: number,
  putts: number,
  par: number
): Partial<MarkerState> => {
  const scoreToPar = strokes - par;
  
  return {
    // Under par achievements
    albatross: scoreToPar <= -3,
    eagle: scoreToPar === -2,
    birdie: scoreToPar === -1,
    // Putt-based auto-detection
    cuatriput: putts >= 4,
    // moreliana is MANUAL ONLY — never auto-detect (ball off green while putting)
    culebra: putts >= 3, // 3+ putts for cumulative bet
    // Score-based stains
    dobleDigito: strokes >= 10,
  };
};

/**
 * Merge auto-detected markers with manually set markers
 */
export const mergeMarkers = (
  autoDetected: Partial<MarkerState>,
  manual: MarkerState
): MarkerState => {
  return {
    ...manual,
    // Override with auto-detected values for score-based markers
    birdie: autoDetected.birdie ?? manual.birdie,
    eagle: autoDetected.eagle ?? manual.eagle,
    albatross: autoDetected.albatross ?? manual.albatross,
    cuatriput: autoDetected.cuatriput ?? manual.cuatriput,
    moreliana: manual.moreliana,
    culebra: autoDetected.culebra ?? manual.culebra,
    dobleDigito: autoDetected.dobleDigito ?? manual.dobleDigito,
  };
};

/**
 * Check if a marker is auto-detected (not manually toggleable)
 */
export const isAutoDetectedMarker = (key: keyof MarkerState): boolean => {
  const autoDetectedKeys: (keyof MarkerState)[] = [
    'birdie',
    'eagle',
    'albatross',
    'cuatriput',
    'culebra',
    'dobleDigito',
  ];
  return autoDetectedKeys.includes(key);
};

/**
 * Get manually toggleable unit markers (positive)
 */
export const getManualUnitMarkers = (): (keyof MarkerState)[] => {
  return ['sandyPar', 'aquaPar', 'holeOut'];
};

/**
 * Get manually toggleable stain markers (negative)
 */
export const getManualStainMarkers = (): (keyof MarkerState)[] => {
  return ['ladies', 'swingBlanco', 'retruje', 'trampa', 'dobleAgua', 'par3GirMas3', 'dobleOB', 'moreliana'];
};
