import { Player, PlayerScore, GolfCourse, WolfConfig, WolfHoleState, WolfHoleDetail, WolfSetupConfig } from '@/types/golf';
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

// Obtiene qué IDs de jugadores aportan el score "usado" en la comparación
// según modo y tamaño del equipo. Devuelve Set de IDs que SÍ se usan.
const getUsedPlayerIds = (
  _teamIds: string[],
  teamScores: { id: string; net: number }[],
  mode: WolfConfig['scoringMode'],
  isLoneWolf: boolean,
  side: 'wolf' | 'rival'
): Set<string> => {
  if (teamScores.length === 0) return new Set();
  if (teamScores.length === 1) return new Set([teamScores[0].id]);

  if (isLoneWolf) {
    // Lone Wolf: rival usa solo min (Bola Baja)
    if (side === 'rival') {
      const minScore = Math.min(...teamScores.map(s => s.net));
      const minPlayer = teamScores.find(s => s.net === minScore);
      return new Set(minPlayer ? [minPlayer.id] : []);
    }
    // Wolf solo: usa su propio único score
    return new Set(teamScores.map(s => s.id));
  }

  if (mode === 'lowBall') {
    const minScore = Math.min(...teamScores.map(s => s.net));
    const minPlayer = teamScores.find(s => s.net === minScore);
    return new Set(minPlayer ? [minPlayer.id] : []);
  }

  if (mode === 'lowHighBall') {
    const minScore = Math.min(...teamScores.map(s => s.net));
    const maxScore = Math.max(...teamScores.map(s => s.net));
    const minPlayer = teamScores.find(s => s.net === minScore);
    const maxPlayer = teamScores.find(s => s.net === maxScore);
    const used = new Set<string>();
    if (minPlayer) used.add(minPlayer.id);
    if (maxPlayer) used.add(maxPlayer.id);
    return used;
  }

  if (mode === 'stroke') {
    // Suma de extremos: min + max. Intermedio NO se usa.
    const minScore = Math.min(...teamScores.map(s => s.net));
    const maxScore = Math.max(...teamScores.map(s => s.net));
    const minPlayer = teamScores.find(s => s.net === minScore);
    const maxPlayer = [...teamScores].reverse().find(s => s.net === maxScore);
    const used = new Set<string>();
    if (minPlayer) used.add(minPlayer.id);
    if (maxPlayer) used.add(maxPlayer.id);
    return used;
  }

  return new Set(teamScores.map(s => s.id));
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
  const isLoneWolf = wolfTeam.length === 1 && rivalTeam.length > 1;

  const wsRaw = wolfTeam.map(id => ({
    id,
    net: getPlayerScore(id, holeNumber, players, scores, course, config.useHandicap, overrides) ?? Infinity,
  })).filter(s => s.net !== Infinity);

  const rsRaw = rivalTeam.map(id => ({
    id,
    net: getPlayerScore(id, holeNumber, players, scores, course, config.useHandicap, overrides) ?? Infinity,
  })).filter(s => s.net !== Infinity);

  const empty = {
    winner: 'tied' as const,
    pointsWolf: 0, pointsRival: 0,
    teamWolfScore: null, teamRivalScore: null,
    lowBallWinner: null, highBallWinner: null,
  };
  if (!wsRaw.length || !rsRaw.length) return empty;

  const wNets = wsRaw.map(s => s.net);
  const rNets = rsRaw.map(s => s.net);

  // ── LONE WOLF: siempre Bola Baja del Lobo vs min(rivales) ──
  if (isLoneWolf) {
    const w = wNets[0];
    const r = Math.min(...rNets);
    const winner = w < r ? 'wolf' : r < w ? 'rival' : 'tied';
    return {
      winner, pointsWolf: 0, pointsRival: 0,
      teamWolfScore: w, teamRivalScore: r,
      lowBallWinner: winner, highBallWinner: null,
    };
  }

  // ── CON COMPAÑERO(S) ──
  if (config.scoringMode === 'lowBall') {
    const w = Math.min(...wNets), r = Math.min(...rNets);
    const winner = w < r ? 'wolf' : r < w ? 'rival' : 'tied';
    return {
      winner, pointsWolf: 0, pointsRival: 0,
      teamWolfScore: w, teamRivalScore: r,
      lowBallWinner: winner, highBallWinner: null,
    };
  }

  if (config.scoringMode === 'lowHighBall') {
    const lowW = Math.min(...wNets), lowR = Math.min(...rNets);
    const highW = Math.max(...wNets), highR = Math.max(...rNets);
    const lbw = lowW < lowR ? 'wolf' : lowR < lowW ? 'rival' : 'tied';
    const hbw = highW < highR ? 'wolf' : highR < highW ? 'rival' : 'tied';
    const pW = (lbw === 'wolf' ? 1 : 0) + (hbw === 'wolf' ? 1 : 0);
    const pR = (lbw === 'rival' ? 1 : 0) + (hbw === 'rival' ? 1 : 0);
    const winner = pW > pR ? 'wolf' : pR > pW ? 'rival' : 'tied';
    return {
      winner, pointsWolf: pW, pointsRival: pR,
      teamWolfScore: lowW, teamRivalScore: lowR,
      lowBallWinner: lbw, highBallWinner: hbw,
    };
  }

  // stroke: suma de extremos (min + max), ignorando intermedios
  const wScore = Math.min(...wNets) + Math.max(...wNets);
  const rScore = Math.min(...rNets) + Math.max(...rNets);
  const winner = wScore < rScore ? 'wolf' : rScore < wScore ? 'rival' : 'tied';
  return {
    winner, pointsWolf: 0, pointsRival: 0,
    teamWolfScore: wScore, teamRivalScore: rScore,
    lowBallWinner: null, highBallWinner: null,
  };
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

/** Wolf-only adapter for saved setup JSON created before holeValue. */
export const normalizeWolfSetup = (setup: WolfSetupConfig | (Omit<WolfSetupConfig, 'holeValue'> & { holeValue?: number; amountPerHole?: number })): WolfSetupConfig => {
  const { amountPerHole, ...rest } = setup as WolfSetupConfig & { amountPerHole?: number };
  return { ...rest, holeValue: rest.holeValue ?? amountPerHole ?? 10 };
};

export const computeEffectiveHoleValue = (
  config: WolfConfig, carryoverHoles: number, wentSolo: boolean
): number => {
  const base = config.holeValue * (1 + Math.max(carryoverHoles, 0));
  return wentSolo ? base * 2 : base;
};

export const computeAmountPerPair = (
  config: WolfConfig, carryoverHoles: number, wentSolo: boolean,
  nWinners: number, nLosers: number
): number => {
  const hv = computeEffectiveHoleValue(config, carryoverHoles, wentSolo);
  return nWinners > 0 && nLosers > 0 ? hv / (nWinners * nLosers) : hv;
};

/** H18 all-in transfers twice the loss, with partner OR solo, without carry. */
export const computeWolfStateHoleValue = (config: WolfConfig, state: WolfHoleState): number =>
  state.redemptionMode === 'all_in'
    ? Math.abs(state.allInAmount ?? 0) * (state.holeNumber === 18 || state.wentSolo ? 2 : 1)
    : computeEffectiveHoleValue(config, state.carryoverHoles ?? 0, state.wentSolo);

/** Recompute carry from the LIVE result of previous holes (stored results may be stale). */
const withLiveCarry = (
  players: Player[], config: WolfConfig, holeStates: WolfHoleState[],
  scores?: Map<string, PlayerScore[]>, course?: GolfCourse
): WolfHoleState[] => {
  if (!scores || !course) return holeStates;
  const participantIds = getParticipantPlayers(players, config).map(p => p.id);
  const live = new Map<number, 'won' | 'lost' | 'tied'>();
  for (const s of holeStates) {
    const wolfTeam = [s.wolfPlayerId, ...s.partnerIds];
    const rivals = participantIds.filter(id => !wolfTeam.includes(id));
    const r = resolveWolfHole(wolfTeam, rivals, s.holeNumber, players, scores, course, config);
    live.set(s.holeNumber, r.winner === 'wolf' ? 'won' : r.winner === 'rival' ? 'lost' : 'tied');
  }
  return holeStates.map(s => {
    let carry = 0;
    if (config.carryover && s.redemptionMode !== 'all_in') {
      for (let h = s.holeNumber - 1; h >= 1 && live.get(h) === 'tied'; h--) carry++;
    }
    return carry === (s.carryoverHoles ?? 0) ? s : { ...s, carryoverHoles: carry };
  });
};

// Motor principal: genera BetSummary[] desde holeStates resueltos
export const calculateWolfBets = (
  players: Player[], config: WolfConfig, holeStates: WolfHoleState[],
  scores?: Map<string, PlayerScore[]>, course?: GolfCourse
): BetSummary[] => {
  if (!config || players.length < 4) return [];
  const participantPlayers = getParticipantPlayers(players, config);
  const participantIdSet = new Set(participantPlayers.map(p => p.id));
  const summaries: BetSummary[] = [];
  [...withLiveCarry(players, config, holeStates, scores, course)]
    .sort((a, b) => a.holeNumber - b.holeNumber)
    .forEach(state => {
      const wolfTeam = [state.wolfPlayerId, ...state.partnerIds];
      const rivalTeamIds = participantPlayers.filter(p => !wolfTeam.includes(p.id)).map(p => p.id);

      // Re-resolve with current config if scores/course available
      let result = state.result;
      if (scores && course) {
        const resolved = resolveWolfHole(wolfTeam, rivalTeamIds, state.holeNumber, players, scores, course, config);
        result = resolved.winner === 'wolf' ? 'won' : resolved.winner === 'rival' ? 'lost' : 'tied';
      }

      if (!result || result === 'tied') return;

      const winners = result === 'won' ? wolfTeam : rivalTeamIds;
      const losers  = result === 'won' ? rivalTeamIds : wolfTeam;
      const validWinners = winners.filter(id => participantIdSet.has(id));
      const validLosers = losers.filter(id => participantIdSet.has(id));
      const isAllIn = state.redemptionMode === 'all_in';
      const effectiveHV = computeWolfStateHoleValue(config, state);
      const nW = validWinners.length;
      const nL = validLosers.length;
      const amountPerPair = nW > 0 && nL > 0 ? effectiveHV / (nW * nL) : effectiveHV;
      const desc = state.wentSolo
        ? (isAllIn ? `Loba All-in Solo · H${state.holeNumber}` : `Loba Sola ×2 · H${state.holeNumber}`)
        : (isAllIn ? `Loba All-in · H${state.holeNumber}` : `La Loba · H${state.holeNumber}`);
      const roundAllIn = isAllIn && state.holeNumber === 18 && nW > 0 && nL > 0;
      const totalCents = Math.round(effectiveHV * 100);
      // Split each winner's share first; distribute remaining cents across
      // losers so partnered winners recover X each and the ledger sums to zero.
      validWinners.forEach((wId, wi) => validLosers.forEach((lId, li) => {
        const winnerCents = Math.floor(totalCents / nW) + (wi >= nW - totalCents % nW ? 1 : 0);
        const amount = roundAllIn
          ? (Math.floor(winnerCents / nL) + ((li + wi) % nL >= nL - winnerCents % nL ? 1 : 0)) / 100
          : amountPerPair;
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
  return [...withLiveCarry(players, config, holeStates, scores, course)].sort((a, b) => a.holeNumber - b.holeNumber).map(state => {
    const wolfTeam  = [state.wolfPlayerId, ...state.partnerIds];
    const rivalTeam = participantPlayers.filter(p => !wolfTeam.includes(p.id));
    const isLoneWolf = wolfTeam.length === 1 && rivalTeam.length > 1;
    const resolved  = resolveWolfHole(wolfTeam, rivalTeam.map(p => p.id), state.holeNumber, players, scores, course, config);
    const freshResult: 'won' | 'lost' | 'tied' | null = resolved.winner === 'wolf' ? 'won' : resolved.winner === 'rival' ? 'lost' : 'tied';

    // Calcular scores netos para identificar quién se usó
    const getNet = (pid: string): number => {
      const p = participantPlayers.find(x => x.id === pid);
      if (!p) return 0;
      const hs = (scores.get(pid) ?? []).find(s => s.holeNumber === state.holeNumber);
      const gross = hs?.strokes ?? 0;
      const effectiveHandicap = overrides?.get(pid) ?? p.handicap;
      const sp = calculateStrokesPerHole(effectiveHandicap, course);
      const strokes = config.useHandicap ? (sp[state.holeNumber - 1] ?? 0) : 0;
      return gross - strokes;
    };

    const wolfScoresRaw = wolfTeam.map(id => ({ id, net: getNet(id) }));
    const rivalScoresRaw = rivalTeam.map(p => ({ id: p.id, net: getNet(p.id) }));

    const usedWolf  = getUsedPlayerIds(wolfTeam, wolfScoresRaw, config.scoringMode, isLoneWolf, 'wolf');
    const usedRival = getUsedPlayerIds(rivalTeam.map(p => p.id), rivalScoresRaw, config.scoringMode, isLoneWolf, 'rival');

    const scoresByPlayer = participantPlayers.map(p => {
      const hs = (scores.get(p.id) ?? []).find(s => s.holeNumber === state.holeNumber);
      const gross = hs?.strokes ?? 0;
      const effectiveHandicap = overrides?.get(p.id) ?? p.handicap;
      const sp = calculateStrokesPerHole(effectiveHandicap, course);
      const strokes = config.useHandicap ? (sp[state.holeNumber - 1] ?? 0) : 0;
      const isWolfSide = wolfTeam.includes(p.id);
      return {
        playerId: p.id,
        playerName: p.name,
        gross,
        strokes,
        net: gross - strokes,
        teamSide: isWolfSide ? 'wolf' as const : 'rival' as const,
        usedForScoring: isWolfSide ? usedWolf.has(p.id) : usedRival.has(p.id),
      };
    });

    return {
      holeNumber: state.holeNumber,
      wolfPlayerId: state.wolfPlayerId,
      wolfPlayerName: players.find(p => p.id === state.wolfPlayerId)?.name ?? '?',
      partnerIds: state.partnerIds,
      partnerNames: state.partnerIds.map(id => players.find(p => p.id === id)?.name ?? '?'),
      wentSolo: state.wentSolo,
      result: freshResult,
      effectiveAmount: wolfTeam.length > 0 && rivalTeam.length > 0
        ? computeWolfStateHoleValue(config, state) / (wolfTeam.length * rivalTeam.length)
        : computeWolfStateHoleValue(config, state),
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
