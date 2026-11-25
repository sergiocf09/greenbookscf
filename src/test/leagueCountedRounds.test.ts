import { describe, expect, it } from 'vitest';
import { computeCountedJornadaDates, type ParticipantJornadaItem } from '@/lib/leagueCountedRounds';

describe('computeCountedJornadaDates', () => {
  it('selects Carlos Echevarria best 12 of 14 jornadas summing to 103 pts', () => {
    const items: ParticipantJornadaItem[] = [
      { date: '2026-11-22', pointsEarned: 10, scoreValue: 1 },
      { date: '2026-11-20', pointsEarned: 5, scoreValue: -1 },
      { date: '2026-11-16', pointsEarned: 5, scoreValue: 6 },
      { date: '2026-11-07', pointsEarned: 10, scoreValue: 1 },
      { date: '2026-10-25', pointsEarned: 7, scoreValue: 3 },
      { date: '2026-10-18', pointsEarned: 10, scoreValue: -3 },
      { date: '2026-10-16', pointsEarned: 7, scoreValue: 4 },
      { date: '2026-09-27', pointsEarned: 5, scoreValue: 8 },
      { date: '2026-09-20', pointsEarned: 10, scoreValue: 8 },
      { date: '2026-09-16', pointsEarned: 7, scoreValue: 0 },
      { date: '2026-09-13', pointsEarned: 10, scoreValue: 3 },
      { date: '2026-09-06', pointsEarned: 10, scoreValue: -3 },
      { date: '2026-08-30', pointsEarned: 10, scoreValue: -2 },
      { date: '2026-08-23', pointsEarned: 7, scoreValue: 4 },
    ];

    const result = computeCountedJornadaDates(items, {
      scoring_system: 'points',
      score_basis: 'net',
      aggregation: 'best_n',
      best_n: 12,
    });

    expect(result.isBestN).toBe(true);
    expect(result.countedCount).toBe(12);
    expect(result.totalCount).toBe(14);

    const countedSum = items
      .filter((i) => result.countedDates.has(i.date))
      .reduce((acc, i) => acc + (i.pointsEarned ?? 0), 0);
    expect(countedSum).toBe(103);
    // The best 5-pt round (2026-11-20, -1 net) is kept; the other two 5-pt rounds are dropped.
    expect(result.countedDates.has('2026-11-20')).toBe(true);
    expect(result.countedDates.has('2026-11-16')).toBe(false);
    expect(result.countedDates.has('2026-09-27')).toBe(false);
  });

  it('selects Sergio Cruz best 12 of 15 jornadas summing to 83 pts', () => {
    const items: ParticipantJornadaItem[] = [
      { date: '2026-11-22', pointsEarned: 7, scoreValue: 2 },
      { date: '2026-11-20', pointsEarned: 3, scoreValue: 0 },
      { date: '2026-11-08', pointsEarned: 7, scoreValue: 2 },
      { date: '2026-11-07', pointsEarned: 7, scoreValue: 3 },
      { date: '2026-11-02', pointsEarned: 3, scoreValue: 5 },
      { date: '2026-11-01', pointsEarned: 3, scoreValue: 7 },
      { date: '2026-10-30', pointsEarned: 10, scoreValue: 3 },
      { date: '2026-10-16', pointsEarned: 1, scoreValue: 15 },
      { date: '2026-10-09', pointsEarned: 1, scoreValue: 6 },
      { date: '2026-08-30', pointsEarned: 6, scoreValue: 1 },
      { date: '2026-08-28', pointsEarned: 10, scoreValue: -1 },
      { date: '2026-08-23', pointsEarned: 5, scoreValue: 5 },
      { date: '2026-08-21', pointsEarned: 10, scoreValue: 1 },
      { date: '2026-07-19', pointsEarned: 5, scoreValue: 8 },
      { date: '2026-07-17', pointsEarned: 10, scoreValue: -1 },
    ];

    const result = computeCountedJornadaDates(items, {
      scoring_system: 'points',
      score_basis: 'net',
      aggregation: 'best_n',
      best_n: 12,
    });

    expect(result.countedCount).toBe(12);
    const countedSum = items
      .filter((i) => result.countedDates.has(i.date))
      .reduce((acc, i) => acc + (i.pointsEarned ?? 0), 0);
    expect(countedSum).toBe(83);
    expect(result.countedDates.has('2026-10-16')).toBe(false);
    expect(result.countedDates.has('2026-10-09')).toBe(false);
    expect(result.countedDates.has('2026-11-01')).toBe(false);
    expect(result.countedDates.has('2026-11-20')).toBe(true);
    expect(result.countedDates.has('2026-11-02')).toBe(true);
  });

  it('marks all jornadas as counted when played <= best_n or aggregation is sum', () => {
    const items: ParticipantJornadaItem[] = [
      { date: '2026-10-01', pointsEarned: 5, scoreValue: 2 },
      { date: '2026-10-08', pointsEarned: 10, scoreValue: -1 },
    ];

    const bestNRes = computeCountedJornadaDates(items, {
      scoring_system: 'points',
      score_basis: 'net',
      aggregation: 'best_n',
      best_n: 12,
    });
    expect(bestNRes.isBestN).toBe(true);
    expect(bestNRes.countedCount).toBe(2);
    expect(bestNRes.countedDates.size).toBe(2);

    const sumRes = computeCountedJornadaDates(items, {
      scoring_system: 'points',
      score_basis: 'net',
      aggregation: 'sum',
      best_n: null,
    });
    expect(sumRes.isBestN).toBe(false);
    expect(sumRes.countedDates.size).toBe(2);
  });

  it('picks lowest scores for strokes and highest scores for stableford', () => {
    const items: ParticipantJornadaItem[] = [
      { date: '2026-10-01', pointsEarned: null, scoreValue: 38 },
      { date: '2026-10-08', pointsEarned: null, scoreValue: 30 },
      { date: '2026-10-15', pointsEarned: null, scoreValue: 35 },
    ];

    const stb = computeCountedJornadaDates(items, {
      scoring_system: 'stableford',
      score_basis: 'stableford',
      aggregation: 'best_n',
      best_n: 2,
    });
    expect([...stb.countedDates].sort()).toEqual(['2026-10-01', '2026-10-15']);

    const strokes = computeCountedJornadaDates(
      [
        { date: '2026-10-01', pointsEarned: null, scoreValue: 8 },
        { date: '2026-10-08', pointsEarned: null, scoreValue: -1 },
        { date: '2026-10-15', pointsEarned: null, scoreValue: 2 },
      ],
      { scoring_system: 'strokes', score_basis: 'net', aggregation: 'best_n', best_n: 2 },
    );
    expect([...strokes.countedDates].sort()).toEqual(['2026-10-08', '2026-10-15']);
  });
});