import { describe, expect, it } from 'vitest';
import {
  LEADERBOARD_DEFAULT_STABLEFORD_POINTS,
  computeAccumulatedStandings,
  type HoleInfo,
} from '@/lib/leaderboardAggregation';
import {
  buildMultiDayStandings,
  parseLinkedRoundHoles,
  type LeaderboardLiveScoreRow,
  type LinkedRoundMeta,
} from '@/lib/multiDayStandings';

const make18Holes = (): HoleInfo[] =>
  Array.from({ length: 18 }, (_, i) => ({
    hole_number: i + 1,
    par: 4,
    stroke_index: i + 1,
  }));

describe('parseLinkedRoundHoles', () => {
  it('parses valid hole metadata arrays and ignores malformed entries', () => {
    const parsed = parseLinkedRoundHoles([
      { hole_number: 1, par: 4, stroke_index: 5 },
      { hole_number: '2', par: '3', stroke_index: '17' },
      null,
      { hole_number: 'bad', par: 4, stroke_index: 1 },
    ]);
    expect(parsed).toEqual([
      { hole_number: 1, par: 4, stroke_index: 5 },
      { hole_number: 2, par: 3, stroke_index: 17 },
    ]);
  });
});

describe('buildMultiDayStandings', () => {
  it('aggregates scores across days from tournament-authorized RPC rows regardless of viewer round membership', () => {
    const days = [
      { day_number: 1, date: '2026-09-03', label: 'Día 1' },
      { day_number: 2, date: '2026-09-05', label: 'Día 2' },
    ];
    const participants = [
      { id: 'p-ana', profile_id: 'prof-ana', guest_name: null, handicap_for_leaderboard: 18 },
      { id: 'p-guest', profile_id: null, guest_name: 'Carlos Inv', handicap_for_leaderboard: 0 },
    ];
    const holes = make18Holes();
    const roundMetas: LinkedRoundMeta[] = [
      { round_id: 'r-day1', round_date: '2026-09-03', course_id: 'c1', course_name: 'Tulum', expected_holes: 18, holes },
      { round_id: 'r-day2', round_date: '2026-09-05', course_id: 'c1', course_name: 'Tulum', expected_holes: 18, holes },
    ];
    const liveRows: LeaderboardLiveScoreRow[] = [
      // Ana played hole 1 & 2 on Day 1 (HCP 18 => 1 stroke/hole): strokes 5, 4 => net 4 (E, 2 pts), 3 (-1, 3 pts)
      { round_player_id: 'rp1', round_id: 'r-day1', profile_id: 'prof-ana', guest_name: null, handicap_for_round: 10, hole_number: 1, strokes: 5 },
      { round_player_id: 'rp1', round_id: 'r-day1', profile_id: 'prof-ana', guest_name: null, handicap_for_round: 10, hole_number: 2, strokes: 4 },
      // Guest played only Day 2 hole 1: stroke 4 (HCP 0 => net 4, E, 2 pts)
      { round_player_id: 'rp2', round_id: 'r-day2', profile_id: null, guest_name: 'Carlos Inv', handicap_for_round: 0, hole_number: 1, strokes: 4 },
      // Unmatched hole score (null strokes) should be ignored
      { round_player_id: 'rp2', round_id: 'r-day2', profile_id: null, guest_name: 'Carlos Inv', handicap_for_round: 0, hole_number: 2, strokes: null },
    ];

    const byDay = buildMultiDayStandings(
      days,
      participants,
      liveRows,
      roundMetas,
      LEADERBOARD_DEFAULT_STABLEFORD_POINTS,
    );

    const anaDay1 = byDay[1].find((e) => e.participantId === 'p-ana')!;
    expect(anaDay1.holesPlayed).toBe(2);
    expect(anaDay1.grossTotal).toBe(9);
    expect(anaDay1.netTotal).toBe(7);
    expect(anaDay1.netVsPar).toBe(-1);
    expect(anaDay1.stablefordTotal).toBe(5);

    const guestDay1 = byDay[1].find((e) => e.participantId === 'p-guest')!;
    expect(guestDay1.holesPlayed).toBe(0);

    const guestDay2 = byDay[2].find((e) => e.participantId === 'p-guest')!;
    expect(guestDay2.holesPlayed).toBe(1);
    expect(guestDay2.grossTotal).toBe(4);
    expect(guestDay2.netVsPar).toBe(0);
    expect(guestDay2.stablefordTotal).toBe(2);

    const acc = computeAccumulatedStandings(byDay, 'sum', undefined, 'net');
    expect(acc[0].participantId).toBe('p-ana');
    expect(acc[1].participantId).toBe('p-guest');
  });

  it('ignores scores from linked rounds whose date does not match any configured tournament day', () => {
    const days = [{ day_number: 1, date: '2026-09-03', label: 'Día 1' }];
    const participants = [{ id: 'p1', profile_id: 'u1', guest_name: null, handicap_for_leaderboard: 0 }];
    const roundMetas: LinkedRoundMeta[] = [
      { round_id: 'r-other', round_date: '2026-09-10', course_id: 'c1', course_name: 'Otro', expected_holes: 18, holes: make18Holes() },
    ];
    const liveRows: LeaderboardLiveScoreRow[] = [
      { round_player_id: 'rp1', round_id: 'r-other', profile_id: 'u1', guest_name: null, handicap_for_round: 0, hole_number: 1, strokes: 4 },
    ];

    const byDay = buildMultiDayStandings(
      days,
      participants,
      liveRows,
      roundMetas,
      LEADERBOARD_DEFAULT_STABLEFORD_POINTS,
    );
    expect(byDay[1][0].holesPlayed).toBe(0);
  });
});