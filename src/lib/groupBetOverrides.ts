/**
 * Group Bet Overrides - Resolution logic
 * 
 * The organizer's bet config acts as a "template" for all groups.
 * Each group can store overrides in `betConfig.groupBetOverrides[groupId]`.
 * This module resolves the effective config for a given group by merging
 * the template with any group-specific overrides.
 */

import { BetConfig, GroupBetOverride } from '@/types/golf';

/**
 * Resolve the effective BetConfig for a given group.
 * If no overrides exist for the group, returns the original config unchanged.
 * Overrides are shallow-merged per bet type (e.g., override.medal merges into config.medal).
 */
export const resolveConfigForGroup = (
  config: BetConfig,
  groupId: string | undefined
): BetConfig => {
  if (!groupId) return config;
  
  const overrides = config.groupBetOverrides?.[groupId];
  if (!overrides) return config;

  const resolved = { ...config };

  // Merge each overridden bet type
  for (const key of Object.keys(overrides) as Array<keyof GroupBetOverride>) {
    const override = overrides[key];
    if (!override) continue;
    
    const base = config[key as keyof BetConfig];
    if (base && typeof base === 'object' && !Array.isArray(base)) {
      const merged = Object.assign({}, base, override);
      (resolved as any)[key] = merged;
    }
  }

  return resolved;
};

/**
 * Check if a bet is effectively enabled for a group.
 * Uses the override if it exists, otherwise falls back to the template.
 */
export const isBetEnabledForGroup = (
  config: BetConfig,
  betKey: keyof BetConfig,
  groupId: string | undefined
): boolean => {
  const resolved = resolveConfigForGroup(config, groupId);
  const betConfig = resolved[betKey] as any;
  return betConfig?.enabled ?? false;
};

/**
 * Check if a bet is enabled in the base config OR in any group override.
 * Used by calculation engines to avoid early-return when G2+ enables a bet that G1 doesn't have.
 */
export const isBetEnabledAnywhere = (
  config: BetConfig,
  betKey: keyof BetConfig
): boolean => {
  const baseBet = config[betKey] as any;
  if (baseBet?.enabled) return true;
  const overrides = config.groupBetOverrides;
  if (!overrides) return false;
  return Object.values(overrides).some(groupOverride => {
    const betOverride = (groupOverride as any)?.[betKey];
    return betOverride?.enabled === true;
  });
};

/**
 * Set a group-specific override for a bet type.
 * Returns a new BetConfig with the override applied.
 */
