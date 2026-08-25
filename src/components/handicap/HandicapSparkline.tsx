import React from 'react';
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
  width?: number;
  height?: number;
}

/**
 * Mini gráfica de la única comparación que define el color:
 * Handicap Index de referencia (ventana de 90 días) vs. Handicap Index actual.
 * Eje directo: si el HCP baja (mejora) la línea baja.
 */
export const HandicapSparkline: React.FC<Props> = ({
  trend,
  currentHandicap,
  referenceHandicap,
  width = 40,
  height = 14,
}) => {
  const status = classifyHandicapTrend(trend);
  const colorClass = status === 'stable' ? 'text-muted-foreground' : handicapTrendColorClass(status);
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

  const isStable = Math.abs(trend) <= HANDICAP_TREND_THRESHOLD;
  const maxOffset = midY - pad;
  const normalizedMagnitude = Math.min(Math.abs(trend), 2.5) / 2.5;
  const offset = maxOffset * Math.max(0.55, normalizedMagnitude);
  const startY = isStable ? midY : trend > 0 ? midY - offset : midY + offset;
  const endY = isStable ? midY : trend > 0 ? midY + offset : midY - offset;
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
