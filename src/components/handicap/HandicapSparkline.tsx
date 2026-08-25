import React from 'react';
import type { HandicapTrendPoint } from '@/hooks/useHandicapTrendSeries';

interface Props {
  points: HandicapTrendPoint[];
  /** Tendencia (actual - referencia). Define el color, igual que el número de HCP. */
  trend: number | null;
  width?: number;
  height?: number;
}

const strokeForTrend = (trend: number | null) => {
  if (trend === null) return 'hsl(var(--muted-foreground))';
  if (trend < -0.4) return 'hsl(142 71% 40%)';
  if (trend > 0.4) return 'hsl(0 72% 51%)';
  return 'hsl(var(--muted-foreground))';
};

/**
 * Mini gráfica (sparkline) del Handicap Index en la ventana de tendencia.
 * El eje Y está invertido: un índice más bajo (mejor) se dibuja más arriba.
 */
export const HandicapSparkline: React.FC<Props> = ({ points, trend, width = 34, height = 14 }) => {
  const stroke = strokeForTrend(trend);

  if (points.length < 2) {
    return (
      <svg width={width} height={height} aria-hidden className="shrink-0 opacity-40">
        <line x1={1} y1={height / 2} x2={width - 1} y2={height / 2} stroke={stroke} strokeWidth={1} strokeDasharray="2 2" />
      </svg>
    );
  }

  const values = points.map(p => p.handicap);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 1.5;
  const innerH = height - pad * 2;
  const innerW = width - pad * 2;

  const coords = points.map((p, i) => {
    const x = pad + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    // Invertido: menor hándicap => más arriba
    const y = pad + ((p.handicap - min) / span) * innerH;
    return [x, y] as const;
  });

  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lastX, lastY] = coords[coords.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      role="img"
      aria-label={`Tendencia de hándicap: ${values[0].toFixed(1)} a ${values[values.length - 1].toFixed(1)}`}
    >
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={1.6} fill={stroke} />
    </svg>
  );
};
