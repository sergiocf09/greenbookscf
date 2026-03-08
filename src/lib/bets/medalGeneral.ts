/**
 * Medal General Bet Calculator — group pool, lowest net wins
 */
import { Player, PlayerScore, BetConfig, GolfCourse } from '@/types/golf';
import { calculateStrokesPerHole } from '../handicapUtils';
import { BetSummary } from './shared';

export const calculateMedalGeneralBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse
): BetSummary[] => {
  const summaries: BetSummary[] = [];
  
  if (!config.medalGeneral?.enabled || players.length < 2) return summaries;
  
  const amount = config.medalGeneral.amount ?? 100;
  const playerHandicaps = config.medalGeneral.playerHandicaps || [];
  
  const playerNetTotals: { playerId: string; netTotal: number; grossTotal: number }[] = [];
  
  players.forEach(player => {
    const playerScores = scores.get(player.id) || [];
    const confirmedScores = playerScores.filter(s => s.confirmed && s.strokes > 0);
    if (confirmedScores.length === 0) return;
    
    const playerHcp = playerHandicaps.find(ph => ph.playerId === player.id);
    const handicap = playerHcp?.handicap ?? player.handicap;
    const strokesPerHole = calculateStrokesPerHole(handicap, course);
    
    const grossTotal = confirmedScores.reduce((sum, s) => sum + s.strokes, 0);
    const netTotal = confirmedScores.reduce((sum, s) => {
      const received = strokesPerHole[s.holeNumber - 1] || 0;
      return sum + (s.strokes - received);
    }, 0);
    
    playerNetTotals.push({ playerId: player.id, netTotal, grossTotal });
  });
  
  if (playerNetTotals.length < 2) return summaries;
  
  const minNetTotal = Math.min(...playerNetTotals.map(p => p.netTotal));
  const winners = playerNetTotals.filter(p => p.netTotal === minNetTotal);
  const losers = playerNetTotals.filter(p => p.netTotal !== minNetTotal);
  
  if (losers.length === 0) return summaries;
  
  losers.forEach(loser => {
    const amountToPayPerWinner = amount / winners.length;
    winners.forEach(winner => {
      summaries.push({ playerId: loser.playerId, vsPlayer: winner.playerId, betType: 'Medal General', amount: -amountToPayPerWinner, segment: 'total', description: `Neto ${loser.netTotal} vs ${winner.netTotal}${winners.length > 1 ? ' (empate dividido)' : ''}` });
      summaries.push({ playerId: winner.playerId, vsPlayer: loser.playerId, betType: 'Medal General', amount: amountToPayPerWinner, segment: 'total', description: `Neto ${winner.netTotal} vs ${loser.netTotal}${winners.length > 1 ? ' (empate dividido)' : ''}` });
    });
  });
  
  return summaries;
};
