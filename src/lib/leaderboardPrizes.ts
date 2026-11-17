/**
 * Leaderboard prizes engine (individual Day / Multi-day leaderboards).
 * Pure functions only — no React, no Supabase. All money is handled in
 * integer cents internally so splits are exact and never negative.
 */
import type {
  PayoutResult,
  PayoutRow,
  PlayerPayout,
  PlayerPayoutItem,
  PoolPayout,
  PrizeCandidate,
  PrizeCategory,
  PrizeConfig,
  PrizeMode,
  PrizePool,
  PrizeTier,
  SpecialAward,
} from '@/types/leaderboard';

export const DEFAULT_PRIZE_CONFIG: PrizeConfig = {
  totalPool: null,
  categories: [],
  assignments: {},
  pools: [],
  manualExclusions: [],
};

/** Non-negative amount → integer cents. */
const toCents = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
};
const fromCents = (c: number): number => Math.round(c) / 100;
const cmpId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Normalizes a raw jsonb value into a well-formed PrizeConfig. */
export function normalizePrizeConfig(raw: unknown): PrizeConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<PrizeConfig>;
  return {
    totalPool: r.totalPool ?? null,
    categories: Array.isArray(r.categories) ? r.categories : [],
    assignments: r.assignments && typeof r.assignments === 'object' ? r.assignments : {},
    pools: Array.isArray(r.pools)
      ? r.pools.map(p => ({
          ...p,
          categoryId: p.categoryId ?? null,
          tiers: Array.isArray(p.tiers) ? p.tiers : [],
          excludeWinnersOf: Array.isArray(p.excludeWinnersOf) ? p.excludeWinnersOf : [],
        }))
      : [],
    manualExclusions: Array.isArray(r.manualExclusions) ? r.manualExclusions : [],
  };
}

export function normalizeSpecialAwards(raw: unknown): SpecialAward[] {
  return Array.isArray(raw) ? (raw as SpecialAward[]) : [];
}

const metricFor = (c: PrizeCandidate, mode: PrizeMode): number => Number(c.metrics?.[mode]);

function computePool(
  pool: PrizePool,
  config: PrizeConfig,
  candidates: PrizeCandidate[],
  winnersByPool: Map<string, Set<string>>,
  poolIndex: Map<string, number>,
  currentIndex: number,
): PoolPayout {
  // Tier cents by place (repeated places add up; invalid places ignored).
  const tierCents = new Map<number, number>();
  let totalTierCents = 0;
  for (const t of pool.tiers || []) {
    const place = Number(t.place);
    if (!Number.isInteger(place) || place < 1) continue;
    const c = toCents(t.amount);
    tierCents.set(place, (tierCents.get(place) ?? 0) + c);
    totalTierCents += c;
  }
  const maxPlace = tierCents.size ? Math.max(...tierCents.keys()) : 0;

  // (a) completed + category
  let eligible = candidates.filter(c => c.completed && Number.isFinite(metricFor(c, pool.mode)));
  if (pool.categoryId != null) {
    eligible = eligible.filter(c => config.assignments?.[c.participantId] === pool.categoryId);
  }
  // (b) manual exclusions
  const manual = new Set(
    (config.manualExclusions || []).filter(e => e.poolId === pool.id).map(e => e.participantId),
  );
  eligible = eligible.filter(c => !manual.has(c.participantId));
  // (c) winners of EARLIER listed pools
  const blocked = new Set<string>();
  for (const prevId of pool.excludeWinnersOf || []) {
    const idx = poolIndex.get(prevId);
    if (idx === undefined || idx >= currentIndex) continue;
    for (const pid of winnersByPool.get(prevId) ?? []) blocked.add(pid);
  }
  eligible = eligible.filter(c => !blocked.has(c.participantId));

  // (d) sort by metric, stable by participantId
  const dir = pool.mode === 'stableford' ? -1 : 1;
  eligible.sort((a, b) => {
    const d = (metricFor(a, pool.mode) - metricFor(b, pool.mode)) * dir;
    return d !== 0 ? d : cmpId(a.participantId, b.participantId);
  });

  // (e)(f)(g) tie groups and payouts
  const rows: PayoutRow[] = [];
  let allocatedCents = 0;
  let i = 0;
  while (i < eligible.length) {
    const p = i + 1;
    if (p > maxPlace) break;
    const value = metricFor(eligible[i], pool.mode);
    let j = i;
    while (j < eligible.length && metricFor(eligible[j], pool.mode) === value) j++;
    const group = eligible.slice(i, j).sort((a, b) => cmpId(a.participantId, b.participantId));
    const k = group.length;
    let sumCents = 0;
    for (let place = p; place <= p + k - 1; place++) sumCents += tierCents.get(place) ?? 0;
    const base = Math.floor(sumCents / k);
    const extra = sumCents - base * k;
    group.forEach((c, gi) => {
      const cents = base + (gi === 0 ? extra : 0);
      allocatedCents += cents;
      rows.push({ participantId: c.participantId, rank: p, tied: k > 1, tiedCount: k, amount: fromCents(cents) });
    });
    i = j;
  }

  return {
    poolId: pool.id,
    rows,
    allocated: fromCents(allocatedCents),
    unallocated: fromCents(Math.max(0, totalTierCents - allocatedCents)),
  };
}

