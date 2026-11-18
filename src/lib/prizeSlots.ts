/**
 * Template generation for special prize slots (Oyes on par 3s).
 * Pure functions only — no React, no Supabase.
 */
import type { SpecialAward } from '@/types/leaderboard';

export interface Par3SlotRound {
  roundId: string;
  date: string;
  courseId: string;
  /** Multi-day day number for the round's date; null in single-day leaderboards. */
  dayNumber: number | null;
}

export interface Par3SlotHole {
  hole_number: number;
  par: number;
}

/** Deterministic slot id so regenerating never duplicates. */
export const par3SlotId = (dayNumber: number | null, holeNumber: number) =>
  `oyes-d${dayNumber ?? 0}-h${holeNumber}`;

/**
 * One template slot (no winner, amount 0) per par 3 of every linked round,
 * ordered by day then hole. In multi-day leaderboards rounds whose date does
 * not match a configured day are skipped (they do not count in standings).
 * Rounds sharing day + hole collapse into one slot (stable id).
 */
export function buildPar3Slots(params: {
  rounds: Par3SlotRound[];
  holesByCourse: Record<string, Par3SlotHole[]>;
  isMultiDay: boolean;
}): SpecialAward[] {
  const { rounds, holesByCourse, isMultiDay } = params;
  const byId = new Map<string, SpecialAward>();
  for (const r of rounds || []) {
    const day = isMultiDay ? r.dayNumber : null;
    if (isMultiDay && (day == null || !Number.isFinite(day))) continue;
    for (const h of holesByCourse?.[r.courseId] || []) {
      if (Number(h.par) !== 3) continue;
      const hole = Number(h.hole_number);
      const id = par3SlotId(day, hole);
      if (byId.has(id)) continue;
      byId.set(id, {
        id,
        label: isMultiDay ? `Oyes · Día ${day} · Hoyo ${hole}` : `Oyes · Hoyo ${hole}`,
        holeNumber: hole,
        dayNumber: day,
        amount: 0,
        winnerParticipantId: null,
        categoryId: null,
        note: '',
      });
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => ((a.dayNumber ?? 0) - (b.dayNumber ?? 0)) || ((a.holeNumber ?? 0) - (b.holeNumber ?? 0)),
  );
}

/** Appends generated slots whose id is not present; existing awards stay untouched. */
export function mergeGeneratedSlots(existing: SpecialAward[], generated: SpecialAward[]): SpecialAward[] {
  const ids = new Set((existing || []).map(a => a.id));
  const added = (generated || []).filter(g => !ids.has(g.id));
  return [...(existing || []), ...added];
}

/* ── Multi-winner special awards ──
 * A special award without groupId/place is place 1 of its own group (legacy
 * data stays valid). Each extra place is one more SpecialAward with id
 * `${baseId}-p${place}`, groupId = baseId and an auto-derived label, so the
 * payout engine, panel, share image and frozen snapshot need no changes.
 */

export const MAX_AWARD_WINNERS = 10;

/** Fields an extra place copies from its base award. */
const SHARED_FIELDS = ['holeNumber', 'dayNumber', 'categoryId', 'note'] as const;

export const awardGroupKey = (a: SpecialAward) => a.groupId || a.id;
export const awardPlace = (a: SpecialAward) => (a.groupId ? Math.max(2, Number(a.place) || 2) : 1);
export const extraAwardId = (baseId: string, place: number) => `${baseId}-p${place}`;
export const extraAwardLabel = (baseLabel: string, place: number) => {
  const base = (baseLabel || '').trim();
  return base ? `${base} · ${place}º` : `${place}º`;
};

export interface SpecialAwardGroup {
  base: SpecialAward;
  /** Extra places (2º, 3º…) sorted by place. */
  extras: SpecialAward[];
}

/** Groups awards by base, keeping base order. Extras whose base is missing are shown as their own group. */
export function groupSpecialAwards(awards: SpecialAward[]): SpecialAwardGroup[] {
  const list = awards || [];
  const baseIds = new Set(list.filter(a => !a.groupId).map(a => a.id));
  const groups: SpecialAwardGroup[] = [];
  const byBase = new Map<string, SpecialAwardGroup>();
  for (const a of list) {
    if (a.groupId && baseIds.has(a.groupId)) continue;
    const g = { base: a, extras: [] as SpecialAward[] };
    groups.push(g);
    byBase.set(a.id, g);
  }
  for (const a of list) {
    if (a.groupId && baseIds.has(a.groupId)) byBase.get(a.groupId)!.extras.push(a);
  }
  for (const g of groups) g.extras.sort((x, y) => awardPlace(x) - awardPlace(y));
  return groups;
}

/** Number of winners (places) a base award currently has. */
export function awardWinnerCount(awards: SpecialAward[], baseId: string): number {
  return 1 + (awards || []).filter(a => a.groupId === baseId).length;
}

/** Extras that would be dropped when reducing a group to `count` winners. */
export function extrasRemovedBy(awards: SpecialAward[], baseId: string, count: number): SpecialAward[] {
  return (awards || []).filter(a => a.groupId === baseId && awardPlace(a) > count);
}

const syncExtra = (base: SpecialAward, extra: SpecialAward): SpecialAward => {
  const place = awardPlace(extra);
  const next: SpecialAward = { ...extra, groupId: base.id, place, label: extraAwardLabel(base.label, place) };
  for (const f of SHARED_FIELDS) (next as unknown as Record<string, unknown>)[f] = base[f] ?? (f === 'note' ? '' : null);
  return next;
};

/**
 * Sets the number of winners (1..MAX_AWARD_WINNERS) of a base award. New
 * places start with amount 0 and no winner; existing places keep their data;
 * places above `count` are removed. The group stays contiguous after its base.
 */
export function setAwardWinnerCount(awards: SpecialAward[], baseId: string, count: number): SpecialAward[] {
  const list = awards || [];
  const base = list.find(a => a.id === baseId && !a.groupId);
  if (!base) return list;
  const n = Math.max(1, Math.min(MAX_AWARD_WINNERS, Math.round(Number(count) || 1)));
  const existing = new Map(list.filter(a => a.groupId === baseId).map(a => [awardPlace(a), a]));
  const extras: SpecialAward[] = [];
  for (let place = 2; place <= n; place++) {
    const prev = existing.get(place);
    extras.push(syncExtra(base, prev ?? {
      id: extraAwardId(baseId, place), label: '', amount: 0, winnerParticipantId: null, groupId: baseId, place,
    }));
  }
  const out: SpecialAward[] = [];
  for (const a of list) {
    if (a.groupId === baseId) continue;
    out.push(a);
    if (a.id === baseId) out.push(...extras);
  }
  return out;
}

/** Patches a base award and propagates label/hole/day/category/note to its extra places. */
export function patchAwardBase(awards: SpecialAward[], baseId: string, patch: Partial<SpecialAward>): SpecialAward[] {
  const list = awards || [];
  const base = list.find(a => a.id === baseId);
  if (!base) return list;
  const nextBase = { ...base, ...patch };
  return list.map(a => (a.id === baseId ? nextBase : a.groupId === baseId ? syncExtra(nextBase, a) : a));
}

/** Removes a base award and all its extra places. */
export function removeAwardGroup(awards: SpecialAward[], baseId: string): SpecialAward[] {
  return (awards || []).filter(a => a.id !== baseId && a.groupId !== baseId);
}

/** Re-derives every extra place from its base (labels, shared fields). Use before saving. */
export function syncAwardGroups(awards: SpecialAward[]): SpecialAward[] {
  const list = awards || [];
  const byId = new Map(list.filter(a => !a.groupId).map(a => [a.id, a]));
  return list.map(a => {
    const base = a.groupId ? byId.get(a.groupId) : undefined;
    return base ? syncExtra(base, a) : a;
  });
}
