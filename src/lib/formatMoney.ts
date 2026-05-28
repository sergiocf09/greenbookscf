/**
 * Formatea un monto monetario redondeando a máximo 2 decimales.
 * Elimina decimales innecesarios (.00 o .10 → sin decimales o un decimal).
 * Ejemplos:
 *   125.00  → "125"
 *   125.50  → "125.5"
 *   125.256 → "125.26"
 *   125.255 → "125.26"
 */
export const fmtMoney = (value: number): string => {
  const rounded = Math.round(value * 100) / 100;
  if (rounded % 1 === 0) return rounded.toFixed(0);
  const str = rounded.toFixed(2);
  return str.endsWith('0') ? str.slice(0, -1) : str;
};

/** Formatea con signo y símbolo: +$125.5 / -$125.5 / $0 */
export const fmtMoneySign = (value: number): string => {
  if (value === 0) return '$0';
  return value > 0
    ? `+$${fmtMoney(value)}`
    : `-$${fmtMoney(Math.abs(value))}`;
};

/** Formatea solo el valor absoluto con símbolo: $125.5 */
export const fmtMoneyAbs = (value: number): string => {
  return `$${fmtMoney(Math.abs(value))}`;
};

/** Redondea un valor individual al múltiplo de 5 más cercano. */
export const roundToNearest5 = (value: number): number => {
  return Math.round(value / 5) * 5;
};

/**
 * Redondea una colección de valores al múltiplo de 5 más cercano preservando
 * la suma original (largest-remainder). Útil para mostrar balances que deben
 * cuadrar en Σ exacta (típicamente Σ = 0).
 *
 * - Si Σ(values) no es múltiplo de 5, se respeta la suma redondeada al
 *   múltiplo de 5 más cercano.
 * - Desvío máximo por elemento: ±$2.50 respecto al valor real.
 */
export const roundGroupToNearest5 = (values: number[]): number[] => {
  if (values.length === 0) return [];
  const targetSum = roundToNearest5(values.reduce((s, v) => s + v, 0));
  const base = values.map(v => roundToNearest5(v));
  const baseSum = base.reduce((s, v) => s + v, 0);
  let drift = (targetSum - baseSum) / 5; // entero (positivo o negativo)
  if (drift === 0) return base;

  // Información por índice para desempate estable.
  const meta = values.map((v, i) => ({
    i,
    residual: v - base[i], // en (-2.5, 2.5]
    abs: Math.abs(v),
  }));

  // Ordenar candidatos: si drift > 0 queremos los residuales más altos;
  // si drift < 0 los más bajos. Desempate por |v| descendente y luego por índice.
  meta.sort((a, b) => {
    const cmp = drift > 0 ? b.residual - a.residual : a.residual - b.residual;
    if (cmp !== 0) return cmp;
    if (b.abs !== a.abs) return b.abs - a.abs;
    return a.i - b.i;
  });

  const step = drift > 0 ? 5 : -5;
  const n = Math.min(Math.abs(drift), meta.length);
  for (let k = 0; k < n; k++) {
    base[meta[k].i] += step;
  }
  return base;
};

/** Versión Map: preserva la suma del Map en múltiplos de 5. */
export const roundGroupToNearest5Map = <K>(map: Map<K, number>): Map<K, number> => {
  const keys = Array.from(map.keys());
  const values = keys.map(k => map.get(k) ?? 0);
  const rounded = roundGroupToNearest5(values);
  const out = new Map<K, number>();
  keys.forEach((k, i) => out.set(k, rounded[i]));
  return out;
};
