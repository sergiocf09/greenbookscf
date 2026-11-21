import { describe, it, expect } from 'vitest';
import { calculateAllBets } from '@/lib/betCalculations';
import { defaultBetConfig } from '@/components/setup/BetSetup';
import { buildCrossPairConfig, keepCrossPairSummaries } from '@/lib/crossGroupBalance';

// G1 = a1, a2 (the Presiones participant list names only them); G2 = b1, b2.
// G2 inherits G1's Presiones as a template, and a1 is crossed with b1.
const course: any = { holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, handicapIndex: i + 1 })) };
const card = (strokes: number) => Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, strokes, putts: 2, confirmed: true }));
const scores = new Map<string, any>([['a1', card(4)], ['a2', card(5)], ['b1', card(4)], ['b2', card(5)]]);
const mk = (id: string, groupId: string): any => ({ id, profileId: id, name: id, initials: id, color: '', handicap: 0, groupId });
const players = [mk('a1', 'g1'), mk('a2', 'g1'), mk('b1', 'g2'), mk('b2', 'g2')];
const config: any = {
  ...defaultBetConfig,
  pressures: { ...defaultBetConfig.pressures, enabled: true, frontAmount: 50, backAmount: 100, totalAmount: 50, participantIds: ['a1', 'a2'] },
  groupBetOverrides: { g2: { medal: { enabled: true } } },
  bilateralHandicaps: [],
};
const allHoles = new Set(Array.from({ length: 18 }, (_, i) => i + 1));
const pressuresBetween = (list: any[], x: string, y: string) =>
  list.filter(s => s.playerId === x && s.vsPlayer === y && s.betType.startsWith('Presiones')).reduce((t, s) => t + s.amount, 0);

describe('close engine settles every group like the dashboard', () => {
  it('G2 keeps the Presiones inherited from G1 when bets are computed over all players', () => {
    const all = calculateAllBets(players, scores, config, course, 1, allHoles);
    expect(pressuresBetween(all, 'b1', 'b2')).toBeGreaterThan(0);
  });

  it('computing G2 on its own (the old close path) loses its inherited Presiones', () => {
    const g2Only = calculateAllBets(players.filter(p => p.groupId === 'g2'), scores, config, course, 1, allHoles);
    expect(pressuresBetween(g2Only, 'b1', 'b2')).toBe(0);
  });

  it('a crossed G1–G2 pair plays Presiones even though G1 lists only its own players', () => {
    const bh = { playerAId: 'a1', playerBId: 'b1', playerAHandicap: 0, playerBHandicap: 0 };
    const cfg = buildCrossPairConfig(config, bh, []);
    expect(cfg.pressures.participantIds).toBeUndefined();
    const pair = [mk('a1', 'xg'), { ...mk('b1', 'xg') }];
    const scoresTie = new Map<string, any>([['a1', card(4)], ['b1', card(5)]]);
    const out = keepCrossPairSummaries(calculateAllBets(pair, scoresTie, cfg, course, 1, allHoles), 'a1', 'b1');
    expect(pressuresBetween(out, 'a1', 'b1')).toBeGreaterThan(0);
  });
});
