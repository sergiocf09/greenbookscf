import type { BetConfig, BetOverride } from '@/types/golf';

const same = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => same(a[k], b[k]));
  }
  return false;
};
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const overrideMap = (value: unknown): Record<string, unknown> => Object.fromEntries(
  (Array.isArray(value) ? value : []).map((override: BetOverride) => [
    [...[override.playerAId, override.playerBId].sort(), override.betType].join(':'), override,
  ]),
);

/** Rebase only local edits; untouched remote fields and rival overrides survive. */
export function mergeBetConfigChanges(base: unknown, local: unknown, remote: unknown): unknown {
  if (same(base, local)) return remote;
  if (isObject(base) && isObject(local)) {
    const result = { ...(isObject(remote) ? remote : {}) };
    for (const key of new Set([...Object.keys(base), ...Object.keys(local)])) {
      if (same(base[key], local[key])) continue;
      if (!(key in local)) delete result[key];
      else if (key === 'betOverrides' && Array.isArray(local[key])) {
        result[key] = Object.values(mergeBetConfigChanges(
          overrideMap(base[key]), overrideMap(local[key]), overrideMap(result[key]),
        ) as Record<string, unknown>);
      } else result[key] = mergeBetConfigChanges(base[key], local[key], result[key]);
    }
    return result;
  }
  return local;
}

export const rebaseBetConfig = (base: unknown, local: BetConfig, remote: unknown): BetConfig =>
  mergeBetConfigChanges(base, local, remote) as BetConfig;