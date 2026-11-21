/**
 * Pure builder for the prizes share image data. It never recalculates
 * payouts: it only reshapes a PayoutResult (live) or a FinalPayoutsSnapshot
 * (final) plus display metadata into what the canvas draws.
 */
import { formatPlayerName } from '@/lib/playerInput';
import type { PayoutResult } from '@/types/leaderboard';
import { buildAwardDisplaySections } from '@/lib/prizeAwardDisplay';
import type { PrizeResultStat } from '@/lib/prizeResultStats';
import type { PrizeMode } from '@/types/leaderboard';
import { roundPayoutForDisplay } from '@/lib/prizeDisplayRounding';

export interface PrizesShareItem { kind?: 'pool' | 'award'; label: string; place?: number; tied?: boolean; amount: number }
export interface PrizesSharePlayer {
  participantId: string;
  name: string;
  initials: string;
  color: string;
  total: number;
  items: PrizesShareItem[];
}
export interface PrizesSharePool {
  label: string;
  mode?: PrizeMode;
  categoryName?: string | null;
  /** hcp/result are display-only (handicap and the pool's result: gross, net or points). */
  rows: { name: string; rank: number; tied: boolean; amount: number; hcp?: number | null; result?: string | null }[];
}
export interface PrizesShareAward {
  label: string; winnerName: string | null; amount: number;
  /** Optional identity so extra places (2º, 3º…) group under their base award. */
  id?: string; groupId?: string | null; place?: number | null;
}
export interface PrizesSharePayouts {
  byParticipant: PrizesSharePlayer[];
  pools: PrizesSharePool[];
  awards: PrizesShareAward[];
}

export interface ShareNameInfo { name: string; initials: string; color: string }

const normText = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const tokensOf = (s: string) => normText(s).split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Pool title for the share image. The category suffix is appended only when the
 * stored label doesn't already mention the category, so a pool labelled
 * "Stableford · Cat. A" never becomes "Stableford · Cat. A · Cat. A".
 */
export function poolShareTitle(base: string, categorySuffix: string | null, categoryName?: string | null): string {
  const b = (base || '').trim();
  const s = (categorySuffix || '').trim();
  if (!s) return b;
  const ncat = normText((categoryName || '').trim());
  const already = normText(b).includes(normText(s)) || (!!ncat && tokensOf(b).includes(ncat));
  if (already) return b;
  return b ? `${b} · ${s}` : s;
}

/**
 * Mode hint shown next to a pool title ("Stableford", "Gross"...). It is dropped
 * when the pool label already names the mode, so "Stableford · Cat. A" is not
 * followed by a second, repeated "Stableford".
 */
export function poolModeSubtitle(label: string, modeLabel: string): string {
  const l = (label || '').trim();
  const m = (modeLabel || '').trim();
  if (!l || !m) return '';
  const lt = tokensOf(l);
  if (tokensOf(m).every(t => lt.includes(t))) return '';
  return m;
}

export function buildPrizesSharePayouts(params: {
  result: Pick<PayoutResult, 'byParticipant' | 'pools' | 'awards'>;
  pools: { id: string; label: string; mode?: PrizeMode; categoryName?: string | null }[];
  awards: { id: string; label: string; amount: number; groupId?: string | null; place?: number | null }[];
  nameOf: (participantId: string) => ShareNameInfo;
  /** Optional handicap/result per player for the pool rows. */
  statsOf?: (participantId: string) => PrizeResultStat | null;
}): PrizesSharePayouts {
  const { result, pools, awards, nameOf, statsOf } = params;
  const who = (pid: string) => {
    const n = nameOf(pid);
    return { ...n, name: formatPlayerName(n.name || '') };
  };
  const winnerByAward = new Map((result.awards || []).map(a => [a.awardId, a.participantId]));
  const payoutByPool = new Map((result.pools || []).map(p => [p.poolId, p]));

  return {
    byParticipant: (result.byParticipant || []).filter(p => p.total > 0).map(p => {
      const n = who(p.participantId);
      return {
        participantId: p.participantId,
        name: n.name,
        initials: n.initials,
        color: n.color,
        total: p.total,
        items: p.items.map(it => ({ kind: it.kind, label: it.label, place: it.place, tied: it.tied, amount: it.amount })),
      };
    }),
    pools: pools.map(pool => ({
      label: pool.label,
      mode: pool.mode,
      categoryName: pool.categoryName ?? null,
      rows: (payoutByPool.get(pool.id)?.rows || [])
        // Every paid place the organizer configured (no fixed top-N cap).
        .filter(r => r.amount > 0)
        .map(r => {
          const st = statsOf?.(r.participantId) ?? null;
          return {
            name: who(r.participantId).name, rank: r.rank, tied: r.tied, amount: r.amount,
            hcp: st?.hcp ?? null,
            result: (pool.mode && st?.results?.[pool.mode]) || null,
          };
        }),
    })),
    awards: awards.map(a => {
      const pid = winnerByAward.get(a.id) ?? null;
      return {
        label: a.label, winnerName: pid ? who(pid).name : null, amount: Number(a.amount) || 0,
        id: a.id, groupId: a.groupId ?? null, place: a.place ?? null,
      };
    }),
  };
}

