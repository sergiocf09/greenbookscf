import { describe, it, expect } from 'vitest';
import { applyConfigChangeForGroup, resolveConfigForGroup } from '@/lib/groupBetOverrides';
import { mergeBetConfigChanges } from '@/lib/betConfigMerge';
import type { BetConfig } from '@/types/golf';

const G3 = 'group-3';
const g1Team = { id: 'c-g1', teamA: ['g1a', 'g1b'], teamB: ['g1c', 'g1d'], frontAmount: 100 };
const base = {
  carritos: { enabled: true },
  carritosTeams: [g1Team],
  teamPressures: { enabled: true, bets: [{ id: 'tp-g1', teamA: ['g1a', 'g1b'], teamB: ['g1c', 'g1d'], enabled: true }] },
  groupBetOverrides: {},
} as unknown as BetConfig;
const g3Ids = ['g3a', 'g3b', 'g3c', 'g3d'];

describe('secondary group team bets', () => {
  it('G3 adding a Carritos keeps G1 Carritos and is not blocked', () => {
    const resolved = resolveConfigForGroup(base, G3) as any;
    const g3Team = { id: 'c-g3', teamA: ['g3a', 'g3b'], teamB: ['g3c', 'g3d'], frontAmount: 50 };
    const next = { ...resolved, carritosTeams: [...resolved.carritosTeams, g3Team] };
    const { config, blocked } = applyConfigChangeForGroup(base, G3, next, g3Ids);
    expect(blocked).toEqual([]);
    expect((config as any).carritosTeams).toEqual([g1Team, g3Team]);
  });

  it('G3 cannot delete or change a G1 Carritos', () => {
    const resolved = resolveConfigForGroup(base, G3) as any;
    const next = { ...resolved, carritosTeams: [] };
    expect((applyConfigChangeForGroup(base, G3, next, g3Ids).config as any).carritosTeams).toEqual([g1Team]);
    const changed = { ...resolved, carritosTeams: [{ ...g1Team, frontAmount: 999 }] };
    expect((applyConfigChangeForGroup(base, G3, changed, g3Ids).config as any).carritosTeams).toEqual([g1Team]);
  });

  it('G3 team pressures go to the shared list, keeping G1 ones', () => {
    const resolved = resolveConfigForGroup(base, G3) as any;
    const tp = { id: 'tp-g3', teamA: ['g3a', 'g3b'], teamB: ['g3c', 'g3d'], enabled: true };
    const next = { ...resolved, teamPressures: { ...resolved.teamPressures, bets: [...resolved.teamPressures.bets, tp] } };
    const { config } = applyConfigChangeForGroup(base, G3, next, g3Ids);
    expect((config as any).teamPressures.bets.map((b: any) => b.id)).toEqual(['tp-g1', 'tp-g3']);
  });
});

describe('Zoológico events merge', () => {
  it('a phone adding an event keeps the event another phone added', () => {
    const b = { zoologico: { events: [{ id: 'a' }] } };
    const local = { zoologico: { events: [{ id: 'a' }, { id: 'c' }] } };
    const remote = { zoologico: { events: [{ id: 'a' }, { id: 'b' }] } };
    expect((mergeBetConfigChanges(b, local, remote) as any).zoologico.events.map((e: any) => e.id)).toEqual(['a', 'b', 'c']);
  });
});
