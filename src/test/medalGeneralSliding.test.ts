import { describe, it, expect } from 'vitest';
import { calculateMedalGeneralBets } from '@/lib/bets/medalGeneral';

const course: any = { id: 'c', name: 'c', location: '', holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, handicapIndex: i + 1 })) };
const gross: Record<string, number[]> = {
  G: [5,4,4,4,4,6,5,6,3,5,7,4,7,5,4,4,2,4],
  R: [5,4,5,5,4,7,5,5,4,5,7,4,7,5,4,3,4,6],
  L: [5,4,6,5,3,7,4,5,3,4,6,4,5,7,5,4,4,5],
  C: [6,4,6,5,2,6,3,7,5,6,5,5,6,5,7,4,5,4],
};
const players: any[] = Object.keys(gross).map((id) => ({ id, name: id, handicap: 0, groupId: 'g' }));
const scores = new Map<string, any[]>(Object.entries(gross).map(([id, s]) => [id, s.map((strokes, i) => ({ holeNumber: i + 1, strokes, confirmed: true }))]));
// giver first (hcp 0), receiver gets the strokes
const pair = (a: string, b: string, n: number) => ({ playerAId: a, playerBId: b, playerAHandicap: 0, playerBHandicap: n });
const bilateralHandicaps = [pair('G','L',1), pair('L','C',6), pair('L','R',8), pair('G','C',8), pair('G','R',10), pair('R','C',1)];

const cfg = (handicapMode: 'individual' | 'bilateral'): any => ({
  bilateralHandicaps,
  medalGeneral: { enabled: true, amount: 25, playerHandicaps: [], segmentMode: 'total', handicapMode },
});

describe('Medal General sliding', () => {
  it('absolute winner (Rubio) collects the total amount from each rival', () => {
    const s = calculateMedalGeneralBets(players, scores, cfg('bilateral'), course);
    const winnerRows = s.filter((x) => x.amount > 0);
    expect(winnerRows.every((x) => x.playerId === 'R')).toBe(true);
    expect(winnerRows.map((x) => x.vsPlayer).sort()).toEqual(['C', 'G', 'L']);
    expect(winnerRows.every((x) => x.amount === 25)).toBe(true);
  });

  it('pays nothing when nobody beats every rival', () => {
    const noWinner = { ...cfg('bilateral'), bilateralHandicaps: bilateralHandicaps.map((b) => b.playerAId === 'G' && b.playerBId === 'R' ? pair('G','R',0) : b) };
    expect(calculateMedalGeneralBets(players, scores, noWinner, course)).toEqual([]);
  });
});
