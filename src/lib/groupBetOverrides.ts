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

/**
 * Translate a whole-config edit made on a secondary group's resolved view
 * (base + that group's overrides) into changes to that group's overrides only.
 *
 * - Bet types that exist as objects in the base config become per-field
 *   overrides for `groupId` (only the fields that actually changed).
 * - Anything that cannot be expressed per group (arrays, flags, keys missing
 *   from the base) is NOT applied and is returned in `blocked`, so the
 *   inherited Group 1 config and the other groups are never modified.
 */
export const applyConfigChangeForGroup = (
  config: BetConfig,
  groupId: string,
  next: BetConfig
): { config: BetConfig; blocked: string[] } => {
  const resolved = resolveConfigForGroup(config, groupId) as unknown as Record<string, unknown>;
  const nextRec = next as unknown as Record<string, unknown>;
  const baseRec = config as unknown as Record<string, unknown>;
  let out = config;
  const blocked: string[] = [];
  const keys = new Set([...Object.keys(resolved), ...Object.keys(nextRec)]);

  for (const key of keys) {
    if (key === 'groupBetOverrides') continue;
    const before = resolved[key];
    const after = nextRec[key];
    if (sameValue(before, after)) continue;

    if (isPlainObject(baseRec[key]) && isPlainObject(after)) {
      const prev = isPlainObject(before) ? before : {};
      const updates: Record<string, unknown> = {};
      for (const field of new Set([...Object.keys(prev), ...Object.keys(after)])) {
        if (!sameValue(prev[field], after[field])) updates[field] = after[field];
      }
      out = setGroupBetOverride(out, groupId, key as keyof BetConfig, updates as never);
    } else {
      blocked.push(key);
    }
  }

  return { config: out, blocked };
};
