/**
 * Pure builder for the prizes share image data. It never recalculates
 * payouts: it only reshapes a PayoutResult (live) or a FinalPayoutsSnapshot
 * (final) plus display metadata into what the canvas draws.
 */
import { formatPlayerName } from '@/lib/playerInput';
import type { PayoutResult } from '@/types/leaderboard';

export interface PrizesShareItem { label: string; place?: number; tied?: boolean; amount: number }
export interface PrizesSharePlayer {
  participantId: string;
  name: string;
  initials: string;
  color: string;
  total: number;
  items: PrizesShareItem[];
}
export interface PrizesSharePool { label: string; rows: { name: string; rank: number; tied: boolean; amount: number }[] }
export interface PrizesShareAward { label: string; winnerName: string | null; amount: number }
export interface PrizesSharePayouts {
  byParticipant: PrizesSharePlayer[];
  pools: PrizesSharePool[];
  awards: PrizesShareAward[];
}

export interface ShareNameInfo { name: string; initials: string; color: string }

/** Max places listed per pool in the "winners by pool" block. */
export const SHARE_POOL_MAX_RANK = 3;

export function buildPrizesSharePayouts(params: {
  result: Pick<PayoutResult, 'byParticipant' | 'pools' | 'awards'>;
  pools: { id: string; label: string }[];
  awards: { id: string; label: string; amount: number }[];
  nameOf: (participantId: string) => ShareNameInfo;
}): PrizesSharePayouts {
  const { result, pools, awards, nameOf } = params;
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
        items: p.items.map(it => ({ label: it.label, place: it.place, tied: it.tied, amount: it.amount })),
      };
    }),
    pools: pools.map(pool => ({
      label: pool.label,
      rows: (payoutByPool.get(pool.id)?.rows || [])
        .filter(r => r.rank <= SHARE_POOL_MAX_RANK && r.amount > 0)
        .map(r => ({ name: who(r.participantId).name, rank: r.rank, tied: r.tied, amount: r.amount })),
    })),
    awards: awards.map(a => {
      const pid = winnerByAward.get(a.id) ?? null;
      return { label: a.label, winnerName: pid ? who(pid).name : null, amount: Number(a.amount) || 0 };
    }),
  };
}

/** Final prizes: reads ONLY the frozen snapshot (names included); never recalculates. */
export function sharePayoutsFromSnapshot(
  snap: import('@/types/leaderboard').FinalPayoutsSnapshot,
  fallbackName: string,
): PrizesSharePayouts {
  return buildPrizesSharePayouts({
    result: { byParticipant: snap.byParticipant || [], pools: snap.pools || [], awards: snap.awards || [] },
    pools: ((snap.pools || []) as unknown as { id?: string; poolId?: string; label?: string }[])
      .map(p => ({ id: p.id ?? p.poolId ?? '', label: p.label ?? '' })),
    awards: ((snap.awards || []) as unknown as { id?: string; awardId?: string; label?: string; amount?: number }[])
      .map(a => ({ id: a.id ?? a.awardId ?? '', label: a.label ?? '', amount: Number(a.amount) || 0 })),
    nameOf: pid => snap.participants?.[pid] ?? { name: fallbackName, initials: '??', color: '#3B82F6' },
  });
}
