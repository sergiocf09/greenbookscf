import { Player, PlayerScore, GolfCourse, WolfConfig, WolfHoleState, WolfHoleDetail } from '@/types/golf';
import { BetSummary } from './shared';
import { calculateStrokesPerHole } from '../handicapUtils';

// Rotación: jugador en posición (holeNumber-1) % players.length es el Wolf
export const getWolfPlayerId = (
  holeNumber: number, players: Player[], playerOrder?: string[]
): string => {
  if (playerOrder && playerOrder.length > 0) {
    return playerOrder[(holeNumber - 1) % playerOrder.length];
  }
  return players[(holeNumber - 1) % players.length].id;
};

// Build a handicap overrides map from config
const buildHandicapOverrides = (
  config: WolfConfig
): Map<string, number> | undefined => {
  if (!config.playerHandicaps || config.playerHandicaps.length === 0) return undefined;
  const map = new Map<string, number>();
  for (const ph of config.playerHandicaps) {
    map.set(ph.playerId, ph.handicap);
  }
  return map;
};

// Score efectivo de un jugador en un hoyo (gross o neto)
const getPlayerScore = (
  playerId: string, holeNumber: number, players: Player[],
  scores: Map<string, PlayerScore[]>, course: GolfCourse, useHandicap: boolean,
  handicapOverrides?: Map<string, number>
): number | null => {
  const player = players.find(p => p.id === playerId);
  if (!player) return null;
  const hs = (scores.get(playerId) ?? []).find(s => s.confirmed && s.holeNumber === holeNumber);
  if (!hs?.strokes) return null;
  if (!useHandicap) return hs.strokes;
  const effectiveHandicap = handicapOverrides?.get(playerId) ?? player.handicap;
  const sp = calculateStrokesPerHole(effectiveHandicap, course);
  return hs.strokes - (sp[holeNumber - 1] ?? 0);
};

// Get participant players from config
const getParticipantPlayers = (players: Player[], config: WolfConfig): Player[] => {
  if (config.participantIds && config.participantIds.length > 0) {
    const ids = new Set(config.participantIds);
    return players.filter(p => ids.has(p.id));
  }
  return players;
};

// Resolución del hoyo según modo de scoring
export const resolveWolfHole = (
  wolfTeam: string[], rivalTeam: string[], holeNumber: number,
  players: Player[], scores: Map<string, PlayerScore[]>,
  course: GolfCourse, config: WolfConfig
): {
  winner: 'wolf' | 'rival' | 'tied';
  pointsWolf: number; pointsRival: number;
  teamWolfScore: number | null; teamRivalScore: number | null;
  lowBallWinner: 'wolf' | 'rival' | 'tied' | null;
  highBallWinner: 'wolf' | 'rival' | 'tied' | null;
} => {
  const overrides = buildHandicapOverrides(config);
  const ws = wolfTeam.map(id => getPlayerScore(id, holeNumber, players, scores, course, config.useHandicap, overrides)).filter((s): s is number => s !== null);
  const rs = rivalTeam.map(id => getPlayerScore(id, holeNumber, players, scores, course, config.useHandicap, overrides)).filter((s): s is number => s !== null);
  const empty = { winner: 'tied' as const, pointsWolf: 0, pointsRival: 0, teamWolfScore: null, teamRivalScore: null, lowBallWinner: null, highBallWinner: null };
  if (!ws.length || !rs.length) return empty;

  if (config.scoringMode === 'lowBall') {
    const w = Math.min(...ws), r = Math.min(...rs);
    const winner = w < r ? 'wolf' : r < w ? 'rival' : 'tied';
    return { winner, pointsWolf: 0, pointsRival: 0, teamWolfScore: w, teamRivalScore: r, lowBallWinner: winner, highBallWinner: null };
  }
  if (config.scoringMode === 'stroke') {
    const w = ws.reduce((a, b) => a + b, 0), r = rs.reduce((a, b) => a + b, 0);
    const winner = w < r ? 'wolf' : r < w ? 'rival' : 'tied';
    return { winner, pointsWolf: 0, pointsRival: 0, teamWolfScore: w, teamRivalScore: r, lowBallWinner: null, highBallWinner: null };
  }
  // lowHighBall: 2 puntos en juego
  const lowW = Math.min(...ws), lowR = Math.min(...rs);
  const highW = Math.max(...ws), highR = Math.max(...rs);
  const lbw = lowW < lowR ? 'wolf' : lowR < lowW ? 'rival' : 'tied';
  const hbw = highW < highR ? 'wolf' : highR < highW ? 'rival' : 'tied';
  const pW = (lbw === 'wolf' ? 1 : 0) + (hbw === 'wolf' ? 1 : 0);
  const pR = (lbw === 'rival' ? 1 : 0) + (hbw === 'rival' ? 1 : 0);
  const winner = pW > pR ? 'wolf' : pR > pW ? 'rival' : 'tied';
  return { winner, pointsWolf: pW, pointsRival: pR, teamWolfScore: lowW, teamRivalScore: lowR, lowBallWinner: lbw, highBallWinner: hbw };
};

