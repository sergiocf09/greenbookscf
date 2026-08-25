import type { HandicapTrendPoint } from '@/hooks/useHandicapTrendSeries';

/** Ventana única de tendencia de Handicap Index usada en ranking e historial. */
export const HANDICAP_TREND_WINDOW_DAYS = 90;
/** Umbral de estabilidad: cambios menores no se consideran tendencia. */
export const HANDICAP_TREND_THRESHOLD = 0.4;
/** Antigüedad máxima aceptada para la referencia (evita comparar contra datos muy viejos). */
export const HANDICAP_TREND_MAX_REFERENCE_DAYS = 240;

export type HandicapTrendStatus = 'improving' | 'worsening' | 'stable' | 'unknown';

export interface HandicapTrend {
  /** actual - referencia. Negativo = mejoró. */
  trend: number | null;
  referenceHandicap: number | null;
  referenceDate: string | null;
  status: HandicapTrendStatus;
}

const dayMs = 24 * 60 * 60 * 1000;

/**
 * Tendencia = Handicap Index actual − Handicap Index de referencia (el registro
 * guardado más reciente con antigüedad ≥ ventana). Misma definición en todas las pantallas.
 */
export const computeHandicapTrend = (
  points: HandicapTrendPoint[] | undefined,
  currentHandicap: number | null | undefined,
): HandicapTrend => {
  if (currentHandicap == null || !points || points.length === 0) {
    return { trend: null, referenceHandicap: null, referenceDate: null, status: 'unknown' };
  }

  const sorted = [...points].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
  );
  const reference = sorted[0];
  const ageDays = (Date.now() - new Date(reference.recordedAt).getTime()) / dayMs;
  if (!Number.isFinite(reference.handicap) || ageDays > HANDICAP_TREND_MAX_REFERENCE_DAYS) {
    return { trend: null, referenceHandicap: null, referenceDate: null, status: 'unknown' };
  }

  const trend = Number((currentHandicap - reference.handicap).toFixed(2));
  return {
    trend,
    referenceHandicap: reference.handicap,
    referenceDate: reference.recordedAt,
    status: classifyHandicapTrend(trend),
  };
};

export const classifyHandicapTrend = (trend: number | null): HandicapTrendStatus => {
  if (trend === null) return 'unknown';
  if (trend < -HANDICAP_TREND_THRESHOLD) return 'improving';
  if (trend > HANDICAP_TREND_THRESHOLD) return 'worsening';
  return 'stable';
};

export const handicapTrendLabel = (status: HandicapTrendStatus) => {
  if (status === 'improving') return 'Mejorando';
  if (status === 'worsening') return 'Empeorando';
  if (status === 'stable') return 'Estable';
  return 'Sin referencia';
};

export const handicapTrendColorClass = (status: HandicapTrendStatus) => {
  if (status === 'improving') return 'text-green-600 dark:text-green-400';
  if (status === 'worsening') return 'text-red-600 dark:text-red-400';
  if (status === 'stable') return 'text-foreground';
  return 'text-muted-foreground';
};
