import { describe, it, expect } from 'vitest';
import { calculateCarritosBets } from '@/lib/bets/carritos';
import { computeCarritosStrokesResult } from '@/lib/bets/carritosStrokes';
import { generateRoundSnapshot } from '@/lib/roundSnapshot';

// Stroke index: hole 2 is the hardest (index 1) so a 1-stroke player receives it there,
// and a 0.5 player gets the half stroke on hole 2.
const FRONT_IDX = [3, 1, 5, 7, 9, 11, 13, 15, 17];
const BACK_IDX = [2, 4, 6, 8, 10, 12, 14, 16, 18];
const course: any = {
  id: 'c', name: 'Test',
  holes: Array.from({ length: 18 }, (_, i) => ({
    number: i + 1, par: 4, handicapIndex: i < 9 ? FRONT_IDX[i] : BACK_IDX[i - 9],
  })),
};
const IDS = ['a1', 'a2', 'b1', 'b2'] as const;
const players: any[] = IDS.map(id => ({ id, name: id.toUpperCase(), initials: id, handicap: 0, color: '#000' }));

type HoleRow = [number, number, number, number] | [number, number, number, number, Partial<Record<string, boolean>>];
/** rows: holeNumber -> [a1, a2, b1, b2] gross (optional 5th = unconfirmed flags per player) */
const mkScores = (rows: Record<number, HoleRow>) => {
  const m = new Map<string, any[]>(IDS.map(id => [id, []]));
  Object.entries(rows).forEach(([h, row]) => {
    const flags = (row[4] ?? {}) as Record<string, boolean>;
    IDS.forEach((id, i) => {
      m.get(id)!.push({ holeNumber: Number(h), strokes: row[i] as number, putts: 2, confirmed: flags[id] === false ? false : true, markers: {} });
    });
  });
  return m;
};

const baseInput = (over: Partial<Parameters<typeof computeCarritosStrokesResult>[0]> = {}) => ({
  teamA: ['a1', 'a2'] as [string, string],
  teamB: ['b1', 'b2'] as [string, string],
  scoringType: 'lowBall' as const,
  handicaps: { a1: 0, a2: 0, b1: 0, b2: 0 },
  course,
  confirmedScores: mkScores({}),
  roundHoles: 18 as const,
  frontAmount: 100, backAmount: 100, totalAmount: 100,
  ...over,
});

const engineCfg = (team: Record<string, unknown>, extra: Record<string, unknown> = {}): any => ({
  carritos: { enabled: true, teamA: ['', ''], teamB: ['', ''] },
  carritosTeams: [{
    id: 't', teamA: ['a1', 'a2'], teamB: ['b1', 'b2'],
    frontAmount: 100, backAmount: 100, totalAmount: 100,
    scoringType: 'lowBall', teamHandicaps: { a1: 0, a2: 0, b1: 0, b2: 0 }, enabled: true,
    ...team,
  }],
  ...extra,
});

