import { Player, PlayerScore, GolfCourse, SixesConfig, SixesHoleDetail, SixesSetResult } from '@/types/golf';
import { BetSummary } from './shared';
import { calculateStrokesPerHole, calculateStrokesPerHoleWithHalf } from '../handicapUtils';

const SET_RANGES: Record<1|2|3, [number, number]> = { 1:[1,6], 2:[7,12], 3:[13,18] };

const getSixesSetAmount = (config: SixesConfig, setNumber: 1 | 2 | 3): number => {
  if (!config.usePerSetAmounts) return config.amount;
  if (setNumber === 1) return config.set1Amount ?? config.amount;
  if (setNumber === 2) return config.set2Amount ?? config.amount;
  return config.set3Amount ?? config.amount;
};

const getScore = (
  playerId: string, holeNumber: number, players: Player[],
  scores: Map<string, PlayerScore[]>, course: GolfCourse, useHandicap: boolean,
  teamHandicaps?: Record<string, number>,
): number | null => {
  const player = players.find(p => p.id === playerId);
  if (!player) return null;
  const hs = (scores.get(playerId) ?? []).find(s => s.confirmed && s.holeNumber === holeNumber);
  if (!hs?.strokes) return null;
  if (!useHandicap) return hs.strokes;
  const hcp = teamHandicaps?.[playerId] ?? player.handicap;
  const sp = calculateStrokesPerHole(Math.floor(hcp), course);
  let strokesReceived = sp[holeNumber - 1] ?? 0;
  return hs.strokes - strokesReceived;
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

const resolveHole = (
  t1: [string,string], t2: [string,string], holeNumber: number,
  players: Player[], scores: Map<string,PlayerScore[]>,
  course: GolfCourse, mode: SixesConfig['scoringMode'], useHandicap: boolean,
  teamHandicaps?: Record<string, number>,
  halfStrokeHole?: number | null,
  halfReceivingTeam?: 'team1' | 'team2' | null,
): SixesHoleDetail => {
  const t1v = t1.map(id => getScore(id, holeNumber, players, scores, course, useHandicap, teamHandicaps)).filter((s): s is number => s !== null);
  const t2v = t2.map(id => getScore(id, holeNumber, players, scores, course, useHandicap, teamHandicaps)).filter((s): s is number => s !== null);

  const scoresByPlayer = [...t1, ...t2].map(id => {
    const player = players.find(p => p.id === id)!;
    const hs = (scores.get(id) ?? []).find(s => s.holeNumber === holeNumber);
    const gross = hs?.strokes ?? 0;
    const hcp = teamHandicaps?.[id] ?? player.handicap;
    const sp = calculateStrokesPerHole(Math.floor(hcp), course);
    const strokes = useHandicap ? (sp[holeNumber - 1] ?? 0) : 0;
    return { playerId: id, playerName: player.name, gross, strokes, net: gross - strokes, teamSide: (t1.includes(id) ? 'team1' : 'team2') as 'team1' | 'team2' };
  });

  const noData: SixesHoleDetail = { holeNumber, scoresByPlayer, team1Score: null, team2Score: null, lowBallWinner: null, highBallWinner: null, pointsTeam1: 0, pointsTeam2: 0, holeWinner: null };
  if (!t1v.length || !t2v.length) return noData;

  const isHalfHole = halfStrokeHole === holeNumber && halfReceivingTeam != null;
  const tieWinner = (tied: boolean): 'team1' | 'team2' | 'tied' => {
    if (!tied) return 'tied';
    if (isHalfHole) return halfReceivingTeam!;
    return 'tied';
  };

  // Patch scoresByPlayer to show .5 visual ONLY when a tie was broken by half-point
  const patchHalfPointVisual = () => {
    if (!isHalfHole) return;
    const entry = scoresByPlayer.find(s => {
      const hcp = teamHandicaps?.[s.playerId] ?? players.find(p => p.id === s.playerId)?.handicap ?? 0;
      return typeof hcp === 'number' && hcp % 1 !== 0 && s.strokes === 0;
    });
    if (entry) { entry.strokes = 0.5; entry.net = entry.gross - 0.5; }
  };

  if (mode === 'lowBall') {
    const s1 = Math.min(...t1v), s2 = Math.min(...t2v);
    const w = s1 < s2 ? 'team1' : s2 < s1 ? 'team2' : tieWinner(s1 === s2);
    if (s1 === s2 && w !== 'tied') patchHalfPointVisual();
    return { holeNumber, scoresByPlayer, team1Score: s1, team2Score: s2, lowBallWinner: w, highBallWinner: null, pointsTeam1: w === 'team1' ? 1 : 0, pointsTeam2: w === 'team2' ? 1 : 0, holeWinner: w };
  }
  if (mode === 'stroke') {
    const s1 = t1v.reduce((a,b) => a+b, 0), s2 = t2v.reduce((a,b) => a+b, 0);
    const w = s1 < s2 ? 'team1' : s2 < s1 ? 'team2' : tieWinner(s1 === s2);
    if (s1 === s2 && w !== 'tied') patchHalfPointVisual();
    return { holeNumber, scoresByPlayer, team1Score: s1, team2Score: s2, lowBallWinner: null, highBallWinner: null, pointsTeam1: w === 'team1' ? 1 : 0, pointsTeam2: w === 'team2' ? 1 : 0, holeWinner: w };
  }
  // lowHighBall
  const low1 = Math.min(...t1v), low2 = Math.min(...t2v);
  const high1 = Math.max(...t1v), high2 = Math.max(...t2v);
  const lbw = low1 < low2 ? 'team1' : low2 < low1 ? 'team2' : tieWinner(low1 === low2);
  const hbw = high1 < high2 ? 'team1' : high2 < high1 ? 'team2' : tieWinner(high1 === high2);
  const p1 = (lbw==='team1'?1:0)+(hbw==='team1'?1:0);
  const p2 = (lbw==='team2'?1:0)+(hbw==='team2'?1:0);
  const hw = p1 > p2 ? 'team1' : p2 > p1 ? 'team2' : 'tied';
  if ((low1 === low2 && lbw !== 'tied') || (high1 === high2 && hbw !== 'tied')) patchHalfPointVisual();
  return { holeNumber, scoresByPlayer, team1Score: low1, team2Score: low2, lowBallWinner: lbw, highBallWinner: hbw, pointsTeam1: p1, pointsTeam2: p2, holeWinner: hw };
};

export const buildSixesSetResults = (
  players: Player[], scores: Map<string,PlayerScore[]>,
  config: SixesConfig, course: GolfCourse,
  teamHandicaps?: Record<string, number>,
): SixesSetResult[] => {
  if (!config?.sets?.length) return [];
  const isHalfPointMode = config.handicapConfig?.slidingHalfPointMode === 'halfPoint';
  const effectiveTH = teamHandicaps ?? config.teamHandicaps;

  return ([1,2,3] as const).map(setNum => {
    const assignment = config.sets.find(s => s.setNumber === setNum);
    if (!assignment) return null;
    const [start, end] = SET_RANGES[setNum];
    const holes = Array.from({ length: end - start + 1 }, (_, i) => start + i);

    const { halfStrokeHole, halfReceivingTeam } = detectHalfPoint(
      assignment.team1, assignment.team2, effectiveTH, isHalfPointMode, course
    );

    const details = holes.map(h => resolveHole(
      assignment.team1, assignment.team2, h, players, scores, course,
      config.scoringMode, config.useHandicap, effectiveTH,
      halfStrokeHole, halfReceivingTeam,
    ));
    const p1 = details.reduce((a, d) => a + d.pointsTeam1, 0);
    const p2 = details.reduce((a, d) => a + d.pointsTeam2, 0);
    const winner = p1 > p2 ? 'team1' : p2 > p1 ? 'team2' : 'tied';
    const effectiveAmt = getSixesSetAmount(config, setNum);
    const baseAmt = config.cobro === 'per_set' ? effectiveAmt : Math.abs(p1 - p2) * effectiveAmt;
    const amt1 = winner === 'team1' ? baseAmt : winner === 'team2' ? -baseAmt : 0;
    const amt2 = -amt1;
    return { setNumber: setNum, startHole: start, endHole: end, team1: assignment.team1, team2: assignment.team2, holeDetails: details, pointsTeam1: p1, pointsTeam2: p2, setWinner: winner, amountTeam1: amt1, amountTeam2: amt2 } as SixesSetResult;
  }).filter((r): r is SixesSetResult => r !== null);
};

export const calculateSixesBets = (
  players: Player[], scores: Map<string,PlayerScore[]>,
  config: SixesConfig, course: GolfCourse,
  teamHandicaps?: Record<string, number>,
): BetSummary[] => {
  if (!config?.sets?.length) return [];
  const summaries: BetSummary[] = [];
  buildSixesSetResults(players, scores, config, course, teamHandicaps).forEach(sr => {
    if (config.cobro === 'per_set') {
      if (!sr.setWinner || sr.setWinner === 'tied') return;
      const winners = [...(sr.setWinner === 'team1' ? sr.team1 : sr.team2)];
      const losers  = [...(sr.setWinner === 'team1' ? sr.team2 : sr.team1)];
      const half = getSixesSetAmount(config, sr.setNumber) / 2;
      losers.forEach(lId => winners.forEach(wId => {
        summaries.push({ playerId: wId, vsPlayer: lId, betType: 'Sixes', amount: half, segment: 'total', description: `Set ${sr.setNumber}` });
        summaries.push({ playerId: lId, vsPlayer: wId, betType: 'Sixes', amount: -half, segment: 'total', description: `Set ${sr.setNumber}` });
      }));
    } else {
      sr.holeDetails.forEach(hd => {
        if (hd.pointsTeam1 === hd.pointsTeam2) return;
        const winners = [...(hd.pointsTeam1 > hd.pointsTeam2 ? sr.team1 : sr.team2)];
        const losers  = [...(hd.pointsTeam1 > hd.pointsTeam2 ? sr.team2 : sr.team1)];
        const half = (getSixesSetAmount(config, sr.setNumber) * Math.abs(hd.pointsTeam1 - hd.pointsTeam2)) / 2;
        losers.forEach(lId => winners.forEach(wId => {
          summaries.push({ playerId: wId, vsPlayer: lId, betType: 'Sixes', amount: half, segment: 'hole', holeNumber: hd.holeNumber, description: `Sixes H${hd.holeNumber} Set${sr.setNumber}` });
          summaries.push({ playerId: lId, vsPlayer: wId, betType: 'Sixes', amount: -half, segment: 'hole', holeNumber: hd.holeNumber, description: `Sixes H${hd.holeNumber} Set${sr.setNumber}` });
        }));
      });
    }
  });
  return summaries;
};
