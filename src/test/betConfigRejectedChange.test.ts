import { describe, it, expect } from 'vitest';
import { isUserVisibleBetChange } from '@/hooks/useBetConfigPersistence';

const base: any = {
  medal: { enabled: true, frontAmount: 100, backAmount: 100, totalAmount: 100 },
  betOverrides: [], parejasExcluded: [], crossGroupRivals: {}, bilateralHandicaps: [],
};

describe('rejected bet changes a regular player must be told about', () => {
  it('a per-pair amount change counts', () => {
    const next = { ...base, betOverrides: [{ playerAId: 'a', playerBId: 'b', betType: 'Medal', enabled: true, amountOverride: 200 }] };
    expect(isUserVisibleBetChange(base, next)).toBe(true);
  });
  it('a Parejas exclusion counts', () => {
    expect(isUserVisibleBetChange(base, { ...base, parejasExcluded: ['a|b'] })).toBe(true);
  });
  it('a new cross-group rival counts', () => {
    expect(isUserVisibleBetChange(base, { ...base, crossGroupRivals: { a: ['c'] } })).toBe(true);
  });
  it('a pair handicap change counts', () => {
    const next = { ...base, bilateralHandicaps: [{ playerAId: 'a', playerBId: 'b', playerAHandicap: 0, playerBHandicap: 3 }] };
    expect(isUserVisibleBetChange(base, next)).toBe(true);
  });
  it('an identical config does not', () => {
    expect(isUserVisibleBetChange(base, JSON.parse(JSON.stringify(base)))).toBe(false);
  });
});
