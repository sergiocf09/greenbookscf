import { describe, it, expect } from 'vitest';
import { calculateCarritosBets } from '@/lib/bets/carritos';

const course: any = { holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, handicap: i + 1 })) };
const players: any[] = ['a1','a2','b1','b2'].map(id => ({ id, name: id, initials: id, handicap: 0 }));
const mk = (s: number) => [{ holeNumber: 10, strokes: s, confirmed: true }];
const scores = new Map<string, any>([['a1', mk(2)], ['a2', mk(4)], ['b1', mk(4)], ['b2', mk(5)]]);
const cfg = (scoringType: string): any => ({ carritos: { enabled: true }, carritosTeams: [{ id: 't', teamA: ['a1','a2'], teamB: ['b1','b2'], frontAmount: 100, backAmount: 100, totalAmount: 100, scoringType, teamHandicaps: { a1: 0, a2: 0, b1: 0, b2: 0 } }] });

describe('Carritos Bola Baja + Bola Alta', () => {
  it('wins back nine when sweeping low and high ball (2-4 vs 4-5)', () => {
    const r = calculateCarritosBets(players, scores, cfg('combined'), course);
    const back = r.filter(s => s.playerId === 'a1' && s.betType === 'Carritos Back');
    expect(back.reduce((t, s) => t + s.amount, 0)).toBe(100);
  });
});
