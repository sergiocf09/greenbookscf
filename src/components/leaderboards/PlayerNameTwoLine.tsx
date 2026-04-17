import React from 'react';
import { formatPlayerName } from '@/lib/playerInput';
import { cn } from '@/lib/utils';

interface Props {
  /** Raw name from DB (any case). */
  name: string;
  /**
   * Optional precomputed display string (e.g. "Juan Pérez" or "Juan Pérez L.")
   * When provided, this overrides the default first+lastSurname rendering.
   * Used by callers that need to disambiguate among a known set of players.
   */
  displayOverride?: string;
  className?: string;
  /**
   * Approximate per-line character budget used to decide when the surname
   * line must shrink to its initial. Tuned for the narrow match-row column.
   */
  maxCharsPerLine?: number;
}

/**
 * Renders a player name on at most two lines:
 *  - Line 1: first given name.
 *  - Line 2: surname(s). When `displayOverride` is supplied we render its
 *    "tail" (everything after the first word) on line 2, collapsing to an
 *    initial if it exceeds the per-line budget.
 *
 * Without an override we render only first name + first surname, which is
 * the cleanest default when there's no disambiguation conflict.
 */
export const PlayerNameTwoLine: React.FC<Props> = ({
  name,
  displayOverride,
  className,
  maxCharsPerLine = 12,
}) => {
  const source = displayOverride ?? formatPlayerName(name);
  const parts = source.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return null;
  if (parts.length === 1) {
    return <span className={cn('block leading-tight break-words', className)}>{parts[0]}</span>;
  }

  const first = parts[0];
  const tail = parts.slice(1);
  let tailLine = tail.join(' ');

  if (tailLine.length > maxCharsPerLine) {
    // Collapse the LAST token to its initial; if still too long, collapse all.
    const head = tail.slice(0, -1);
    const last = tail[tail.length - 1];
    const lastInitial = last.charAt(0).toUpperCase() + '.';
    tailLine = [...head, lastInitial].join(' ').trim();
    if (tailLine.length > maxCharsPerLine) {
      tailLine = tail.map(t => t.charAt(0).toUpperCase() + '.').join(' ');
    }
  }

  return (
    <span className={cn('block leading-tight', className)}>
      <span className="block truncate">{first}</span>
      <span className="block truncate">{tailLine}</span>
    </span>
  );
};
