import { describe, expect, it } from 'vitest';
import { defaultBetConfig } from '@/components/setup/bets/defaultBetConfig';
import { BetConfig } from '@/types/golf';
import {
  isSixesSettlementActive,
  isVegasSettlementActive,
  isWolfSettlementActive,
  TEAM_SETTLEMENT_BET_IDS,
} from '@/lib/teamBetPersistence';

const baseConfig = (): BetConfig => ({
  ...defaultBetConfig,
  disabledTeamBetIds: [],
  wolfSetup: { ...defaultBetConfig.wolfSetup!, enabled: true },
  sixesEnabled: true,
  sixesBets: [
    {
      id: 'sixes-primary',
      scoringMode: 'lowBall',
      cobro: 'per_set',
      amount: 100,
      useHandicap: true,
      sets: [{ setNumber: 1, team1: ['p1', 'p2'], team2: ['p3', 'p4'] }],
    },
  ],
  vegasEnabled: true,
  vegasBets: [
    {
      id: 'vegas-primary',
      valuePerPoint: 10,
      useHandicap: false,
      birdieMultiplier: false,
      variant: 'fixed',
      playerAId: 'p1',
      playerBId: 'p2',
      playerCId: 'p3',
      playerDId: 'p4',
    },
  ],
});

describe('team bet persistence guards', () => {
  it('keeps Vegas, Sixes and Loba active only when setup/matrix are present', () => {
    const config = baseConfig();

    expect(isWolfSettlementActive(config)).toBe(true);
    expect(isSixesSettlementActive(config)).toBe(true);
    expect(isVegasSettlementActive(config)).toBe(true);
  });

  it('removes Loba from balance calculations when setup disables it', () => {
    const config = baseConfig();
    config.wolfSetup = { ...config.wolfSetup!, enabled: false };

    expect(isWolfSettlementActive(config)).toBe(false);
  });

  it('removes Sixes and Vegas from balances when the setup matrix no longer has the bet', () => {
    const config = baseConfig();
    config.sixesBets = [];
    config.vegasBets = [];

    expect(isSixesSettlementActive(config)).toBe(false);
    expect(isVegasSettlementActive(config)).toBe(false);
  });

  it('removes Sixes and Vegas from balances when explicit enabled persistence is false', () => {
    const config = baseConfig();
    config.sixesEnabled = false;
    config.vegasEnabled = false;

    expect(isSixesSettlementActive(config)).toBe(false);
    expect(isVegasSettlementActive(config)).toBe(false);
  });

  it('removes Vegas, Sixes and Loba from balances when dashboard overrides cancel them', () => {
    const config = baseConfig();
    config.disabledTeamBetIds = [
      TEAM_SETTLEMENT_BET_IDS.wolf,
      TEAM_SETTLEMENT_BET_IDS.sixes,
      TEAM_SETTLEMENT_BET_IDS.vegas,
    ];

    expect(isWolfSettlementActive(config)).toBe(false);
    expect(isSixesSettlementActive(config)).toBe(false);
    expect(isVegasSettlementActive(config)).toBe(false);
  });
});