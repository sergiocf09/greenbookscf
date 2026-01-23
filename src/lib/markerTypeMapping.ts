import type { MarkerState } from '@/types/golf';

// DB enum uses snake_case, UI state uses camelCase.
// Keep this mapping centralized to avoid silent failures when persisting/restoring markers.

export type MarkerKey = keyof MarkerState;

// Complete mapping (manual + auto-detected) for consistency.
export const markerKeyToDb: Record<MarkerKey, string> = {
  birdie: 'birdie',
  eagle: 'eagle',
  albatross: 'albatross',
  cuatriput: 'cuatriput',
  sandyPar: 'sandy_par',
  aquaPar: 'aqua_par',
  holeOut: 'hole_out',
  ladies: 'ladies',
  swingBlanco: 'swing_blanco',
  retruje: 'retruje',
  trampa: 'trampa',
  dobleAgua: 'doble_agua',
  dobleOB: 'doble_ob',
  par3GirMas3: 'par3_gir_mas_3',
  dobleDigito: 'doble_digito',
  moreliana: 'moreliana',
  culebra: 'culebra',
};

const dbToMarkerKey: Record<string, MarkerKey> = Object.fromEntries(
  Object.entries(markerKeyToDb).map(([k, v]) => [v, k as MarkerKey])
) as Record<string, MarkerKey>;

export const markerDbToKey = (dbValue: string | null | undefined): MarkerKey | null => {
  if (!dbValue) return null;
  return dbToMarkerKey[String(dbValue)] ?? null;
};
