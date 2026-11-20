import { describe, it, expect } from 'vitest';
import { applyConfigChangeForGroup, resolveConfigForGroup } from '@/lib/groupBetOverrides';
import type { BetConfig } from '@/types/golf';

const G2 = 'group-2';
const G3 = 'group-3';

const base = {
  medal: { enabled: true, frontAmount: 100, backAmount: 100, totalAmount: 100, participantIds: ['g1a', 'g1b'] },
  skins: { enabled: true, amount: 50 },
  sixesEnabled: false,
  sixesBets: [],
  groupBetOverrides: { [G3]: { skins: { enabled: false } } },
} as unknown as BetConfig;

describe('applyConfigChangeForGroup', () => {
  it('stores a G2 matrix change only in G2 overrides, leaving G1 base and G3 untouched', () => {
    const resolved = resolveConfigForGroup(base, G2) as any;
    const next = { ...resolved, medal: { ...resolved.medal, participantIds: ['g2a'] } };
    const { config, blocked } = applyConfigChangeForGroup(base, G2, next);
    expect(blocked).toEqual([]);
    expect((config as any).medal).toEqual((base as any).medal);
    expect((config as any).groupBetOverrides[G2]).toEqual({ medal: { participantIds: ['g2a'] } });
    expect((config as any).groupBetOverrides[G3]).toEqual({ skins: { enabled: false } });
  });

  it('does not apply options that cannot be set per group (Sixes) and reports them', () => {
    const resolved = resolveConfigForGroup(base, G2) as any;
    const next = { ...resolved, sixesEnabled: true };
    const { config, blocked } = applyConfigChangeForGroup(base, G2, next);
    expect(blocked).toEqual(['sixesEnabled']);
    expect(config).toBe(base);
  });

  it('a template applied by G2 never overwrites the G1 base amounts', () => {
    const template = { ...(base as any), medal: { ...(base as any).medal, frontAmount: 500 }, groupBetOverrides: {} };
    const { config } = applyConfigChangeForGroup(base, G2, template);
    expect((config as any).medal.frontAmount).toBe(100);
    expect((config as any).groupBetOverrides[G2].medal).toEqual({ frontAmount: 500 });
    expect((config as any).groupBetOverrides[G3]).toEqual({ skins: { enabled: false } });
  });
});
