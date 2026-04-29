import { describe, expect, it } from 'vitest';
import { defaultBetConfig } from '@/components/setup/bets/defaultBetConfig';
import { BetConfig } from '@/types/golf';
import {
  assertNoCanceledTeamBetLedgerEntries,
  getCanceledTeamBetLedgerViolations,
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

  it('detects recreated ledger rows by canceled bet type', () => {
    const config = baseConfig();
    config.disabledTeamBetIds = [TEAM_SETTLEMENT_BET_IDS.wolf, TEAM_SETTLEMENT_BET_IDS.sixes, TEAM_SETTLEMENT_BET_IDS.vegas];
    const ledger = [
      { fromPlayerId: 'p2', toPlayerId: 'p1', amount: 100, betType: 'Wolf' },
      { fromPlayerId: 'p3', toPlayerId: 'p1', amount: 50, betType: 'Sixes' },
      { fromPlayerId: 'p4', toPlayerId: 'p2', amount: 25, betType: 'Vegas' },
    ];

    const violations = getCanceledTeamBetLedgerViolations(config, ledger);

    expect(violations).toHaveLength(3);
    expect(violations[0]).toContain('Wolf');
    expect(violations[1]).toContain('Sixes');
    expect(violations[2]).toContain('Vegas');
  });

  it('detects recreated ledger rows by canceled bet pair', () => {
    const config = baseConfig();
    config.betOverrides = [{ playerAId: 'p1', playerBId: 'p2', betType: 'Vegas', enabled: false }];
    const ledger = [
      { fromPlayerId: 'p2', toPlayerId: 'p1', amount: 100, betType: 'Vegas' },
      { fromPlayerId: 'p4', toPlayerId: 'p3', amount: 100, betType: 'Vegas' },
    ];

    const violations = getCanceledTeamBetLedgerViolations(config, ledger);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('p2::p1');
  });

  it('throws before snapshot persistence if canceled team ledger rows are present', () => {
    const config = baseConfig();
    config.sixesBets = [];

    expect(() =>
      assertNoCanceledTeamBetLedgerEntries(config, [
        { fromPlayerId: 'p2', toPlayerId: 'p1', amount: 100, betType: 'Sixes' },
      ])
    ).toThrow(/Canceled team bet ledger validation failed/);
  });
});