/**
 * Stableford Bet Calculator — point-based scoring group pool
 */
import { Player, PlayerScore, BetConfig, GolfCourse } from '@/types/golf';
import { calculateStrokesPerHole } from '../handicapUtils';
import { BetSummary } from './shared';

export const calculateStablefordBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse
): BetSummary[] => {
  if (!config.stableford?.enabled || players.length < 2) return [];
  
  const summaries: BetSummary[] = [];
  const amount = config.stableford.amount ?? 100;
  const points = config.stableford.points;
  const playerHandicaps = config.stableford.playerHandicaps || [];
  
  const playerPoints: { playerId: string; points: number }[] = [];
  
  players.forEach(player => {
    const playerScores = scores.get(player.id) || [];
    const confirmedScores = playerScores.filter(s => s.confirmed && s.strokes > 0);
    if (confirmedScores.length === 0) return;
    
    const playerHcp = playerHandicaps.find(ph => ph.playerId === player.id);
    const handicap = playerHcp?.handicap ?? player.handicap;
    const strokesPerHole = calculateStrokesPerHole(handicap, course);
    
    let totalPoints = 0;
    confirmedScores.forEach(score => {
      const holePar = course.holes[score.holeNumber - 1]?.par || 4;
      const strokesReceived = strokesPerHole[score.holeNumber - 1] || 0;
      const netScore = score.strokes - strokesReceived;
      const toPar = netScore - holePar;
      
      if (toPar <= -3) totalPoints += points.albatross;
      else if (toPar === -2) totalPoints += points.eagle;
      else if (toPar === -1) totalPoints += points.birdie;
      else if (toPar === 0) totalPoints += points.par;
      else if (toPar === 1) totalPoints += points.bogey;
      else if (toPar === 2) totalPoints += points.doubleBogey;
      else if (toPar === 3) totalPoints += points.tripleBogey;
      else totalPoints += points.quadrupleOrWorse;
    });
    
    playerPoints.push({ playerId: player.id, points: totalPoints });
  });
  
  if (playerPoints.length < 2) return [];
  
  const maxPoints = Math.max(...playerPoints.map(p => p.points));
  const winners = playerPoints.filter(p => p.points === maxPoints);
  const losers = playerPoints.filter(p => p.points !== maxPoints);
  
  if (losers.length === 0) return [];
  
  losers.forEach(loser => {
    const amountToPayPerWinner = Math.round(amount / winners.length);
    winners.forEach(winner => {
      summaries.push({ playerId: loser.playerId, vsPlayer: winner.playerId, betType: 'Stableford', amount: -amountToPayPerWinner, segment: 'total', description: `${loser.points} vs ${winner.points} pts` });
      summaries.push({ playerId: winner.playerId, vsPlayer: loser.playerId, betType: 'Stableford', amount: amountToPayPerWinner, segment: 'total', description: `${winner.points} vs ${loser.points} pts` });
    });
  });
  
  return summaries;
};
