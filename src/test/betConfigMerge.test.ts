import { describe, expect, it } from 'vitest';
import { mergeBetConfigChanges } from '@/lib/betConfigMerge';

const override = (rival: string, amount: number) => ({ playerAId: 'sergio', playerBId: rival, betType: 'Medal Front 9', enabled: true, amountOverride: amount });

describe('bilateral amount persistence', () => {
  it('preserves separate rival edits from concurrent phones', () => {
    const base = { betOverrides: [override('a', 50), override('b', 50)] };
    const local = { betOverrides: [override('a', 100), override('b', 50)] };
    const remote = { betOverrides: [override('a', 50), override('b', 200)] };
    expect(mergeBetConfigChanges(base, local, remote)).toEqual({ betOverrides: [override('a', 100), override('b', 200)] });
  });
  it('keeps zero amounts while rebasing a remote setting update', () => {
    const base = { betOverrides: [override('a', 50)], medal: { totalAmount: 50 } };
    const local = { ...base, betOverrides: [override('a', 0)] };
    expect(mergeBetConfigChanges(base, local, { ...base, medal: { totalAmount: 200 } })).toEqual({ betOverrides: [override('a', 0)], medal: { totalAmount: 200 } });
  });
  it('keeps a newer local amount when an earlier save finishes', () => {
    expect(mergeBetConfigChanges({ betOverrides: [override('a', 100)] }, { betOverrides: [override('a', 200)] }, { betOverrides: [override('a', 100), override('b', 50)] })).toEqual({ betOverrides: [override('a', 200), override('b', 50)] });
  });
  it('removes only the deleted bilateral override', () => {
    expect(mergeBetConfigChanges({ betOverrides: [override('a', 50)] }, { betOverrides: [] }, { betOverrides: [override('a', 50), override('b', 200)] })).toEqual({ betOverrides: [override('b', 200)] });
  });
});