import { describe, it, expect } from 'vitest';
import { buildPar3Slots, mergeGeneratedSlots } from '@/lib/prizeSlots';

const course = (par3: number[]) =>
  Array.from({ length: 18 }, (_, i) => ({ hole_number: i + 1, par: par3.includes(i + 1) ? 3 : 4 }));

describe('buildPar3Slots', () => {
  it('a course with 4 par 3s yields 4 ordered slots', () => {
    const slots = buildPar3Slots({
      rounds: [{ roundId: 'r1', date: '2026-11-20', courseId: 'c1', dayNumber: null }],
      holesByCourse: { c1: course([17, 3, 8, 12]) },
      isMultiDay: false,
    });
    expect(slots.map(s => s.id)).toEqual(['oyes-d0-h3', 'oyes-d0-h8', 'oyes-d0-h12', 'oyes-d0-h17']);
    expect(slots[0]).toMatchObject({ label: 'Oyes · Hoyo 3', holeNumber: 3, dayNumber: null, amount: 0, winnerParticipantId: null });
  });

  it('multi-day with 2 rounds yields slots per day', () => {
    const slots = buildPar3Slots({
      rounds: [
        { roundId: 'r2', date: '2026-11-21', courseId: 'c2', dayNumber: 2 },
        { roundId: 'r1', date: '2026-11-20', courseId: 'c1', dayNumber: 1 },
      ],
      holesByCourse: { c1: course([3, 8]), c2: course([5]) },
      isMultiDay: true,
    });
    expect(slots.map(s => s.id)).toEqual(['oyes-d1-h3', 'oyes-d1-h8', 'oyes-d2-h5']);
    expect(slots[2]).toMatchObject({ label: 'Oyes · Día 2 · Hoyo 5', dayNumber: 2 });
  });

  it('no rounds yields an empty list', () => {
    expect(buildPar3Slots({ rounds: [], holesByCourse: {}, isMultiDay: false })).toEqual([]);
  });
});

describe('mergeGeneratedSlots', () => {
  it('regenerating neither duplicates nor overwrites amount/winner/note', () => {
    const generated = buildPar3Slots({
      rounds: [{ roundId: 'r1', date: '2026-11-20', courseId: 'c1', dayNumber: null }],
      holesByCourse: { c1: course([3, 8]) },
      isMultiDay: false,
    });
    const edited = [{ ...generated[0], amount: 500, winnerParticipantId: 'p1', note: 'a 1.2 m' }];
    const merged = mergeGeneratedSlots(edited, generated);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ id: 'oyes-d0-h3', amount: 500, winnerParticipantId: 'p1', note: 'a 1.2 m' });
    expect(mergeGeneratedSlots(merged, generated)).toHaveLength(2);
  });
});