/** Final prizes: reads ONLY the frozen snapshot (names included); never recalculates. */
export function sharePayoutsFromSnapshot(
  snap: import('@/types/leaderboard').FinalPayoutsSnapshot,
  fallbackName: string,
): PrizesSharePayouts {
  const shown = roundPayoutForDisplay({
    byParticipant: snap.byParticipant || [], pools: snap.pools || [], awards: snap.awards || [],
    totalAllocated: 0, totalUnallocated: 0, totalPendingAwards: 0,
  });
  return buildPrizesSharePayouts({
    result: { byParticipant: shown.byParticipant, pools: shown.pools, awards: shown.awards },
    pools: ((snap.pools || []) as unknown as {
      id?: string; poolId?: string; label?: string; mode?: PrizeMode; categoryName?: string | null;
    }[]).map(p => ({ id: p.id ?? p.poolId ?? '', label: p.label ?? '', mode: p.mode, categoryName: p.categoryName ?? null })),
    awards: ((snap.awards || []) as unknown as { id?: string; awardId?: string; label?: string; amount?: number }[])
      .map(a => ({ id: a.id ?? a.awardId ?? '', label: a.label ?? '', amount: Math.round(Number(a.amount) || 0) })),
    nameOf: pid => snap.participants?.[pid] ?? { name: fallbackName, initials: '??', color: '#3B82F6' },
    statsOf: pid => {
      const sp = snap.participants?.[pid];
      return sp?.results ? { hcp: sp.hcp ?? null, results: sp.results } : null;
    },
  });
}

/** One card in the share image: a base award ("Hoyo 5") and its winners by place. */
export interface ShareAwardCard { key: string; title: string; rows: { place: number; winnerName: string | null; amount: number }[] }
export interface ShareAwardBlock { key: string; heading: string; cards: ShareAwardCard[] }

/**
 * Display-only grouping for the share image (same rules as the Prizes panel):
 * the section title appears once ("Oyes"), each base award is one card
 * ("Hoyo 5") with its places 1º, 2º, 3º. Awards without a shared prefix
 * ("Drive largo") are gathered under one "special awards" block, titled by
 * their own label. Never changes amounts or winners.
 */
export function buildShareAwardBlocks(awards: PrizesShareAward[], otherHeading: string): ShareAwardBlock[] {
  const sections = buildAwardDisplaySections(
    awards.map((a, i) => ({
      id: a.id || `award-${i}`, label: a.label, amount: a.amount, winner: a.winnerName,
      groupId: a.groupId ?? null, place: a.place ?? null,
    })),
  );
  const blocks: ShareAwardBlock[] = [];
  for (const sec of sections) {
    const titled = sec.groups.length > 0 && !!sec.groups[0].title;
    const cards: ShareAwardCard[] = sec.groups.map(g => ({
      key: g.key,
      title: titled ? g.title : sec.heading,
      rows: g.rows.map(r => ({ place: r.place, winnerName: r.winner, amount: r.amount })),
    }));
    const last = blocks[blocks.length - 1];
    if (titled) blocks.push({ key: sec.key, heading: sec.heading, cards });
    else if (last && last.heading === otherHeading) last.cards.push(...cards);
    else blocks.push({ key: sec.key, heading: otherHeading, cards });
  }
  return blocks;
}
