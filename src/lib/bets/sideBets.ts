/**
 * Side Bets Calculator — direct money capture between players
 */
import { Player, BetConfig } from '@/types/golf';
import { BetSummary } from './shared';

export const calculateSideBets = (
  players: Player[],
  config: BetConfig
): BetSummary[] => {
  if (!config.sideBets?.enabled || !config.sideBets.bets?.length) return [];
  
  const summaries: BetSummary[] = [];
  
  const resolveToLocalId = (rawId: string): string => {
    if (players.some(p => p.id === rawId)) return rawId;
    const byProfile = players.find(p => p.profileId === rawId);
    if (byProfile) return byProfile.id;
    return rawId;
  };
  
  const validBets = config.sideBets.bets.filter(bet => 
    bet.winners?.length > 0 && bet.losers?.length > 0 && bet.amount > 0 && !bet.deleted
  );
  
  validBets.forEach(bet => {
    bet.winners.forEach(rawWinnerId => {
      const winnerId = resolveToLocalId(rawWinnerId);
      bet.losers.forEach(rawLoserId => {
        const loserId = resolveToLocalId(rawLoserId);
        summaries.push({ playerId: winnerId, vsPlayer: loserId, betType: 'Side Bet', amount: bet.amount, segment: 'total', description: bet.description || 'Side Bet', betId: bet.id });
        summaries.push({ playerId: loserId, vsPlayer: winnerId, betType: 'Side Bet', amount: -bet.amount, segment: 'total', description: bet.description || 'Side Bet', betId: bet.id });
      });
    });
  });
  
  return summaries;
};
