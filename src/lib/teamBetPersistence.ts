import { BetConfig } from '@/types/golf';

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