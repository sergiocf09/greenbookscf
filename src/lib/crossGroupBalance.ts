import { BetOverride, Player } from '@/types/golf';
import { BetSummary } from '@/lib/betCalculations';

const EXCLUDED_BET_TYPES = new Set([
  'Carritos Front',
  'Carritos Back',
  'Carritos Total',
  'Presiones Parejas',
  'Presiones Pareja',
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
