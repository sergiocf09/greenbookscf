import { describe, it, expect } from 'vitest';
import { singleDayCandidates, multiDayCandidates } from '@/lib/prizeCandidates';
import type { StandingsEntry } from '@/hooks/useLeaderboards';
import type { AccumulatedStanding, DayStanding } from '@/lib/leaderboardAggregation';

const entry = (id: string, holesPlayed: number, gross = 0, net = 0, stb = 0): StandingsEntry => ({
  participant: { id, leaderboard_id: 'lb', profile_id: null, guest_name: id, guest_initials: null, guest_color: null, handicap_for_leaderboard: 0, is_active: true },
  grossVsPar: gross, netVsPar: net, stablefordTotal: stb, grossTotal: 0, netTotal: 0, holesPlayed, roundsPlayed: holesPlayed > 0 ? 1 : 0,
});

const day = (participantId: string, holesPlayed: number): DayStanding => ({
  participantId, profile_id: null, grossTotal: 0, netTotal: 0, grossVsPar: 0, netVsPar: 0, stablefordTotal: 0, holesPlayed, position: 0,
});

const acc = (participantId: string, extra: Partial<AccumulatedStanding> = {}): AccumulatedStanding => ({
  participantId, profile_id: null, daysPlayed: 1, totalGross: 0, totalNetVsPar: 3, totalGrossVsPar: 10, totalStableford: 70,
  dayNetScores: [], dayGrossScores: [], dayStablefordScores: [], position: 1, ...extra,
});

const days = [{ day_number: 1, date: '2026-11-20' }, { day_number: 2, date: '2026-11-21' }];

describe('singleDayCandidates', () => {
  it('18/18 is completed, 12/18 is not; metrics come from standings', () => {
    const c = singleDayCandidates({ standings: [entry('a', 18, 5, -2, 38), entry('b', 12)], expectedHoles: 18 });
    expect(c[0]).toEqual({ participantId: 'a', completed: true, metrics: { gross: 5, net: -2, stableford: 38 } });
    expect(c[1].completed).toBe(false);
  });

  it('a 9-hole round (expected 9) is completed with 9 holes', () => {
    const c = singleDayCandidates({ standings: [entry('a', 9)], expectedHoles: 9 });
    expect(c[0].completed).toBe(true);
  });

  it('projection counts players still in progress', () => {
    const c = singleDayCandidates({ standings: [entry('a', 12), entry('b', 0)], expectedHoles: 18, projection: true });
    expect(c.map(x => x.completed)).toEqual([true, false]);
  });

  it('a player with no holes is included and not completed', () => {
    const c = singleDayCandidates({ standings: [entry('z', 0)], expectedHoles: 18 });
    expect(c).toHaveLength(1);
    expect(c[0].completed).toBe(false);
  });
});

describe('multiDayCandidates', () => {
  const participants = [{ id: 'a' }, { id: 'b' }];

  it('completed only when every day is complete', () => {
    const c = multiDayCandidates({
      participants,
      standingsByDay: { 1: [day('a', 18), day('b', 18)], 2: [day('a', 18), day('b', 10)] },
      rules: { days, aggregation: 'sum' },
      expectedHolesByDay: { 1: 18, 2: 18 },
      accumulated: [acc('a'), acc('b')],
    });
    expect(c.map(x => x.completed)).toEqual([true, false]);
    expect(c[0].metrics).toEqual({ gross: 10, net: 3, stableford: 70 });
  });

  it('best_n uses the bestN metrics shown in the accumulated table', () => {
    const c = multiDayCandidates({
      participants: [{ id: 'a' }],
      standingsByDay: { 1: [day('a', 18)], 2: [day('a', 18)] },
      rules: { days, aggregation: 'best_n', best_n: 1 },
      expectedHolesByDay: { 1: 18, 2: 18 },
      accumulated: [acc('a', { bestNGross: 4, bestNNetVsPar: -1, bestNStableford: 37 })],
    });
    expect(c[0].metrics).toEqual({ gross: 4, net: -1, stableford: 37 });
  });

  it('a day without a linked round leaves everyone incomplete', () => {
    const c = multiDayCandidates({
      participants,
      standingsByDay: { 1: [day('a', 18), day('b', 18)], 2: [day('a', 0), day('b', 0)] },
      rules: { days, aggregation: 'sum' },
      expectedHolesByDay: { 1: 18 },
      accumulated: [acc('a'), acc('b')],
    });
    expect(c.every(x => !x.completed)).toBe(true);
  });

  it('projection: any holes on at least one day; missing accumulated → zero metrics', () => {
    const c = multiDayCandidates({
      participants: [{ id: 'a' }, { id: 'b' }],
      standingsByDay: { 1: [day('a', 5), day('b', 0)], 2: [day('a', 0), day('b', 0)] },
      rules: { days, aggregation: 'sum' },
      expectedHolesByDay: { 1: 18, 2: 18 },
      accumulated: [acc('a')],
      projection: true,
    });
    expect(c[0].completed).toBe(true);
    expect(c[1]).toEqual({ participantId: 'b', completed: false, metrics: { gross: 0, net: 0, stableford: 0 } });
  });
});
