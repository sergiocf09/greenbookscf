import { describe, expect, it } from 'vitest';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import type { GolfCourse } from '@/types/golf';

// Official scorecard supplied October 23, 2026; regression for the active-round repair.
const pars = [5, 4, 4, 3, 4, 4, 3, 5, 4, 4, 5, 4, 3, 4, 5, 3, 4, 4];
const indices = [17, 9, 3, 15, 7, 11, 5, 13, 1, 10, 8, 4, 18, 6, 14, 16, 2, 12];
const course: GolfCourse = {
  id: 'aa5f4765-aa23-4310-8e84-a14a39615dfa',
  name: 'San Gil',
  location: 'San Juan del Río',
  holes: pars.map((par, index) => ({ number: index + 1, par, handicapIndex: indices[index] })),
};

describe('San Gil corrected scorecard allocation', () => {
  it('gives a six-handicap player strokes on holes 3, 7 and 9 rather than hole 2', () => {
    expect(calculateStrokesPerHole(6, course)).toEqual([
      0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0,
    ]);
  });
  it('keeps the active eleven-handicap player allocation unchanged for the first eight holes', () => {
    expect(calculateStrokesPerHole(11, course).slice(0, 8)).toEqual([0, 1, 1, 0, 1, 1, 1, 0]);
  });
});