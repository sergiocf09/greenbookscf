import type { MultiDayRulesJson } from '@/types/leaderboard';

export interface DayStanding {
  participantId: string;
  profile_id: string | null;
  grossTotal: number;
  netTotal: number;
  grossVsPar: number;
  netVsPar: number;
  stablefordTotal: number;
  holesPlayed: number;
  position: number;
}

export interface AccumulatedStanding {
  participantId: string;
  profile_id: string | null;
  daysPlayed: number;
  totalGross: number;
  totalNetVsPar: number;
  totalGrossVsPar: number;
  totalStableford: number;
  bestNNetVsPar?: number;
  bestNGross?: number;
  bestNStableford?: number;
  dayNetScores: number[];
  dayGrossScores: number[];
  dayStablefordScores: number[];
  position: number;
}

export function computeAccumulatedStandings(
  standingsByDay: Record<number, DayStanding[]>,
  aggregation: 'sum' | 'best_n',
  bestN?: number,
  sortMode: 'gross' | 'net' | 'stableford' = 'net',
): AccumulatedStanding[] {
  const accMap: Record<string, AccumulatedStanding> = {};

  for (const dayNum of Object.keys(standingsByDay)) {
    for (const s of standingsByDay[Number(dayNum)]) {
      if (s.holesPlayed === 0) continue;
      if (!accMap[s.participantId]) {
        accMap[s.participantId] = {
          participantId: s.participantId,
          profile_id: s.profile_id,
          daysPlayed: 0,
          totalGross: 0,
          totalNetVsPar: 0,
          totalGrossVsPar: 0,
          totalStableford: 0,
          dayNetScores: [],
          dayGrossScores: [],
          dayStablefordScores: [],
          position: 0,
        };
      }
      const e = accMap[s.participantId];
      e.daysPlayed += 1;
      e.totalGross += s.grossTotal;
      e.totalNetVsPar += s.netVsPar;
      e.totalGrossVsPar += s.grossVsPar;
      e.totalStableford += s.stablefordTotal;
      e.dayNetScores.push(s.netVsPar);
      e.dayGrossScores.push(s.grossVsPar);
      e.dayStablefordScores.push(s.stablefordTotal);
    }
  }

  const results = Object.values(accMap).map(e => {
    if (aggregation === 'best_n' && bestN) {
      const ascNet = [...e.dayNetScores].sort((a, b) => a - b).slice(0, bestN);
      const ascGross = [...e.dayGrossScores].sort((a, b) => a - b).slice(0, bestN);
      const descStb = [...e.dayStablefordScores].sort((a, b) => b - a).slice(0, bestN);
      e.bestNNetVsPar = ascNet.reduce((s, v) => s + v, 0);
      e.bestNGross = ascGross.reduce((s, v) => s + v, 0);
      e.bestNStableford = descStb.reduce((s, v) => s + v, 0);
    }
    return e;
  });

  results.sort((a, b) => {
    if (sortMode === 'stableford') {
      const av = aggregation === 'best_n' ? (a.bestNStableford ?? 0) : a.totalStableford;
      const bv = aggregation === 'best_n' ? (b.bestNStableford ?? 0) : b.totalStableford;
      return bv - av;
    }
    if (sortMode === 'gross') {
      const av = aggregation === 'best_n' ? (a.bestNGross ?? 0) : a.totalGrossVsPar;
      const bv = aggregation === 'best_n' ? (b.bestNGross ?? 0) : b.totalGrossVsPar;
      return av - bv;
    }
    const av = aggregation === 'best_n' ? (a.bestNNetVsPar ?? 0) : a.totalNetVsPar;
    const bv = aggregation === 'best_n' ? (b.bestNNetVsPar ?? 0) : b.totalNetVsPar;
    return av - bv;
  });

  return results.map((r, i) => ({ ...r, position: i + 1 }));
}

export function getDayForRoundDate(
  rules: MultiDayRulesJson,
  roundDate: string | null | undefined,
): number | null {
  if (!roundDate) return null;
  const d = rules.days?.find(d => d.date === roundDate);
  return d ? d.day_number : null;
}

