// Fecha de activación del paywall — cambiar aquí para adelantar o retrasar
// CST México (UTC-6)
export const PAYWALL_ACTIVE_DATE = new Date('2026-10-05T00:00:00-06:00');

export function isPaywallActive(): boolean {
  return new Date() >= PAYWALL_ACTIVE_DATE;
}
