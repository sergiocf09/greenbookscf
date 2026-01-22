// Group Bets Card - Medal General, Culebras, Pinguinos consolidated display
// Simplified view: Medal shows winners only, Culebras/Pinguinos show count + loser payment
import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Player, PlayerScore, BetConfig, GolfCourse } from '@/types/golf';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Users } from 'lucide-react';

interface GroupBetsCardProps {
  players: Player[];
  scores: Map<string, PlayerScore[]>;
  betConfig: BetConfig;
  course: GolfCourse;
  basePlayerId?: string;
}

interface MedalGeneralResult {
  enabled: boolean;
  amount: number;
  winners: Array<{
    playerId: string;
    name: string;
    initials: string;
    color: string;
    netScore: number;
    amountWon: number;
  }>;
  hasValidScores: boolean;
}

interface OccurrenceBetResult {
  enabled: boolean;
  type: 'culebras' | 'pinguinos';
  title: string;
  emoji: string;
  totalCount: number;
  valuePerOccurrence: number;
  loser: {
    playerId: string;
    name: string;
    initials: string;
    color: string;
    totalLoss: number;
  } | null;
}

export const GroupBetsCard: React.FC<GroupBetsCardProps> = ({
  players,
  scores,
  betConfig,
  course,
  basePlayerId,
}) => {
  // Calculate Medal General - only winners
  const medalGeneralResult = useMemo((): MedalGeneralResult | null => {
    if (!betConfig.medalGeneral?.enabled || players.length < 2) {
      return null;
    }

    const playerHandicaps = betConfig.medalGeneral.playerHandicaps || [];
    const amount = betConfig.medalGeneral.amount || 100;

    // Calculate net totals for each player
    const playerNetScores: Array<{ playerId: string; name: string; initials: string; color: string; netScore: number }> = [];

    players.forEach(player => {
      const playerScores = scores.get(player.id) || [];
      const confirmedScores = playerScores.filter(s => s.confirmed && s.strokes > 0);

      if (confirmedScores.length === 0) return;

      // Get Medal General handicap for this player
      const playerHcp = playerHandicaps.find(ph => ph.playerId === player.id);
      const handicap = playerHcp?.handicap ?? player.handicap;

      // Calculate strokes received per hole
      const strokesPerHole = calculateStrokesPerHole(handicap, course);

      // Calculate net total
      const netTotal = confirmedScores.reduce((sum, s) => {
        const received = strokesPerHole[s.holeNumber - 1] || 0;
        return sum + (s.strokes - received);
      }, 0);

      playerNetScores.push({
        playerId: player.id,
        name: player.name,
        initials: player.initials,
        color: player.color,
        netScore: netTotal,
      });
    });

    if (playerNetScores.length < 2) {
      return { enabled: true, amount, winners: [], hasValidScores: false };
    }

    // Find minimum net total (winners)
    const minNet = Math.min(...playerNetScores.map(p => p.netScore));
    const winners = playerNetScores.filter(p => p.netScore === minNet);
    const losersCount = playerNetScores.length - winners.length;

    // Calculate winnings: losers pay amount each, split among winners
    const totalPot = losersCount * amount;
    const amountPerWinner = winners.length > 0 ? totalPot / winners.length : 0;

    return {
      enabled: true,
      amount,
      winners: winners.map(w => ({
        ...w,
        amountWon: amountPerWinner,
      })),
      hasValidScores: true,
    };
  }, [players, scores, betConfig.medalGeneral, course]);

  // Calculate Culebras - show count and loser payment
  const culebrasResult = useMemo((): OccurrenceBetResult | null => {
    if (!betConfig.culebras?.enabled || players.length < 2) {
      return null;
    }

    const valuePerOccurrence = betConfig.culebras.valuePerOccurrence || 25;

    // Find all culebras (3+ putts)
    const allCulebras: { playerId: string; holeNumber: number; putts: number }[] = [];

    players.forEach(player => {
      const playerScores = scores.get(player.id) || [];
      playerScores.filter(s => s.confirmed).forEach(score => {
        if (score.putts >= 3) {
          allCulebras.push({
            playerId: player.id,
            holeNumber: score.holeNumber,
            putts: score.putts,
          });
        }
      });
    });

    const totalCount = allCulebras.length;

    // Find last player to pay (most recent culebra by hole number)
    let loser = null;
    if (allCulebras.length > 0) {
      const maxHole = Math.max(...allCulebras.map(c => c.holeNumber));
      const culebrasOnLastHole = allCulebras.filter(c => c.holeNumber === maxHole);
      const maxPutts = Math.max(...culebrasOnLastHole.map(c => c.putts));
      const loserCulebra = culebrasOnLastHole.find(c => c.putts === maxPutts);
      
      if (loserCulebra) {
        const loserPlayer = players.find(p => p.id === loserCulebra.playerId);
        if (loserPlayer) {
          const amountPerPlayer = totalCount * valuePerOccurrence;
          const totalLoss = amountPerPlayer * (players.length - 1);
          loser = {
            playerId: loserPlayer.id,
            name: loserPlayer.name,
            initials: loserPlayer.initials,
            color: loserPlayer.color,
            totalLoss,
          };
        }
      }
    }

    return {
      enabled: true,
      type: 'culebras',
      title: 'Culebras',
      emoji: '🐍',
      totalCount,
      valuePerOccurrence,
      loser,
    };
  }, [players, scores, betConfig.culebras]);

  // Calculate Pinguinos - show count and loser payment
  const pinguinosResult = useMemo((): OccurrenceBetResult | null => {
    if (!betConfig.pinguinos?.enabled || players.length < 2) {
      return null;
    }

    const valuePerOccurrence = betConfig.pinguinos.valuePerOccurrence || 25;

    // Find all pinguinos (triple bogey or worse = +3 or more over par)
    const allPinguinos: { playerId: string; holeNumber: number; overPar: number }[] = [];

    players.forEach(player => {
      const playerScores = scores.get(player.id) || [];
      playerScores.filter(s => s.confirmed).forEach(score => {
        const holePar = course.holes[score.holeNumber - 1]?.par || 4;
        const overPar = score.strokes - holePar;
        if (overPar >= 3) {
          allPinguinos.push({
            playerId: player.id,
            holeNumber: score.holeNumber,
            overPar,
          });
        }
      });
    });

    const totalCount = allPinguinos.length;

    // Find last player to pay
    let loser = null;
    if (allPinguinos.length > 0) {
      const maxHole = Math.max(...allPinguinos.map(p => p.holeNumber));
      const pinguinosOnLastHole = allPinguinos.filter(p => p.holeNumber === maxHole);
      const maxOverPar = Math.max(...pinguinosOnLastHole.map(p => p.overPar));
      const loserPinguino = pinguinosOnLastHole.find(p => p.overPar === maxOverPar);
      
      if (loserPinguino) {
        const loserPlayer = players.find(p => p.id === loserPinguino.playerId);
        if (loserPlayer) {
          const amountPerPlayer = totalCount * valuePerOccurrence;
          const totalLoss = amountPerPlayer * (players.length - 1);
          loser = {
            playerId: loserPlayer.id,
            name: loserPlayer.name,
            initials: loserPlayer.initials,
            color: loserPlayer.color,
            totalLoss,
          };
        }
      }
    }

    return {
      enabled: true,
      type: 'pinguinos',
      title: 'Pingüinos',
      emoji: '🐧',
      totalCount,
      valuePerOccurrence,
      loser,
    };
  }, [players, scores, betConfig.pinguinos, course]);

  // Check if any group bet is enabled
  const hasAnyBet = medalGeneralResult || culebrasResult || pinguinosResult;

  if (!hasAnyBet) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="h-4 w-4" />
          Apuestas Grupales
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* Medal General - Show only winners */}
        {medalGeneralResult && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-yellow-500" />
                <span className="font-medium text-sm">Medal General</span>
              </div>
              <span className="text-xs text-muted-foreground">${medalGeneralResult.amount} c/u</span>
            </div>
            
            {medalGeneralResult.hasValidScores && medalGeneralResult.winners.length > 0 ? (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-green-500 text-sm">🏆</span>
                    <div className="flex items-center gap-1">
                      {medalGeneralResult.winners.map((winner, idx) => (
                        <React.Fragment key={winner.playerId}>
                          {idx > 0 && <span className="text-xs text-muted-foreground mx-1">&</span>}
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                            style={{ backgroundColor: winner.color }}
                          >
                            {winner.initials}
                          </div>
                          <span className="font-medium text-sm">{winner.name.split(' ')[0]}</span>
                          <span className="text-xs text-muted-foreground">(Neto: {winner.netScore})</span>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                  <span className="text-green-500 font-bold text-lg">
                    +${medalGeneralResult.winners[0]?.amountWon || 0}
                  </span>
                </div>
                {medalGeneralResult.winners.length > 1 && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Empate - pot dividido entre {medalGeneralResult.winners.length} jugadores
                  </p>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground p-2 bg-muted/20 rounded">
                Sin scores confirmados suficientes
              </div>
            )}
          </div>
        )}

        {/* Culebras - Show count and loser */}
        {culebrasResult && (
          <>
            {medalGeneralResult && <div className="border-t border-border/50" />}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{culebrasResult.emoji}</span>
                  <span className="font-medium text-sm">{culebrasResult.title}</span>
                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {culebrasResult.totalCount} total
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">${culebrasResult.valuePerOccurrence} c/u</span>
              </div>
              
              {culebrasResult.loser ? (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-destructive text-xs">Paga:</span>
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                        style={{ backgroundColor: culebrasResult.loser.color }}
                      >
                        {culebrasResult.loser.initials}
                      </div>
                      <span className="font-medium text-sm">{culebrasResult.loser.name.split(' ')[0]}</span>
                    </div>
                    <span className="text-destructive font-bold text-lg">
                      -${culebrasResult.loser.totalLoss}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Paga ${culebrasResult.totalCount * culebrasResult.valuePerOccurrence} a cada uno de los otros {players.length - 1} jugadores
                  </p>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground p-2 bg-muted/20 rounded">
                  Sin culebras registradas
                </div>
              )}
            </div>
          </>
        )}

        {/* Pinguinos - Show count and loser */}
        {pinguinosResult && (
          <>
            {(medalGeneralResult || culebrasResult) && <div className="border-t border-border/50" />}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{pinguinosResult.emoji}</span>
                  <span className="font-medium text-sm">{pinguinosResult.title}</span>
                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {pinguinosResult.totalCount} total
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">${pinguinosResult.valuePerOccurrence} c/u</span>
              </div>
              
              {pinguinosResult.loser ? (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-destructive text-xs">Paga:</span>
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                        style={{ backgroundColor: pinguinosResult.loser.color }}
                      >
                        {pinguinosResult.loser.initials}
                      </div>
                      <span className="font-medium text-sm">{pinguinosResult.loser.name.split(' ')[0]}</span>
                    </div>
                    <span className="text-destructive font-bold text-lg">
                      -${pinguinosResult.loser.totalLoss}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Paga ${pinguinosResult.totalCount * pinguinosResult.valuePerOccurrence} a cada uno de los otros {players.length - 1} jugadores
                  </p>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground p-2 bg-muted/20 rounded">
                  Sin pingüinos registrados
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

// Utility function to calculate Medal General result for bilateral view
export const getMedalGeneralBilateralResult = (
  player: Player,
  rival: Player,
  scores: Map<string, PlayerScore[]>,
  betConfig: BetConfig,
  course: GolfCourse
): { isWinner: boolean; isTied: boolean; amount: number; playerNet: number; rivalNet: number } | null => {
  if (!betConfig.medalGeneral?.enabled) {
    return null;
  }

  const playerHandicaps = betConfig.medalGeneral.playerHandicaps || [];
  const amount = betConfig.medalGeneral.amount || 100;

  // Get player scores
  const playerScores = scores.get(player.id) || [];
  const rivalScores = scores.get(rival.id) || [];
  
  const confirmedPlayerScores = playerScores.filter(s => s.confirmed && s.strokes > 0);
  const confirmedRivalScores = rivalScores.filter(s => s.confirmed && s.strokes > 0);

  if (confirmedPlayerScores.length === 0 || confirmedRivalScores.length === 0) {
    return null;
  }

  // Get handicaps
  const playerHcp = playerHandicaps.find(ph => ph.playerId === player.id)?.handicap ?? player.handicap;
  const rivalHcp = playerHandicaps.find(ph => ph.playerId === rival.id)?.handicap ?? rival.handicap;

  // Calculate strokes per hole
  const playerStrokesPerHole = calculateStrokesPerHole(playerHcp, course);
  const rivalStrokesPerHole = calculateStrokesPerHole(rivalHcp, course);

  // Calculate net totals
  const playerNet = confirmedPlayerScores.reduce((sum, s) => {
    const received = playerStrokesPerHole[s.holeNumber - 1] || 0;
    return sum + (s.strokes - received);
  }, 0);

  const rivalNet = confirmedRivalScores.reduce((sum, s) => {
    const received = rivalStrokesPerHole[s.holeNumber - 1] || 0;
    return sum + (s.strokes - received);
  }, 0);

  const isWinner = playerNet < rivalNet;
  const isTied = playerNet === rivalNet;

  return {
    isWinner,
    isTied,
    amount: isWinner ? amount : isTied ? 0 : -amount,
    playerNet,
    rivalNet,
  };
};