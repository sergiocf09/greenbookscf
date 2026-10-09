import { describe, expect, it } from 'vitest';
import { calculateWolfBets, computeAmountPerPair, computeEffectiveHoleValue, computeWolfStateHoleValue, normalizeWolfSetup } from '@/lib/bets/wolf';
import type { Player, WolfConfig, WolfHoleState } from '@/types/golf';

const players: Player[] = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, initials: `P${i}`, color: '', handicap: 0 }));
const config: WolfConfig = { roundId: 'round', holeValue: 60, scoringMode: 'lowBall', useHandicap: false, timing: 'B', carryover: true, playerOrder: players.map(p => p.id), participantIds: players.map(p => p.id) };
const state: WolfHoleState = { roundId: 'round', holeNumber: 18, wolfPlayerId: 'p0', partnerIds: ['p1'], wentSolo: false, result: 'won', effectiveAmount: null, carryoverHoles: 0 };
const balance = (bets: ReturnType<typeof calculateWolfBets>, id: string) => bets.filter(b => b.playerId === id).reduce((s, b) => s + b.amount, 0);

describe('Wolf total hole value', () => {
  it('60, 2 vs 3: pair 10, winners 30, losers -20, transfer 60', () => {
    const bets = calculateWolfBets(players, config, [state]);
    expect(computeAmountPerPair(config, 0, false, 2, 3)).toBe(10);
    expect(balance(bets, 'p0')).toBe(30);
    expect(balance(bets, 'p2')).toBe(-20);
    expect(bets.filter(b => b.amount > 0).reduce((s, b) => s + b.amount, 0)).toBe(60);
    expect(bets.reduce((s, b) => s + b.amount, 0)).toBe(0);
  });
  it('60, 1 vs 4 solo doubles to 120, pair 30', () => {
    const bets = calculateWolfBets(players, config, [{ ...state, partnerIds: [], wentSolo: true }]);
    expect(computeEffectiveHoleValue(config, 0, true)).toBe(120);
    expect(computeAmountPerPair(config, 0, true, 1, 4)).toBe(30);
    expect(balance(bets, 'p0')).toBe(120);
  });
  it('60, 1 vs 3 normal has pair 20 and wolf total 60', () => {
    expect(computeAmountPerPair(config, 0, false, 1, 3)).toBe(20);
  });
  it('normal recovery keeps carry and solo only doubles', () => {
    expect(computeWolfStateHoleValue(config, { ...state, redemptionMode: 'normal', carryoverHoles: 2, wentSolo: true })).toBe(360);
  });
  it('all-in uses loss 150 instead of base and ignores carry with partner', () => {
    const s = { ...state, redemptionMode: 'all_in' as const, allInAmount: 150, carryoverHoles: 9 };
    const bets = calculateWolfBets(players, config, [s]);
    expect(computeWolfStateHoleValue(config, s)).toBe(150);
    expect(balance(bets, 'p0')).toBe(75);
    expect(balance(bets, 'p2')).toBe(-50);
  });
  it('all-in solo transfers 300 for loss 150 with symmetric losing debt', () => {
    const s = { ...state, redemptionMode: 'all_in' as const, allInAmount: 150, carryoverHoles: 9, wentSolo: true, partnerIds: [] };
    expect(balance(calculateWolfBets(players, config, [s]), 'p0')).toBe(300);
    expect(balance(calculateWolfBets(players, config, [{ ...s, result: 'lost' }]), 'p0')).toBe(-300);
  });
  it('ties transfer no money', () => {
    expect(calculateWolfBets(players, config, [{ ...state, result: 'tied' }])).toEqual([]);
  });
  it('legacy Wolf setup preserves 60, explicit holeValue zero wins', () => {
    const { holeValue: _, roundId: __, participantIds: ___, ...setup } = config;
    expect(normalizeWolfSetup({ ...setup, enabled: true, amountPerHole: 60 }).holeValue).toBe(60);
    expect(normalizeWolfSetup({ ...setup, enabled: true, holeValue: 0, amountPerHole: 60 }).holeValue).toBe(0);
  });
});