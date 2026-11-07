/**
 * Carritos — "Medal por Parejas" (scoringMethod === 'strokes').
 *
 * Single implementation of the strokes method, shared by the bet engine
 * (calculateCarritosBets) and the BetDashboard. Pure: no React, no I/O.
 *
 * Rules:
 *  - Per hole where all 4 players have a confirmed score, each team scores:
 *      lowBall  = lowest net of the pair
 *      highBall = highest net of the pair
 *      combined = sum of both nets ('all' is treated as 'combined')
 *    A hole missing any confirmed score is skipped for both teams.
 *  - Net = gross − strokes received, using Math.floor(hcp) and
 *    calculateStrokesPerHole (no startingHole), same as dashboard Carritos.
 *  - Segments: Front = 1-9, Back = 10-18, Total = Front + Back.
 *    Lowest accumulated total wins; a tie means the segment is not paid.
 *    9-hole rounds: only Front exists (Back/Total are 0 and never paid).
 *  - Half stroke (handicapConfig.slidingHalfPointMode === 'halfPoint' and a
 *    player with a .5 handicap): on that player's half-stroke hole, ONLY when
 *    the hole is tied under the modality and the player's score is the one that
 *    counts, the receiving team subtracts ONE full stroke. Never 0.5.
 *  - Payment: same as Carritos — each loser pays amount/2 to each winner.
 */
import { GolfCourse, PlayerScore } from '@/types/golf';
import { calculateStrokesPerHole, calculateStrokesPerHoleWithHalf } from '../handicapUtils';

export type CarritosScoringType = 'lowBall' | 'highBall' | 'combined' | 'all';
export type CarritosSegmentWinner = 'A' | 'B' | 'tie';

export interface CarritosStrokesHoleDetail {
  holeNumber: number;
  grossA1: number; hcpA1: number; netA1: number;
  grossA2: number; hcpA2: number; netA2: number;
  grossB1: number; hcpB1: number; netB1: number;
  grossB2: number; hcpB2: number; netB2: number;
  /** Team strokes counted for this hole (after a half-stroke tie-break, if any). */
  teamScoreA: number;
  teamScoreB: number;
  /** Team that subtracted 1 stroke via the half-stroke tie-break on this hole. */
  halfAppliedTeam: 'A' | 'B' | null;
  /** Stroke advantage of team A on this hole: teamScoreB − teamScoreA (positive = A better). */
  diff: number;
}

export interface CarritosStrokesInput {
  teamA: [string, string];
  teamB: [string, string];
  scoringType: CarritosScoringType;
  /** Resolved handicap per player id (teamHandicaps resolved as in Carritos). */
  handicaps: Record<string, number>;
  handicapConfig?: { mode?: string; slidingHalfPointMode?: 'halfPoint' | 'roundDown' };
  course: GolfCourse;
  /** Scores per player id; only entries with confirmed === true count. */
  confirmedScores: Map<string, PlayerScore[]>;
  roundHoles?: 9 | 18;
  frontAmount: number;
  backAmount: number;
  totalAmount: number;
}

export interface CarritosStrokesResult {
  method: 'strokes';
  /** Effective modality ('all' becomes 'combined'). */
  scoringType: 'lowBall' | 'highBall' | 'combined';
  holeDetailsFront: Array<CarritosStrokesHoleDetail | null>; // holes 1-9
  holeDetailsBack: Array<CarritosStrokesHoleDetail | null>;  // holes 10-18
  scoreAFront: number; scoreBFront: number;
  scoreABack: number; scoreBBack: number;
  scoreATotal: number; scoreBTotal: number;
  winnerFront: CarritosSegmentWinner;
  winnerBack: CarritosSegmentWinner;
  winnerTotal: CarritosSegmentWinner;
  /** Team A money per segment (team amount; each cross is half of it). */
  moneyAFront: number;
  moneyABack: number;
  moneyATotal: number;
  moneyA: number;
  halfStrokeHole: number | null;
  halfPlayerId: string | null;
}