export function computePrizePayouts(params: {
  config: PrizeConfig;
  awards: SpecialAward[];
  candidates: PrizeCandidate[];
}): PayoutResult {
  const config = normalizePrizeConfig(params.config);
  const awards = normalizeSpecialAwards(params.awards);
  const candidates = params.candidates || [];

  const poolIndex = new Map<string, number>();
  config.pools.forEach((p, idx) => { if (!poolIndex.has(p.id)) poolIndex.set(p.id, idx); });

  const winnersByPool = new Map<string, Set<string>>();
  const perPlayer = new Map<string, { cents: number; items: PlayerPayoutItem[] }>();
  const credit = (pid: string, cents: number, item: PlayerPayoutItem) => {
    if (cents <= 0) return;
    const e = perPlayer.get(pid) ?? { cents: 0, items: [] };
    e.cents += cents;
    e.items.push(item);
    perPlayer.set(pid, e);
  };

  const pools: PoolPayout[] = [];
  let allocatedCents = 0;
  let unallocatedCents = 0;
  config.pools.forEach((pool, idx) => {
    const res = computePool(pool, config, candidates, winnersByPool, poolIndex, idx);
    pools.push(res);
    allocatedCents += toCents(res.allocated);
    unallocatedCents += toCents(res.unallocated);
    const winners = new Set<string>();
    for (const r of res.rows) {
      if (r.amount > 0) {
        winners.add(r.participantId);
        credit(r.participantId, toCents(r.amount), {
          kind: 'pool', refId: pool.id, label: pool.label, place: r.rank, tied: r.tied, amount: r.amount,
        });
      }
    }
    winnersByPool.set(pool.id, winners);
  });

  let pendingCents = 0;
  const awardsOut = awards.map(a => {
    const cents = toCents(a.amount);
    if (a.winnerParticipantId) {
      allocatedCents += cents;
      credit(a.winnerParticipantId, cents, { kind: 'award', refId: a.id, label: a.label, amount: fromCents(cents) });
    } else {
      pendingCents += cents;
    }
    return { awardId: a.id, participantId: a.winnerParticipantId ?? null, amount: fromCents(cents) };
  });

  const byParticipant: PlayerPayout[] = Array.from(perPlayer.entries())
    .filter(([, e]) => e.cents > 0)
    .map(([participantId, e]) => ({ participantId, total: fromCents(e.cents), items: e.items }))
    .sort((a, b) => (b.total - a.total) || cmpId(a.participantId, b.participantId));

  return {
    pools,
    awards: awardsOut,
    byParticipant,
    totalAllocated: fromCents(allocatedCents),
    totalUnallocated: fromCents(unallocatedCents),
    totalPendingAwards: fromCents(pendingCents),
  };
}

