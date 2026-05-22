import { Player, PlayerScore, GolfCourse, VegasConfig, VegasHoleDetail, VegasSetResult } from '@/types/golf';
import { BetSummary } from './shared';
import { calculateStrokesPerHole, calculateStrokesPerHoleWithHalf } from '../handicapUtils';
import { detectScoreBasedMarkers } from '../scoreDetection';

// Número de 2 dígitos Las Vegas: menor primero.
// Si alguno >= 10: el mayor va primero (regla del 10+)
export const formVegasNumber = (s1: number, s2: number): number => {
  const lo = Math.min(s1, s2), hi = Math.max(s1, s2);
  if (hi >= 10) return parseInt(`${hi}${lo}`, 10);
  return lo * 10 + hi;
};

/**
 * Returns the play-order index (0..17) of a hole, considering the round's
 * starting hole. When startingHole=10, hole 10 is index 0, hole 18 is index
 * 8, hole 1 is index 9, hole 9 is index 17.
 */
const playOrderIndex = (holeNumber: number, startingHole: 1 | 10): number => {
  if (startingHole === 10) {
    return holeNumber >= 10 ? holeNumber - 10 : holeNumber + 8;
  }
  return holeNumber - 1;
};

/**
 * Returns the played holes in play order based on the starting hole.
 */
