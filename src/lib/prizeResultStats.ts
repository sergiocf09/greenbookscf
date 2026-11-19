/**
 * Display-only helpers for the Prizes panel and share image. Pure: no React,
 * no Supabase. They never rank, recompute or change payouts.
 *
 * - Result stats: the handicap and the competition result (gross, net or
 *   Stableford points) each player obtained, shown next to pool winners.
 * - Item summary: a player's prizes condensed to "1º Stableford" and
 *   "Oyes ×2" (award count regardless of place) for the per-player summary.
 */
import type { StandingsEntry } from '@/hooks/useLeaderboards';
import type { AccumulatedStanding } from '@/lib/leaderboardAggregation';
import type { PrizeMode } from '@/types/leaderboard';

export interface PrizeResultStat {
  hcp: number | null;
  /** Pre-formatted result per mode, as the leaderboard shows it. */
  results: Partial<Record<PrizeMode, string>>;
}
export type PrizeResultStats = Record<string, PrizeResultStat>;

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
export const fmtVsPar = (v: number) => (v === 0 ? 'E' : v > 0 ? `+${fmtNum(v)}` : fmtNum(v));

/** Single-day: gross and net strokes, Stableford points, leaderboard HCP. */
export function singleDayResultStats(standings: StandingsEntry[]): PrizeResultStats {
  const out: PrizeResultStats = {};
  for (const e of standings || []) {
    const played = (Number(e.holesPlayed) || 0) > 0;
    out[e.participant.id] = {
      hcp: num(e.participant.handicap_for_leaderboard),
      results: played
        ? { gross: fmtNum(e.grossTotal), net: fmtNum(e.netTotal), stableford: fmtNum(e.stablefordTotal) }
        : {},
    };
  }
  return out;
}

/** Multi-day: same accumulated values the multi-day standings show (vs par, points). */
export function multiDayResultStats(params: {
  participants: { id: string; handicap_for_leaderboard?: number | null }[];
  accumulated: AccumulatedStanding[];
  aggregation: 'sum' | 'best_n';
}): PrizeResultStats {
  const accById = new Map((params.accumulated || []).map(a => [a.participantId, a]));
  const bestN = params.aggregation === 'best_n';
  const out: PrizeResultStats = {};
  for (const p of params.participants || []) {
    const a = accById.get(p.id);
    out[p.id] = {
      hcp: num(p.handicap_for_leaderboard),
      results: a && a.daysPlayed > 0
        ? {
            gross: fmtVsPar(bestN ? a.bestNGross ?? 0 : a.totalGrossVsPar),
            net: fmtVsPar(bestN ? a.bestNNetVsPar ?? 0 : a.totalNetVsPar),
            stableford: fmtNum(bestN ? a.bestNStableford ?? 0 : a.totalStableford),
          }
        : {},
    };
  }
  return out;
}

export interface PrizeSummaryInputItem {
  kind?: 'pool' | 'award';
  label: string;
  place?: number;
  tied?: boolean;
}
export type PrizeSummaryChip =
  | { kind: 'pool'; key: string; label: string; place: number; tied: boolean }
  | { kind: 'award'; key: string; label: string; count: number };

const PLACE_SUFFIX = /\s·\s\d+º$/;
const awardHeading = (label: string) => {
  const clean = (label || '').replace(PLACE_SUFFIX, '').trim();
  const idx = clean.indexOf(' · ');
  return idx > 0 ? clean.slice(0, idx).trim() : clean;
};

/** Pools as "place + label"; special awards counted per section ("Oyes" ×n), any place. */
export function summarizePrizeItems(items: PrizeSummaryInputItem[]): PrizeSummaryChip[] {
  const pools: PrizeSummaryChip[] = [];
  const awards = new Map<string, { kind: 'award'; key: string; label: string; count: number }>();
  (items || []).forEach((it, i) => {
    const isPool = it.kind ? it.kind === 'pool' : it.place != null;
    if (isPool) {
      pools.push({ kind: 'pool', key: `p-${i}`, label: it.label, place: Number(it.place) || 1, tied: !!it.tied });
      return;
    }
    const heading = awardHeading(it.label);
    const g = awards.get(heading);
    if (g) g.count += 1;
    else awards.set(heading, { kind: 'award', key: `a-${heading}`, label: heading, count: 1 });
  });
  return [...pools, ...awards.values()];
}
