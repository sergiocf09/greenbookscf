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
    
    const base = config[key];
    if (base && typeof base === 'object' && !Array.isArray(base)) {
      (resolved as any)[key] = { ...base, ...override };
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