const playedHolesInOrder = (startingHole: 1 | 10): number[] => {
  if (startingHole === 10) {
    return [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  }
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
};

const getScore = (
  playerId: string, holeNumber: number, players: Player[],
  scores: Map<string,PlayerScore[]>, course: GolfCourse, useHandicap: boolean,
  teamHandicaps?: Record<string, number>,
): number => {
  const player = players.find(p => p.id === playerId);
  if (!player) return 0;
  const hs = (scores.get(playerId) ?? []).find(s => s.confirmed && s.holeNumber === holeNumber);
  if (!hs?.strokes) return 0;
  if (!useHandicap) return hs.strokes;
  const hcp = teamHandicaps?.[playerId] ?? player.handicap;
  const sp = calculateStrokesPerHole(Math.floor(hcp), course);
  return hs.strokes - (sp[holeNumber - 1] ?? 0);
};

const hasBirdie = (
  playerIds: string[], holeNumber: number,
  players: Player[], scores: Map<string,PlayerScore[]>, course: GolfCourse
): boolean =>
  playerIds.some(id => {
    const hs = (scores.get(id) ?? []).find(s => s.holeNumber === holeNumber);
    if (!hs?.strokes) return false;
    const par = course.holes[holeNumber - 1]?.par ?? 4;
    const d = detectScoreBasedMarkers(hs.strokes, hs.putts ?? 0, par);
    return !!(d.birdie || d.eagle || d.albatross);
  });

const getVegasSegmentAmount = (
  config: VegasConfig,
  holeNumber: number,
  startingHole: 1 | 10 = 1,
): number => {
  if (!config.useSegmentAmounts) return config.valuePerPoint;
  const idx = playOrderIndex(holeNumber, startingHole);
  if (config.variant === 'fixed') {
    return idx <= 8
      ? (config.frontAmount ?? config.valuePerPoint)
      : (config.backAmount  ?? config.valuePerPoint);
  }
  if (idx <= 5)  return config.set1Amount ?? config.valuePerPoint;
  if (idx <= 11) return config.set2Amount ?? config.valuePerPoint;
  return config.set3Amount ?? config.valuePerPoint;
};

/** Detect halfStrokeHole and receiving team from teamHandicaps */
const detectHalfPoint = (
  t1: [string, string], t2: [string, string],
  teamHandicaps: Record<string, number> | undefined,
  isHalfPointMode: boolean,
  course: GolfCourse,
): { halfStrokeHole: number | null; halfReceivingTeam: 'team1' | 'team2' | null } => {
  if (!isHalfPointMode || !teamHandicaps) return { halfStrokeHole: null, halfReceivingTeam: null };
  for (const pid of [...t1, ...t2]) {
    const hcp = teamHandicaps[pid];
    if (typeof hcp === 'number' && hcp % 1 !== 0) {
      const result = calculateStrokesPerHoleWithHalf(hcp, true, course);
      const team = t1.includes(pid) ? 'team1' as const : 'team2' as const;
      return { halfStrokeHole: result.halfStrokeHole, halfReceivingTeam: team };
    }
  }
  return { halfStrokeHole: null, halfReceivingTeam: null };
};

const resolveVegasHole = (
  team1: [string,string], team2: [string,string],
  holeNumber: number, setNumber: 1|2|3|null,
  players: Player[], scores: Map<string,PlayerScore[]>,
  course: GolfCourse, config: VegasConfig,
  teamHandicaps?: Record<string, number>,
  halfStrokeHole?: number | null,
  halfReceivingTeam?: 'team1' | 'team2' | null,
  startingHole: 1 | 10 = 1,
): VegasHoleDetail => {
  const [pA, pB] = team1; const [pC, pD] = team2;
  const useH = !!teamHandicaps;
  const gA = getScore(pA, holeNumber, players, scores, course, false);
  const gB = getScore(pB, holeNumber, players, scores, course, false);
  const gC = getScore(pC, holeNumber, players, scores, course, false);
  const gD = getScore(pD, holeNumber, players, scores, course, false);
  const sA = useH ? getScore(pA, holeNumber, players, scores, course, true, teamHandicaps) : gA;
  const sB = useH ? getScore(pB, holeNumber, players, scores, course, true, teamHandicaps) : gB;
  const sC = useH ? getScore(pC, holeNumber, players, scores, course, true, teamHandicaps) : gC;
  const sD = useH ? getScore(pD, holeNumber, players, scores, course, true, teamHandicaps) : gD;

  const halfPointBreaksTie = !!halfReceivingTeam && holeNumber === halfStrokeHole;
  const pd = (pid: string, gross: number, strokes: number, isHalfHole: boolean) => {
    const isReceiving = halfPointBreaksTie && (
      (halfReceivingTeam === 'team1' && (pid === pA || pid === pB)) ||
      (halfReceivingTeam === 'team2' && (pid === pC || pid === pD))
    );
    const net = isHalfHole && isReceiving ? strokes - 0.5 : strokes;
    return { gross, strokes, net };
  };

  const n1 = formVegasNumber(sA, sB);
  const n2 = formVegasNumber(sC, sD);

  const dA = pd(pA, gA, sA, !!halfPointBreaksTie), dB = pd(pB, gB, sB, !!halfPointBreaksTie);
  const dC = pd(pC, gC, sC, !!halfPointBreaksTie), dD = pd(pD, gD, sD, !!halfPointBreaksTie);
  const bT1 = config.birdieMultiplier && hasBirdie([pA,pB], holeNumber, players, scores, course);
  const bT2 = config.birdieMultiplier && hasBirdie([pC,pD], holeNumber, players, scores, course);

  let n1e = n1, n2e = n2;
  let multiplierApplied: 'team1'|'team2'|'none' = 'none';
  if (bT1 && !bT2) { n2e = n2 * 2; multiplierApplied = 'team2'; }
  else if (bT2 && !bT1) { n1e = n1 * 2; multiplierApplied = 'team1'; }

  const diff = n2e - n1e;

  const amountThisHole = Math.abs(diff) * getVegasSegmentAmount(config, holeNumber, startingHole);
  const winner: 'team1'|'team2'|'tied' = diff > 0 ? 'team1' : diff < 0 ? 'team2' : 'tied';

  return {
    holeNumber, setNumber, team1, team2,
    grossA: dA.gross, strokesA: dA.strokes, netA: dA.net,
    grossB: dB.gross, strokesB: dB.strokes, netB: dB.net,
    grossC: dC.gross, strokesC: dC.strokes, netC: dC.net,
    grossD: dD.gross, strokesD: dD.strokes, netD: dD.net,
    numberTeam1: n1, numberTeam2: n2,
    numberTeam1Effective: n1e, numberTeam2Effective: n2e,
    birdieTeam1: bT1, birdieTeam2: bT2, multiplierApplied,
    diff, amountThisHole, winner,
  };
};

export const buildVegasSetResults = (
  players: Player[], scores: Map<string,PlayerScore[]>,
  config: VegasConfig, course: GolfCourse,
  teamHandicaps?: Record<string, number>,
  startingHole: 1 | 10 = 1,
): VegasSetResult[] => {
  const { playerAId: A, playerBId: B, playerCId: C, playerDId: D } = config;
  if (!A || !B || !C || !D) return [];

  const isHalfPointMode = config.handicapConfig?.slidingHalfPointMode === 'halfPoint';
  const effectiveTH = teamHandicaps ?? config.teamHandicaps;

  const order = playedHolesInOrder(startingHole);

  const sets = config.variant === 'fixed'
    ? [{ setNumber: null as null, holes: order, t1: [A,B] as [string,string], t2: [C,D] as [string,string] }]
    : [
        { setNumber: 1 as const, holes: order.slice(0, 6),  t1: [A,B] as [string,string], t2: [C,D] as [string,string] },
        { setNumber: 2 as const, holes: order.slice(6, 12), t1: [A,C] as [string,string], t2: [B,D] as [string,string] },
        { setNumber: 3 as const, holes: order.slice(12, 18), t1: [A,D] as [string,string], t2: [B,C] as [string,string] },
      ];

  return sets.map(s => {
    const { halfStrokeHole, halfReceivingTeam } = detectHalfPoint(
      s.t1, s.t2, effectiveTH, isHalfPointMode, course
    );

    const details = s.holes.map(h => resolveVegasHole(
      s.t1, s.t2, h, s.setNumber, players, scores, course, config, effectiveTH,
      halfStrokeHole, halfReceivingTeam, startingHole,
    ));
    const totalDiff = details.reduce((acc, d) => acc + d.diff, 0);
    const startHole = s.holes[0] ?? 1;
    const endHole = s.holes[s.holes.length - 1] ?? 18;
    const totalAmount = (() => {
      if (!config.useSegmentAmounts || config.variant !== 'fixed') {
        return Math.abs(totalDiff) * getVegasSegmentAmount(config, startHole, startingHole);
      }
      // Fixed variant with segment amounts: split by first/second nine in play order
      const frontHoleSet = new Set(order.slice(0, 9));
      const frontDiff = details.filter(d => frontHoleSet.has(d.holeNumber)).reduce((a, d) => a + d.diff, 0);
      const backDiff = details.filter(d => !frontHoleSet.has(d.holeNumber)).reduce((a, d) => a + d.diff, 0);
      const frontRef = order[0];
      const backRef = order[9] ?? order[0];
      return Math.abs(frontDiff) * getVegasSegmentAmount(config, frontRef, startingHole)
           + Math.abs(backDiff) * getVegasSegmentAmount(config, backRef, startingHole);
    })();
    const winner: 'team1'|'team2'|'tied' = totalDiff > 0 ? 'team1' : totalDiff < 0 ? 'team2' : 'tied';
    return { setNumber: s.setNumber, startHole, endHole, team1: s.t1, team2: s.t2, holeDetails: details, totalDiff, totalAmount, winner };
  });
};

export const calculateVegasBets = (
  players: Player[], scores: Map<string,PlayerScore[]>,
  config: VegasConfig, course: GolfCourse,
  teamHandicaps?: Record<string, number>,
  startingHole: 1 | 10 = 1,
): BetSummary[] => {
  const summaries: BetSummary[] = [];
  buildVegasSetResults(players, scores, config, course, teamHandicaps, startingHole).forEach(sr => {
    if (sr.winner === 'tied' || sr.totalAmount === 0) return;
    const winners = [...(sr.winner === 'team1' ? sr.team1 : sr.team2)];
    const losers  = [...(sr.winner === 'team1' ? sr.team2 : sr.team1)];
    const splitAmount = sr.totalAmount / 2;
    const desc = sr.setNumber ? `Vegas Set${sr.setNumber}` : 'Las Vegas';
    losers.forEach(lId => winners.forEach(wId => {
      summaries.push({ playerId: wId, vsPlayer: lId, betType: 'Vegas', amount: splitAmount, segment: 'total', description: desc });
      summaries.push({ playerId: lId, vsPlayer: wId, betType: 'Vegas', amount: -splitAmount, segment: 'total', description: desc });
    }));
  });
  return summaries;
};
