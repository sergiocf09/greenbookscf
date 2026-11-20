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

const hasId = (v: unknown): v is Record<string, unknown> & { id: string } =>
  isObject(v) && typeof v.id === 'string';

/**
 * Three-way merge of an id-keyed list (e.g. Zoológico events): keeps events other
 * phones added, applies only this phone's additions/edits/deletions.
 */
export function mergeIdArray(base: unknown, local: unknown[], remote: unknown): unknown[] {
  const baseArr = Array.isArray(base) ? base : [];
  const remoteArr = Array.isArray(remote) ? remote : [];
  if (![...baseArr, ...local, ...remoteArr].every(hasId)) return local;
  const baseMap = new Map(baseArr.map(e => [(e as { id: string }).id, e]));
  const localMap = new Map(local.map(e => [(e as { id: string }).id, e]));
  const out: unknown[] = [];
  const seen = new Set<string>();
  for (const r of remoteArr as Array<{ id: string }>) {
    seen.add(r.id);
    if (baseMap.has(r.id) && !localMap.has(r.id)) continue; // deleted on this phone
    const l = localMap.get(r.id);
    out.push(l !== undefined && !same(baseMap.get(r.id), l) ? mergeBetConfigChanges(baseMap.get(r.id), l, r) : r);
  }
  for (const l of local as Array<{ id: string }>) {
    if (seen.has(l.id) || baseMap.has(l.id)) continue; // already merged, or deleted remotely
    out.push(l);
  }
  return out;
}

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
      } else if (key === 'events' && Array.isArray(local[key])) {
        result[key] = mergeIdArray(base[key], local[key] as unknown[], result[key]);
      } else result[key] = mergeBetConfigChanges(base[key], local[key], result[key]);
    }
    return result;
  }
  return local;
}

export const rebaseBetConfig = (base: unknown, local: BetConfig, remote: unknown): BetConfig =>
  mergeBetConfigChanges(base, local, remote) as BetConfig;