// Carryover en BB+BA: SOLO si 0-0 (ambas bolas empatadas)
export const isWolfCarryoverHole = (
  resolved: ReturnType<typeof resolveWolfHole>, config: WolfConfig
): boolean => {
  if (!config.carryover) return false;
  if (config.scoringMode === 'lowHighBall')
    return resolved.winner === 'tied' && resolved.pointsWolf === 0 && resolved.pointsRival === 0;
  return resolved.winner === 'tied';
};

// Monto efectivo = base × (1 + carryoverHoles) × (2 si Lone Wolf)
export const computeEffectiveAmount = (
  config: WolfConfig, carryoverHoles: number, wentSolo: boolean
): number => {
  const redemptionMultiplier = (wentSolo && carryoverHoles === -1) ? 3 : 1; // -1 sentinel = redemption
  return config.amountPerHole * (1 + Math.max(carryoverHoles, 0)) * (wentSolo ? 2 : 1) * (redemptionMultiplier > 1 ? 1.5 : 1);
};

// Effective amount for redemption hole (×3, solo)
export const computeRedemptionAmount = (
  config: WolfConfig
): number => config.amountPerHole * 3;

// Motor principal: genera BetSummary[] desde holeStates resueltos
export const calculateWolfBets = (
  players: Player[], config: WolfConfig, holeStates: WolfHoleState[]
): BetSummary[] => {
  if (!config || players.length < 4) return [];
  const participantPlayers = getParticipantPlayers(players, config);
  const participantIdSet = new Set(participantPlayers.map(p => p.id));
  const summaries: BetSummary[] = [];
  holeStates
    .filter(s => s.result && s.result !== 'tied')
    .sort((a, b) => a.holeNumber - b.holeNumber)
    .forEach(state => {
      const amount = state.effectiveAmount ?? config.amountPerHole;
      const wolfTeam = [state.wolfPlayerId, ...state.partnerIds];
      const rivalTeam = participantPlayers.filter(p => !wolfTeam.includes(p.id)).map(p => p.id);
      const winners = state.result === 'won' ? wolfTeam : rivalTeam;
      const losers  = state.result === 'won' ? rivalTeam : wolfTeam;
      // Filter to only include participants
      const validWinners = winners.filter(id => participantIdSet.has(id));
      const validLosers = losers.filter(id => participantIdSet.has(id));
      validWinners.forEach(wId => validLosers.forEach(lId => {
        const desc = state.wentSolo ? `Loba Sola ×2 · H${state.holeNumber}` : `La Loba · H${state.holeNumber}`;
        summaries.push({ playerId: wId, vsPlayer: lId, betType: 'Wolf', amount, segment: 'hole', holeNumber: state.holeNumber, description: desc });
        summaries.push({ playerId: lId, vsPlayer: wId, betType: 'Wolf', amount: -amount, segment: 'hole', holeNumber: state.holeNumber, description: `vs ${desc}` });
      }));
    });
  return summaries;
};

// Construye WolfHoleDetail[] para tooltips del dashboard
export const buildWolfHoleDetails = (
  players: Player[], scores: Map<string, PlayerScore[]>,
  config: WolfConfig, holeStates: WolfHoleState[], course: GolfCourse
): WolfHoleDetail[] => {
  const participantPlayers = getParticipantPlayers(players, config);
  const overrides = buildHandicapOverrides(config);
  return [...holeStates].sort((a, b) => a.holeNumber - b.holeNumber).map(state => {
    const wolfTeam  = [state.wolfPlayerId, ...state.partnerIds];
    const rivalTeam = participantPlayers.filter(p => !wolfTeam.includes(p.id));
    const resolved  = resolveWolfHole(wolfTeam, rivalTeam.map(p => p.id), state.holeNumber, players, scores, course, config);
    const scoresByPlayer = participantPlayers.map(p => {
      const hs = (scores.get(p.id) ?? []).find(s => s.holeNumber === state.holeNumber);
      const gross = hs?.strokes ?? 0;
      const effectiveHandicap = overrides?.get(p.id) ?? p.handicap;
      const sp = calculateStrokesPerHole(effectiveHandicap, course);
      const strokes = config.useHandicap ? (sp[state.holeNumber - 1] ?? 0) : 0;
      return { playerId: p.id, playerName: p.name, gross, strokes, net: gross - strokes, teamSide: wolfTeam.includes(p.id) ? 'wolf' as const : 'rival' as const };
    });
    return {
      holeNumber: state.holeNumber,
      wolfPlayerId: state.wolfPlayerId,
      wolfPlayerName: players.find(p => p.id === state.wolfPlayerId)?.name ?? '?',
      partnerIds: state.partnerIds,
      partnerNames: state.partnerIds.map(id => players.find(p => p.id === id)?.name ?? '?'),
      wentSolo: state.wentSolo,
      result: state.result,
      effectiveAmount: state.effectiveAmount ?? config.amountPerHole,
      carryoverHoles: state.carryoverHoles,
      scoresByPlayer,
      teamWolfScore: resolved.teamWolfScore,
      teamRivalScore: resolved.teamRivalScore,
      lowBallWinner: resolved.lowBallWinner,
      highBallWinner: resolved.highBallWinner,
      pointsWolf: resolved.pointsWolf,
      pointsRival: resolved.pointsRival,
    };
  });
};
