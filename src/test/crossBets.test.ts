import { describe, it, expect } from 'vitest';
import { computeCrossBet, crossNet } from '@/lib/bets/crossBets';

const card = (nets: number[], putts = 2) => nets.map((n, i) => ({ holeNumber: i + 1, strokes: n, net: n, putts }));

describe('cross bets', () => {
  it('medal: lower net wins each segment amount', () => {
    const a = card(Array(18).fill(4));
    const b = card([...Array(9).fill(5), ...Array(9).fill(4)]);
    const lines = computeCrossBet({ medal: { enabled: true, amount: 100 } }, a, b);
    expect(lines.map(l => l.amount)).toEqual([100, 0, 100]);
    expect(crossNet(lines)).toBe(200);
  });
  it('disabled bets produce nothing', () => {
    expect(computeCrossBet({ medal: { enabled: false, amount: 100 } }, card([4]), card([5]))).toEqual([]);
  });
  it('skins: each hole won pays the amount, ties pay nothing', () => {
    const lines = computeCrossBet({ skins: { enabled: true, amount: 20 } }, card([3, 4, 5]), card([4, 4, 4]));
    expect(crossNet(lines)).toBe(0);
    expect(lines).toHaveLength(2);
  });
});
