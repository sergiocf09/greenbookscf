import { BetConfig, BetOverride, Player } from '@/types/golf';

export type TeamSettlementBet = 'wolf' | 'sixes' | 'vegas';

export const TEAM_SETTLEMENT_BET_IDS: Record<TeamSettlementBet, string> = {
  wolf: 'wolf-primary',
  sixes: 'sixes-primary',
  vegas: 'vegas-primary',
};

export const isTeamSettlementBetDisabled = (
  config: Pick<BetConfig, 'disabledTeamBetIds'>,
  bet: TeamSettlementBet
): boolean => (config.disabledTeamBetIds || []).includes(TEAM_SETTLEMENT_BET_IDS[bet]);

export const isWolfSettlementActive = (config: Pick<BetConfig, 'wolfSetup' | 'disabledTeamBetIds'>): boolean =>
  config.wolfSetup?.enabled === true && !isTeamSettlementBetDisabled(config, 'wolf');

export const isSixesSettlementActive = (config: Pick<BetConfig, 'sixesEnabled' | 'sixesBets' | 'disabledTeamBetIds'>): boolean =>
  (config.sixesEnabled ?? ((config.sixesBets ?? []).length > 0)) &&
  (config.sixesBets ?? []).length > 0 &&
  !isTeamSettlementBetDisabled(config, 'sixes');

export const isVegasSettlementActive = (config: Pick<BetConfig, 'vegasEnabled' | 'vegasBets' | 'disabledTeamBetIds'>): boolean =>
  (config.vegasEnabled ?? ((config.vegasBets ?? []).length > 0)) &&
  (config.vegasBets ?? []).length > 0 &&
  !isTeamSettlementBetDisabled(config, 'vegas');

type LedgerLike = {
  fromPlayerId: string;
  toPlayerId: string;
  amount: number;
  betType: string;
};

const LEDGER_BET_TYPE_TO_TEAM_BET: Record<string, TeamSettlementBet> = {
  wolf: 'wolf',
  loba: 'wolf',
  sixes: 'sixes',
  vegas: 'vegas',
};

const normalizeBetType = (betType: string): string =>
  betType.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const resolvePlayerId = (playerId: string, players: Pick<Player, 'id' | 'profileId'>[]): string => {
  const player = players.find(p => p.id === playerId || (!!p.profileId && p.profileId === playerId));
  return player?.id ?? playerId;
};

const overrideAppliesToLedgerEntry = (
  override: BetOverride,
  entry: LedgerLike,
  players: Pick<Player, 'id' | 'profileId'>[]
): boolean => {
  if (override.enabled !== false) return false;
  const overrideTeamBet = LEDGER_BET_TYPE_TO_TEAM_BET[normalizeBetType(override.betType)];
  const entryTeamBet = LEDGER_BET_TYPE_TO_TEAM_BET[normalizeBetType(entry.betType)];
  if (!overrideTeamBet || overrideTeamBet !== entryTeamBet) return false;

  const playerAId = resolvePlayerId(override.playerAId, players);
  const playerBId = resolvePlayerId(override.playerBId, players);
  return (
    (playerAId === entry.fromPlayerId && playerBId === entry.toPlayerId) ||
    (playerAId === entry.toPlayerId && playerBId === entry.fromPlayerId)
  );
};

export const getCanceledTeamBetLedgerViolations = (
  config: Pick<BetConfig, 'wolfSetup' | 'sixesEnabled' | 'sixesBets' | 'vegasEnabled' | 'vegasBets' | 'disabledTeamBetIds' | 'betOverrides'>,
  ledger: LedgerLike[],
  players: Pick<Player, 'id' | 'profileId'>[] = []
): string[] => {
  const activeByBet: Record<TeamSettlementBet, boolean> = {
    wolf: isWolfSettlementActive(config),
    sixes: isSixesSettlementActive(config),
    vegas: isVegasSettlementActive(config),
  };

  return ledger.flatMap(entry => {
    const teamBet = LEDGER_BET_TYPE_TO_TEAM_BET[normalizeBetType(entry.betType)];
    if (!teamBet || entry.amount <= 0) return [];

    const pairLabel = `${entry.fromPlayerId}::${entry.toPlayerId}`;
    const violations: string[] = [];
    if (!activeByBet[teamBet]) {
      violations.push(`Canceled ${entry.betType} ledger entry recreated for pair ${pairLabel}`);
    }
    if ((config.betOverrides || []).some(override => overrideAppliesToLedgerEntry(override, entry, players))) {
      violations.push(`Pair-canceled ${entry.betType} ledger entry recreated for pair ${pairLabel}`);
    }
    return violations;
  });
};

export const assertNoCanceledTeamBetLedgerEntries = (
  config: Pick<BetConfig, 'wolfSetup' | 'sixesEnabled' | 'sixesBets' | 'vegasEnabled' | 'vegasBets' | 'disabledTeamBetIds' | 'betOverrides'>,
  ledger: LedgerLike[],
  players: Pick<Player, 'id' | 'profileId'>[] = []
): void => {
  const violations = getCanceledTeamBetLedgerViolations(config, ledger, players);
  if (violations.length > 0) {
    throw new Error(`Canceled team bet ledger validation failed: ${violations.join('; ')}`);
  }
};