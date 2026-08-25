import React from 'react';
import type { HandicapTrendPoint } from '@/hooks/useHandicapTrendSeries';
import {
  HANDICAP_TREND_THRESHOLD,
  HANDICAP_TREND_WINDOW_DAYS,
  classifyHandicapTrend,
  handicapTrendColorClass,
} from '@/lib/handicapTrend';

interface Props {
  /** Tendencia (actual - referencia). Define el color y la pendiente. */
  trend: number | null;
  /** Hándicap actual mostrado en la misma fila. */
  currentHandicap: number;
  /** Hándicap de referencia (inicio de la ventana), si se conoce. */
  referenceHandicap?: number | null;
  /** Puntos guardados del Handicap Index para dibujar una tendencia compacta. */
  points?: HandicapTrendPoint[];
  variant?: 'delta' | 'series';
  width?: number;
  height?: number;
}

/**
 * Mini gráfica de la única comparación que define el color:
 * Handicap Index de referencia (ventana mensual) vs. Handicap Index actual.
 * Eje directo: si el HCP baja (mejora) la línea baja.
 */
export const HandicapSparkline: React.FC<Props> = ({
  trend,
  currentHandicap,
  referenceHandicap,
  points,
  variant = 'delta',
  width = 40,
  height = 14,
}) => {
  const status = classifyHandicapTrend(trend);
  const colorClass = status === 'stable' ? 'text-muted-foreground' : handicapTrendColorClass(status);
  const pad = 2;
  const midY = height / 2;
  const startX = pad;
  const endX = width - pad;

  if (variant === 'series' && points?.length) {
    const reference = referenceHandicap ?? (trend === null ? currentHandicap : currentHandicap - trend);
    const sortedPoints = [...points]
      .filter(point => Number.isFinite(point.handicap))
      .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
    const firstPoint = sortedPoints[0] ?? { recordedAt: new Date().toISOString(), handicap: reference };
    const pointsWithCurrent = [
      firstPoint,
      ...sortedPoints.slice(1),
      { recordedAt: new Date().toISOString(), handicap: currentHandicap },
    ];
    const compactPoints = pointsWithCurrent.length > 20
      ? [pointsWithCurrent[0], ...pointsWithCurrent.slice(-19)]
      : pointsWithCurrent;
    const values = compactPoints.map(point => point.handicap);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = Math.max(maxValue - minValue, 0.6);
    const innerWidth = width - pad * 2;
    const innerHeight = height - pad * 2;
    const denom = Math.max(compactPoints.length - 1, 1);
    const toX = (index: number) => pad + (index / denom) * innerWidth;
    const toY = (handicap: number) => pad + ((maxValue - handicap) / range) * innerHeight;
    const path = compactPoints
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${toX(index).toFixed(2)} ${toY(point.handicap).toFixed(2)}`)
      .join(' ');
    const label = `Tendencia ${HANDICAP_TREND_WINDOW_DAYS}d: ${reference.toFixed(1)} → ${currentHandicap.toFixed(1)}`;

    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={`shrink-0 ${colorClass}`}
        role="img"
        aria-label={label}
      >
        <title>{label}</title>
        <line x1={startX} y1={height - pad} x2={endX} y2={height - pad} stroke="currentColor" strokeWidth={0.75} opacity={0.16} />
        <path d={path} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={toX(0)} cy={toY(compactPoints[0].handicap)} r={1.5} fill="hsl(var(--background))" stroke="currentColor" strokeWidth={0.9} />
        <circle cx={toX(compactPoints.length - 1)} cy={toY(currentHandicap)} r={1.6} fill="currentColor" />
      </svg>
    );
  }

  if (trend === null) {
    return (
      <svg width={width} height={height} aria-hidden className={`shrink-0 opacity-40 ${colorClass}`}>
        <line x1={startX} y1={midY} x2={endX} y2={midY} stroke="currentColor" strokeWidth={1.25} strokeDasharray="2 2" />
      </svg>
    );
  }

  const isStable = Math.abs(trend) <= HANDICAP_TREND_THRESHOLD;
  const maxOffset = midY - pad;
  const normalizedMagnitude = Math.min(Math.abs(trend), 2.5) / 2.5;
  const offset = maxOffset * Math.max(0.55, normalizedMagnitude);
  const startY = isStable ? midY : trend > 0 ? midY + offset : midY - offset;
  const endY = isStable ? midY : trend > 0 ? midY - offset : midY + offset;
  const reference = referenceHandicap ?? currentHandicap - trend;
  const label = `Tendencia ${HANDICAP_TREND_WINDOW_DAYS}d: ${reference.toFixed(1)} → ${currentHandicap.toFixed(1)}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`shrink-0 ${colorClass}`}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <line x1={startX} y1={midY} x2={endX} y2={midY} stroke="currentColor" strokeWidth={0.75} opacity={0.22} />
      {/* Marcador vertical del punto de referencia */}
      <line x1={startX} y1={pad * 0.5} x2={startX} y2={height - pad * 0.5} stroke="currentColor" strokeWidth={0.75} opacity={0.35} strokeDasharray="1.5 1.5" />
      <line x1={startX} y1={startY} x2={endX} y2={endY} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      {/* Referencia: círculo hueco. Actual: punto sólido. */}
      <circle cx={startX} cy={startY} r={1.6} fill="hsl(var(--background))" stroke="currentColor" strokeWidth={0.9} />
      <circle cx={endX} cy={endY} r={1.6} fill="currentColor" />
    </svg>
  );
};
