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
  const allParts = source.trim().split(/\s+/).filter(Boolean);

  if (allParts.length === 0) return null;
  if (allParts.length === 1) {
    return <span className={cn('block leading-tight break-words', className)}>{allParts[0]}</span>;
  }

  // Strict: only first name + first surname. Disambiguation lives on the avatar.
  const first = allParts[0];
  let surname = allParts[1];

  if (surname.length > maxCharsPerLine) {
    surname = surname.charAt(0).toUpperCase() + '.';
  }

  return (
    <span className={cn('block leading-tight', className)}>
      <span className="block truncate">{first}</span>
      <span className="block truncate">{surname}</span>
    </span>
  );
};
