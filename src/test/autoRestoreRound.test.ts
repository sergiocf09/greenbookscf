import { describe, it, expect } from 'vitest';
import { isRecentEnoughToAutoRestore, pickAutoRestoreRoundId } from '@/lib/autoRestoreRound';

const now = new Date(2026, 10, 16, 12, 0); // Nov 16 2026, local noon

describe('auto-restore of pending rounds', () => {
  it('reopens a round dated today', () => {
    expect(isRecentEnoughToAutoRestore(new Date(2026, 10, 16), now)).toBe(true);
  });

  it('reopens a round dated yesterday', () => {
    expect(isRecentEnoughToAutoRestore(new Date(2026, 10, 15), now)).toBe(true);
  });

  it('does not reopen a round from two days ago', () => {
    expect(isRecentEnoughToAutoRestore(new Date(2026, 10, 14), now)).toBe(false);
  });

  it('skips an old unfinished round (Sept 19) even if it was touched most recently', () => {
    const pending = [
      { roundId: 'old-sept-19', date: new Date(2026, 8, 19) },
      { roundId: 'today', date: new Date(2026, 10, 16) },
    ];
    expect(pickAutoRestoreRoundId(pending, () => false, now)).toBe('today');
    expect(pickAutoRestoreRoundId([pending[0]], () => false, now)).toBeNull();
  });

  it('still respects rounds the player exited', () => {
    const pending = [{ roundId: 'today', date: new Date(2026, 10, 16) }];
    expect(pickAutoRestoreRoundId(pending, id => id === 'today', now)).toBeNull();
  });
});
