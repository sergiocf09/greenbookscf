import { describe, it, expect } from 'vitest';
import { computeCrossBet, crossNet, resolveStrokes } from '@/lib/bets/crossBets';
import type { GolfCourse } from '@/types/golf';

const course: GolfCourse = {
  id: 'c', name: 'C', location: '',
  holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, handicapIndex: i + 1 })),
};
const card = (nets: number[]) => nets.map((n, i) => ({ holeNumber: i + 1, strokes: n, net: n, putts: 2 }));
const side = (id: string, nets: number[], handicap = 0) => ({ profileId: id, name: id, handicap, scores: card(nets) });

describe('cross bets use the regular engine', () => {
  it('medal scratch: lower gross wins front and total', () => {
    const lines = computeCrossBet({ medal: { enabled: true, amount: 100 }, strokes: { giverProfileId: null, count: 0 } },
      side('A', Array(18).fill(4)), side('B', [...Array(9).fill(5), ...Array(9).fill(4)]), course);
    expect(crossNet(lines)).toBe(200);
  });
  it('strokes given flip the medal result', () => {
    // B shoots one more per front hole but receives 9 strokes on holes SI 1-9 -> front tie
    const lines = computeCrossBet({ medal: { enabled: true, amount: 100 }, strokes: { giverProfileId: 'A', count: 9 } },
      side('A', Array(18).fill(4)), side('B', [...Array(9).fill(5), ...Array(9).fill(4)]), course);
    expect(crossNet(lines)).toBe(0);
  });
  it('disabled bets produce nothing', () => {
    expect(computeCrossBet({ medal: { enabled: false } }, side('A', [4]), side('B', [5]), course)).toEqual([]);
  });
  it('default strokes follow the handicap difference', () => {
    expect(resolveStrokes({}, 'A', 5, 'B', 12)).toEqual({ giverProfileId: 'A', count: 7 });
  });
});
