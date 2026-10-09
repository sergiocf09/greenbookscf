import { describe, expect, it } from 'vitest';
import { calculateWolfBets, computeAmountPerPair, computeEffectiveHoleValue, computeWolfStateHoleValue, normalizeWolfSetup } from '@/lib/bets/wolf';
import type { Player, WolfConfig, WolfHoleState } from '@/types/golf';

const players: Player[] = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, initials: `P${i}`, color: '', handicap: 0 }));
const config: WolfConfig = { roundId: 'round', holeValue: 60, scoringMode: 'lowBall', useHandicap: false, timing: 'B', carryover: true, playerOrder: players.map(p => p.id), participantIds: players.map(p => p.id) };
const state: WolfHoleState = { roundId: 'round', holeNumber: 18, wolfPlayerId: 'p0', partnerIds: ['p1'], wentSolo: false, result: 'won', effectiveAmount: null, carryoverHoles: 0 };
const balance = (bets: ReturnType<typeof calculateWolfBets>, id: string) => bets.filter(b => b.playerId === id).reduce((s, b) => s + b.amount, 0);

describe('Wolf total hole value', () => {
  it('60, 2 vs 3: each rival pays 60, each winner +90', () => {
    const bets = calculateWolfBets(players, config, [state]);
    expect(computeAmountPerPair(config, 0, false, 2, 3)).toBe(30);
    expect(balance(bets, 'p0')).toBe(90);
    expect(balance(bets, 'p2')).toBe(-60);
    expect(bets.filter(b => b.amount > 0).reduce((s, b) => s + b.amount, 0)).toBe(180);
    expect(bets.reduce((s, b) => s + b.amount, 0)).toBe(0);
  });
  it('60, 1 vs 4 solo: each rival pays 120, Loba +480', () => {
    const bets = calculateWolfBets(players, config, [{ ...state, partnerIds: [], wentSolo: true }]);
    expect(computeEffectiveHoleValue(config, 0, true)).toBe(120);
    expect(computeAmountPerPair(config, 0, true, 1, 4)).toBe(120);
    expect(balance(bets, 'p0')).toBe(480);
    expect(balance(bets, 'p2')).toBe(-120);
  });
  it('60, 1 vs 3 normal has pair 60 and wolf total 180', () => {
    expect(computeAmountPerPair(config, 0, false, 1, 3)).toBe(60);
  });
  it('60, 2 vs 2 equal teams: pot splits evenly, each player ±30', () => {
    const bets = calculateWolfBets(players.slice(0, 4), config, [state]);
    expect(computeAmountPerPair(config, 0, false, 2, 2)).toBe(15);
    expect(balance(bets, 'p0')).toBe(30);
    expect(balance(bets, 'p1')).toBe(30);
    expect(balance(bets, 'p2')).toBe(-30);
    expect(balance(bets, 'p3')).toBe(-30);
    expect(bets.reduce((s, b) => s + b.amount, 0)).toBe(0);
  });
  it('60 with 11 carries, 2 vs 2: pot 660, each winner +330 (165 per rival)', () => {
    const s = { ...state, carryoverHoles: 11 };
    const bets = calculateWolfBets(players.slice(0, 4), config, [s]);
    expect(computeAmountPerPair(config, 11, false, 2, 2)).toBe(165);
    expect(balance(bets, 'p0')).toBe(330);
    expect(balance(bets, 'p2')).toBe(-330);
    expect(bets.reduce((s, b) => s + b.amount, 0)).toBe(0);
  });
  it('normal recovery keeps carry and solo only doubles', () => {
    expect(computeWolfStateHoleValue(config, { ...state, redemptionMode: 'normal', carryoverHoles: 2, wentSolo: true })).toBe(360);
  });
  it('all-in uses loss 150 instead of base and ignores carry with partner', () => {
    const s = { ...state, redemptionMode: 'all_in' as const, allInAmount: 150, carryoverHoles: 9 };
    const bets = calculateWolfBets(players, config, [s]);
    expect(computeWolfStateHoleValue(config, s)).toBe(300);
    expect(balance(bets, 'p0')).toBe(150);
    expect(balance(bets, 'p2')).toBe(-100);
  });
  it('all-in solo transfers 300 for loss 150 with symmetric losing debt', () => {
    const s = { ...state, redemptionMode: 'all_in' as const, allInAmount: 150, carryoverHoles: 9, wentSolo: true, partnerIds: [] };
    expect(balance(calculateWolfBets(players, config, [s]), 'p0')).toBe(300);
    expect(balance(calculateWolfBets(players, config, [{ ...s, result: 'lost' }]), 'p0')).toBe(-300);
  });
  it('ties transfer no money', () => {
    expect(calculateWolfBets(players, config, [{ ...state, result: 'tied' }])).toEqual([]);
  });
  it.each([4, 5])('H18 loss 200 with partner, %i players: zero if won, -400 if lost', (count) => {
    const s = { ...state, redemptionMode: 'all_in' as const, allInAmount: 200, carryoverHoles: 5 };
    const won = calculateWolfBets(players.slice(0, count), config, [s]);
    expect(computeWolfStateHoleValue(config, s)).toBe(400);
    expect(-200 + balance(won, 'p0')).toBe(0);
    expect(balance(won, 'p1')).toBe(200);
    expect(won.reduce((sum, b) => sum + Math.round(b.amount * 100), 0)).toBe(0);
    const lost = calculateWolfBets(players.slice(0, count), config, [{ ...s, result: 'lost' }]);
    expect(-200 + balance(lost, 'p0')).toBeCloseTo(-400);
    expect(balance(lost, 'p1')).toBeCloseTo(-200);
    expect(lost.reduce((sum, b) => sum + Math.round(b.amount * 100), 0)).toBe(0);
  });
  it.each([4, 5])('H18 loss 200 solo, %i players: +200 if won, -600 if lost', (count) => {
    const s = { ...state, redemptionMode: 'all_in' as const, allInAmount: 200, partnerIds: [], wentSolo: true };
    const won = calculateWolfBets(players.slice(0, count), config, [s]);
    expect(-200 + balance(won, 'p0')).toBeCloseTo(200);
    expect(players.slice(1, count).map(p => balance(won, p.id)).sort()).toEqual(count === 4 ? [-133.33, -133.33, -133.34].sort() : [-100, -100, -100, -100]);
    expect(won.reduce((sum, b) => sum + Math.round(b.amount * 100), 0)).toBe(0);
    const lost = calculateWolfBets(players.slice(0, count), config, [{ ...s, result: 'lost' }]);
    expect(-200 + balance(lost, 'p0')).toBeCloseTo(-600);
    expect(lost.reduce((sum, b) => sum + Math.round(b.amount * 100), 0)).toBe(0);
  });
  it('partner doubling exception does not apply outside H18 or normal mode', () => {
    expect(computeWolfStateHoleValue(config, { ...state, holeNumber: 17, redemptionMode: 'all_in', allInAmount: 200 })).toBe(200);
    expect(computeWolfStateHoleValue(config, { ...state, redemptionMode: 'normal', allInAmount: 200 })).toBe(60);
  });
  it('legacy Wolf setup preserves 60, explicit holeValue zero wins', () => {
    const { holeValue: _, roundId: __, participantIds: ___, ...setup } = config;
    expect(normalizeWolfSetup({ ...setup, enabled: true, amountPerHole: 60 }).holeValue).toBe(60);
    expect(normalizeWolfSetup({ ...setup, enabled: true, holeValue: 0, amountPerHole: 60 }).holeValue).toBe(0);
  });
});