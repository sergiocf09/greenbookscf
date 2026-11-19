/**
 * Display-only rounding of prize payouts to whole pesos.
 *
 * The payout engine keeps exact cents (e.g. a 3-way tie of 32,500 → 10,833.33 each).
 * For a cleaner screen we show whole amounts, distributing each pool's leftover pesos
 * by largest remainder so every pool — and therefore the grand total — still adds up
 * exactly. Player totals are re-summed from the rounded rows, so a player card always
 * equals the rows shown below it. Stored/frozen data is never modified.
 */
import type { PayoutResult, PayoutRow, PlayerPayout } from '@/types/leaderboard';

/** Rounds values to integers keeping their (rounded) sum; ties in remainder go to the earlier item. */
export function roundKeepingTotal(values: number[]): number[] {
  const target = Math.round(values.reduce((s, v) => s + (Number(v) || 0), 0));
  const floors = values.map(v => Math.floor((Number(v) || 0) + 1e-9));
  let left = target - floors.reduce((s, v) => s + v, 0);
  const order = values
    .map((v, i) => ({ i, rem: (Number(v) || 0) - floors[i] }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  const out = [...floors];
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k].i] += 1;
  for (let k = order.length - 1; left < 0 && k >= 0; k--, left++) out[order[k].i] -= 1;
  return out;
}

export function roundPayoutForDisplay<T extends PayoutResult>(result: T): T {
  if (!result) return result;
  const rounded = new Map<string, number>(); // `${poolId}|${participantId}` → whole amount
  const pools = (result.pools || []).map(pool => {
    const amounts = roundKeepingTotal(pool.rows.map(r => r.amount));
    const rows: PayoutRow[] = pool.rows.map((r, i) => {
      rounded.set(`${pool.poolId}|${r.participantId}`, amounts[i]);
      return { ...r, amount: amounts[i] };
    });
    return {
      ...pool,
      rows,
      allocated: amounts.reduce((s, v) => s + v, 0),
      unallocated: Math.round(Number(pool.unallocated) || 0),
    };
  });

  const byParticipant: PlayerPayout[] = (result.byParticipant || [])
    .map((pp, idx) => {
      const items = pp.items.map(it => ({
        ...it,
        amount: it.kind === 'pool'
          ? rounded.get(`${it.refId}|${pp.participantId}`) ?? Math.round(it.amount)
          : Math.round(it.amount),
      }));
      return { idx, pp: { ...pp, items, total: items.reduce((s, it) => s + it.amount, 0) } };
    })
    .sort((a, b) => b.pp.total - a.pp.total || a.idx - b.idx)
    .map(x => x.pp);

  return {
    ...result,
    pools,
    awards: (result.awards || []).map(a => ({ ...a, amount: Math.round(Number(a.amount) || 0) })),
    byParticipant,
    totalAllocated: byParticipant.reduce((s, p) => s + p.total, 0),
    totalUnallocated: Math.round(Number(result.totalUnallocated) || 0),
    totalPendingAwards: Math.round(Number(result.totalPendingAwards) || 0),
  };
}
