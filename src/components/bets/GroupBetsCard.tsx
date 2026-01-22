// Group Bets Card - Medal General, Culebras, Pinguinos consolidated display
import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Player, PlayerScore, BetConfig, GolfCourse } from '@/types/golf';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Target, Users } from 'lucide-react';

interface GroupBetsCardProps {
  players: Player[];
  scores: Map<string, PlayerScore[]>;
  betConfig: BetConfig;
  course: GolfCourse;
  basePlayerId?: string;
}

interface GroupBetResult {
  type: 'medalGeneral' | 'culebras' | 'pinguinos';
  title: string;
  icon: React.ReactNode;
  enabled: boolean;
  amount: number;
  playerResults: Array<{
    playerId: string;
    name: string;
    initials: string;
    color: string;
    value: number; // Net score for medal, count for culebras/pinguinos
    isWinner: boolean;
    isLoser: boolean;
    moneyChange: number;
    detail?: string;
  }>;
  totalOccurrences?: number; // For culebras/pinguinos
}

export const GroupBetsCard: React.FC<GroupBetsCardProps> = ({
  players,
  scores,
  betConfig,
  course,
  basePlayerId,
}) => {
  // Calculate Medal General results
  const medalGeneralResult = useMemo((): GroupBetResult | null => {
    if (!betConfig.medalGeneral?.enabled || players.length < 2) {
      return null;
    }

    const playerHandicaps = betConfig.medalGeneral.playerHandicaps || [];
    const amount = betConfig.medalGeneral.amount || 100;

    // Calculate net totals for each player
    const playerResults: GroupBetResult['playerResults'] = [];

    players.forEach(player => {
      const playerScores = scores.get(player.id) || [];
      const confirmedScores = playerScores.filter(s => s.confirmed && s.strokes > 0);

      if (confirmedScores.length === 0) {
        playerResults.push({
          playerId: player.id,
          name: player.name,
          initials: player.initials,
          color: player.color,
          value: 0,
          isWinner: false,
          isLoser: false,
          moneyChange: 0,
          detail: 'Sin scores',
        });
        return;
      }

      // Get Medal General handicap for this player
      const playerHcp = playerHandicaps.find(ph => ph.playerId === player.id);
      const handicap = playerHcp?.handicap ?? player.handicap;

      // Calculate strokes received per hole
      const strokesPerHole = calculateStrokesPerHole(handicap, course);

      // Calculate gross and net totals
      const grossTotal = confirmedScores.reduce((sum, s) => sum + s.strokes, 0);
      const netTotal = confirmedScores.reduce((sum, s) => {
        const received = strokesPerHole[s.holeNumber - 1] || 0;
        return sum + (s.strokes - received);
      }, 0);

      playerResults.push({
        playerId: player.id,
        name: player.name,
        initials: player.initials,
        color: player.color,
        value: netTotal,
        isWinner: false,
        isLoser: false,
        moneyChange: 0,
        detail: `Bruto: ${grossTotal} | HCP: ${handicap}`,
      });
    });

    // Only process winners/losers if we have valid scores
    const playersWithScores = playerResults.filter(p => p.detail !== 'Sin scores');
    if (playersWithScores.length < 2) {
      return {
        type: 'medalGeneral',
        title: 'Medal General',
        icon: <Trophy className="h-4 w-4" />,
        enabled: true,
        amount,
        playerResults,
      };
    }

    // Find minimum net total
    const minNet = Math.min(...playersWithScores.map(p => p.value));
    const winners = playersWithScores.filter(p => p.value === minNet);
    const losers = playersWithScores.filter(p => p.value !== minNet);

    // Calculate money
    const totalPot = losers.length * amount;
    const amountPerWinner = winners.length > 0 ? totalPot / winners.length : 0;
    const amountLostPerLoser = winners.length > 0 ? amount : 0;

    // Update player results with winner/loser status
    playerResults.forEach(pr => {
      if (winners.some(w => w.playerId === pr.playerId)) {
        pr.isWinner = true;
        pr.moneyChange = amountPerWinner;
      } else if (losers.some(l => l.playerId === pr.playerId)) {
        pr.isLoser = true;
        pr.moneyChange = -amountLostPerLoser;
      }
    });

    return {
      type: 'medalGeneral',
      title: 'Medal General',
      icon: <Trophy className="h-4 w-4" />,
      enabled: true,
      amount,
      playerResults,
    };
  }, [players, scores, betConfig.medalGeneral, course]);

  // Calculate Culebras results
  const culebrasResult = useMemo((): GroupBetResult | null => {
    if (!betConfig.culebras?.enabled || players.length < 2) {
      return null;
    }

    const valuePerOccurrence = betConfig.culebras.valuePerOccurrence || 25;

    // Find all culebras
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

    // Count per player
    const playerCounts = new Map<string, number>();
    allCulebras.forEach(c => {
      playerCounts.set(c.playerId, (playerCounts.get(c.playerId) || 0) + 1);
    });

    // Find last player to pay
    let lastPlayerToPay: string | null = null;
    if (allCulebras.length > 0) {
      const maxHole = Math.max(...allCulebras.map(c => c.holeNumber));
      const culebrasOnLastHole = allCulebras.filter(c => c.holeNumber === maxHole);
      const maxPutts = Math.max(...culebrasOnLastHole.map(c => c.putts));
      const playersWithMaxPutts = culebrasOnLastHole.filter(c => c.putts === maxPutts);
      lastPlayerToPay = playersWithMaxPutts[0]?.playerId || null;
    }

    const totalCulebras = allCulebras.length;
    const amountPerPlayer = totalCulebras * valuePerOccurrence;

    const playerResults: GroupBetResult['playerResults'] = players.map(player => {
      const count = playerCounts.get(player.id) || 0;
      const isLoser = player.id === lastPlayerToPay;
      const isWinner = !isLoser && lastPlayerToPay !== null;

      return {
        playerId: player.id,
        name: player.name,
        initials: player.initials,
        color: player.color,
        value: count,
        isWinner,
        isLoser,
        moneyChange: isLoser ? -amountPerPlayer * (players.length - 1) : isWinner ? amountPerPlayer : 0,
        detail: count > 0 ? `🐍 x${count}` : undefined,
      };
    });

    return {
      type: 'culebras',
      title: 'Culebras',
      icon: <span className="text-sm">🐍</span>,
      enabled: true,
      amount: valuePerOccurrence,
      playerResults,
      totalOccurrences: totalCulebras,
    };
  }, [players, scores, betConfig.culebras]);

  // Calculate Pinguinos results
  const pinguinosResult = useMemo((): GroupBetResult | null => {
    if (!betConfig.pinguinos?.enabled || players.length < 2) {
      return null;
    }

    const valuePerOccurrence = betConfig.pinguinos.valuePerOccurrence || 25;

    // Find all pinguinos (triple bogey or worse)
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

    // Count per player
    const playerCounts = new Map<string, number>();
    allPinguinos.forEach(p => {
      playerCounts.set(p.playerId, (playerCounts.get(p.playerId) || 0) + 1);
    });

    // Find last player to pay
    let lastPlayerToPay: string | null = null;
    if (allPinguinos.length > 0) {
      const maxHole = Math.max(...allPinguinos.map(p => p.holeNumber));
      const pinguinosOnLastHole = allPinguinos.filter(p => p.holeNumber === maxHole);
      const maxOverPar = Math.max(...pinguinosOnLastHole.map(p => p.overPar));
      const playersWithMaxOverPar = pinguinosOnLastHole.filter(p => p.overPar === maxOverPar);
      lastPlayerToPay = playersWithMaxOverPar[0]?.playerId || null;
    }

    const totalPinguinos = allPinguinos.length;
    const amountPerPlayer = totalPinguinos * valuePerOccurrence;

    const playerResults: GroupBetResult['playerResults'] = players.map(player => {
      const count = playerCounts.get(player.id) || 0;
      const isLoser = player.id === lastPlayerToPay;
      const isWinner = !isLoser && lastPlayerToPay !== null;

      return {
        playerId: player.id,
        name: player.name,
        initials: player.initials,
        color: player.color,
        value: count,
        isWinner,
        isLoser,
        moneyChange: isLoser ? -amountPerPlayer * (players.length - 1) : isWinner ? amountPerPlayer : 0,
        detail: count > 0 ? `🐧 x${count}` : undefined,
      };
    });

    return {
      type: 'pinguinos',
      title: 'Pingüinos',
      icon: <span className="text-sm">🐧</span>,
      enabled: true,
      amount: valuePerOccurrence,
      playerResults,
      totalOccurrences: totalPinguinos,
    };
  }, [players, scores, betConfig.pinguinos, course]);

  // Collect all enabled group bets
  const groupBets = useMemo(() => {
    const bets: GroupBetResult[] = [];
    if (medalGeneralResult) bets.push(medalGeneralResult);
    if (culebrasResult) bets.push(culebrasResult);
    if (pinguinosResult) bets.push(pinguinosResult);
    return bets;
  }, [medalGeneralResult, culebrasResult, pinguinosResult]);

  if (groupBets.length === 0) {
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
        {groupBets.map((bet) => (
          <div key={bet.type} className="space-y-2">
            {/* Bet Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {bet.icon}
                <span className="font-medium text-sm">{bet.title}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {bet.type === 'medalGeneral' 
                  ? `$${bet.amount} c/u`
                  : `$${bet.amount} x ocurrencia`}
                {bet.totalOccurrences !== undefined && bet.totalOccurrences > 0 && (
                  <span className="ml-1 text-accent font-medium">
                    (Total: {bet.totalOccurrences})
                  </span>
                )}
              </div>
            </div>

            {/* Player Results */}
            <div className="grid grid-cols-2 gap-2">
              {bet.playerResults.map((pr) => {
                const isBase = pr.playerId === basePlayerId;
                
                return (
                  <div
                    key={pr.playerId}
                    className={cn(
                      'flex items-center justify-between p-2 rounded-lg text-xs',
                      pr.isWinner 
                        ? 'bg-green-500/10 border border-green-500/30'
                        : pr.isLoser 
                          ? 'bg-destructive/10 border border-destructive/30'
                          : 'bg-muted/30',
                      isBase && 'ring-1 ring-primary'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                        style={{ backgroundColor: pr.color }}
                      >
                        {pr.initials}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium">{pr.name.split(' ')[0]}</span>
                        {bet.type === 'medalGeneral' && pr.value > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            Neto: {pr.value}
                          </span>
                        )}
                        {pr.detail && bet.type !== 'medalGeneral' && (
                          <span className="text-[10px] text-muted-foreground">
                            {pr.detail}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      {pr.isWinner && (
                        <span className="text-[9px] text-green-500 font-medium">🏆 Gana</span>
                      )}
                      {pr.isLoser && bet.type !== 'medalGeneral' && (
                        <span className="text-[9px] text-destructive font-medium">Último</span>
                      )}
                      {pr.moneyChange !== 0 && (
                        <span className={cn(
                          'font-bold',
                          pr.moneyChange > 0 ? 'text-green-500' : 'text-destructive'
                        )}>
                          {pr.moneyChange > 0 ? '+' : ''}${pr.moneyChange}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Divider between bets */}
            {groupBets.indexOf(bet) < groupBets.length - 1 && (
              <div className="border-t border-border/50 mt-3" />
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
