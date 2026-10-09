import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
let root: Root | undefined;
let container: HTMLDivElement;
const button = (name: string | RegExp) => {
  const found = [...container.querySelectorAll('button')].find(b => typeof name === 'string' ? b.textContent === name : name.test(b.textContent ?? ''));
  if (!found) throw new Error(`Button not found: ${name}`);
  return found;
};
const click = async (name: string | RegExp) => { await act(async () => { button(name).click(); }); };
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { WolfDecisionPanel } from '@/components/bets/WolfDecisionPanel';
import type { Player, WolfConfig } from '@/types/golf';

vi.mock('@/i18n/tr', () => ({ trs: (s: string) => s }));
vi.mock('@/components/PlayerAvatar', () => ({ PlayerAvatar: () => null }));
const players: Player[] = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: `Player${i}`, initials: `P${i}`, color: '', handicap: 0 }));
const config: WolfConfig = { roundId: 'round', holeValue: 60, scoringMode: 'lowBall', useHandicap: false, timing: 'B', carryover: true, playerOrder: players.map(p => p.id), participantIds: players.map(p => p.id) };
const mount = () => {
  const onDecision = vi.fn().mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<WolfDecisionPanel holeNumber={18} players={players} wolfPlayerId="p2" regularWolfPlayerId="p2"
    holeState={null} wolfConfig={config} isOrganizer currentUserId={null} onDecision={onDecision}
    redemptionCandidateId="p0" redemptionCandidateLoss={150} />));
  return onDecision;
};
afterEach(() => { act(() => root?.unmount()); container.remove(); });
describe('Wolf H18 optional three-step recovery', () => {
  it('accepts, chooses all-in, then saves partner and mode', async () => {
    const onDecision = mount();
    await click('🐺 Sí, tomo La Loba');
    expect(onDecision).not.toHaveBeenCalled();
    await click(/Opción B/);
    expect(button('Con pareja').disabled).toBe(true);
    await click('Player1');
    await click('Con pareja');
    expect(onDecision).toHaveBeenCalledWith(['p1'], false, 'all_in');
  });
  it('accepts normal and allows solo ×2', async () => {
    const onDecision = mount();
    await click('🐺 Sí, tomo La Loba');
    await click(/Opción A/);
    await click('🐺 Solo ×2');
    expect(onDecision).toHaveBeenCalledWith([], true, 'normal');
  });
  it('declining uses rotational wolf and saves no recovery mode', async () => {
    const onDecision = mount();
    await click('Declinar');
    expect(() => button('Player2')).toThrow();
    expect(button('Player0')).toBeDefined();
    await click('🐺 Solo ×2');
    expect(onDecision).toHaveBeenCalledWith([], true, undefined);
  });
});