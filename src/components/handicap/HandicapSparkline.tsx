import React from 'react';
import type { HandicapTrendPoint } from '@/hooks/useHandicapTrendSeries';

interface Props {
  points: HandicapTrendPoint[];
  /** Tendencia (actual - referencia). Define el color, igual que el número de HCP. */
  trend: number | null;
  /** Hándicap actual mostrado en la misma fila. */
  currentHandicap: number;
  width?: number;
  height?: number;
}

const TREND_THRESHOLD = 0.4;

const colorClassForTrend = (trend: number | null) => {
  if (trend === null) return 'text-muted-foreground';
  if (trend < -TREND_THRESHOLD) return 'text-green-600 dark:text-green-400';
  if (trend > TREND_THRESHOLD) return 'text-red-600 dark:text-red-400';
  return 'text-muted-foreground';
};

/**
 * Mini gráfica de la misma comparación que colorea el HCP:
 * referencia de hace 30+ días vs. HCP actual. Si el cambio no rebasa el umbral,
 * se muestra plana para no sugerir una tendencia que el color no está usando.
 */
export const HandicapSparkline: React.FC<Props> = ({ points, trend, currentHandicap, width = 34, height = 14 }) => {
  const colorClass = colorClassForTrend(trend);
  const pad = 2;
  const midY = height / 2;
  const startX = pad;
  const endX = width - pad;

  if (trend === null) {
    return (
      <svg width={width} height={height} aria-hidden className={`shrink-0 opacity-40 ${colorClass}`}>
        <line x1={startX} y1={midY} x2={endX} y2={midY} stroke="currentColor" strokeWidth={1.25} strokeDasharray="2 2" />
      </svg>
    );
  }

  const isStable = Math.abs(trend) <= TREND_THRESHOLD;
  const maxOffset = midY - pad;
  const normalizedMagnitude = Math.min(Math.abs(trend), 2.5) / 2.5;
  const offset = maxOffset * Math.max(0.55, normalizedMagnitude);
  const startY = isStable ? midY : trend > 0 ? midY - offset : midY + offset;
  const endY = isStable ? midY : trend > 0 ? midY + offset : midY - offset;
  const referenceHandicap = currentHandicap - trend;
  const latestPointLabel = points.length > 0 ? `, ${points.length} registros` : '';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`shrink-0 ${colorClass}`}
      role="img"
      aria-label={`Tendencia de hándicap 30 días: ${referenceHandicap.toFixed(1)} a ${currentHandicap.toFixed(1)}${latestPointLabel}`}
    >
      <line x1={startX} y1={midY} x2={endX} y2={midY} stroke="currentColor" strokeWidth={0.75} opacity={0.22} />
      <line x1={startX} y1={startY} x2={endX} y2={endY} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={endX} cy={endY} r={1.6} fill="currentColor" />
    </svg>
  );
};
