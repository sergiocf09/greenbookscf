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