/** Returns human-readable (Spanish) validation errors; empty array when valid. */
export function validatePrizeConfig(config: PrizeConfig, awards: SpecialAward[]): string[] {
  const cfg = normalizePrizeConfig(config);
  const list = normalizeSpecialAwards(awards);
  const errors: string[] = [];
  const categoryIds = new Set(cfg.categories.map(c => c.id));
  const poolPos = new Map<string, number>();
  cfg.pools.forEach((p, idx) => { if (!poolPos.has(p.id)) poolPos.set(p.id, idx); });

  if (cfg.totalPool != null && Number(cfg.totalPool) < 0) {
    errors.push('La bolsa total no puede ser negativa.');
  }

  let tiersCents = 0;
  cfg.pools.forEach((pool, idx) => {
    const name = pool.label || `Bolsa ${idx + 1}`;
    const seen = new Set<number>();
    const dup = new Set<number>();
    for (const t of pool.tiers) {
      const place = Number(t.place);
      if (!Number.isInteger(place) || place < 1) {
        errors.push(`La bolsa "${name}" tiene un lugar inválido (${t.place}).`);
      } else if (seen.has(place)) {
        dup.add(place);
      } else {
        seen.add(place);
      }
      if (Number(t.amount) < 0) {
        errors.push(`La bolsa "${name}" tiene un monto negativo en el lugar ${t.place}.`);
      }
      tiersCents += toCents(t.amount);
    }
    for (const place of dup) errors.push(`La bolsa "${name}" tiene el lugar ${place} repetido.`);

    for (const ref of pool.excludeWinnersOf) {
      const refIdx = poolPos.get(ref);
      if (refIdx === undefined) {
        errors.push(`La bolsa "${name}" excluye ganadores de una bolsa que no existe.`);
      } else if (refIdx >= idx) {
        errors.push(`La bolsa "${name}" solo puede excluir ganadores de bolsas anteriores.`);
      }
    }
    if (pool.categoryId != null && !categoryIds.has(pool.categoryId)) {
      errors.push(`La bolsa "${name}" usa una categoría que no existe.`);
    }
  });

  const badAssignments = Object.values(cfg.assignments).filter(cid => !categoryIds.has(cid)).length;
  if (badAssignments > 0) {
    errors.push(
      badAssignments === 1
        ? 'Hay un jugador asignado a una categoría que no existe.'
        : `Hay ${badAssignments} jugadores asignados a categorías que no existen.`,
    );
  }

  let awardsCents = 0;
  for (const a of list) {
    if (Number(a.amount) < 0) errors.push(`El premio especial "${a.label || a.id}" tiene un monto negativo.`);
    if (a.categoryId != null && !categoryIds.has(a.categoryId)) {
      errors.push(`El premio especial "${a.label || a.id}" usa una categoría que no existe.`);
    }
    awardsCents += toCents(a.amount);
  }

  if (cfg.totalPool != null && Number.isFinite(Number(cfg.totalPool))) {
    const totalCents = Math.round(Number(cfg.totalPool) * 100);
    if (tiersCents + awardsCents > totalCents) {
      errors.push(
        `La suma de premios ($${fromCents(tiersCents + awardsCents)}) supera la bolsa total ($${fromCents(totalCents)}).`,
      );
    }
  }
  return errors;
}

/**
 * Converts percentages (e.g. [50, 30, 20]) into whole-peso tiers for places
 * 1..n. The last place absorbs rounding so the sum equals the total exactly.
 */
export function presetTiers(totalForPool: number, percentages: number[]): PrizeTier[] {
  const total = Number(totalForPool);
  if (!Number.isFinite(total) || total <= 0 || !percentages.length) return [];
  const tiers: PrizeTier[] = [];
  let used = 0;
  percentages.forEach((pct, i) => {
    if (i === percentages.length - 1) {
      tiers.push({ place: i + 1, amount: Math.max(0, Math.round((total - used) * 100) / 100) });
    } else {
      const amount = Math.max(0, Math.round((total * Number(pct || 0)) / 100));
      used += amount;
      tiers.push({ place: i + 1, amount });
    }
  });
  return tiers;
}

/**
 * Assigns each participant to the first category whose inclusive
 * [hcpMin, hcpMax] range (null = unbounded) contains their handicap.
 */
export function autoAssignCategoriesByHandicap(
  participants: { id: string; handicap: number }[],
  categories: PrizeCategory[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of participants) {
    const h = Number(p.handicap);
    if (!Number.isFinite(h)) continue;
    const cat = categories.find(c =>
      (c.hcpMin == null || h >= Number(c.hcpMin)) && (c.hcpMax == null || h <= Number(c.hcpMax)),
    );
    if (cat) out[p.id] = cat.id;
  }
  return out;
}