const FRONT_HOLES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const BACK_HOLES = [10, 11, 12, 13, 14, 15, 16, 17, 18];

const winnerOf = (a: number, b: number): CarritosSegmentWinner => (a < b ? 'A' : b < a ? 'B' : 'tie');
const moneyFor = (w: CarritosSegmentWinner, amount: number): number =>
  w === 'A' ? amount : w === 'B' ? -amount : 0;

export const computeCarritosStrokesResult = (input: CarritosStrokesInput): CarritosStrokesResult => {
  const { teamA, teamB, handicaps, handicapConfig, course, confirmedScores } = input;
  const mode: 'lowBall' | 'highBall' | 'combined' = input.scoringType === 'all' ? 'combined' : input.scoringType;
  const isNineHole = (input.roundHoles ?? 18) === 9;

  const getHcp = (pid: string): number => {
    const h = handicaps[pid];
    return typeof h === 'number' && Number.isFinite(h) ? h : 0;
  };

  const allPids = [...new Set([...teamA, ...teamB])];

  // Half-stroke hole (first player with a .5 handicap, as in dashboard Carritos)
  let halfStrokeHole: number | null = null;
  let halfPlayerId: string | null = null;
  if (handicapConfig?.slidingHalfPointMode === 'halfPoint') {
    for (const pid of allPids) {
      const hcp = getHcp(pid);
      if (hcp % 1 !== 0) {
        halfStrokeHole = calculateStrokesPerHoleWithHalf(hcp, true, course).halfStrokeHole;
        halfPlayerId = pid;
        break;
      }
    }
  }
  const halfTeam: 'A' | 'B' | null = halfPlayerId ? (teamA.includes(halfPlayerId) ? 'A' : 'B') : null;

  const strokesMap = new Map<string, number[]>();
  allPids.forEach(pid => strokesMap.set(pid, calculateStrokesPerHole(Math.floor(getHcp(pid)), course)));

  const getHole = (pid: string, holeNum: number): { gross: number; hcp: number; net: number } | null => {
    const s = confirmedScores.get(pid)?.find(x => x.holeNumber === holeNum);
    if (!s || s.confirmed !== true || typeof s.strokes !== 'number' || !Number.isFinite(s.strokes)) return null;
    const hcp = strokesMap.get(pid)?.[holeNum - 1] ?? 0;
    return { gross: s.strokes, hcp, net: s.strokes - hcp };
  };

  const teamScore = (n1: number, n2: number): number =>
    mode === 'lowBall' ? Math.min(n1, n2) : mode === 'highBall' ? Math.max(n1, n2) : n1 + n2;

  const holeDetail = (holeNum: number): CarritosStrokesHoleDetail | null => {
    const a1 = getHole(teamA[0], holeNum), a2 = getHole(teamA[1], holeNum);
    const b1 = getHole(teamB[0], holeNum), b2 = getHole(teamB[1], holeNum);
    if (!a1 || !a2 || !b1 || !b2) return null;

    let teamScoreA = teamScore(a1.net, a2.net);
    let teamScoreB = teamScore(b1.net, b2.net);
    let halfAppliedTeam: 'A' | 'B' | null = null;

    if (halfStrokeHole === holeNum && halfPlayerId && halfTeam && teamScoreA === teamScoreB) {
      const own = halfTeam === 'A' ? [a1.net, a2.net] : [b1.net, b2.net];
      const ownIds = halfTeam === 'A' ? teamA : teamB;
      const playerNet = halfPlayerId === ownIds[0] ? own[0] : own[1];
      const low = Math.min(own[0], own[1]);
      const high = Math.max(own[0], own[1]);
      const counts =
        mode === 'lowBall' ? playerNet === low
        : mode === 'highBall' ? playerNet === high && playerNet !== low
        : true;
      if (counts) {
        halfAppliedTeam = halfTeam;
        if (halfTeam === 'A') teamScoreA -= 1; else teamScoreB -= 1;
      }
    }

    return {
      holeNumber: holeNum,
      grossA1: a1.gross, hcpA1: a1.hcp, netA1: a1.net,
      grossA2: a2.gross, hcpA2: a2.hcp, netA2: a2.net,
      grossB1: b1.gross, hcpB1: b1.hcp, netB1: b1.net,
      grossB2: b2.gross, hcpB2: b2.hcp, netB2: b2.net,
      teamScoreA, teamScoreB, halfAppliedTeam,
      diff: teamScoreB - teamScoreA,
    };
  };

  const sum = (details: Array<CarritosStrokesHoleDetail | null>) =>
    details.reduce((acc, d) => (d ? { a: acc.a + d.teamScoreA, b: acc.b + d.teamScoreB } : acc), { a: 0, b: 0 });

  const holeDetailsFront = FRONT_HOLES.map(holeDetail);
  const holeDetailsBack = isNineHole ? BACK_HOLES.map(() => null) : BACK_HOLES.map(holeDetail);

  const front = sum(holeDetailsFront);
  const back = sum(holeDetailsBack);
  const scoreATotal = isNineHole ? 0 : front.a + back.a;
  const scoreBTotal = isNineHole ? 0 : front.b + back.b;

  const winnerFront = winnerOf(front.a, front.b);
  const winnerBack: CarritosSegmentWinner = isNineHole ? 'tie' : winnerOf(back.a, back.b);
  const winnerTotal: CarritosSegmentWinner = isNineHole ? 'tie' : winnerOf(scoreATotal, scoreBTotal);

  const moneyAFront = moneyFor(winnerFront, input.frontAmount);
  const moneyABack = isNineHole ? 0 : moneyFor(winnerBack, input.backAmount);
  const moneyATotal = isNineHole ? 0 : moneyFor(winnerTotal, input.totalAmount);

  return {
    method: 'strokes',
    scoringType: mode,
    holeDetailsFront,
    holeDetailsBack,
    scoreAFront: front.a, scoreBFront: front.b,
    scoreABack: back.a, scoreBBack: back.b,
    scoreATotal, scoreBTotal,
    winnerFront, winnerBack, winnerTotal,
    moneyAFront, moneyABack, moneyATotal,
    moneyA: moneyAFront + moneyABack + moneyATotal,
    halfStrokeHole,
    halfPlayerId,
  };
};