describe('Medal por Parejas (Carritos strokes)', () => {
  it('(a) acceptance: lowBall, b1 gets 1 stroke on hole 2 → Front A 8 vs B 9, A wins', () => {
    const r = computeCarritosStrokesResult(baseInput({
      handicaps: { a1: 0, a2: 0, b1: 1, b2: 0 },
      confirmedScores: mkScores({ 1: [4, 6, 5, 6], 2: [4, 6, 5, 6] }),
    }));
    expect(r.holeDetailsFront[1]?.netB1).toBe(4);
    expect(r.scoreAFront).toBe(8);
    expect(r.scoreBFront).toBe(9);
    expect(r.winnerFront).toBe('A');
    expect(r.moneyAFront).toBe(100);
  });

  it('(b) a tied segment is not paid', () => {
    const scores = mkScores({ 1: [4, 6, 4, 6], 10: [5, 5, 4, 6] });
    const r = computeCarritosStrokesResult(baseInput({ confirmedScores: scores }));
    expect(r.winnerFront).toBe('tie');
    expect(r.moneyAFront).toBe(0);
    const s = calculateCarritosBets(players, scores, engineCfg({ scoringMethod: 'strokes' }), course);
    expect(s.filter(x => x.betType === 'Carritos Front')).toHaveLength(0);
    expect(s.filter(x => x.betType === 'Carritos Back')).toHaveLength(8);
  });

  it('(c) highBall accumulates the higher net; combined accumulates the sum', () => {
    const scores = mkScores({ 1: [3, 6, 5, 5], 2: [4, 4, 3, 6] });
    const high = computeCarritosStrokesResult(baseInput({ scoringType: 'highBall', confirmedScores: scores }));
    expect(high.scoreAFront).toBe(6 + 4);
    expect(high.scoreBFront).toBe(5 + 6);
    expect(high.winnerFront).toBe('A');
    const comb = computeCarritosStrokesResult(baseInput({ scoringType: 'combined', confirmedScores: scores }));
    expect(comb.scoreAFront).toBe(9 + 8);
    expect(comb.scoreBFront).toBe(10 + 9);
  });

  it("(d) 'all' with strokes behaves as 'combined'", () => {
    const scores = mkScores({ 1: [3, 6, 5, 5], 2: [4, 4, 3, 6], 12: [5, 5, 4, 4] });
    const all = computeCarritosStrokesResult(baseInput({ scoringType: 'all', confirmedScores: scores }));
    const comb = computeCarritosStrokesResult(baseInput({ scoringType: 'combined', confirmedScores: scores }));
    expect(all.scoringType).toBe('combined');
    expect({ ...all, scoringType: 'x' }).toEqual({ ...comb, scoringType: 'x' });
  });

  it('(e) a hole with one unconfirmed score is skipped for both teams', () => {
    const scores = mkScores({ 1: [4, 5, 5, 5], 2: [9, 9, 3, 3, { b2: false }] });
    const r = computeCarritosStrokesResult(baseInput({ confirmedScores: scores }));
    expect(r.holeDetailsFront[1]).toBeNull();
    expect(r.scoreAFront).toBe(4);
    expect(r.scoreBFront).toBe(5);
  });

  it('(f) Total = Front + Back; 9-hole rounds only pay Front', () => {
    const scores = mkScores({ 1: [4, 5, 5, 5], 10: [5, 5, 4, 6], 11: [5, 5, 4, 6] });
    const r = computeCarritosStrokesResult(baseInput({ confirmedScores: scores }));
    expect(r.scoreATotal).toBe(r.scoreAFront + r.scoreABack);
    expect(r.scoreBTotal).toBe(r.scoreBFront + r.scoreBBack);
    expect([r.scoreATotal, r.scoreBTotal]).toEqual([14, 13]);
    expect(r.winnerTotal).toBe('B');

    const nine = calculateCarritosBets(players, scores, engineCfg({ scoringMethod: 'strokes' }, { roundHoles: 9 }), course);
    expect(new Set(nine.map(s => s.betType))).toEqual(new Set(['Carritos Front']));
    const r9 = computeCarritosStrokesResult(baseInput({ confirmedScores: scores, roundHoles: 9 }));
    expect([r9.scoreABack, r9.scoreBBack, r9.scoreATotal, r9.scoreBTotal, r9.moneyABack, r9.moneyATotal]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('(g) each loser pays amount/2 to each winner per lost segment (4 crosses)', () => {
    const scores = mkScores({ 1: [4, 6, 5, 6], 2: [4, 6, 5, 6] });
    const s = calculateCarritosBets(players, scores, engineCfg({ scoringMethod: 'strokes', frontAmount: 200 }), course);
    const front = s.filter(x => x.betType === 'Carritos Front');
    expect(front).toHaveLength(8);
    for (const w of ['a1', 'a2']) for (const l of ['b1', 'b2']) {
      const win = front.find(x => x.playerId === w && x.vsPlayer === l)!;
      const lose = front.find(x => x.playerId === l && x.vsPlayer === w)!;
      expect(win.amount).toBe(100);
      expect(lose.amount).toBe(-100);
      expect(win.description).toBe('8 vs 10');
      expect(lose.description).toBe('10 vs 8');
      expect(win.betId).toBe('t');
      expect(win.segment).toBe('front');
    }
    // Each loser pays the full segment amount in total
    expect(front.filter(x => x.playerId === 'b1').reduce((t, x) => t + x.amount, 0)).toBe(-200);
  });

  describe('(h) half stroke', () => {
    const halfInput = (scoringType: 'lowBall' | 'combined', hole2: [number, number, number, number], mode: 'halfPoint' | 'roundDown' = 'halfPoint') =>
      baseInput({
        scoringType,
        handicaps: { a1: 0, a2: 0, b1: 0.5, b2: 0 },
        handicapConfig: { slidingHalfPointMode: mode },
        confirmedScores: mkScores({ 2: hole2 }),
      });

    it('lowBall: tie on the half hole where the player is the low ball → subtract 1 full stroke', () => {
      const r = computeCarritosStrokesResult(halfInput('lowBall', [4, 5, 4, 6]));
      expect(r.halfStrokeHole).toBe(2);
      expect(r.holeDetailsFront[1]?.halfAppliedTeam).toBe('B');
      expect(r.holeDetailsFront[1]?.teamScoreB).toBe(3);
      expect(r.scoreBFront).toBe(3);
      expect(Number.isInteger(r.scoreBFront)).toBe(true);
      expect(r.winnerFront).toBe('B');
    });

    it('lowBall: not applied without a tie', () => {
      const r = computeCarritosStrokesResult(halfInput('lowBall', [3, 5, 4, 6]));
      expect(r.holeDetailsFront[1]?.halfAppliedTeam).toBeNull();
      expect([r.scoreAFront, r.scoreBFront]).toEqual([3, 4]);
    });

    it("lowBall: not applied when the player's score is not the one that counts", () => {
      const r = computeCarritosStrokesResult(halfInput('lowBall', [4, 5, 6, 4]));
      expect(r.holeDetailsFront[1]?.halfAppliedTeam).toBeNull();
      expect(r.winnerFront).toBe('tie');
    });

    it('lowBall: not applied outside halfPoint mode', () => {
      const r = computeCarritosStrokesResult(halfInput('lowBall', [4, 5, 4, 6], 'roundDown'));
      expect(r.holeDetailsFront[1]?.halfAppliedTeam).toBeNull();
      expect(r.winnerFront).toBe('tie');
    });

    it('combined: applied when the team sums tie', () => {
      const r = computeCarritosStrokesResult(halfInput('combined', [4, 5, 6, 3]));
      expect(r.holeDetailsFront[1]?.halfAppliedTeam).toBe('B');
      expect([r.scoreAFront, r.scoreBFront]).toEqual([9, 8]);
    });
  });

  describe('(i) regression: points method unchanged', () => {
    const scores = mkScores({ 1: [4, 6, 5, 5], 2: [4, 4, 3, 6], 10: [2, 4, 4, 5], 11: [5, 5, 5, 5] });
    const strip = (s: any[]) => s.map(({ playerId, vsPlayer, betType, amount, segment, betId, description }) => ({ playerId, vsPlayer, betType, amount, segment, betId, description }));

    it("scoringMethod absent and 'points' give identical results", () => {
      for (const t of ['lowBall', 'highBall', 'combined', 'all']) {
        const absent = calculateCarritosBets(players, scores, engineCfg({ scoringType: t }), course);
        const points = calculateCarritosBets(players, scores, engineCfg({ scoringType: t, scoringMethod: 'points' }), course);
        expect(strip(points)).toEqual(strip(absent));
        expect(absent.every(s => s.description === undefined)).toBe(true);
      }
    });

    it('points lowBall keeps per-hole points: Front 1-1 tie, Back A 1-0 → Back and Total to A', () => {
      const r = calculateCarritosBets(players, scores, engineCfg({ scoringType: 'lowBall' }), course);
      const a1 = (bt: string) => r.filter(s => s.playerId === 'a1' && s.betType === bt).reduce((t, s) => t + s.amount, 0);
      expect(a1('Carritos Front')).toBe(0);
      expect(a1('Carritos Back')).toBe(100);
      expect(a1('Carritos Total')).toBe(100);
    });
  });

  it('(j) snapshot with strokes summaries is symmetric, zero-sum and excludes Carritos from pairBreakdowns', () => {
    const scores = mkScores({ 1: [4, 6, 5, 6], 2: [4, 6, 5, 6], 10: [5, 5, 4, 6] });
    const cfg = engineCfg({ scoringMethod: 'strokes' });
    const summaries = calculateCarritosBets(players, scores, cfg, course);
    expect(summaries.length).toBeGreaterThan(0);
    const snap = generateRoundSnapshot('r1', course, players, scores as any, cfg, summaries, 'white', 1, '2026-11-07');
    expect(snap.meta.integrityChecks?.symmetryOk ?? true).toBe(true);
    expect(snap.meta.integrityChecks?.zeroSumOk ?? true).toBe(true);
    expect(snap.balances.reduce((t, b) => t + b.totalNet, 0)).toBe(0);
    for (const b of snap.balances) for (const v of b.vsBalances) {
      const back = snap.balances.find(x => x.playerId === v.rivalId)!.vsBalances.find(x => x.rivalId === b.playerId)!;
      expect(back.netAmount).toBe(-v.netAmount);
    }
    const breakdownTypes = Object.values(snap.pairBreakdowns ?? {}).flatMap(o => Object.keys(o));
    expect(breakdownTypes.some(t => t.startsWith('Carritos'))).toBe(false);
    expect(snap.ledger.some(e => e.betType === 'Carritos Front' && e.description === '8 vs 10')).toBe(true);
  });
});
