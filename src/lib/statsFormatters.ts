// Formatters reutilizables para el módulo de estadísticas

export function fmtPct(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return `${Number(value).toFixed(decimals)}%`;
}

export function fmtAvg(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return Number(value).toFixed(decimals);
}

export function fmtVsPar(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  const n = Number(value);
  if (n > 0) return `+${n.toFixed(1)}`;
  return n.toFixed(1);
}

export function vsParColor(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'text-muted-foreground';
  if (value < 0) return 'text-emerald-500';
  if (value <= 1.0) return 'text-yellow-500';
  return 'text-red-500';
}
