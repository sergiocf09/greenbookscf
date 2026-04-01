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