export const setGroupBetOverride = <K extends keyof BetConfig>(
  config: BetConfig,
  groupId: string,
  betKey: K,
  updates: Partial<BetConfig[K]>
): BetConfig => {
  const currentOverrides = config.groupBetOverrides || {};
  const groupOverride = currentOverrides[groupId] || {};
  
  const currentBetOverride = (groupOverride[betKey] || {}) as Partial<BetConfig[K]>;
  const mergedBetOverride = { ...currentBetOverride, ...updates };

  return {
    ...config,
    groupBetOverrides: {
      ...currentOverrides,
      [groupId]: {
        ...groupOverride,
        [betKey]: mergedBetOverride,
      },
    },
  };
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Team-bet lists computed from the base config; entries are scoped by their players. */
const TEAM_LIST_KEYS = ['carritosTeams', 'sixesBets', 'vegasBets', 'ninesBets'] as const;
const TEAM_LIST_FLAGS: Record<string, string> = { sixesBets: 'sixesEnabled', vegasBets: 'vegasEnabled' };
const OWN_PAIR_KEYS = ['basePairCarritos', 'basePairTeamPressures'];

const collectStrings = (value: unknown, out: Set<string> = new Set()): Set<string> => {
  if (typeof value === 'string') out.add(value);
  else if (Array.isArray(value)) value.forEach(v => collectStrings(v, out));
  else if (isPlainObject(value)) Object.values(value).forEach(v => collectStrings(v, out));
  return out;
};

const touchesGroup = (entry: unknown, myIds: Set<string>): boolean => {
  for (const s of collectStrings(entry)) if (myIds.has(s)) return true;
  return false;
};

const entryKey = (entry: unknown): string =>
  isPlainObject(entry) && typeof entry.id === 'string' && entry.id
    ? `id:${entry.id}`
    : `json:${JSON.stringify(entry)}`;

/**
 * Merge a team-bet list edited by a secondary group into the base list:
 * entries involving the group's players may be added/changed/removed; entries of
 * other groups always keep their base version and position.
 */
export const mergeGroupScopedList = (
  baseList: unknown,
  nextList: unknown,
  myIds: Set<string>
): unknown[] => {
  const base = Array.isArray(baseList) ? baseList : [];
  const next = Array.isArray(nextList) ? nextList : [];
  const nextMap = new Map(next.map(e => [entryKey(e), e]));
  const baseKeys = new Set(base.map(entryKey));
  const out: unknown[] = [];
  for (const b of base) {
    const mine = touchesGroup(b, myIds);
    const n = nextMap.get(entryKey(b));
    if (n === undefined) {
      if (!mine) out.push(b); // other groups' bets cannot be deleted from here
    } else {
      out.push(mine ? n : b); // only own bets may change
    }
  }
  for (const n of next) if (!baseKeys.has(entryKey(n))) out.push(n);
  return out;
};

/**
 * Translate a whole-config edit made on a secondary group's resolved view
 * (base + that group's overrides) into changes scoped to that group only.
 *
 * - Bet types that exist as objects in the base config become per-field
 *   overrides for `groupId` (only the fields that actually changed).
 * - Team-bet lists (Carritos, Sixes, Vegas, Nines, team pressures) are computed
 *   from the base config, so the group's own entries (those involving
 *   `myPlayerIds`) are merged into the base list; other groups' entries are kept.
 * - Anything else that cannot be expressed per group is NOT applied and is
 *   returned in `blocked`, so the inherited Group 1 config is never modified.
 */
export const applyConfigChangeForGroup = (
  config: BetConfig,
  groupId: string,
  next: BetConfig,
  myPlayerIds: Iterable<string> = []
): { config: BetConfig; blocked: string[] } => {
  const myIds = new Set([...myPlayerIds].filter(Boolean));
  const resolved = resolveConfigForGroup(config, groupId) as unknown as Record<string, unknown>;
  const nextRec = next as unknown as Record<string, unknown>;
  const baseRec = config as unknown as Record<string, unknown>;
  let out = config;
  const setBase = (key: string, value: unknown) => {
    out = { ...(out as unknown as Record<string, unknown>), [key]: value } as unknown as BetConfig;
  };
  const blocked: string[] = [];
  const keys = new Set([...Object.keys(resolved), ...Object.keys(nextRec)]);
  const flagKeys = new Set(Object.values(TEAM_LIST_FLAGS));

  for (const key of keys) {
    if (key === 'groupBetOverrides' || flagKeys.has(key)) continue;
    const before = resolved[key];
    const after = nextRec[key];
    if (sameValue(before, after)) continue;

    if (myIds.size > 0 && (TEAM_LIST_KEYS as readonly string[]).includes(key)) {
      const merged = mergeGroupScopedList(baseRec[key], after, myIds);
      if (!sameValue(merged, baseRec[key] ?? [])) setBase(key, merged);
      continue;
    }

    if (myIds.size > 0 && OWN_PAIR_KEYS.includes(key)) {
      const ids = Array.isArray(after) ? after.filter(Boolean) : [];
      if (after === undefined || ids.every(id => myIds.has(String(id)))) setBase(key, after);
      else blocked.push(key);
      continue;
    }

    if (isPlainObject(baseRec[key]) && isPlainObject(after)) {
      const prev = isPlainObject(before) ? before : {};
      const updates: Record<string, unknown> = {};
      for (const field of new Set([...Object.keys(prev), ...Object.keys(after)])) {
        if (sameValue(prev[field], after[field])) continue;
        if (key === 'teamPressures' && field === 'bets' && myIds.size > 0) {
          const baseTp = baseRec.teamPressures as Record<string, unknown>;
          const merged = mergeGroupScopedList(baseTp.bets, after.bets, myIds);
          if (!sameValue(merged, baseTp.bets ?? [])) {
            const curTp = (out as unknown as Record<string, unknown>).teamPressures as Record<string, unknown>;
            setBase('teamPressures', { ...curTp, bets: merged });
          }
          continue;
        }
        updates[field] = after[field];
      }
      if (Object.keys(updates).length > 0) {
        out = setGroupBetOverride(out, groupId, key as keyof BetConfig, updates as never);
      }
    } else {
      blocked.push(key);
    }
  }

  // Sixes/Vegas on-off flags are shared: follow the group only when no other
  // group's bets remain in that list.
  for (const [listKey, flagKey] of Object.entries(TEAM_LIST_FLAGS)) {
    if (sameValue(resolved[flagKey], nextRec[flagKey])) continue;
    const list = (out as unknown as Record<string, unknown>)[listKey];
    const foreign = myIds.size > 0 && Array.isArray(list) && list.some(e => !touchesGroup(e, myIds));
    if (myIds.size > 0 && !foreign) setBase(flagKey, nextRec[flagKey]);
    else blocked.push(flagKey);
  }

  return { config: out, blocked };
};
