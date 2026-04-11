import { Player, PlayerScore, GolfCourse, NinesConfig, NinesHoleDetail, NinesPlayerSummary } from '@/types/golf';
import { BetSummary } from './shared';
import { calculateStrokesPerHole } from '../handicapUtils';

// Distribución exacta de 9 puntos entre 3 jugadores
export const distributeNinesPoints = (
  netScores: { id: string; net: number }[]
): Map<string, 1|2|3|4|5> => {
  const result = new Map<string, 1|2|3|4|5>();
  if (netScores.length !== 3) return result;
  const sorted = [...netScores].sort((a, b) => a.net - b.net);
  const [first, second, third] = sorted;
  const allTied = first.net === third.net;
  const topTied = first.net === second.net && first.net !== third.net;
  const botTied = second.net === third.net && first.net !== second.net;
  if (allTied)       { netScores.forEach(p => result.set(p.id, 3)); }
  else if (topTied)  { result.set(first.id, 4); result.set(second.id, 4); result.set(third.id, 1); }
  else if (botTied)  { result.set(first.id, 5); result.set(second.id, 2); result.set(third.id, 2); }
  else               { result.set(first.id, 5); result.set(second.id, 3); result.set(third.id, 1); }
  return result;
};

export const buildNinesHoleDetails = (
  players: Player[], scores: Map<string,PlayerScore[]>,
  config: NinesConfig, course: GolfCourse
): NinesHoleDetail[] => {
  if (!config?.playerIds?.length) return [];
  const participants = config.playerIds.map(id => players.find(p => p.id === id)).filter((p): p is Player => !!p);
  if (participants.length !== 3) return [];
  const details: NinesHoleDetail[] = [];

  for (let h = 1; h <= 18; h++) {
    const netScores = participants.map(p => {
      const hcp = config.playerHandicaps?.[p.id] ?? p.handicap;
      const sp = calculateStrokesPerHole(hcp, course);
      const hs = (scores.get(p.id) ?? []).find(s => s.confirmed && s.holeNumber === h);
      if (!hs?.strokes) return null;
      return { id: p.id, net: hs.strokes - (sp[h - 1] ?? 0) };
    }).filter((x): x is { id: string; net: number } => x !== null);

    if (netScores.length !== 3) continue;

    const pointsMap = distributeNinesPoints(netScores);
    const sorted = [...netScores].sort((a, b) => a.net - b.net);

    const playerScores = participants.map(p => {
      const hcp = config.playerHandicaps?.[p.id] ?? p.handicap;
      const sp = calculateStrokesPerHole(hcp, course);
      const hs = (scores.get(p.id) ?? []).find(s => s.holeNumber === h);
      const gross = hs?.strokes ?? 0;
      const strokes = sp[h - 1] ?? 0;
      const net = gross - strokes;
      const pts = (pointsMap.get(p.id) ?? 3) as 1|2|3|4|5;
      const pos = (sorted.findIndex(x => x.id === p.id) + 1) as 1|2|3;
      return { playerId: p.id, playerName: p.name, gross, strokes, net, points: pts, position: pos };
    });
    details.push({ holeNumber: h, playerScores });
  }
  return details;
};

export const calculateNinesPlayerSummaries = (
  players: Player[], holeDetails: NinesHoleDetail[], config: NinesConfig
): NinesPlayerSummary[] =>
  config.playerIds.map(id => {
    const player = players.find(p => p.id === id);
    if (!player) return null;
    const totalPoints = holeDetails.reduce((sum, hd) => sum + (hd.playerScores.find(p => p.playerId === id)?.points ?? 0), 0);
    return { playerId: id, playerName: player.name, playerInitials: player.initials, playerColor: player.color, totalPoints };
  }).filter((s): s is NinesPlayerSummary => s !== null);

export const calculateNinesBets = (
  players: Player[], scores: Map<string,PlayerScore[]>,
  config: NinesConfig, course: GolfCourse
): BetSummary[] => {
  if (!config?.playerIds?.length) return [];
  const details = buildNinesHoleDetails(players, scores, config, course);
  const summaries = calculateNinesPlayerSummaries(players, details, config);
  const betSummaries: BetSummary[] = [];
  for (let i = 0; i < summaries.length; i++) {
    for (let j = i + 1; j < summaries.length; j++) {
      const A = summaries[i], B = summaries[j];
      const diff = A.totalPoints - B.totalPoints;
      if (diff === 0) continue;
      const amount = Math.abs(diff) * config.valuePerPoint;
      const [wId, lId, wPts, lPts] = diff > 0 ? [A.playerId, B.playerId, A.totalPoints, B.totalPoints] : [B.playerId, A.playerId, B.totalPoints, A.totalPoints];
      betSummaries.push({ playerId: wId, vsPlayer: lId, betType: 'Nines', amount, segment: 'total', description: `${wPts} vs ${lPts} pts`, units: Math.abs(diff), baseUnitAmount: config.valuePerPoint });
      betSummaries.push({ playerId: lId, vsPlayer: wId, betType: 'Nines', amount: -amount, segment: 'total', description: `${lPts} vs ${wPts} pts`, units: Math.abs(diff), baseUnitAmount: config.valuePerPoint });
    }
  }
  return betSummaries;
};
