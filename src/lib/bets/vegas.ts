import { Player, PlayerScore, GolfCourse, VegasConfig, VegasHoleDetail, VegasSetResult } from '@/types/golf';
import { BetSummary } from './shared';
import { calculateStrokesPerHole } from '../handicapUtils';
import { detectScoreBasedMarkers } from '../scoreDetection';

// Número de 2 dígitos Las Vegas: menor primero.
// Si alguno >= 10: el mayor va primero (regla del 10+)
export const formVegasNumber = (s1: number, s2: number): number => {
  const lo = Math.min(s1, s2), hi = Math.max(s1, s2);
  if (hi >= 10) return parseInt(`${hi}${lo}`, 10);
  return lo * 10 + hi;
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

const getVegasSegmentAmount = (config: VegasConfig, holeNumber: number): number => {
  if (!config.useSegmentAmounts) return config.valuePerPoint;
  if (config.variant === 'fixed') {
    return holeNumber <= 9
      ? (config.frontAmount ?? config.valuePerPoint)
      : (config.backAmount  ?? config.valuePerPoint);
  }
  if (holeNumber <= 6)  return config.set1Amount ?? config.valuePerPoint;
  if (holeNumber <= 12) return config.set2Amount ?? config.valuePerPoint;
  return config.set3Amount ?? config.valuePerPoint;
};

const resolveVegasHole = (
  team1: [string,string], team2: [string,string],
  holeNumber: number, setNumber: 1|2|3|null,
  players: Player[], scores: Map<string,PlayerScore[]>,
  course: GolfCourse, config: VegasConfig,
  teamHandicaps?: Record<string, number>,
): VegasHoleDetail => {
  const [pA, pB] = team1, [pC, pD] = team2;
  // Net scores used for Vegas number formation
  const sA = getScore(pA, holeNumber, players, scores, course, config.useHandicap, teamHandicaps);
  const sB = getScore(pB, holeNumber, players, scores, course, config.useHandicap, teamHandicaps);
  const sC = getScore(pC, holeNumber, players, scores, course, config.useHandicap, teamHandicaps);
  const sD = getScore(pD, holeNumber, players, scores, course, config.useHandicap, teamHandicaps);

  // Raw gross scores for popover display
  const gA = getScore(pA, holeNumber, players, scores, course, false);
  const gB = getScore(pB, holeNumber, players, scores, course, false);
  const gC = getScore(pC, holeNumber, players, scores, course, false);
  const gD = getScore(pD, holeNumber, players, scores, course, false);

  const pd = (id: string, gross: number, net: number) => {
    const p = players.find(x => x.id === id);
    const hcp = teamHandicaps?.[id] ?? p?.handicap ?? 0;
    const sp = calculateStrokesPerHole(Math.floor(hcp), course);
    const strokes = config.useHandicap ? (sp[holeNumber - 1] ?? 0) : 0;
    return { gross, strokes, net };
  };
  const dA = pd(pA, gA, sA), dB = pd(pB, gB, sB), dC = pd(pC, gC, sC), dD = pd(pD, gD, sD);

  const n1 = formVegasNumber(sA, sB), n2 = formVegasNumber(sC, sD);
  const bT1 = config.birdieMultiplier && hasBirdie([pA,pB], holeNumber, players, scores, course);
  const bT2 = config.birdieMultiplier && hasBirdie([pC,pD], holeNumber, players, scores, course);

  let n1e = n1, n2e = n2;
  let multiplierApplied: 'team1'|'team2'|'none' = 'none';
  if (bT1 && !bT2) { n2e = n2 * 2; multiplierApplied = 'team2'; }
  else if (bT2 && !bT1) { n1e = n1 * 2; multiplierApplied = 'team1'; }

  const diff = n2e - n1e;
  const amountThisHole = Math.abs(diff) * getVegasSegmentAmount(config, holeNumber);
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
): VegasSetResult[] => {
  const { playerAId: A, playerBId: B, playerCId: C, playerDId: D } = config;
  if (!A || !B || !C || !D) return [];

  const sets = config.variant === 'fixed'
    ? [{ setNumber: null as null, start: 1, end: 18, t1: [A,B] as [string,string], t2: [C,D] as [string,string] }]
    : [
        { setNumber: 1 as const, start: 1,  end: 6,  t1: [A,B] as [string,string], t2: [C,D] as [string,string] },
        { setNumber: 2 as const, start: 7,  end: 12, t1: [A,C] as [string,string], t2: [B,D] as [string,string] },
        { setNumber: 3 as const, start: 13, end: 18, t1: [A,D] as [string,string], t2: [B,C] as [string,string] },
      ];

  return sets.map(s => {
    const holes = Array.from({ length: s.end - s.start + 1 }, (_, i) => s.start + i);
    const details = holes.map(h => resolveVegasHole(s.t1, s.t2, h, s.setNumber, players, scores, course, config, teamHandicaps));
    const totalDiff = details.reduce((acc, d) => acc + d.diff, 0);
    const totalAmount = (() => {
      if (!config.useSegmentAmounts || config.variant !== 'fixed') {
        return Math.abs(totalDiff) * getVegasSegmentAmount(config, s.start);
      }
      const frontDiff = details.filter(d => d.holeNumber <= 9).reduce((a, d) => a + d.diff, 0);
      const backDiff = details.filter(d => d.holeNumber > 9).reduce((a, d) => a + d.diff, 0);
      return Math.abs(frontDiff) * getVegasSegmentAmount(config, 1)
           + Math.abs(backDiff) * getVegasSegmentAmount(config, 10);
    })();
    const winner: 'team1'|'team2'|'tied' = totalDiff > 0 ? 'team1' : totalDiff < 0 ? 'team2' : 'tied';
    return { setNumber: s.setNumber, startHole: s.start, endHole: s.end, team1: s.t1, team2: s.t2, holeDetails: details, totalDiff, totalAmount, winner };
  });
};

export const calculateVegasBets = (
  players: Player[], scores: Map<string,PlayerScore[]>,
  config: VegasConfig, course: GolfCourse,
  teamHandicaps?: Record<string, number>,
): BetSummary[] => {
  const summaries: BetSummary[] = [];
  buildVegasSetResults(players, scores, config, course, teamHandicaps).forEach(sr => {
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
