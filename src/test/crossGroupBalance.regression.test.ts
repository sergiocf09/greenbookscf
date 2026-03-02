import { describe, it, expect } from 'vitest';
import type { BetSummary } from '@/lib/betCalculations';
import type { BetOverride, Player } from '@/types/golf';
import { getCrossGroupPairBalance, isCrossGroupPairInMap } from '@/lib/crossGroupBalance';

const makePlayer = (id: string, profileId: string, initials: string): Player => ({
  id,
  profileId,
  initials,
  name: initials,
  color: '#000000',
  handicap: 0,
});

describe('cross-group balance regression', () => {
  it('does not leak Side Bets from unrelated pairs into AG vs RE', () => {
    const ag = makePlayer('ag-local', 'ag-profile', 'AG');
    const re = makePlayer('re-local', 're-profile', 'RE');
    const sc = makePlayer('sc-local', 'sc-profile', 'SC');

    const betSummaries: BetSummary[] = [
      { playerId: ag.id, vsPlayer: re.id, betType: 'Medal Total', amount: 250, segment: 'total' },
      { playerId: ag.id, vsPlayer: re.id, betType: 'Presiones Match 18', amount: 200, segment: 'total' },
      // Caros disabled for AG/RE should NOT count
      { playerId: ag.id, vsPlayer: re.id, betType: 'Caros', amount: 200, segment: 'total' },
      // Unrelated side bet AG vs SC should NOT leak into AG/RE
      { playerId: ag.id, vsPlayer: sc.id, betType: 'Side Bet', amount: 625, segment: 'total' },
    ];

    const betOverrides: BetOverride[] = [
      {
        playerAId: ag.profileId!,
        playerBId: re.id,
        betType: 'Caros',
        enabled: false,
      },
    ];

    const crossGroupRivalsMap = {
      [ag.id]: [re.id],
      [re.id]: [ag.id],
    };

    expect(isCrossGroupPairInMap(crossGroupRivalsMap, ag.id, re.id)).toBe(true);

    const pairBalance = getCrossGroupPairBalance({
      playerId: ag.id,
      rivalId: re.id,
      betSummaries,
      betOverrides,
      allPlayersForCalculations: [ag, re, sc],
    });

    expect(pairBalance).toBe(450);
  });

  it('matches bilateral header-style sum for the same cross-group pair', () => {
    const ag = makePlayer('ag-local', 'ag-profile', 'AG');
    const re = makePlayer('re-local', 're-profile', 'RE');

    const betSummaries: BetSummary[] = [
      { playerId: ag.id, vsPlayer: re.id, betType: 'Medal Total', amount: 300, segment: 'total' },
      { playerId: ag.id, vsPlayer: re.id, betType: 'Presiones Match 18', amount: 150, segment: 'total' },
      { playerId: ag.id, vsPlayer: re.id, betType: 'Carritos Front', amount: 100, segment: 'front' }, // excluded
    ];

    const iconAndTableBalance = getCrossGroupPairBalance({
      playerId: ag.id,
      rivalId: re.id,
      betSummaries,
      betOverrides: [],
      allPlayersForCalculations: [ag, re],
    });

    const bilateralHeaderLikeTotal = betSummaries
      .filter(
        (s) =>
          s.playerId === ag.id &&
          s.vsPlayer === re.id &&
          !['Carritos Front', 'Carritos Back', 'Carritos Total', 'Presiones Parejas', 'Presiones Pareja'].includes(s.betType)
      )
      .reduce((sum, s) => sum + s.amount, 0);

    expect(iconAndTableBalance).toBe(450);
    expect(iconAndTableBalance).toBe(bilateralHeaderLikeTotal);
  });
});
