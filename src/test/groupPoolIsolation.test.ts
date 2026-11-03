import { describe, expect, it } from 'vitest';
import { calculateAllBets } from '@/lib/betCalculations';
import { calculateMedalGeneralBets } from '@/lib/bets/medalGeneral';
import { calculateOyesesBets } from '@/lib/oyesesCalculations';
import { defaultBetConfig } from '@/components/setup/BetSetup';
import { defaultMarkerState, type Player, type PlayerScore, type GolfCourse } from '@/types/golf';

const players: Player[] = ['S', 'E', 'R', 'J', 'L', 'F', 'G'].map((id, i) => ({
  id, name: id, initials: id, handicap: 0, color: '', groupId: i < 3 ? 'g1' : 'g2',
}));
const course: GolfCourse = { id: 'c', name: 'c', location: '', holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: i === 0 ? 3 : 4, handicapIndex: i + 1 })) };
const scores = new Map<string, PlayerScore[]>(players.map(p => [p.id, course.holes.map(h => ({
  playerId: p.id, holeNumber: h.number, strokes: p.id === 'J' ? 3 : p.id === 'S' ? 4 : 5,
  putts: 2, markers: { ...defaultMarkerState }, strokesReceived: 0, netScore: 4, confirmed: true,
  oyesProximity: h.number === 1 && (p.id === 'S' || p.id === 'J') ? 1 : null,
}))]));
const config = {
  ...defaultBetConfig,
  medalGeneral: { ...defaultBetConfig.medalGeneral, enabled: true, scope: 'group' as const, handicapMode: 'bilateral' as const, segmentMode: 'segments' as const, frontAmount: 20, backAmount: 20, amount: 20 },
  oyeses: { ...defaultBetConfig.oyeses, enabled: true, amount: 20, singleWinner: true, zapatoEnabled: false },
};

describe('group pool accounting', () => {
  it('Sliding pays Sergio $20 from each rival on Front without competing against Jorge in another group', () => {
    const rows = calculateMedalGeneralBets(players, scores, config, course);
    expect(rows.filter(r => r.playerId === 'S' && r.segment === 'front' && r.amount > 0).map(r => [r.vsPlayer, r.amount]).sort()).toEqual([['E', 20], ['R', 20]]);
    expect(rows.some(r => players.find(p => p.id === r.playerId)?.groupId !== players.find(p => p.id === r.vsPlayer)?.groupId)).toBe(false);
  });
  it('single-winner Oyes resolves each group independently and never collects from other groups', () => {
    const rows = calculateOyesesBets(players, scores, config, course);
    expect(rows.filter(r => r.playerId === 'S' && r.amount > 0).map(r => [r.vsPlayer, r.amount]).sort()).toEqual([['E', 20], ['R', 20]]);
    expect(rows.filter(r => r.playerId === 'J' && r.amount > 0).map(r => [r.vsPlayer, r.amount]).sort()).toEqual([['F', 20], ['G', 20], ['L', 20]]);
  });
  it('shared engine returns the same pool transfers whether called with all players or one group at a time', () => {
    const poolRows = (ps: Player[]) => calculateAllBets(ps, scores, config, course).filter(r => ['Oyes', 'Medal General'].includes(r.betType));
    const canonical = (rows: ReturnType<typeof poolRows>) => rows.map(r => JSON.stringify(r)).sort();
    expect(canonical(poolRows(players))).toEqual(canonical([...poolRows(players.slice(0, 3)), ...poolRows(players.slice(3))]));
  });
  it('global scope competes against everybody once, while both scope adds the independent group pools', () => {
    const global = calculateMedalGeneralBets(players, scores, { ...config, medalGeneral: { ...config.medalGeneral, scope: 'global' } }, course);
    expect(global.filter(r => r.playerId === 'J' && r.segment === 'front' && r.amount > 0)).toHaveLength(6);
    const both = calculateMedalGeneralBets(players, scores, { ...config, medalGeneral: { ...config.medalGeneral, scope: 'both' } }, course);
    expect(both).toEqual([...calculateMedalGeneralBets(players, scores, config, course), ...global]);
  });
});