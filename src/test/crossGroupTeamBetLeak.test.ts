import { describe, it, expect } from 'vitest';
import { calculateAllBets } from '@/lib/betCalculations';
import { defaultBetConfig } from '@/components/setup/BetSetup';
import { keepCrossPairSummaries, stripTeamBetsForCrossPair } from '@/lib/crossGroupBalance';

// Round with G1 player "g1" crossed against G3 player "fl"; G3 also plays a
// Presiones por Parejas (fl/ec vs ju/po) that has nothing to do with g1.
const course: any = { holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, handicap: i + 1 })) };
const ids = ['g1', 'fl', 'ec', 'ju', 'po'];
const card = (strokes: number) => Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, strokes, putts: 2, confirmed: true }));
const scores = new Map<string, any>([['g1', card(4)], ['fl', card(3)], ['ec', card(4)], ['ju', card(5)], ['po', card(5)]]);
const pair: any[] = ['g1', 'fl'].map(id => ({ id, profileId: id, name: id, initials: id, color: '', handicap: 0, groupId: '__xg_pair' }));
const config: any = {
  ...defaultBetConfig,
  teamPressures: {
    enabled: true,
    bets: [{ id: 'tp-g3', teamA: ['fl', 'ec'], teamB: ['ju', 'po'], enabled: true, scoringType: 'lowBall', frontAmount: 50, backAmount: 100, totalAmount: 100, teamHandicaps: {} }],
  },
  carritos: { ...defaultBetConfig.carritos, enabled: true },
  carritosTeams: [{ id: 'c-g3', teamA: ['fl', 'ec'], teamB: ['ju', 'po'], enabled: true, frontAmount: 100, backAmount: 100, totalAmount: 100, scoringType: 'all', teamHandicaps: {} }],
};
const allHoles = new Set(Array.from({ length: 18 }, (_, i) => i + 1));

describe('cross-group pair never inherits other players\' team bets', () => {
  it('the unpatched synthetic pair context does produce G3 team-bet entries (bug guard)', () => {
    const raw = calculateAllBets(pair, scores, config, course, 1, allHoles);
    expect(raw.some(s => s.betType === 'Presiones Parejas')).toBe(true);
  });

  it('stripping team bets and keeping only the pair leaves no Presiones Parejas or Carritos', () => {
    const raw = calculateAllBets(pair, scores, stripTeamBetsForCrossPair(config), course, 1, allHoles);
    const kept = keepCrossPairSummaries(raw, 'g1', 'fl');
    expect(kept.filter(s => s.betType === 'Presiones Parejas' || s.betType.startsWith('Carritos'))).toHaveLength(0);
  });

  it('keeps only entries between the two crossed players', () => {
    const summaries = [
      { playerId: 'g1', vsPlayer: 'fl', amount: 100 },
      { playerId: 'fl', vsPlayer: 'g1', amount: -100 },
      { playerId: 'fl', vsPlayer: 'ju', amount: 125 },
      { playerId: 'ju', vsPlayer: 'fl', amount: -125 },
    ];
    expect(keepCrossPairSummaries(summaries, 'g1', 'fl').map(s => s.amount)).toEqual([100, -100]);
  });
});
