import { describe, it, expect } from 'vitest';
import {
  buildBasePairCarritosTeams,
  buildCarritosFromPairs,
  dropExistingMatches,
  matchKey,
} from '@/components/setup/bets/basePairGenerator';
import type { BasePairDefaults } from '@/components/setup/bets/basePairGenerator';
import { mergeBetConfigChanges } from '@/lib/betConfigMerge';
import type { CarritosTeamBet } from '@/types/golf';

const defaults = (over: Partial<BasePairDefaults> = {}): BasePairDefaults => ({
  scoringType: 'all',
  handicapMode: 'individual',
  frontAmount: 100,
  backAmount: 100,
  totalAmount: 100,
  ...over,
});

const team = (over: Partial<CarritosTeamBet> = {}): CarritosTeamBet => ({
  id: 'c1',
  teamA: ['a', 'b'],
  teamB: ['c', 'd'],
  frontAmount: 100,
  backAmount: 100,
  totalAmount: 100,
  scoringType: 'all',
  teamHandicaps: {},
  enabled: true,
  ...over,
});

describe('Carritos setup — scoringMethod (Medal por Parejas)', () => {
  it('a Carritos and a Medal por Parejas with the same 4 players are different matches', () => {
    expect(matchKey(['a', 'b'], ['c', 'd'])).not.toBe(matchKey(['b', 'a'], ['d', 'c'], 'strokes'));
    expect(matchKey(['a', 'b'], ['c', 'd'])).toBe(matchKey(['d', 'c'], ['b', 'a'], 'points'));
  });

  it('base pair "add" keeps a new Medal por Parejas next to an existing Carritos of the same 4', () => {
    const generated = buildBasePairCarritosTeams(['a', 'b'], ['c', 'd', 'e'], undefined, defaults({ scoringMethod: 'strokes' }));
    const kept = dropExistingMatches(generated, [team()]);
    expect(kept).toHaveLength(3);
    const dupes = dropExistingMatches(generated, [team({ scoringMethod: 'strokes' })]);
    expect(dupes).toHaveLength(2);
  });

  it('5-player generation copies the method from defaults and never uses "Todos" for strokes', () => {
    const generated = buildBasePairCarritosTeams(['a', 'b'], ['c', 'd', 'e'], undefined, defaults({ scoringMethod: 'strokes', scoringType: 'all' }));
    expect(generated.every((g) => g.scoringMethod === 'strokes')).toBe(true);
    expect(generated.every((g) => g.scoringType === 'lowBall')).toBe(true);
  });

  it('falls back to the template method, then to points', () => {
    const fromTemplate = buildBasePairCarritosTeams(['a', 'b'], ['c', 'd', 'e'], team({ scoringMethod: 'strokes', scoringType: 'highBall' }));
    expect(fromTemplate.every((g) => g.scoringMethod === 'strokes' && g.scoringType === 'highBall')).toBe(true);
    const plain = buildBasePairCarritosTeams(['a', 'b'], ['c', 'd', 'e']);
    expect(plain.every((g) => g.scoringMethod === 'points' && g.scoringType === 'all')).toBe(true);
  });

  it('6-player round robin shares the method of the first match', () => {
    const generated = buildCarritosFromPairs([['a', 'b'], ['c', 'd'], ['e', 'f']], team({ scoringMethod: 'strokes', scoringType: 'combined' }));
    expect(generated).toHaveLength(3);
    expect(generated.every((g) => g.scoringMethod === 'strokes' && g.scoringType === 'combined')).toBe(true);
  });

  it('bet-config merge keeps a local method change', () => {
    const base = { carritosTeams: [team()], carritos: { scoringMethod: 'points' }, medal: { frontAmount: 50 } };
    const local = { carritosTeams: [team({ scoringMethod: 'strokes', scoringType: 'lowBall' })], carritos: { scoringMethod: 'strokes' }, medal: { frontAmount: 50 } };
    const remote = { carritosTeams: [team()], carritos: { scoringMethod: 'points' }, medal: { frontAmount: 80 } };
    const merged = mergeBetConfigChanges(base, local, remote) as any;
    expect(merged.carritosTeams[0].scoringMethod).toBe('strokes');
    expect(merged.carritosTeams[0].scoringType).toBe('lowBall');
    expect(merged.carritos.scoringMethod).toBe('strokes');
    expect(merged.medal.frontAmount).toBe(80);
  });

  it('bet-config merge keeps a remote method change when this phone did not touch Carritos', () => {
    const base = { carritosTeams: [team()], medal: { frontAmount: 50 } };
    const local = { carritosTeams: [team()], medal: { frontAmount: 70 } };
    const remote = { carritosTeams: [team({ scoringMethod: 'strokes' })], medal: { frontAmount: 50 } };
    const merged = mergeBetConfigChanges(base, local, remote) as { carritosTeams: CarritosTeamBet[] };
    expect(merged.carritosTeams[0].scoringMethod).toBe('strokes');
  });
});
