import { BetConfig, BetOverride, Player } from '@/types/golf';
import { BetSummary } from '@/lib/betCalculations';

const EXCLUDED_BET_TYPES = new Set([
  'Carritos Front',
  'Carritos Back',
  'Carritos Total',
  'Presiones Parejas',
  'Presiones Pareja',
  'Side Bet',
]);

const normalizeType = (value: string): string =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');

const mapBetTypeToOverrideCandidates = (betType: string): string[] => {
  if (betType.startsWith('Medal') && betType !== 'Medal General') return ['Medal', 'medal'];
  if (betType.startsWith('Presiones') && betType !== 'Presiones Parejas' && betType !== 'Presiones Pareja') return ['Presiones', 'pressures'];
  if (betType.startsWith('Skins')) return ['Skins', 'skins'];
  if (betType === 'Caros') return ['Caros', 'caros'];
  if (betType === 'Oyes') return ['Oyes', 'oyeses'];
  if (betType === 'Unidades') return ['Unidades', 'units'];
  if (betType === 'Manchas') return ['Manchas', 'manchas'];
  if (betType === 'Culebras') return ['Culebras', 'culebras'];
  if (betType.includes('Pingüino')) return ['Pingüinos', 'pinguinos'];
  if (betType === 'Coneja') return ['Coneja', 'coneja'];
  if (betType === 'Putts' || betType.startsWith('Putts')) return ['Putts', 'putts'];
  if (betType === 'Side Bet') return ['Side Bet', 'sideBets', 'sidebets'];
  if (betType === 'Stableford') return ['Stableford', 'stableford'];
  return [betType];
};

const getPlayerAliases = (playerId: string, players: Player[]): Set<string> => {
  const aliases = new Set<string>([playerId]);
  const direct = players.find((p) => p.id === playerId);
  if (direct?.profileId) aliases.add(direct.profileId);

  const byProfile = players.find((p) => p.profileId === playerId);
  if (byProfile?.id) aliases.add(byProfile.id);

  return aliases;
};

const matchesPlayer = (overrideId: string, playerId: string, players: Player[]): boolean => {
  const aliases = getPlayerAliases(playerId, players);
  return aliases.has(overrideId);
};

export const isCrossGroupPairInMap = (
  crossGroupRivalsMap: Record<string, string[] | undefined>,
  playerId: string,
  rivalId: string
): boolean => {
  const playerRivals = crossGroupRivalsMap[playerId] || [];
  if (playerRivals.includes(rivalId)) return true;

  const rivalRivals = crossGroupRivalsMap[rivalId] || [];
  if (rivalRivals.includes(playerId)) return true;

  return false;
};

export const isBetDisabledForPairInCrossGroup = (
  betType: string,
  playerId: string,
  rivalId: string,
  betOverrides: BetOverride[] | undefined,
  allPlayersForCalculations: Player[]
): boolean => {
  const acceptable = mapBetTypeToOverrideCandidates(betType).map(normalizeType);

  const override = betOverrides?.find((candidate) => {
    const type = normalizeType(candidate.betType || '');
    const matchesType = acceptable.some((normalized) => type === normalized || type.includes(normalized));
    if (!matchesType) return false;

    const matchesPair =
      (matchesPlayer(candidate.playerAId, playerId, allPlayersForCalculations) &&
        matchesPlayer(candidate.playerBId, rivalId, allPlayersForCalculations)) ||
      (matchesPlayer(candidate.playerAId, rivalId, allPlayersForCalculations) &&
        matchesPlayer(candidate.playerBId, playerId, allPlayersForCalculations));

    return matchesPair;
  });

  return override?.enabled === false;
};

interface GetCrossGroupPairBalanceParams {
  playerId: string;
  rivalId: string;
  betSummaries: BetSummary[];
  betOverrides?: BetOverride[];
  allPlayersForCalculations: Player[];
}

export const getCrossGroupPairBalance = ({
  playerId,
  rivalId,
  betSummaries,
  betOverrides,
  allPlayersForCalculations,
}: GetCrossGroupPairBalanceParams): number => {
  return betSummaries
    .filter(
      (summary) =>
        summary.playerId === playerId &&
        summary.vsPlayer === rivalId &&
        !EXCLUDED_BET_TYPES.has(summary.betType) &&
        !isBetDisabledForPairInCrossGroup(
          summary.betType,
          playerId,
          rivalId,
          betOverrides,
          allPlayersForCalculations
        )
    )
    .reduce((sum, summary) => sum + summary.amount, 0);
};

/**
 * Cross-group pairs are settled by running the engine on a synthetic 2-player
 * context. Team bets (Presiones por Parejas, Carritos) ignore the player list and
 * would be recalculated with every team in the round, so they are removed here:
 * the main engine already settles them once with their real players.
 */
export const stripTeamBetsForCrossPair = (config: BetConfig): BetConfig => ({
  ...config,
  teamPressures: config.teamPressures
    ? { ...config.teamPressures, bets: [] }
    : config.teamPressures,
  carritos: config.carritos ? { ...config.carritos, enabled: false } : config.carritos,
  carritosTeams: [],
});

/**
 * Keep only summaries that belong exactly to the cross-group pair. Any entry
 * involving a third player came from a bet that is not this pair's and must never
 * be re-attributed to it.
 */
export const keepCrossPairSummaries = <T extends { playerId: string; vsPlayer: string }>(
  summaries: T[],
  playerAId: string,
  playerBId: string,
): T[] =>
  summaries.filter(
    (s) =>
      (s.playerId === playerAId && s.vsPlayer === playerBId) ||
      (s.playerId === playerBId && s.vsPlayer === playerAId),
  );

/**
 * Single source for the synthetic 2-player config used to settle a cross-group
 * pair, shared by the live dashboard and the close engine so both settle the
 * same bets: only this pair's handicap and overrides, no group overrides,
 * participant lists cleared (`undefined` = both play; G1's lists must never
 * exclude a G2/G3 rival), and pool/group-scoped/team bets disabled because the
 * main engine already settles them once.
 */
export const buildCrossPairConfig = (
  config: BetConfig,
  bilateral: NonNullable<BetConfig['bilateralHandicaps']>[number],
  pairOverrides: BetOverride[],
): BetConfig => ({
  ...stripTeamBetsForCrossPair(config),
  bilateralHandicaps: [bilateral],
  betOverrides: pairOverrides,
  groupBetOverrides: {},
  medal: { ...config.medal, participantIds: undefined },
  pressures: { ...config.pressures, participantIds: undefined },
  skins: { ...config.skins, participantIds: undefined },
  caros: { ...config.caros, participantIds: undefined },
  units: { ...config.units, participantIds: undefined },
  putts: { ...config.putts, participantIds: undefined },
  stableford: { ...config.stableford, participantIds: undefined },
  medalGeneral: { ...config.medalGeneral, enabled: false },
  manchas: { ...config.manchas, enabled: false },
  culebras: { ...config.culebras, enabled: false },
  pinguinos: { ...config.pinguinos, enabled: false },
  zoologico: { ...config.zoologico, enabled: false },
  coneja: { ...config.coneja, enabled: false },
  oyeses: { ...config.oyeses, enabled: false },
  rayas: { ...config.rayas, enabled: false },
  sideBets: { bets: [], enabled: false },
} as BetConfig);