/* ── Single-round, per-mode totals (used by the historical round view) ── */

export type ScoringMode = 'gross' | 'net' | 'stableford';

export interface HoleInfo {
  hole_number: number;
  par: number;
  stroke_index: number;
}

export interface RoundModeTotals {
  grossTotal: number;
  netTotal: number;
  grossVsPar: number;
  netVsPar: number;
  stablefordTotal: number;
  holesPlayed: number;
}

/**
 * Totals for one player in one round, applying the competition handicap
 * hole-by-hole via stroke index (same rule used by the live leaderboards).
 */
export function computeRoundModeTotals(
  scores: { hole_number: number; strokes: number | null }[],
  holes: HoleInfo[],
  handicap: number,
  stablefordPoints: LeaderboardStablefordPoints = LEADERBOARD_DEFAULT_STABLEFORD_POINTS,
): RoundModeTotals {
  const totals: RoundModeTotals = {
    grossTotal: 0, netTotal: 0, grossVsPar: 0, netVsPar: 0,
    stablefordTotal: 0, holesPlayed: 0,
  };
  const sortedHoles = [...holes].sort((a, b) => a.stroke_index - b.stroke_index);
  const fullStrokes = Math.floor(handicap / 18);
  const remainder = Math.round(handicap) % 18;

  for (const s of scores) {
    if (!s.strokes) continue;
    const holeInfo = holes.find(h => h.hole_number === s.hole_number);
    const par = holeInfo?.par || 4;
    const idx = sortedHoles.findIndex(h => h.hole_number === s.hole_number);
    const strokesReceived = fullStrokes + (idx >= 0 && idx < remainder ? 1 : 0);
    const netStrokes = s.strokes - strokesReceived;
    const diff = netStrokes - par;
    const stb = stablefordPointsForDiff(diff, stablefordPoints);

    totals.grossTotal += s.strokes;
    totals.netTotal += netStrokes;
    totals.grossVsPar += s.strokes - par;
    totals.netVsPar += diff;
    totals.stablefordTotal += stb;
    totals.holesPlayed += 1;
  }
  return totals;
}

/** Stableford point table configurable per leaderboard (rules_json.stableford_points). */
export interface LeaderboardStablefordPoints {
  albatross: number; eagle: number; birdie: number; par: number;
  bogey: number; doubleBogey: number; tripleBogey: number; quadrupleOrWorse: number;
}

/** Historic leaderboard table (kept as default so existing leaderboards don't change). */
export const LEADERBOARD_DEFAULT_STABLEFORD_POINTS: LeaderboardStablefordPoints = {
  albatross: 5, eagle: 4, birdie: 3, par: 2, bogey: 1, doubleBogey: 0, tripleBogey: 0, quadrupleOrWorse: 0,
};

export function resolveLeaderboardStablefordPoints(rules: unknown): LeaderboardStablefordPoints {
  const raw = (rules && typeof rules === 'object' ? (rules as any).stableford_points : null) || {};
  const out = { ...LEADERBOARD_DEFAULT_STABLEFORD_POINTS };
  for (const k of Object.keys(out) as (keyof LeaderboardStablefordPoints)[]) {
    const v = Number(raw[k]);
    if (raw[k] !== undefined && raw[k] !== null && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** Points for a net score relative to par (diff = net - par). */
export function stablefordPointsForDiff(diff: number, pts: LeaderboardStablefordPoints = LEADERBOARD_DEFAULT_STABLEFORD_POINTS): number {
  if (diff <= -3) return pts.albatross;
  if (diff === -2) return pts.eagle;
  if (diff === -1) return pts.birdie;
  if (diff === 0) return pts.par;
  if (diff === 1) return pts.bogey;
  if (diff === 2) return pts.doubleBogey;
  if (diff === 3) return pts.tripleBogey;
  return pts.quadrupleOrWorse;
}