/**
 * Paid segments of a strokes result, with team-A money and the "36 vs 38"
 * description from each team's perspective. Shared by engine and dashboard so
 * labels, amounts and descriptions never drift.
 */
export const getCarritosStrokesPaidSegments = (r: Pick<CarritosStrokesResult,
  'moneyAFront' | 'moneyABack' | 'moneyATotal' | 'scoreAFront' | 'scoreBFront' | 'scoreABack' | 'scoreBBack' | 'scoreATotal' | 'scoreBTotal'>,
): Array<{ label: 'Carritos Front' | 'Carritos Back' | 'Carritos Total'; segment: 'front' | 'back' | 'total'; moneyA: number; descriptionA: string; descriptionB: string }> => {
  const all = [
    { label: 'Carritos Front' as const, segment: 'front' as const, moneyA: r.moneyAFront, a: r.scoreAFront, b: r.scoreBFront },
    { label: 'Carritos Back' as const, segment: 'back' as const, moneyA: r.moneyABack, a: r.scoreABack, b: r.scoreBBack },
    { label: 'Carritos Total' as const, segment: 'total' as const, moneyA: r.moneyATotal, a: r.scoreATotal, b: r.scoreBTotal },
  ];
  return all
    .filter(s => s.moneyA !== 0)
    .map(s => ({ label: s.label, segment: s.segment, moneyA: s.moneyA, descriptionA: `${s.a} vs ${s.b}`, descriptionB: `${s.b} vs ${s.a}` }));
};
