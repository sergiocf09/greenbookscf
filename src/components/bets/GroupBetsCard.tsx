// Group Bets Card - Medal General, Culebras, Pinguinos, Coneja, Stableford consolidated display
// Simplified view: Medal shows winners only, Culebras/Pinguinos show count + loser payment
import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Player, PlayerScore, BetConfig, GolfCourse, StablefordPointConfig, DEFAULT_STABLEFORD_POINTS } from '@/types/golf';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Users, Star } from 'lucide-react';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { 
  calculateConejaSetResults, 
  getConejaHoleDisplays, 
  getConejaHoleMatrix,
  getConejaHoleDetail,
  type ConejaHoleDisplay, 
  type ConejaHoleMatrix 
} from '@/lib/conejaCalculations';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface GroupBetsCardProps {
  players: Player[];
  scores: Map<string, PlayerScore[]>;
  betConfig: BetConfig;
  course: GolfCourse;
  basePlayerId?: string;
  confirmedHoles?: Set<number>;
}

// Stableford Points Calculator
interface StablefordPlayerResult {
  playerId: string;
  player: Player;
  pointsFront: number;
  pointsBack: number;
  pointsTotal: number;
  holePoints: Array<{ holeNumber: number; points: number; toPar: number }>;
}

const calculateStablefordPoints = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse,
  betConfig: BetConfig
): StablefordPlayerResult[] => {
  if (!betConfig.stableford?.enabled) return [];
  
  const points = betConfig.stableford.points || DEFAULT_STABLEFORD_POINTS;
  const playerHandicaps = betConfig.stableford.playerHandicaps || [];
  
  return players.map(player => {
    const playerScores = scores.get(player.id) || [];
    const confirmedScores = playerScores.filter(s => s.confirmed && s.strokes > 0);
    
    // Get stableford handicap for this player
    const playerHcp = playerHandicaps.find(ph => ph.playerId === player.id);
    const handicap = playerHcp?.handicap ?? player.handicap;
    const strokesPerHole = calculateStrokesPerHole(handicap, course);
    
    const holePoints: StablefordPlayerResult['holePoints'] = [];
    let pointsFront = 0;
    let pointsBack = 0;
    
    confirmedScores.forEach(score => {
      const holePar = course.holes[score.holeNumber - 1]?.par || 4;
      const strokesReceived = strokesPerHole[score.holeNumber - 1] || 0;
      const netScore = score.strokes - strokesReceived;
      const toPar = netScore - holePar;
      
      let holePoint = 0;
      if (toPar <= -3) holePoint = points.albatross;
      else if (toPar === -2) holePoint = points.eagle;
      else if (toPar === -1) holePoint = points.birdie;
      else if (toPar === 0) holePoint = points.par;
      else if (toPar === 1) holePoint = points.bogey;
      else if (toPar === 2) holePoint = points.doubleBogey;
      else if (toPar === 3) holePoint = points.tripleBogey;
      else holePoint = points.quadrupleOrWorse;
      
      holePoints.push({ holeNumber: score.holeNumber, points: holePoint, toPar });
      
      if (score.holeNumber <= 9) {
        pointsFront += holePoint;
      } else {
        pointsBack += holePoint;
      }
    });
    
    return {
      playerId: player.id,
      player,
      pointsFront,
      pointsBack,
      pointsTotal: pointsFront + pointsBack,
      holePoints,
    };
  }).sort((a, b) => b.pointsTotal - a.pointsTotal);
};

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

interface OccurrenceInfo {
  playerId: string;
  playerInitial: string;
  holeNumber: number;
}

interface OccurrenceBetResult {
  enabled: boolean;
  type: 'culebras' | 'pinguinos';
  title: string;
  emoji: string;
  totalCount: number;
  valuePerOccurrence: number;
  amountPerPlayer: number;
  occurrences: OccurrenceInfo[];
  loser: {
    playerId: string;
    name: string;
    initials: string;
    color: string;
    totalLoss: number;
  } | null;
}

