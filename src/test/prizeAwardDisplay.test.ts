import { describe, it, expect } from 'vitest';
import { buildAwardDisplaySections } from '@/lib/prizeAwardDisplay';

const a = (id: string, label: string, amount: number, winner: string | null = null, extra: object = {}) =>
  ({ id, label, amount, winner, ...extra });

describe('buildAwardDisplaySections', () => {
  it('shows "Oyes" once and puts each hole with its winners underneath', () => {
    const sections = buildAwardDisplaySections([
      a('oyes-d0-h5', 'Oyes · Hoyo 5', 2000, 'ca'),
      a('oyes-d0-h5-p2', 'Oyes · Hoyo 5 · 2º', 1000, 'scd', { groupId: 'oyes-d0-h5', place: 2 }),
      a('oyes-d0-h5-p3', 'Oyes · Hoyo 5 · 3º', 500, 'scf', { groupId: 'oyes-d0-h5', place: 3 }),
      a('oyes-d0-h7', 'Oyes · Hoyo 7', 2000, 'scf'),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBe('Oyes');
    expect(sections[0].groups.map(g => g.title)).toEqual(['Hoyo 5', 'Hoyo 7']);
    expect(sections[0].groups[0].rows.map(r => [r.place, r.amount])).toEqual([[1, 2000], [2, 1000], [3, 500]]);
  });

  it('groups frozen snapshot places by id when groupId is missing', () => {
    const sections = buildAwardDisplaySections([
      a('oyes-d1-h3', 'Oyes · Día 1 · Hoyo 3', 300),
      a('oyes-d1-h3-p2', 'Oyes · Día 1 · Hoyo 3 · 2º', 100),
    ]);
    expect(sections[0].groups).toHaveLength(1);
    expect(sections[0].groups[0].title).toBe('Día 1 · Hoyo 3');
    expect(sections[0].groups[0].rows.map(r => r.place)).toEqual([1, 2]);
  });

  it('keeps a plain-label award as its own section', () => {
    const sections = buildAwardDisplaySections([
      a('ld', 'Long drive', 500, 'x'),
      a('oyes-d0-h5', 'Oyes · Hoyo 5', 2000),
    ]);
    expect(sections.map(s => s.heading)).toEqual(['Long drive', 'Oyes']);
    expect(sections[0].groups[0].title).toBe('');
  });
});
