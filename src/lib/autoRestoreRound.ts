/**
 * Auto-restore policy for pending rounds on app start.
 *
 * Only rounds dated today or yesterday (local calendar) reopen by themselves.
 * Older unfinished rounds stay in the pending list for a manual restore, so a
 * forgotten round from weeks ago never silently becomes the "current" round.
 */
export const AUTO_RESTORE_MAX_AGE_DAYS = 1;

const startOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function isRecentEnoughToAutoRestore(roundDate: Date, now: Date = new Date()): boolean {
  if (!(roundDate instanceof Date) || Number.isNaN(roundDate.getTime())) return false;
  const diffDays = Math.round(
    (startOfLocalDay(now).getTime() - startOfLocalDay(roundDate).getTime()) / 86_400_000,
  );
  return diffDays <= AUTO_RESTORE_MAX_AGE_DAYS;
}

export function pickAutoRestoreRoundId(
  pending: Array<{ roundId: string; date: Date }>,
  isExcluded: (roundId: string) => boolean,
  now: Date = new Date(),
): string | null {
  return (
    pending.find(r => !isExcluded(r.roundId) && isRecentEnoughToAutoRestore(r.date, now))?.roundId ?? null
  );
}