// Coneja Section component with interactive toolkit
interface ConejaSectionProps {
  conejaResult: {
    setResults: ReturnType<typeof calculateConejaSetResults>;
    holeDisplays: ConejaHoleDisplay[];
    winners: Array<{
      setNumber: number;
      player: Player | undefined;
      accumulatedSets: number[];
      amount: number;
      isAccumulated: boolean;
      wonOnHole: number | null;
    }>;
    amount: number;
  };
  players: Player[];
  scores: Map<string, PlayerScore[]>;
  course: GolfCourse;
  betConfig: BetConfig;
  confirmedHoles: Set<number>;
  basePlayerId?: string;
  getPlayer: (id: string) => Player | undefined;
}

const ConejaSection: React.FC<ConejaSectionProps> = ({
  conejaResult,
  players,
  scores,
  course,
  betConfig,
  confirmedHoles,
  basePlayerId,
  getPlayer,
}) => {
  const [selectedHole, setSelectedHole] = useState<number | null>(null);
  
  // Get matrix for selected hole
  const holeMatrix = useMemo(() => {
    if (!selectedHole) return null;
    return getConejaHoleMatrix(selectedHole, players, scores, course, betConfig, confirmedHoles);
  }, [selectedHole, players, scores, course, betConfig, confirmedHoles]);

  // Render multiple rabbits based on pata count
  const renderPatas = (count: number) => {
    return Array(count).fill('🐰').join('');
  };

  // Render a single hole cell
  const renderHoleCell = (hd: ConejaHoleDisplay) => {
    const pataPlayer = hd.pataPlayerId ? getPlayer(hd.pataPlayerId) : null;
    
    // Determine if pata was lost on this hole (had more patas before)
    const pataLost = hd.isConfirmed && hd.previousPataCount > 0 && (!hd.hasPata || hd.pataCount < hd.previousPataCount);
    
    // Show "=" ONLY if:
    // 1. The hole was a tie (no absolute winner) AND no one has pata
    // 2. OR someone lost all their patas and now no one has pata
    // CRITICAL: If someone still HAS pata, show the rabbit, NOT the "="
    const showTie = hd.isConfirmed && !hd.hasPata && (hd.isTie || pataLost);
    
    // When pata is lost but player still has patas, we show reduced rabbits (no winner indicator)
    // When hole is won and player gains pata, we show rabbits with their initials
    // We do NOT show the winner's initials when someone else loses a pata
    
    // For displaying multiple circles when multiple conejas are won
    const circleCount = hd.isSetWonHole ? Math.min(hd.conejasWonCount || 1, 3) : 0;
    
    return (
      <Popover key={hd.holeNumber}>
        <PopoverTrigger asChild>
          <button
            className="flex flex-col items-center cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => setSelectedHole(hd.holeNumber)}
          >
            <span className="text-[8px] text-muted-foreground">{hd.holeNumber}</span>
            <div className={cn(
              "relative flex items-center justify-center text-[8px]",
              // Regular sizing and styling for non-won holes
              !hd.isSetWonHole && "w-6 h-6 rounded",
              !hd.isConfirmed && !hd.isSetWonHole && "bg-muted/50",
              hd.isConfirmed && showTie && !hd.isSetWonHole && "bg-muted",
              hd.hasPata && !hd.isSetWonHole && "bg-amber-100 dark:bg-amber-900/30",
              // For won holes, we use relative positioning for circles
              hd.isSetWonHole && "w-7 h-7"
            )}>
              {/* Concentric circles for multiple conejas won */}
              {hd.isSetWonHole && circleCount >= 3 && (
                <div className="absolute w-7 h-7 rounded-full border-2 border-green-500" />
              )}
              {hd.isSetWonHole && circleCount >= 2 && (
                <div className="absolute w-5 h-5 rounded-full border-2 border-green-500" />
              )}
              {hd.isSetWonHole && (
                <div className="w-4 h-4 rounded-full border-2 border-green-500 bg-green-100 dark:bg-green-900/50 flex items-center justify-center z-10">
                  {/* Show pata (rabbit) inside the winning circle if player has pata */}
                  {hd.hasPata && !showTie && (
                    <span className="text-[7px]">{renderPatas(1)}</span>
                  )}
                </div>
              )}
              {showTie && <span className="text-muted-foreground font-bold">=</span>}
              {hd.hasPata && !showTie && !hd.isSetWonHole && renderPatas(Math.min(hd.pataCount, 2))}
            </div>
            {/* Only show initials of the pata holder, not when a pata was lost to someone */}
            {(hd.hasPata && pataPlayer && !showTie) && (
              <span className="text-[8px] font-bold text-amber-700 dark:text-amber-400">{pataPlayer.initials}</span>
            )}
          </button>
        </PopoverTrigger>
        {hd.isConfirmed && (
          <PopoverContent className="w-auto p-2" side="top">
            <HoleMatrixTooltip 
              holeNumber={hd.holeNumber} 
              players={players}
              scores={scores}
              course={course}
              betConfig={betConfig}
              confirmedHoles={confirmedHoles}
            />
          </PopoverContent>
        )}
      </Popover>
    );
  };

  return (
    <>
      <div className="border-t border-border/50" />
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🐰</span>
            <span className="font-medium text-sm">Coneja</span>
            <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
              {betConfig.coneja?.handicapMode === 'bilateral' ? 'Sliding' : 'USGA'}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">${conejaResult.amount} c/set</span>
        </div>
        
        {/* Toolkit visual - holes grid */}
        <div className="bg-muted/30 rounded-lg p-2 space-y-1">
          {/* Front 9 */}
          <div className="grid grid-cols-9 gap-0.5">
            {conejaResult.holeDisplays.slice(0, 9).map(renderHoleCell)}
          </div>
          {/* Back 9 */}
          <div className="grid grid-cols-9 gap-0.5">
            {conejaResult.holeDisplays.slice(9, 18).map(renderHoleCell)}
          </div>
        </div>

        {/* Winners display */}
        {conejaResult.winners.length > 0 && (
          <div className="space-y-1">
            {/* Group winners by player ID to show all wins on one row */}
            {(() => {
              const winsByPlayer = new Map<string, typeof conejaResult.winners>();
              conejaResult.winners.forEach(w => {
                if (!w.player) return;
                const existing = winsByPlayer.get(w.player.id) || [];
                existing.push(w);
                winsByPlayer.set(w.player.id, existing);
              });
              
              return Array.from(winsByPlayer.entries()).map(([playerId, wins]) => {
                const player = wins[0].player!;
                const totalAmount = wins.reduce((sum, w) => sum + w.amount, 0);
                // Build set descriptions: "Set 1 (H6), Set 2 (H12)"
                const setDescriptions = wins.map(w => 
                  w.isAccumulated && w.accumulatedSets.length > 1 
                    ? `Sets ${w.accumulatedSets.join('+')} (H${w.wonOnHole})`
                    : `Set ${w.setNumber} (H${w.wonOnHole})`
                ).join(', ');
                
                return (
                  <div key={playerId} className="bg-green-500/10 border border-green-500/30 rounded-lg p-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-green-500 text-xs">🏆</span>
                        <PlayerAvatar initials={player.initials} background={player.color} size="sm" isLoggedInUser={player.id === basePlayerId} />
                        <span className="font-medium text-sm">{player.name.split(' ')[0]}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {setDescriptions}
                        </span>
                      </div>
                      <span className="text-green-600 font-bold">+${totalAmount}</span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>
    </>
  );
};

// Matrix tooltip showing pairwise net score comparisons
interface HoleMatrixTooltipProps {
  holeNumber: number;
  players: Player[];
  scores: Map<string, PlayerScore[]>;
  course: GolfCourse;
  betConfig: BetConfig;
  confirmedHoles: Set<number>;
}

const HoleMatrixTooltip: React.FC<HoleMatrixTooltipProps> = ({
  holeNumber,
  players,
  scores,
  course,
  betConfig,
  confirmedHoles,
}) => {
  const matrix = useMemo(() => {
    return getConejaHoleMatrix(holeNumber, players, scores, course, betConfig, confirmedHoles);
  }, [holeNumber, players, scores, course, betConfig, confirmedHoles]);

  if (!matrix) {
    return <span className="text-xs text-muted-foreground">Sin datos</span>;
  }

  const winnerPlayer = matrix.winnerId ? players.find(p => p.id === matrix.winnerId) : null;
  const hole = course.holes[holeNumber - 1];

  // Column-based matrix: columns are the perspective
  // Each cell shows: [row player net] vs [column player net] with dot if column received stroke
  // Green if column won, red if column lost, gray if tie

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">Hoyo {holeNumber}</span>
        <span className="text-xs text-muted-foreground">Par {hole?.par}</span>
      </div>
      
      {/* Matrix table - columns are the perspective */}
      <div className="overflow-x-auto">
        <table className="text-[10px] border-collapse">
          <thead>
            {/* Row 1: Label + Gross scores above column headers */}
            <tr>
              <th className="p-1 text-[9px] text-muted-foreground font-normal">Gross</th>
              {matrix.playerIds.map(pid => (
                <th key={`gross-${pid}`} className="p-0.5 text-center text-muted-foreground font-normal">
                  {matrix.playerGrossScores[pid] || '-'}
                </th>
              ))}
            </tr>
            {/* Row 2: Column player initials with circles for winner (multiple if accumulated) */}
            <tr>
              <th className="p-1 border-b border-r border-border/50"></th>
              {matrix.playerIds.map(pid => {
                const isWinner = matrix.winnerId === pid;
                const circleCount = isWinner ? Math.min(matrix.conejasWonCount || 1, 3) : 0;
                
                return (
                  <th 
                    key={pid} 
                    className="p-1 border-b border-border/50 text-center min-w-[36px]"
                  >
                    {isWinner && circleCount > 0 ? (
                      <div className="relative inline-flex items-center justify-center">
                        {/* Render concentric circles based on conejas won */}
                        {circleCount >= 3 && (
                          <div className="absolute w-9 h-9 rounded-full border-2 border-green-500" />
                        )}
                        {circleCount >= 2 && (
                          <div className="absolute w-7 h-7 rounded-full border-2 border-green-500" />
                        )}
                        <div className="w-5 h-5 rounded-full border-2 border-green-500 bg-green-100 dark:bg-green-900/50 flex items-center justify-center text-green-700 font-bold">
                          {matrix.playerInitials[pid]}
                        </div>
                      </div>
                    ) : (
                      <div className="inline-flex items-center justify-center font-bold">
                        {matrix.playerInitials[pid]}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {matrix.playerIds.map(rowPlayerId => (
              <tr key={rowPlayerId}>
                <td className="p-1 border-r border-border/50 font-bold">
                  {matrix.playerInitials[rowPlayerId]}
                </td>
                {matrix.playerIds.map(colPlayerId => {
                  if (rowPlayerId === colPlayerId) {
                    return (
                      <td key={colPlayerId} className="p-1 text-center bg-muted/30">—</td>
                    );
                  }
                  
                  // Get the cell from column player's perspective vs row player
                  // cells[colPlayerId][rowPlayerId] gives column's perspective
                  const cell = matrix.cells[colPlayerId]?.[rowPlayerId];
                  if (!cell) {
                    return <td key={colPlayerId} className="p-1 text-center">-</td>;
                  }
                  
                  // cell.playerNet is column player's net, cell.rivalNet is row player's net
                  // cell.result is from column's perspective
                  // cell.playerReceived indicates if column player received a stroke
                  
                  return (
                    <td 
                      key={colPlayerId} 
                      className={cn(
                        "p-1 text-center",
                        cell.result === 'win' && "bg-green-100 dark:bg-green-900/30 text-green-700",
                        cell.result === 'loss' && "bg-red-100 dark:bg-red-900/30 text-destructive",
                        cell.result === 'tie' && "bg-muted/50"
                      )}
                    >
                      <div className="flex items-center justify-center gap-0.5">
                        <span className="font-medium">{cell.rivalNet}</span>
                        <span className="text-muted-foreground">v</span>
                        <span className="font-medium">{cell.playerNet}</span>
                        {cell.playerReceived && <span className="text-primary font-bold">•</span>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Winner indicator */}
      {winnerPlayer ? (
        <div className="text-[10px] text-green-600 text-center pt-1 border-t border-border/50 flex items-center justify-center gap-1">
          <span>🐰</span>
          <span className="font-bold">{winnerPlayer.initials}</span>
          <span>gana pata</span>
        </div>
      ) : (
        <div className="text-[10px] text-muted-foreground text-center pt-1 border-t border-border/50">
          Empate - Sin ganador absoluto
        </div>
      )}
    </div>
  );
};

export const GroupBetsCard: React.FC<GroupBetsCardProps> = ({
  players,
  scores,
  betConfig,
  course,
  basePlayerId,
  confirmedHoles = new Set(),
}) => {
  // Check if all 18 holes are confirmed for all players
  const all18HolesConfirmed = useMemo(() => {
    return Array.from({ length: 18 }, (_, i) => i + 1).every(holeNum =>
      players.every(player => {
        const playerScores = scores.get(player.id) || [];
        return playerScores.some(s => s.holeNumber === holeNum && s.confirmed && s.strokes > 0);
      })
    );
  }, [players, scores]);

  // Calculate Coneja results
  const conejaResult = useMemo(() => {
    if (!betConfig.coneja?.enabled || players.length < 2) return null;
    
    const setResults = calculateConejaSetResults(players, scores, course, betConfig, confirmedHoles);
    const holeDisplays = getConejaHoleDisplays(players, scores, course, betConfig, confirmedHoles);
    const amount = betConfig.coneja.amount || 50;
    
    // Get winners for display
    const winners = setResults
      .filter(sr => sr.winnerId)
      .map(sr => {
        const winner = players.find(p => p.id === sr.winnerId);
        const numConejas = sr.isAccumulated && sr.accumulatedSets.length > 0 ? sr.accumulatedSets.length : 1;
        return {
          setNumber: sr.setNumber,
          player: winner,
          accumulatedSets: sr.accumulatedSets,
          amount: amount * numConejas * (players.length - 1),
          isAccumulated: sr.isAccumulated,
          wonOnHole: sr.wonOnHole,
        };
      });
    
    return { setResults, holeDisplays, winners, amount };
  }, [players, scores, course, betConfig, confirmedHoles]);

  // Calculate Medal General - only show after all 18 holes are confirmed
  const medalGeneralResult = useMemo((): MedalGeneralResult | null => {
    if (!betConfig.medalGeneral?.enabled || players.length < 2) {
      return null;
    }

    // Only show Medal General results at end of round (all 18 holes confirmed)
    if (!all18HolesConfirmed) {
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
      return null;
    }

    // Find minimum net total (winners)
    const minNet = Math.min(...playerNetScores.map(p => p.netScore));
    const winners = playerNetScores.filter(p => p.netScore === minNet);
    const losersCount = playerNetScores.length - winners.length;

    // If everyone tied, there is no payout.
    if (losersCount === 0) {
      return null;
    }

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
  }, [players, scores, betConfig.medalGeneral, course, all18HolesConfirmed]);

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
      // NOTE: `scores` is already filtered to confirmed holes by BetDashboard.
      // Late-joined players may have `confirmed=false` on previously confirmed holes;
      // filtering again by `score.confirmed` would undercount vs the main bet engine.
      playerScores.forEach(score => {
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
    const amountPerPlayer = totalCount * valuePerOccurrence;

    // Map occurrences with player initials
    const occurrences: OccurrenceInfo[] = allCulebras
      .sort((a, b) => a.holeNumber - b.holeNumber)
      .map(c => {
        const player = players.find(p => p.id === c.playerId);
        return {
          playerId: c.playerId,
          playerInitial: player?.initials?.charAt(0) || '?',
          holeNumber: c.holeNumber,
        };
      });

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
      amountPerPlayer,
      occurrences,
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
      // Same rationale as Culebras: rely on parent filtering by confirmed holes.
      playerScores.forEach(score => {
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
    const amountPerPlayer = totalCount * valuePerOccurrence;

    // Map occurrences with player initials
    const occurrences: OccurrenceInfo[] = allPinguinos
      .sort((a, b) => a.holeNumber - b.holeNumber)
      .map(p => {
        const player = players.find(pl => pl.id === p.playerId);
        return {
          playerId: p.playerId,
          playerInitial: player?.initials?.charAt(0) || '?',
          holeNumber: p.holeNumber,
        };
      });

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
      amountPerPlayer,
      occurrences,
      loser,
    };
  }, [players, scores, betConfig.pinguinos, course]);

  // Calculate Stableford points for each player
  const stablefordResults = useMemo(() => {
    return calculateStablefordPoints(players, scores, course, betConfig);
  }, [players, scores, course, betConfig]);

  // Check if any group bet is enabled
  const hasAnyBet = medalGeneralResult || culebrasResult || pinguinosResult || conejaResult || betConfig.stableford?.enabled;

  if (!hasAnyBet) {
    return null;
  }

  // Get player by ID helper
  const getPlayer = (id: string) => players.find(p => p.id === id);

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
                          <PlayerAvatar initials={winner.initials} background={winner.color} size="sm" isLoggedInUser={winner.playerId === basePlayerId} />
                          <span className="font-medium text-sm">{winner.name.split(' ')[0]}</span>
                          <span className="text-xs text-muted-foreground">(Neto: {winner.netScore})</span>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                  <span className="text-green-600 font-bold text-lg">
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
                <div className="flex items-center gap-3">
                  <span className="text-lg">{culebrasResult.emoji}</span>
                  <span className="font-medium text-sm">{culebrasResult.title}</span>
                  <div className="w-8 h-8 border-2 border-destructive flex items-center justify-center">
                    <span className="text-destructive font-bold text-lg">{culebrasResult.totalCount}</span>
                  </div>
                </div>
                <span className="text-sm font-medium text-muted-foreground">
                  ${culebrasResult.amountPerPlayer} c/jug
                </span>
              </div>
              
              {culebrasResult.loser ? (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-destructive text-xs">Paga:</span>
                      <PlayerAvatar initials={culebrasResult.loser.initials} background={culebrasResult.loser.color} size="sm" isLoggedInUser={culebrasResult.loser.playerId === basePlayerId} />
                      <span className="font-medium text-sm">{culebrasResult.loser.name.split(' ')[0]}</span>
                    </div>
                    <span className="text-destructive font-bold text-lg">
                      -${culebrasResult.loser.totalLoss}
                    </span>
                  </div>
                  {culebrasResult.occurrences.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {culebrasResult.occurrences.map((occ, idx) => (
                        <span key={idx} className="text-xs bg-muted/50 px-1.5 py-0.5 rounded font-medium">
                          {occ.playerInitial}-{occ.holeNumber}
                        </span>
                      ))}
                    </div>
                  )}
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
                <div className="flex items-center gap-3">
                  <span className="text-lg">{pinguinosResult.emoji}</span>
                  <span className="font-medium text-sm">{pinguinosResult.title}</span>
                  <div className="w-8 h-8 border-2 border-destructive flex items-center justify-center">
                    <span className="text-destructive font-bold text-lg">{pinguinosResult.totalCount}</span>
                  </div>
                </div>
                <span className="text-sm font-medium text-muted-foreground">
                  ${pinguinosResult.amountPerPlayer} c/jug
                </span>
              </div>
              
              {pinguinosResult.loser ? (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-destructive text-xs">Paga:</span>
                      <PlayerAvatar initials={pinguinosResult.loser.initials} background={pinguinosResult.loser.color} size="sm" isLoggedInUser={pinguinosResult.loser.playerId === basePlayerId} />
                      <span className="font-medium text-sm">{pinguinosResult.loser.name.split(' ')[0]}</span>
                    </div>
                    <span className="text-destructive font-bold text-lg">
                      -${pinguinosResult.loser.totalLoss}
                    </span>
                  </div>
                  {pinguinosResult.occurrences.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {pinguinosResult.occurrences.map((occ, idx) => (
                        <span key={idx} className="text-xs bg-muted/50 px-1.5 py-0.5 rounded font-medium">
                          {occ.playerInitial}-{occ.holeNumber}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground p-2 bg-muted/20 rounded">
                  Sin pingüinos registrados
                </div>
              )}
            </div>
          </>
        )}

        {/* Coneja - Patas system */}
        {conejaResult && (
          <ConejaSection
            conejaResult={conejaResult}
            players={players}
            scores={scores}
            course={course}
            betConfig={betConfig}
            confirmedHoles={confirmedHoles}
            basePlayerId={basePlayerId}
            getPlayer={getPlayer}
          />
        )}
        
        {/* Stableford - Points system with toolkit */}
        {betConfig.stableford?.enabled && stablefordResults.length > 0 && (
          <>
            <div className="border-t border-border/50" />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500" />
                  <span className="font-medium text-sm">Stableford</span>
                  <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                    HCP Propio
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">${betConfig.stableford.amount || 100}</span>
              </div>
              
              {/* Default view: Player totals with points (click for toolkit) */}
              <Popover>
                <PopoverTrigger asChild>
                  <div className="flex flex-wrap gap-2 cursor-pointer hover:bg-muted/20 rounded-lg p-2 transition-colors">
                    {stablefordResults.map((result, idx) => {
                      const isWinner = idx === 0 && result.pointsTotal > (stablefordResults[1]?.pointsTotal ?? 0);
                      return (
                        <div 
                          key={result.playerId}
                          className={cn(
                            "flex items-center gap-1.5 px-2 py-1 rounded-lg",
                            isWinner ? "bg-green-500/20 border border-green-500/30" : "bg-muted/50"
                          )}
                        >
                          <PlayerAvatar initials={result.player.initials} background={result.player.color} size="sm" isLoggedInUser={result.playerId === basePlayerId} />
                          <div className="flex flex-col items-start">
                            <span className={cn(
                              "text-sm font-bold",
                              isWinner ? "text-green-600" : ""
                            )}>
                              {result.pointsTotal} pts
                            </span>
                            <span className="text-[8px] text-muted-foreground">
                              F{result.pointsFront} B{result.pointsBack}
                            </span>
                          </div>
                          {isWinner && <Trophy className="h-3 w-3 text-amber-500" />}
                        </div>
                      );
                    })}
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-[340px] max-h-[70vh] overflow-y-auto" side="top">
                  <div className="space-y-2">
                    <div className="font-semibold text-sm flex items-center gap-2">
                      <Star className="h-4 w-4 text-amber-500" />
                      Stableford - Detalle por Hoyo
                    </div>
                    
                    {/* Front 9 */}
                    <div className="grid grid-cols-[50px_repeat(9,1fr)_35px] gap-0.5 text-[8px] text-muted-foreground">
                      <div></div>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(h => (
                        <div key={h} className="text-center">{h}</div>
                      ))}
                      <div className="text-center font-semibold">F9</div>
                    </div>
                    {stablefordResults.map(result => (
                      <div key={result.playerId} className="grid grid-cols-[50px_repeat(9,1fr)_35px] gap-0.5 items-center">
                        <PlayerAvatar initials={result.player.initials} background={result.player.color} size="sm" isLoggedInUser={result.playerId === basePlayerId} />
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(h => {
                          const hp = result.holePoints.find(p => p.holeNumber === h);
                          return (
                            <div 
                              key={h} 
                              className={cn(
                                "text-center text-[9px] font-medium rounded py-0.5",
                                !hp ? "text-muted-foreground" :
                                hp.points >= 3 ? "bg-amber-500/30 text-amber-700" :
                                hp.points >= 2 ? "bg-green-500/30 text-green-700" :
                                hp.points >= 1 ? "bg-blue-500/20 text-blue-600" :
                                hp.points === 0 ? "bg-muted/50" :
                                "bg-red-500/20 text-destructive"
                              )}
                            >
                              {hp?.points ?? '-'}
                            </div>
                          );
                        })}
                        <div className="text-center text-[10px] font-bold bg-muted/50 rounded py-0.5">
                          {result.pointsFront}
                        </div>
                      </div>
                    ))}
                    
                    {/* Back 9 */}
                    <div className="grid grid-cols-[50px_repeat(9,1fr)_35px] gap-0.5 text-[8px] text-muted-foreground mt-2">
                      <div></div>
                      {[10, 11, 12, 13, 14, 15, 16, 17, 18].map(h => (
                        <div key={h} className="text-center">{h}</div>
                      ))}
                      <div className="text-center font-semibold">B9</div>
                    </div>
                    {stablefordResults.map(result => (
                      <div key={`${result.playerId}-back`} className="grid grid-cols-[50px_repeat(9,1fr)_35px] gap-0.5 items-center">
                        <PlayerAvatar initials={result.player.initials} background={result.player.color} size="sm" isLoggedInUser={result.playerId === basePlayerId} />
                        {[10, 11, 12, 13, 14, 15, 16, 17, 18].map(h => {
                          const hp = result.holePoints.find(p => p.holeNumber === h);
                          return (
                            <div 
                              key={h} 
                              className={cn(
                                "text-center text-[9px] font-medium rounded py-0.5",
                                !hp ? "text-muted-foreground" :
                                hp.points >= 3 ? "bg-amber-500/30 text-amber-700" :
                                hp.points >= 2 ? "bg-green-500/30 text-green-700" :
                                hp.points >= 1 ? "bg-blue-500/20 text-blue-600" :
                                hp.points === 0 ? "bg-muted/50" :
                                "bg-red-500/20 text-destructive"
                              )}
                            >
                              {hp?.points ?? '-'}
                            </div>
                          );
                        })}
                        <div className="text-center text-[10px] font-bold bg-muted/50 rounded py-0.5">
                          {result.pointsBack}
                        </div>
                      </div>
                    ))}
                    
                    {/* Total row in toolkit */}
                    <div className="border-t border-border/50 pt-2 mt-2 text-center text-[10px] text-muted-foreground">
                      Toca afuera para cerrar
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              
              {/* Winner display */}
              {stablefordResults.length > 0 && stablefordResults[0].pointsTotal > (stablefordResults[1]?.pointsTotal ?? 0) && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-green-500 text-xs">🏆</span>
                      <PlayerAvatar initials={stablefordResults[0].player.initials} background={stablefordResults[0].player.color} size="sm" isLoggedInUser={stablefordResults[0].playerId === basePlayerId} />
                      <span className="font-medium text-sm">{stablefordResults[0].player.name.split(' ')[0]}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {stablefordResults[0].pointsTotal} pts
                      </span>
                    </div>
                    <span className="text-green-600 font-bold">+${(betConfig.stableford?.amount || 100) * (players.length - 1)}</span>
                  </div>
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
  allPlayers: Player[],
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

  // Calculate net totals for all players (to properly handle ties and split payouts)
  const netTotals: Array<{ playerId: string; netTotal: number }> = [];

  allPlayers.forEach((p) => {
    const pScores = scores.get(p.id) || [];
    const confirmed = pScores.filter((s) => s.confirmed && s.strokes > 0);
    if (confirmed.length === 0) return;

    const hcp = playerHandicaps.find((ph) => ph.playerId === p.id)?.handicap ?? p.handicap;
    const strokesPerHole = calculateStrokesPerHole(hcp, course);
    const netTotal = confirmed.reduce((sum, s) => {
      const received = strokesPerHole[s.holeNumber - 1] || 0;
      return sum + (s.strokes - received);
    }, 0);

    netTotals.push({ playerId: p.id, netTotal });
  });

  if (netTotals.length < 2) {
    return null;
  }

  const minNetTotal = Math.min(...netTotals.map((p) => p.netTotal));
  const winnerIds = new Set(netTotals.filter((p) => p.netTotal === minNetTotal).map((p) => p.playerId));
  const winnersCount = winnerIds.size;
  const losersCount = netTotals.length - winnersCount;

  // Everyone tied => no payout.
  if (losersCount === 0) {
    return null;
  }

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

  // Medal General payout is group-based:
  // each non-winner pays `amount`, split evenly among winners.
  const isPlayerWinner = winnerIds.has(player.id);
  const isRivalWinner = winnerIds.has(rival.id);

  const amountFromLoserToWinner = amount / winnersCount;
  const bilateralAmount =
    isPlayerWinner && !isRivalWinner
      ? amountFromLoserToWinner
      : !isPlayerWinner && isRivalWinner
        ? -amountFromLoserToWinner
        : 0;

  return {
    // Keep these for UI messaging, but amount is now the true group-based bilateral impact.
    isWinner,
    isTied,
    amount: bilateralAmount,
    playerNet,
    rivalNet,
  };
};