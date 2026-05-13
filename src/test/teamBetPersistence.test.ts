import { describe, expect, it } from 'vitest';
import { defaultBetConfig } from '@/components/setup/bets/defaultBetConfig';
import { BetConfig, GolfCourse, Player, PlayerScore, SixesConfig, VegasConfig, defaultMarkerState } from '@/types/golf';
import { calculateSixesBets } from '@/lib/bets/sixes';
import { calculateVegasBets } from '@/lib/bets/vegas';
import { calculateCarritosBets } from '@/lib/bets/carritos';
import { generateRoundSnapshot } from '@/lib/roundSnapshot';
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

const players: Player[] = [
  { id: 'p1', name: 'A', initials: 'A', color: '#000', handicap: 0 },
  { id: 'p2', name: 'B', initials: 'B', color: '#000', handicap: 0 },
  { id: 'p3', name: 'C', initials: 'C', color: '#000', handicap: 0 },
  { id: 'p4', name: 'D', initials: 'D', color: '#000', handicap: 0 },
];

const course: GolfCourse = {
  id: 'c1',
  name: 'Test',
  location: 'Test',
  holes: Array.from({ length: 18 }, (_, index) => ({
    number: index + 1,
    par: 4,
    handicapIndex: index + 1,
  })),
};

const scores = new Map<string, PlayerScore[]>(players.map((p) => [
  p.id,
  Array.from({ length: 18 }, (_, index) => ({
    playerId: p.id,
    holeNumber: index + 1,
    strokes: index === 0 && (p.id === 'p1' || p.id === 'p2') ? 5 : 4,
    putts: 2,
    markers: defaultMarkerState,
    strokesReceived: 0,
    netScore: index === 0 && (p.id === 'p1' || p.id === 'p2') ? 5 : 4,
    confirmed: true,
  })),
]));

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

  it('uses persisted Sixes team handicaps so close-engine totals match the dashboard totals', () => {
    const sixesConfig: SixesConfig = {
      roundId: 'r1',
      scoringMode: 'lowBall',
      cobro: 'per_hole',
      amount: 90,
      useHandicap: true,
      sets: [{ setNumber: 1, team1: ['p1', 'p2'], team2: ['p3', 'p4'] }],
      teamHandicaps: { p1: 18, p2: 18, p3: 0, p4: 0 },
    };

    const dbOnlySixesConfig = { ...sixesConfig, teamHandicaps: undefined, handicapConfig: undefined };
    const dashboardSummaries = calculateSixesBets(players, scores, sixesConfig, course, sixesConfig.teamHandicaps);
    const closeEngineWithoutPersistedHandicaps = calculateSixesBets(players, scores, dbOnlySixesConfig, course);
    const closeEngineWithPersistedHandicaps = calculateSixesBets(players, scores, sixesConfig, course, sixesConfig.teamHandicaps);

    expect(dashboardSummaries.filter((s) => s.amount > 0).reduce((sum, s) => sum + s.amount, 0)).toBeGreaterThan(0);
    expect(closeEngineWithoutPersistedHandicaps).not.toEqual(dashboardSummaries);
    expect(closeEngineWithPersistedHandicaps).toEqual(dashboardSummaries);
  });

  it('uses persisted Vegas team handicaps so close-engine totals match the dashboard totals', () => {
    const vegasConfig: VegasConfig = {
      roundId: 'r1',
      valuePerPoint: 10,
      useHandicap: true,
      birdieMultiplier: false,
      variant: 'fixed',
      playerAId: 'p1',
      playerBId: 'p2',
      playerCId: 'p3',
      playerDId: 'p4',
      teamHandicaps: { p1: 18, p2: 18, p3: 0, p4: 0 },
    };

    const dbOnlyVegasConfig = { ...vegasConfig, teamHandicaps: undefined, handicapConfig: undefined };
    const dashboardSummaries = calculateVegasBets(players, scores, vegasConfig, course, vegasConfig.teamHandicaps);
    const closeEngineWithoutPersistedHandicaps = calculateVegasBets(players, scores, dbOnlyVegasConfig, course);
    const closeEngineWithPersistedHandicaps = calculateVegasBets(players, scores, vegasConfig, course, vegasConfig.teamHandicaps);

    expect(dashboardSummaries.filter((s) => s.amount > 0).reduce((sum, s) => sum + s.amount, 0)).toBeGreaterThan(0);
    expect(closeEngineWithoutPersistedHandicaps).not.toEqual(dashboardSummaries);
    expect(closeEngineWithPersistedHandicaps).toEqual(dashboardSummaries);
  });

  it('preserves multiple Carritos team bets with identical pair amounts in the snapshot ledger', () => {
    const config: BetConfig = {
      ...defaultBetConfig,
      carritos: { ...defaultBetConfig.carritos, enabled: true },
      carritosTeams: [
        {
          id: 'carritos-a',
          teamA: ['p1', 'p2'],
          teamB: ['p3', 'p4'],
          frontAmount: 100,
          backAmount: 100,
          totalAmount: 100,
          scoringType: 'all',
          enabled: true,
        },
        {
          id: 'carritos-b',
          teamA: ['p1', 'p2'],
          teamB: ['p3', 'p4'],
          frontAmount: 100,
          backAmount: 100,
          totalAmount: 100,
          scoringType: 'all',
          enabled: true,
        },
      ],
    };

    const summaries = calculateCarritosBets(players, scores, config, course);
    const snapshot = generateRoundSnapshot(
      'round-carritos-duplicates',
      course,
      players,
      scores,
      config,
      summaries,
      'white',
      1,
      '2026-05-08'
    );

    const carritosFront = snapshot.ledger.filter((entry) => entry.betType === 'Carritos Front');
    const carritosTotal = snapshot.ledger.filter((entry) => entry.betType === 'Carritos Total');

    expect(carritosFront).toHaveLength(8);
    expect(carritosTotal).toHaveLength(8);
    expect(carritosFront.reduce((sum, entry) => sum + entry.amount, 0)).toBe(400);
    expect(carritosTotal.reduce((sum, entry) => sum + entry.amount, 0)).toBe(400);
  });
});