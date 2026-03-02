/**
 * Snapshot Group Filter — filters a single round snapshot
 * to show data for a specific group (intra-group) or cross-group bets only.
 *
 * Used by HistoricalRoundView to render per-group tabs without
 * modifying the snapshot or the closure pipeline.
 */

import { Player } from '@/types/golf';
import {
  RoundSnapshot,
  SnapshotPlayerBalance,
  SnapshotLedgerEntry,
  SnapshotPairBreakdowns,
  SnapshotPairSegmentResults,
} from './roundSnapshot';

export interface GroupFilteredView {
  players: Player[];
  playerIds: Set<string>;
  balances: SnapshotPlayerBalance[];
  ledger: SnapshotLedgerEntry[];
  pairBreakdowns: SnapshotPairBreakdowns;
  pairSegmentResults: SnapshotPairSegmentResults;
}

/** Build a map of playerId → groupId from snapshot groups */
export function buildPlayerGroupMap(snapshot: RoundSnapshot): Map<string, string> {
  const map = new Map<string, string>();
  if (snapshot.groups) {
    for (const g of snapshot.groups) {
      for (const pid of g.playerIds) {
        map.set(pid, g.id);
      }
    }
  }
  return map;
}

/** Filter snapshot data to a specific group (intra-group only) */
export function filterSnapshotByGroup(
  snapshot: RoundSnapshot,
  groupIndex: number,
  allPlayers: Player[],
): GroupFilteredView {
  const group = snapshot.groups?.[groupIndex];
  if (!group) {
    const allIds = new Set(allPlayers.map(p => p.id));
    return {
      players: allPlayers,
      playerIds: allIds,
      balances: snapshot.balances,
      ledger: snapshot.ledger,
      pairBreakdowns: snapshot.pairBreakdowns || {},
      pairSegmentResults: snapshot.pairSegmentResults || {},
    };
  }

  const groupPlayerIds = new Set(group.playerIds);
  const players = allPlayers.filter(p => groupPlayerIds.has(p.id));

  // Filter balances to intra-group, recompute totalNet
  const balances = (snapshot.balances || [])
    .filter(b => groupPlayerIds.has(b.playerId))
    .map(b => {
      const vsBalances = b.vsBalances.filter(vs => groupPlayerIds.has(vs.rivalId));
      return {
        ...b,
        totalNet: vsBalances.reduce((sum, vs) => sum + vs.netAmount, 0),
        vsBalances,
      };
    });

  // Filter ledger to intra-group entries
  const ledger = (snapshot.ledger || []).filter(
    e => groupPlayerIds.has(e.fromPlayerId) && groupPlayerIds.has(e.toPlayerId),
  );

  // Filter pairBreakdowns
  const pairBreakdowns: SnapshotPairBreakdowns = {};
  if (snapshot.pairBreakdowns) {
    for (const [key, val] of Object.entries(snapshot.pairBreakdowns)) {
      const [a, b] = key.split('::');
      if (groupPlayerIds.has(a) && groupPlayerIds.has(b)) {
        pairBreakdowns[key] = val;
      }
    }
  }

  // Filter pairSegmentResults
  const pairSegmentResults: SnapshotPairSegmentResults = {};
  if (snapshot.pairSegmentResults) {
    for (const [key, val] of Object.entries(snapshot.pairSegmentResults)) {
      const parts = key.split('::');
      if (groupPlayerIds.has(parts[0]) && groupPlayerIds.has(parts[1])) {
        pairSegmentResults[key] = val;
      }
    }
  }

  return { players, playerIds: groupPlayerIds, balances, ledger, pairBreakdowns, pairSegmentResults };
}

/** Filter snapshot data to cross-group bets only */
export function filterSnapshotCrossGroup(
  snapshot: RoundSnapshot,
  allPlayers: Player[],
): GroupFilteredView {
  const pgMap = buildPlayerGroupMap(snapshot);

  const crossPlayerIds = new Set<string>();
  const ledger = (snapshot.ledger || []).filter(entry => {
    const fg = pgMap.get(entry.fromPlayerId);
    const tg = pgMap.get(entry.toPlayerId);
    if (fg && tg && fg !== tg) {
      crossPlayerIds.add(entry.fromPlayerId);
      crossPlayerIds.add(entry.toPlayerId);
      return true;
    }
    return false;
  });

  const players = allPlayers.filter(p => crossPlayerIds.has(p.id));

  // Compute balances from cross-group ledger
  const balanceMap = new Map<string, Map<string, number>>();
  for (const p of players) balanceMap.set(p.id, new Map());

  for (const entry of ledger) {
    if (entry.amount <= 0) continue;
    const wVs = balanceMap.get(entry.toPlayerId);
    if (wVs) wVs.set(entry.fromPlayerId, (wVs.get(entry.fromPlayerId) || 0) + entry.amount);
    const lVs = balanceMap.get(entry.fromPlayerId);
    if (lVs) lVs.set(entry.toPlayerId, (lVs.get(entry.toPlayerId) || 0) - entry.amount);
  }

  const balances: SnapshotPlayerBalance[] = players.map(p => {
    const vs = balanceMap.get(p.id) || new Map();
    const origBal = snapshot.balances.find(b => b.playerId === p.id);
    const vsBalances = Array.from(vs.entries()).map(([rivalId, netAmount]) => ({
      rivalId,
      rivalName: players.find(pl => pl.id === rivalId)?.name || 'Unknown',
      netAmount,
      slidingStrokes: origBal?.vsBalances.find(v => v.rivalId === rivalId)?.slidingStrokes,
    }));
    return {
      playerId: p.id,
      playerName: p.name,
      totalGross: origBal?.totalGross || 0,
      totalNet: vsBalances.reduce((sum, v) => sum + v.netAmount, 0),
      vsBalances,
    };
  });

  // Filter pairBreakdowns to cross-group pairs
  const pairBreakdowns: SnapshotPairBreakdowns = {};
  if (snapshot.pairBreakdowns) {
    for (const [key, val] of Object.entries(snapshot.pairBreakdowns)) {
      const [a, b] = key.split('::');
      const ga = pgMap.get(a);
      const gb = pgMap.get(b);
      if (ga && gb && ga !== gb) pairBreakdowns[key] = val;
    }
  }

  // Filter pairSegmentResults to cross-group pairs
  const pairSegmentResults: SnapshotPairSegmentResults = {};
  if (snapshot.pairSegmentResults) {
    for (const [key, val] of Object.entries(snapshot.pairSegmentResults)) {
      const parts = key.split('::');
      const ga = pgMap.get(parts[0]);
      const gb = pgMap.get(parts[1]);
      if (ga && gb && ga !== gb) pairSegmentResults[key] = val;
    }
  }

  return { players, playerIds: crossPlayerIds, balances, ledger, pairBreakdowns, pairSegmentResults };
}

/** Check if a snapshot has any cross-group ledger entries */
export function snapshotHasCrossGroupData(snapshot: RoundSnapshot): boolean {
  if (!snapshot.groups || snapshot.groups.length <= 1) return false;
  const pgMap = buildPlayerGroupMap(snapshot);
  return (snapshot.ledger || []).some(e => {
    const fg = pgMap.get(e.fromPlayerId);
    const tg = pgMap.get(e.toPlayerId);
    return fg && tg && fg !== tg;
  });
}
