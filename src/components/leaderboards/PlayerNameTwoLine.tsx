import React from 'react';
import { formatPlayerName } from '@/lib/playerInput';
import { cn } from '@/lib/utils';

interface Props {
  name: string;
  className?: string;
  /**
   * Approximate per-line character budget used to decide when the last
   * surname must shrink to its initial. Tuned for the narrow match-row
   * column on a 390px viewport.
   */
  maxCharsPerLine?: number;
}

/**
 * Renders a player name on at most two lines:
 *  - Line 1: first name (+ middle name if present and short).
 *  - Line 2: surnames. If the full surname block doesn't fit, the LAST
 *    surname is collapsed to its initial (e.g. "García López" → "García L.").
 *
 * Heuristic: we don't measure DOM; we estimate by character count.
 * If even one surname is too long, we collapse to a single initial.
 */
export const PlayerNameTwoLine: React.FC<Props> = ({
  name,
  className,
  maxCharsPerLine = 12,
}) => {
  const formatted = formatPlayerName(name).trim();
  const parts = formatted.split(/\s+/);

  if (parts.length <= 1) {
    return <span className={cn('block leading-tight break-words', className)}>{formatted}</span>;
  }

  // Convention: first token = given name; remainder = surnames.
  const first = parts[0];
  const surnames = parts.slice(1);

  let surnameLine = surnames.join(' ');
  // If surname line exceeds the budget, shrink the LAST surname to its initial.
  if (surnameLine.length > maxCharsPerLine && surnames.length >= 1) {
    const head = surnames.slice(0, -1);
    const last = surnames[surnames.length - 1];
    const lastInitial = last.charAt(0).toUpperCase() + '.';
    surnameLine = [...head, lastInitial].join(' ').trim();
    // Still too long? collapse all surnames to initials.
    if (surnameLine.length > maxCharsPerLine) {
      surnameLine = surnames.map(s => s.charAt(0).toUpperCase() + '.').join(' ');
    }
  }

  return (
    <span className={cn('block leading-tight', className)}>
      <span className="block truncate">{first}</span>
      <span className="block truncate">{surnameLine}</span>
    </span>
  );
};
