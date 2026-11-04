import { describe, it, expect } from 'vitest';
import { findMissingCloseHoles } from '@/lib/findMissingCloseHoles';

const holes = new Set([1, 2, 3]);

describe('findMissingCloseHoles', () => {
  it('flags a player whose holes only have unconfirmed par placeholders', () => {
    const scores = new Map([
      ['a', [1, 2, 3].map((h) => ({ holeNumber: h, strokes: 4, confirmed: true }))],
      ['b', [1, 2, 3].map((h) => ({ holeNumber: h, strokes: 4, confirmed: h === 1 }))],
    ]);
    const res = findMissingCloseHoles([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], scores, holes);
    expect(res).toEqual([{ playerId: 'b', name: 'B', holes: [2, 3] }]);
  });

  it('allows close when every player confirmed every active hole', () => {
    const scores = new Map([['a', [1, 2, 3].map((h) => ({ holeNumber: h, strokes: 5, confirmed: true }))]]);
    expect(findMissingCloseHoles([{ id: 'a', name: 'A' }], scores, holes)).toEqual([]);
  });
});
