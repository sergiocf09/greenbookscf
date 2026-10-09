import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WolfDecisionPanel } from '@/components/bets/WolfDecisionPanel';
import type { Player, WolfConfig } from '@/types/golf';

vi.mock('@/i18n/tr', () => ({ trs: (s: string) => s }));
vi.mock('@/components/PlayerAvatar', () => ({ PlayerAvatar: () => null }));
const players: Player[] = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: `Player${i}`, initials: `P${i}`, color: '', handicap: 0 }));
const config: WolfConfig = { roundId: 'round', holeValue: 60, scoringMode: 'lowBall', useHandicap: false, timing: 'B', carryover: true, playerOrder: players.map(p => p.id), participantIds: players.map(p => p.id) };
const mount = () => {
  const onDecision = vi.fn().mockResolvedValue(undefined);
  render(<WolfDecisionPanel holeNumber={18} players={players} wolfPlayerId="p2" regularWolfPlayerId="p2"
    holeState={null} wolfConfig={config} isOrganizer currentUserId={null} onDecision={onDecision}
    redemptionCandidateId="p0" redemptionCandidateLoss={150} />);
  return onDecision;
};
afterEach(cleanup);
describe('Wolf H18 optional three-step recovery', () => {
  it('accepts, chooses all-in, then saves partner and mode', async () => {
    const onDecision = mount();
    fireEvent.click(screen.getByRole('button', { name: '🐺 Sí, tomo La Loba' }));
    expect(onDecision).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Opción B/ }));
    expect(screen.getByRole('button', { name: 'Con pareja' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Player1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Con pareja' }));
    await waitFor(() => expect(onDecision).toHaveBeenCalledWith(['p1'], false, 'all_in'));
  });
  it('accepts normal and allows solo ×2', async () => {
    const onDecision = mount();
    fireEvent.click(screen.getByRole('button', { name: '🐺 Sí, tomo La Loba' }));
    fireEvent.click(screen.getByRole('button', { name: /Opción A/ }));
    fireEvent.click(screen.getByRole('button', { name: '🐺 Solo ×2' }));
    await waitFor(() => expect(onDecision).toHaveBeenCalledWith([], true, 'normal'));
  });
  it('declining uses rotational wolf and saves no recovery mode', async () => {
    const onDecision = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Declinar' }));
    expect(screen.queryByRole('button', { name: 'Player2' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Player0' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '🐺 Solo ×2' }));
    await waitFor(() => expect(onDecision).toHaveBeenCalledWith([], true, undefined));
  });
});