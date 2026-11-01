import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { calculateBloquesForPair, calculateBloquesBets, getBloquesPairKey } from '@/lib/bets/bloques';
import { BloquesLastBlockPress } from '@/components/bets/BloquesLastBlockPress';
import { defaultMarkerState, type BetConfig, type GolfCourse, type Player, type PlayerScore } from '@/types/golf';

const course: GolfCourse = { id: 'c', name: 'Test', location: '', holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, handicapIndex: i + 1 })) };
const players: Player[] = ['a', 'b', 'c'].map(id => ({ id, name: id, initials: id, color: '', handicap: 0 }));
const [a, b] = players;
const scores = new Map<string, PlayerScore[]>(players.map(p => [p.id, course.holes.map(h => ({ playerId: p.id, holeNumber: h.number, strokes: p.id === 'a' ? 4 : 5, putts: 2, netScore: p.id === 'a' ? 4 : 5, strokesReceived: 0, confirmed: true, markers: { ...defaultMarkerState } }))]));
const config = (size: 2 | 3 | 6, roundHoles: 9 | 18 = 18): BetConfig => ({ bloques: { enabled: true, holesPerBlock: size, amountPerBlock: 100, carryOverOnTie: true }, roundHoles } as BetConfig);

describe('Bloques final-block press', () => {
  it.each([2, 3, 6] as const)('doubles only the final %s-hole block', size => {
    const blocks = calculateBloquesForPair(a, b, scores, course, config(size), [], 1, size, 100, true, 2);
    expect(blocks.slice(0, -1).every(block => block.amountAtStake === 100 && block.multiplier === 1)).toBe(true);
    expect(blocks.at(-1)?.amountAtStake).toBe(200);
    expect(blocks.at(-1)?.multiplier).toBe(2);
  });
  it('presses the last played block when starting on hole 10', () => {
    const last = calculateBloquesForPair(a, b, scores, course, config(3), [], 10, 3, 100, true, 2).at(-1);
    expect([last?.startHole, last?.endHole, last?.amountAtStake]).toEqual([7, 9, 200]);
  });
  it('presses the last block in a nine-hole round', () => {
    const blocks = calculateBloquesForPair(a, b, scores, course, config(3, 9), [], 1, 3, 100, true, 2, 9);
    expect(blocks).toHaveLength(3);
    expect(blocks.at(-1)?.amountAtStake).toBe(200);
  });
  it('uses the bilateral amount and leaves other rivals unchanged', () => {
    const cfg = config(3);
    cfg.bloques.lastBlockMultipliers = { [getBloquesPairKey(b.id, a.id)]: 2 };
    cfg.betOverrides = [{ playerAId: a.id, playerBId: b.id, betType: 'Bloques', enabled: true, amountOverride: 150 }];
    const result = calculateBloquesBets(players, scores, cfg, course);
    expect(result.find(r => r.playerId === a.id && r.vsPlayer === b.id)?.amount).toBe(1050);
    expect(result.find(r => r.playerId === b.id && r.vsPlayer === a.id)?.amount).toBe(-1050);
    expect(result.find(r => r.playerId === a.id && r.vsPlayer === 'c')?.amount).toBe(600);
  });
  it('selects ×2 and restores ×1 when switched off', () => {
    function Harness() {
      const [pressed, setPressed] = useState(false);
      const blocks = calculateBloquesForPair(a, b, scores, course, config(3), [], 1, 3, 100, true, pressed ? 2 : 1);
      const last = blocks.at(-1);
      return last ? <><BloquesLastBlockPress block={last} onChange={setPressed} /><output data-testid="stake">{last.amountAtStake}</output></> : null;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByTestId('stake').textContent).toBe('200');
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByTestId('stake').textContent).toBe('100');
    cleanup();
  });
});