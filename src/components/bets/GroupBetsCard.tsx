// Group Bets Card - Medal General, Culebras, Pinguinos, Zoologico, Coneja, Stableford, Skins Grupal consolidated display
// Simplified view: Medal shows winners only, Culebras/Pinguinos show count + loser payment
import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Player, PlayerScore, BetConfig, GolfCourse, StablefordPointConfig, DEFAULT_STABLEFORD_POINTS, ZooAnimalType, ZOO_ANIMALS } from '@/types/golf';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { calculateZoologicoAnimalResult, ZoologicoAnimalResult } from '@/lib/betCalculations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trophy, Users, Star, ChevronDown, AlertTriangle, Check, X, Target } from 'lucide-react';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { formatPlayerName, formatPlayerNameShort, formatPlayerNameTwoWords, disambiguateInitials } from '@/lib/playerInput';
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
  onBetConfigChange?: (config: BetConfig) => void;
}

// Tie-break storage helper
// We store tie-breaks as "<holeNumber>:<playerId>" so the selection only applies to that specific hole.
// Legacy values without ":" are treated as unknown-hole and therefore NOT auto-applied (forces re-select).
const parseTieBreak = (value?: string | null): { hole: number | null; playerId: string | null } => {
  if (!value) return { hole: null, playerId: null };
  const parts = String(value).split(':');
  if (parts.length === 2) {
    const hole = Number(parts[0]);
    const playerId = parts[1];
    return {
      hole: Number.isFinite(hole) ? hole : null,
      playerId: playerId || null,
    };
  }
  // Legacy format (just playerId)
  return { hole: null, playerId: String(value) };
};

// Stableford Points Calculator
interface StablefordPlayerResult {
  playerId: string;
  player: Player;
  pointsFront: number;
  pointsBack: number;
  pointsTotal: number;
  holePoints: Array<{ holeNumber: number; points: number; toPar: number; strokesReceived: number }>;
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
      
      holePoints.push({ holeNumber: score.holeNumber, points: holePoint, toPar, strokesReceived });
      
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
  // Tie-breaker info
  hasTie: boolean;
  tiedPlayers: Player[];
  tieHole: number | null;
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

// Medal General result block - reusable for group/global scopes
const MedalResultBlock: React.FC<{
  result: MedalGeneralResult;
  all18HolesConfirmed: boolean;
  basePlayerId?: string;
  label?: string;
  sameGroupPlayerIds: Set<string>;
}> = ({ result, all18HolesConfirmed, basePlayerId, label, sameGroupPlayerIds }) => {
  if (!result.hasValidScores || result.winners.length === 0) {
    return (
      <div className="text-xs text-muted-foreground p-2 bg-muted/20 rounded">
        {label && <span className="font-medium mr-1">{label}:</span>}
        Sin scores confirmados suficientes
      </div>
    );
  }

  const amountWon = result.winners[0]?.amountWon || 0;
  // Check if winner is from the same group as base player
  const winnerInSameGroup = result.winners.some(w => sameGroupPlayerIds.has(w.playerId));
  const isConfirmed = all18HolesConfirmed;

  // Neutral style when amount is 0
  const isZeroAmount = amountWon === 0;
  const useGreen = !isZeroAmount && winnerInSameGroup;
  const useAmber = !isZeroAmount && !winnerInSameGroup;

  return (
    <div className={cn(
      'rounded-lg p-3',
      isZeroAmount
        ? 'bg-muted/50 border border-border/50'
        : useGreen ? 'bg-green-500/10 border border-green-500/30' : 'bg-amber-500/10 border border-amber-500/30'
    )}>
      {label && (
        <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">{label}</span>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('text-sm', isZeroAmount ? 'text-muted-foreground' : useGreen ? 'text-green-500' : 'text-amber-500')}>
            {isConfirmed ? '🏆' : '📊'}
          </span>
          <div className="flex items-center gap-1">
            {result.winners.map((winner, idx) => (
              <React.Fragment key={winner.playerId}>
                {idx > 0 && <span className="text-xs text-muted-foreground mx-1">&</span>}
                <PlayerAvatar initials={winner.initials} background={winner.color} size="sm" isLoggedInUser={winner.playerId === basePlayerId} />
                <span className="font-medium text-sm">{formatPlayerName(winner.name).split(' ')[0]}</span>
                <span className="text-xs text-muted-foreground">(Neto: {winner.netScore})</span>
              </React.Fragment>
            ))}
          </div>
        </div>
        {isZeroAmount ? (
          <span className="text-xs text-muted-foreground">$0</span>
        ) : (
          <span className={cn('font-bold text-sm', useGreen ? 'text-green-600' : 'text-amber-600')}>
            {isConfirmed ? '+' : '~'}${amountWon}
          </span>
        )}
      </div>
      {result.winners.length > 1 && (
        <p className="text-[10px] text-muted-foreground mt-1">
          Empate - pot dividido entre {result.winners.length} jugadores
        </p>
      )}
    </div>
  );
};

// Stableford result block - reusable for group/global scopes
const StablefordResultBlock: React.FC<{
  results: StablefordPlayerResult[];
  amount: number;
  basePlayerId?: string;
  label?: string;
  sameGroupPlayerIds: Set<string>;
}> = ({ results, amount, basePlayerId, label, sameGroupPlayerIds }) => {
  if (results.length === 0) return null;
  const isWinner = results[0].pointsTotal > (results[1]?.pointsTotal ?? 0);
  const winnerInSameGroup = isWinner && sameGroupPlayerIds.has(results[0].playerId);

  return (
    <div className="space-y-1">
      {label && (
        <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <div className="grid grid-cols-4 gap-2 cursor-pointer hover:bg-muted/20 rounded-lg p-2 transition-colors">
            {results.slice(0, 8).map((result, idx) => {
              const isTop = idx === 0 && isWinner;
              return (
                <div
                  key={result.playerId}
                  className={cn(
                    "flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg",
                    isTop ? "bg-green-500/20 border border-green-500/30" : "bg-muted/50"
                  )}
                >
                  <div className="relative">
                    <PlayerAvatar initials={result.player.initials} background={result.player.color} size="sm" isLoggedInUser={result.playerId === basePlayerId} />
                    {isTop && <Trophy className="h-3 w-3 text-amber-500 absolute -top-1 -right-1" />}
                  </div>
                  <span className={cn("text-sm font-bold", isTop ? "text-green-600" : "")}>
                    {result.pointsTotal}
                  </span>
                  <span className="text-[8px] text-muted-foreground">
                    F{result.pointsFront} B{result.pointsBack}
                  </span>
                </div>
              );
            })}
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-[340px] max-h-[70vh] overflow-y-auto" side="top">
          <div className="space-y-2">
            <div className="font-semibold text-sm flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />
              Stableford - Detalle por Hoyo {label ? `(${label})` : ''}
            </div>
            {/* Front 9 */}
            <div className="grid grid-cols-[50px_repeat(9,1fr)_35px] gap-0.5 text-[8px] text-muted-foreground">
              <div></div>
              {[1,2,3,4,5,6,7,8,9].map(h => <div key={h} className="text-center">{h}</div>)}
              <div className="text-center font-semibold">F9</div>
            </div>
            {results.map(r => (
              <div key={r.playerId} className="grid grid-cols-[50px_repeat(9,1fr)_35px] gap-0.5 items-center">
                <PlayerAvatar initials={r.player.initials} background={r.player.color} size="sm" isLoggedInUser={r.playerId === basePlayerId} />
                {[1,2,3,4,5,6,7,8,9].map(h => {
                  const hp = r.holePoints.find(p => p.holeNumber === h);
                  return (
                    <div key={h} className={cn(
                      "text-center text-[10px] font-bold rounded py-0.5 relative",
                      !hp ? "text-muted-foreground" :
                      hp.points >= 3 ? "bg-amber-500/30 text-amber-700" :
                      hp.points >= 2 ? "bg-green-500/30 text-green-700" :
                      hp.points >= 1 ? "bg-blue-500/20 text-blue-600" :
                      hp.points === 0 ? "bg-muted/50" :
                      "bg-red-500/20 text-destructive"
                    )}>
                      {hp?.points ?? '-'}
                      {hp && hp.strokesReceived > 0 && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-foreground" />}
                    </div>
                  );
                })}
                <div className="text-center text-[10px] font-bold bg-muted/50 rounded py-0.5">{r.pointsFront}</div>
              </div>
            ))}
            {/* Back 9 */}
            <div className="grid grid-cols-[50px_repeat(9,1fr)_35px] gap-0.5 text-[8px] text-muted-foreground mt-2">
              <div></div>
              {[10,11,12,13,14,15,16,17,18].map(h => <div key={h} className="text-center">{h}</div>)}
              <div className="text-center font-semibold">B9</div>
            </div>
            {results.map(r => (
              <div key={`${r.playerId}-back`} className="grid grid-cols-[50px_repeat(9,1fr)_35px] gap-0.5 items-center">
                <PlayerAvatar initials={r.player.initials} background={r.player.color} size="sm" isLoggedInUser={r.playerId === basePlayerId} />
                {[10,11,12,13,14,15,16,17,18].map(h => {
                  const hp = r.holePoints.find(p => p.holeNumber === h);
                  return (
                    <div key={h} className={cn(
                      "text-center text-[10px] font-bold rounded py-0.5 relative",
                      !hp ? "text-muted-foreground" :
                      hp.points >= 3 ? "bg-amber-500/30 text-amber-700" :
                      hp.points >= 2 ? "bg-green-500/30 text-green-700" :
                      hp.points >= 1 ? "bg-blue-500/20 text-blue-600" :
                      hp.points === 0 ? "bg-muted/50" :
                      "bg-red-500/20 text-destructive"
                    )}>
                      {hp?.points ?? '-'}
                      {hp && hp.strokesReceived > 0 && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-foreground" />}
                    </div>
                  );
                })}
                <div className="text-center text-[10px] font-bold bg-muted/50 rounded py-0.5">{r.pointsBack}</div>
              </div>
            ))}
            <div className="border-t border-border/50 pt-2 mt-2 text-center text-[10px] text-muted-foreground">
              Toca afuera para cerrar
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {/* Winner display */}
      {isWinner && (
        <div className={cn(
          "rounded-lg p-2",
          amount > 0
            ? (winnerInSameGroup ? "bg-green-500/10 border border-green-500/30" : "bg-amber-500/10 border border-amber-500/30")
            : "bg-muted/50 border border-border/50"
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={cn("text-xs", amount > 0 ? (winnerInSameGroup ? "text-green-500" : "text-amber-500") : "text-muted-foreground")}>🏆</span>
              <PlayerAvatar initials={results[0].player.initials} background={results[0].player.color} size="sm" isLoggedInUser={results[0].playerId === basePlayerId} />
              <span className="font-medium text-sm">{formatPlayerName(results[0].player.name).split(' ')[0]}</span>
              <span className="text-[10px] text-muted-foreground">{results[0].pointsTotal} pts</span>
            </div>
            {amount > 0 ? (
              <span className={cn("font-bold", winnerInSameGroup ? "text-green-600" : "text-amber-600")}>
                +${amount * (results.length - 1)}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">$0</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Skins Grupal Popover - detailed hole-by-hole grid
const SkinsGrupalPopover: React.FC<{
  segment: string;
  holes: Array<{ holeNum: number; nets: Array<{ playerId: string; net: number; strokesReceived: number }>; winnerId: string | null; accumulated: number; skinValue: number }>;
  participants: Player[];
  getPlayerAbbr: (p: Player) => string;
  basePlayerId?: string;
}> = ({ segment, holes, participants, getPlayerAbbr, basePlayerId }) => {
  return (
    <div className="space-y-2">
      <span className="font-medium text-sm">{segment} — Skins Grupal</span>
      <div className="overflow-x-auto">
        <table className="text-[10px] border-collapse w-full">
          <thead>
            <tr>
              <th className="p-0.5 text-[9px] text-muted-foreground font-normal text-left">H</th>
              {participants.map(p => (
                <th key={p.id} className="p-0.5 text-center font-bold min-w-[28px]">
                  {getPlayerAbbr(p)}
                </th>
              ))}
              <th className="p-0.5 text-center text-[9px] text-muted-foreground font-normal">Skin</th>
            </tr>
          </thead>
          <tbody>
            {holes.map(hole => {
              const winner = hole.winnerId;
              return (
                <tr key={hole.holeNum}>
                  <td className="p-0.5 text-muted-foreground font-medium">{hole.holeNum}</td>
                  {participants.map(p => {
                    const entry = hole.nets.find(n => n.playerId === p.id);
                    if (!entry) return <td key={p.id} className="p-0.5 text-center text-muted-foreground">-</td>;
                    const isWinner = winner === p.id;
                    return (
                      <td key={p.id} className={cn(
                        'p-0.5 text-center font-bold',
                        isWinner ? 'bg-green-100 dark:bg-green-900/30 text-green-700' :
                        winner ? 'bg-red-100 dark:bg-red-900/20 text-destructive' :
                        'text-muted-foreground'
                      )}>
                        {entry.net}{entry.strokesReceived > 0 && <span className="text-primary">•</span>}
                      </td>
                    );
                  })}
                  <td className={cn(
                    'p-0.5 text-center font-bold',
                    winner ? 'text-green-600' : hole.accumulated > 0 ? 'text-muted-foreground' : ''
                  )}>
                    {winner ? (hole.skinValue > 0 ? `$${hole.skinValue}` : '✓') : hole.accumulated > 0 ? `(${hole.accumulated})` : '·'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
  onBetConfigChange,
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

  // Helper: get players in the same group as the base player (for per-group bets)
  const sameGroupPlayers = useMemo(() => {
    const basePlayer = players.find(p => p.id === basePlayerId || p.profileId === basePlayerId);
    const baseGroupId = basePlayer?.groupId;
    if (!baseGroupId) return players; // No group info = single group, use all
    return players.filter(p => p.groupId === baseGroupId);
  }, [players, basePlayerId]);

  // Disambiguated initials for this group
  const disambiguatedAbbrs = useMemo(() => disambiguateInitials(sameGroupPlayers), [sameGroupPlayers]);
  const getPlayerAbbr = (player: Player) => disambiguatedAbbrs.get(player.id) || player.initials;

  // Helper: resolve participants for this group, handling template inheritance.
  // When participantIds was set for Group 1 only, Group 2 players won't be in the list.
  // In that case, treat it as "all group players participate".
  const resolveGroupParticipants = (participantIds: string[] | undefined): typeof sameGroupPlayers => {
    if (!participantIds || participantIds.length === 0) return sameGroupPlayers;
    
    // Logic for late-joined guests: if all profile-based players of this group who are in the round
    // are present in the participant list, we assume guests of the same group should also be included.
    // This allows templates created for Group 1 to work for Group 2, and handles guests added after setup.
    const groupProfilePlayers = sameGroupPlayers.filter(p => p.profileId);
    const profilePlayersInList = groupProfilePlayers.filter(p => participantIds.includes(p.id));
    const groupPlayersInList = sameGroupPlayers.filter(p => participantIds.includes(p.id));

    // Fallback 1: If ALL profile players from this group are in the list, include guests too.
    if (profilePlayersInList.length === groupProfilePlayers.length && groupProfilePlayers.length > 0) {
      return sameGroupPlayers;
    }

    // Fallback 2: if NONE of our group players are in the list, it's likely a template inheritance
    // issue from a different group. Return ALL group players.
    if (groupPlayersInList.length === 0) return sameGroupPlayers;
    
    return groupPlayersInList;
  };

  // Calculate Coneja results (scoped to same group)
  const conejaResult = useMemo(() => {
    if (!betConfig.coneja?.enabled || sameGroupPlayers.length < 2) return null;

    // Filter by participantIds to respect participation setup
    const conejaParticipantIds = betConfig.coneja.participantIds;
    const conejaPlayers = (conejaParticipantIds && conejaParticipantIds.length > 0)
      ? sameGroupPlayers.filter(p => conejaParticipantIds.includes(p.id))
      : sameGroupPlayers;
    const effectiveConejaPlayers = conejaPlayers.length >= 2 ? conejaPlayers : sameGroupPlayers;

    const setResults = calculateConejaSetResults(effectiveConejaPlayers, scores, course, betConfig, confirmedHoles);
    const holeDisplays = getConejaHoleDisplays(effectiveConejaPlayers, scores, course, betConfig, confirmedHoles);
    const amount = betConfig.coneja.amount || 50;
    
    // Get winners for display
    const winners = setResults
      .filter(sr => sr.winnerId)
      .map(sr => {
        const winner = sameGroupPlayers.find(p => p.id === sr.winnerId);
        const numConejas = sr.isAccumulated && sr.accumulatedSets.length > 0 ? sr.accumulatedSets.length : 1;
        return {
          setNumber: sr.setNumber,
          player: winner,
          accumulatedSets: sr.accumulatedSets,
          amount: amount * numConejas * (sameGroupPlayers.length - 1),
          isAccumulated: sr.isAccumulated,
          wonOnHole: sr.wonOnHole,
        };
      });
    
    return { setResults, holeDisplays, winners, amount };
  }, [sameGroupPlayers, scores, course, betConfig, confirmedHoles]);

  // Helper to calculate Medal General for a given player pool
  const calculateMedalForPool = (pool: Player[]): MedalGeneralResult | null => {
    if (!betConfig.medalGeneral?.enabled || pool.length < 2) return null;

    const playerHandicaps = betConfig.medalGeneral.playerHandicaps || [];
    const amount = betConfig.medalGeneral.amount ?? 100;

    const playerNetScores: Array<{ playerId: string; name: string; initials: string; color: string; netScore: number; groupId?: string }> = [];

    pool.forEach(player => {
      const playerScores = scores.get(player.id) || [];
      const confirmedScores = playerScores.filter(s => s.confirmed && s.strokes > 0);
      if (confirmedScores.length === 0) return;

      const playerHcp = playerHandicaps.find(ph => ph.playerId === player.id);
      const handicap = playerHcp?.handicap ?? player.handicap;
      const strokesPerHole = calculateStrokesPerHole(handicap, course);
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
        groupId: player.groupId,
      });
    });

    if (playerNetScores.length < 2) return null;

    const minNet = Math.min(...playerNetScores.map(p => p.netScore));
    const winners = playerNetScores.filter(p => p.netScore === minNet);
    const losersCount = playerNetScores.length - winners.length;
    if (losersCount === 0) return null;

    const totalPot = losersCount * amount;
    const amountPerWinner = winners.length > 0 ? totalPot / winners.length : 0;

    return {
      enabled: true,
      amount,
      winners: winners.map(w => ({ ...w, amountWon: amountPerWinner })),
      hasValidScores: true,
    };
  };

  // Medal General results based on scope
  const medalScope = betConfig.medalGeneral?.scope ?? 'global';
  const hasMultipleGroups = useMemo(() => {
    const groupIds = new Set(players.map(p => p.groupId).filter(Boolean));
    return groupIds.size > 1;
  }, [players]);

  const medalGeneralGroupResult = useMemo((): MedalGeneralResult | null => {
    if (!hasMultipleGroups || medalScope === 'global') return null;
    return calculateMedalForPool(sameGroupPlayers);
  }, [sameGroupPlayers, scores, betConfig.medalGeneral, course, hasMultipleGroups, medalScope]);

  const medalGeneralGlobalResult = useMemo((): MedalGeneralResult | null => {
    if (hasMultipleGroups && medalScope === 'group') return null;
    return calculateMedalForPool(players);
  }, [players, scores, betConfig.medalGeneral, course, hasMultipleGroups, medalScope]);

  // For backward compat: single result for non-multi-group or single scope
  const medalGeneralResult = medalGeneralGroupResult || medalGeneralGlobalResult;



  // Calculate Culebras - show count and loser payment (scoped to same group)
  const culebrasResult = useMemo((): OccurrenceBetResult | null => {
    if (!betConfig.culebras?.enabled || sameGroupPlayers.length < 2) {
      return null;
    }

    const valuePerOccurrence = betConfig.culebras.valuePerOccurrence || 25;
    
    // Filter to only participating players within the same group (with template inheritance)
    const participatingPlayers = resolveGroupParticipants(betConfig.culebras.participantIds);
    
    if (participatingPlayers.length < 2) return null;

    // Find all culebras (3+ putts) - ONLY from participating players
    const allCulebras: { playerId: string; holeNumber: number; putts: number }[] = [];

    participatingPlayers.forEach(player => {
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
        const player = participatingPlayers.find(p => p.id === c.playerId);
        return {
          playerId: c.playerId,
          playerInitial: player?.initials?.charAt(0) || '?',
          holeNumber: c.holeNumber,
        };
      });

    // Find last player to pay (most recent culebra by hole number)
    let loser = null;
    let hasTie = false;
    let tiedPlayers: Player[] = [];
    let tieHole: number | null = null;
    
    if (allCulebras.length > 0) {
      const maxHole = Math.max(...allCulebras.map(c => c.holeNumber));
      const culebrasOnLastHole = allCulebras.filter(c => c.holeNumber === maxHole);
      const maxPutts = Math.max(...culebrasOnLastHole.map(c => c.putts));
      const playersWithMaxPutts = culebrasOnLastHole.filter(c => c.putts === maxPutts);
      
      // Check if there's a tie
      if (playersWithMaxPutts.length > 1) {
        hasTie = true;
        tieHole = maxHole;
        tiedPlayers = playersWithMaxPutts
          .map(c => participatingPlayers.find(p => p.id === c.playerId))
          .filter((p): p is Player => p !== undefined);
        
        // Check if there's a manual override
        const override = parseTieBreak(betConfig.culebras.tieBreakLoser);
        // Only apply override if it was chosen for THIS tie hole
        if (override.hole === maxHole && override.playerId && playersWithMaxPutts.some(c => c.playerId === override.playerId)) {
          const loserPlayer = participatingPlayers.find(p => p.id === override.playerId);
          if (loserPlayer) {
            hasTie = false; // Tie resolved
            const totalLoss = amountPerPlayer * (participatingPlayers.length - 1);
            loser = {
              playerId: loserPlayer.id,
              name: loserPlayer.name,
              initials: loserPlayer.initials,
              color: loserPlayer.color,
              totalLoss,
            };
          }
        }
      } else if (playersWithMaxPutts.length === 1) {
        const loserPlayer = participatingPlayers.find(p => p.id === playersWithMaxPutts[0].playerId);
        if (loserPlayer) {
          const totalLoss = amountPerPlayer * (participatingPlayers.length - 1);
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
      hasTie,
      tiedPlayers,
      tieHole,
    };
  }, [sameGroupPlayers, scores, betConfig.culebras]);

  // Calculate Pinguinos - show count and loser payment (scoped to same group)
  const pinguinosResult = useMemo((): OccurrenceBetResult | null => {
    if (!betConfig.pinguinos?.enabled || sameGroupPlayers.length < 2) {
      return null;
    }

    const valuePerOccurrence = betConfig.pinguinos.valuePerOccurrence || 25;
    
    // Filter to only participating players within the same group (with template inheritance)
    const participatingPlayers = resolveGroupParticipants(betConfig.pinguinos.participantIds);
    
    if (participatingPlayers.length < 2) return null;

    // Find all pinguinos (triple bogey or worse = +3 or more over par) - ONLY from participating players
    const allPinguinos: { playerId: string; holeNumber: number; overPar: number }[] = [];

    participatingPlayers.forEach(player => {
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
        const player = participatingPlayers.find(pl => pl.id === p.playerId);
        return {
          playerId: p.playerId,
          playerInitial: player?.initials?.charAt(0) || '?',
          holeNumber: p.holeNumber,
        };
      });

    // Find last player to pay
    let loser = null;
    let hasTie = false;
    let tiedPlayers: Player[] = [];
    let tieHole: number | null = null;
    
    if (allPinguinos.length > 0) {
      const maxHole = Math.max(...allPinguinos.map(p => p.holeNumber));
      const pinguinosOnLastHole = allPinguinos.filter(p => p.holeNumber === maxHole);
      const maxOverPar = Math.max(...pinguinosOnLastHole.map(p => p.overPar));
      const playersWithMaxOverPar = pinguinosOnLastHole.filter(p => p.overPar === maxOverPar);
      
      // Check if there's a tie
      if (playersWithMaxOverPar.length > 1) {
        hasTie = true;
        tieHole = maxHole;
        tiedPlayers = playersWithMaxOverPar
          .map(p => participatingPlayers.find(pl => pl.id === p.playerId))
          .filter((p): p is Player => p !== undefined);
        
        // Check if there's a manual override
        const override = parseTieBreak(betConfig.pinguinos.tieBreakLoser);
        // Only apply override if it was chosen for THIS tie hole
        if (override.hole === maxHole && override.playerId && playersWithMaxOverPar.some(p => p.playerId === override.playerId)) {
          const loserPlayer = participatingPlayers.find(p => p.id === override.playerId);
          if (loserPlayer) {
            hasTie = false; // Tie resolved
            const totalLoss = amountPerPlayer * (participatingPlayers.length - 1);
            loser = {
              playerId: loserPlayer.id,
              name: loserPlayer.name,
              initials: loserPlayer.initials,
              color: loserPlayer.color,
              totalLoss,
            };
          }
        }
      } else if (playersWithMaxOverPar.length === 1) {
        const loserPlayer = participatingPlayers.find(p => p.id === playersWithMaxOverPar[0].playerId);
        if (loserPlayer) {
          const totalLoss = amountPerPlayer * (participatingPlayers.length - 1);
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
      hasTie,
      tiedPlayers,
      tieHole,
    };
  }, [sameGroupPlayers, scores, betConfig.pinguinos, course]);

  // Calculate Stableford points based on scope
  const stablefordScope = betConfig.stableford?.scope ?? 'global';

  const stablefordGroupResults = useMemo(() => {
    if (!hasMultipleGroups || stablefordScope === 'global') return [];
    return calculateStablefordPoints(sameGroupPlayers, scores, course, betConfig);
  }, [sameGroupPlayers, scores, course, betConfig, hasMultipleGroups, stablefordScope]);

  const stablefordGlobalResults = useMemo(() => {
    if (hasMultipleGroups && stablefordScope === 'group') return [];
    return calculateStablefordPoints(players, scores, course, betConfig);
  }, [players, scores, course, betConfig, hasMultipleGroups, stablefordScope]);

  // For backward compat
  const stablefordResults = stablefordGroupResults.length > 0 ? stablefordGroupResults : stablefordGlobalResults;

  // Calculate Manchas summary per player (informational only)
  const manchasSummary = useMemo(() => {
    if (sameGroupPlayers.length < 2) return null;
    const MANCHA_MARKERS = ['ladies', 'swingBlanco', 'retruje', 'trampa', 'dobleAgua', 'dobleOB', 'par3GirMas3', 'dobleDigito', 'moreliana', 'cuatriput'];
    const MANCHA_LABELS: Record<string, { label: string; emoji: string; short: string }> = {
      ladies:       { label: 'Ladies',       emoji: '👠', short: 'Pinkies' },
      swingBlanco:  { label: 'Swing Blanco', emoji: '💨', short: 'Paloma' },
      retruje:      { label: 'Retruje',      emoji: '↩️', short: 'Retruje' },
      trampa:       { label: 'Trampa',       emoji: '⚠️', short: 'Trampa' },
      dobleAgua:    { label: 'Doble Agua',   emoji: '🌊', short: '2xAgua' },
      dobleOB:      { label: 'Doble OB',     emoji: '🚫', short: '2xOB' },
      par3GirMas3:  { label: 'Par3 GIR+3',  emoji: '⛳', short: 'GIR>3' },
      dobleDigito:  { label: 'Doble Dígito',emoji: '💀', short: '10+' },
      moreliana:    { label: 'Moreliana',    emoji: '🎭', short: 'Morel' },
      cuatriput:    { label: 'Cuatriput',    emoji: '😱', short: '4+Putt' },
    };
    const participatingPlayers = resolveGroupParticipants(betConfig.manchas.participantIds);
    if (participatingPlayers.length < 2) return null;

    const playerData = participatingPlayers.map(player => {
      const playerScores = scores.get(player.id) || [];
      const manchas: { marker: string; label: string; emoji: string; short: string; holeNumber: number }[] = [];
      playerScores.forEach(score => {
        if (!score.confirmed || !score.strokes) return;
        // Manual markers
        if (score.markers) {
          MANCHA_MARKERS.forEach(key => {
            const camelKey = key;
            if (camelKey === 'dobleDigito' || camelKey === 'cuatriput') return; // handled below
            if ((score.markers as any)[camelKey]) {
              manchas.push({ marker: camelKey, ...(MANCHA_LABELS[key] || { label: key, emoji: '❗', short: key }), holeNumber: score.holeNumber });
            }
          });
        }
        // Auto-detected: Doble Dígito (10+ strokes)
        const hasDobleDigito = score.strokes >= 10 || !!(score.markers as any)?.dobleDigito;
        if (hasDobleDigito) {
          manchas.push({ marker: 'dobleDigito', ...MANCHA_LABELS.dobleDigito, holeNumber: score.holeNumber });
        }
        // Auto-detected: Cuatriput (4+ putts)
        const hasCuatriput = (score.putts != null && score.putts >= 4) || !!(score.markers as any)?.cuatriput;
        if (hasCuatriput) {
          manchas.push({ marker: 'cuatriput', ...MANCHA_LABELS.cuatriput, holeNumber: score.holeNumber });
        }
      });
      return { player, manchas, total: manchas.length };
    });

    const totalManchas = playerData.reduce((s, p) => s + p.total, 0);
    return { playerData, totalManchas };
  }, [sameGroupPlayers, scores, betConfig.manchas, course.holes]);

  // Calculate Unidades summary per player (informational only)
  const unidadesSummary = useMemo(() => {
    if (sameGroupPlayers.length < 2) return null;
    const UNIT_MARKERS = ['birdie', 'eagle', 'albatross', 'holeOut', 'aquaPar', 'sandyPar'];
    const UNIT_LABELS: Record<string, { label: string; emoji: string; short: string }> = {
      birdie:    { label: 'Birdie',      emoji: '🐦', short: 'Birdie' },
      eagle:     { label: 'Águila',      emoji: '🦅', short: 'Águila' },
      albatross: { label: 'Albatros',    emoji: '🦢', short: 'Albatros' },
      holeOut:   { label: 'Hole Out',    emoji: '🎯', short: 'HoleOut' },
      aquaPar:   { label: 'Aqua Par',    emoji: '💧', short: 'AquaPar' },
      sandyPar:  { label: 'Sandy Par',   emoji: '🏖️', short: 'Sandy' },
    };
    const participatingPlayers = resolveGroupParticipants(betConfig.units.participantIds);
    if (participatingPlayers.length < 2) return null;

    const playerData = participatingPlayers.map(player => {
      const playerScores = scores.get(player.id) || [];
      const unidades: { marker: string; label: string; emoji: string; short: string; holeNumber: number }[] = [];
      playerScores.forEach(score => {
        if (!score.confirmed || !score.strokes) return;
        const holePar = course.holes[score.holeNumber - 1]?.par || 4;
        const toPar = score.strokes - holePar;
        // Auto-detected score-based units
        if (toPar <= -3) {
          unidades.push({ marker: 'albatross', ...UNIT_LABELS.albatross, holeNumber: score.holeNumber });
        } else if (toPar === -2) {
          unidades.push({ marker: 'eagle', ...UNIT_LABELS.eagle, holeNumber: score.holeNumber });
        } else if (toPar === -1) {
          unidades.push({ marker: 'birdie', ...UNIT_LABELS.birdie, holeNumber: score.holeNumber });
        }
        // Manual markers (holeOut, aquaPar, sandyPar)
        if (score.markers) {
          ['holeOut', 'aquaPar', 'sandyPar'].forEach(key => {
            if ((score.markers as any)[key]) {
              unidades.push({ marker: key, ...(UNIT_LABELS[key] || { label: key, emoji: '⭐', short: key }), holeNumber: score.holeNumber });
            }
          });
        }
      });
      return { player, unidades, total: unidades.length };
    });

    const totalUnidades = playerData.reduce((s, p) => s + p.total, 0);
    return { playerData, totalUnidades };
  }, [sameGroupPlayers, scores, betConfig.units, course.holes]);


  // Calculate Oyeses summary per par-3 hole (informational only)
  const oyesesSummary = useMemo(() => {
    if (sameGroupPlayers.length < 2) return null;

    // Use resolveGroupParticipants for proper participant resolution (handles profileId/id mismatch)
    const activePlayers = resolveGroupParticipants(betConfig.oyeses?.participantIds);
    if (activePlayers.length < 2) return null;

    const playerConfigs = betConfig.oyeses?.playerConfigs || [];
    // CRITICAL: Filter configs to only active participants to prevent a sangron config
    // from a non-participant from poisoning the fallback. Default is ALWAYS 'acumulados'.
    const activePlayerIds = new Set(activePlayers.map(p => p.id));
    const activeConfigs = playerConfigs.filter(c => activePlayerIds.has(c.playerId));

    const getEffectiveModality = (playerId: string): 'acumulados' | 'sangron' => {
      const found = activeConfigs.find(c => c.playerId === playerId);
      if (found?.enabled && found.modality === 'sangron') return 'sangron';
      return 'acumulados'; // Default fallback is always acumulados
    };

    const hasAcumulados = activePlayers.some(p => getEffectiveModality(p.id) === 'acumulados');
    const hasSangron = activePlayers.some(p => getEffectiveModality(p.id) === 'sangron');

    // Get par 3 holes from course
    const par3Holes = course.holes.filter(h => h.par === 3).map(h => h.number);

    const holeSummaries = par3Holes.map(holeNumber => {
      // Acumulados rankings: ALL active players, sorted by oyes_proximity
      const acumuladosRankings = hasAcumulados ? activePlayers
        .map(player => {
          const s = scores.get(player.id)?.find(sc => sc.holeNumber === holeNumber);
          return { playerId: player.id, rank: s?.oyesProximity ?? null };
        })
        .sort((a, b) => {
          if (a.rank === null) return 1;
          if (b.rank === null) return -1;
          return a.rank - b.rank;
        }) : null;

      // Sangrón rankings: ALL active players, sorted by oyes_proximity_sangron
      // with fallback to oyes_proximity (per memory: rayas-oyeses-sangron-fallback)
      const sangronRankings = hasSangron ? activePlayers
        .map(player => {
          const s = scores.get(player.id)?.find(sc => sc.holeNumber === holeNumber);
          return { playerId: player.id, rank: s?.oyesProximitySangron ?? s?.oyesProximity ?? null };
        })
        .sort((a, b) => {
          if (a.rank === null) return 1;
          if (b.rank === null) return -1;
          return a.rank - b.rank;
        }) : null;

      const hasAcumuladoEntry = acumuladosRankings
        ? activePlayers.some(p => scores.get(p.id)?.some(sc => sc.holeNumber === holeNumber))
        : false;
      const hasData = (acumuladosRankings?.some(r => r.rank !== null) || sangronRankings?.some(r => r.rank !== null) || hasAcumuladoEntry);
      return { holeNumber, acumuladosRankings, sangronRankings, hasData };
    });

    // Count holes that have actual data for the counter
    const holesWithData = holeSummaries.filter(h => h.hasData).length;

    return { holeSummaries, hasAcumulados, hasSangron, totalPar3: par3Holes.length, holesWithData, activePlayers };
  }, [betConfig.oyeses, scores, course, sameGroupPlayers]);

  // Calculate Zoologico results for each animal type (scoped to same group)
  const zoologicoResults = useMemo((): ZoologicoAnimalResult[] => {
    if (!betConfig.zoologico?.enabled || sameGroupPlayers.length < 2) return [];
    
    const enabledAnimals = betConfig.zoologico.enabledAnimals || ['camello', 'pez', 'gorila'];
    // Maintain order: camello, pez, gorila
    const orderedAnimals: ZooAnimalType[] = ['camello', 'pez', 'gorila'];
    
    return orderedAnimals
      .filter(animal => enabledAnimals.includes(animal))
      .map(animal => calculateZoologicoAnimalResult(animal, sameGroupPlayers, betConfig.zoologico))
      .filter((r): r is ZoologicoAnimalResult => r !== null);
  }, [sameGroupPlayers, betConfig.zoologico]);

  // State for collapsible occurrence details
  const [showCulebrasDetail, setShowCulebrasDetail] = useState(false);
  const [showPinguinosDetail, setShowPinguinosDetail] = useState(false);
  const [showZooDetail, setShowZooDetail] = useState<ZooAnimalType | null>(null);
  const [showManchasPanel, setShowManchasPanel] = useState(false);
  const [showUnidadesPanel, setShowUnidadesPanel] = useState(false);
  const [showOyesesPanel, setShowOyesesPanel] = useState(false);
  const [oyesesPanelTab, setOyesesPanelTab] = useState<'acumulado' | 'sangron'>('acumulado');
  
  // Handler for tie-breaker selection (amount editing removed - was a syntax error request)
  // Handler for tie-breaker selection
  const handleSelectTieBreakLoser = (betType: 'culebras' | 'pinguinos', tieHole: number, playerId: string) => {
    if (!onBetConfigChange) return;
    const value = `${tieHole}:${playerId}`;
    
    if (betType === 'culebras') {
      onBetConfigChange({
        ...betConfig,
        culebras: { ...betConfig.culebras, tieBreakLoser: value },
      });
    } else {
      onBetConfigChange({
        ...betConfig,
        pinguinos: { ...betConfig.pinguinos, tieBreakLoser: value },
      });
    }
  };

  // Handler for Zoologico tie-breaker
  const handleSelectZooTieBreakLoser = (animalType: ZooAnimalType, tieHole: number, playerId: string) => {
    if (!onBetConfigChange) return;
    const value = `${tieHole}:${playerId}`;
    
    onBetConfigChange({
      ...betConfig,
      zoologico: {
        ...betConfig.zoologico,
        tieBreakers: {
          ...(betConfig.zoologico?.tieBreakers || {}),
          [animalType]: value,
        },
      },
    });
  };
  
  // Calculate Skins Grupal results
  const skinsGrupalResult = useMemo(() => {
    if (!betConfig.skinsGrupal?.enabled || sameGroupPlayers.length < 2) return null;
    
    const cfg = betConfig.skinsGrupal;
    const participants = cfg.participantIds?.length
      ? sameGroupPlayers.filter(p => cfg.participantIds!.includes(p.id))
      : sameGroupPlayers;
    if (participants.length < 2) return null;

    const getNetScore = (playerId: string, holeNum: number): number | null => {
      const ph = cfg.playerHandicaps?.find(h => h.playerId === playerId);
      const hcp = ph?.handicap ?? players.find(p => p.id === playerId)?.handicap ?? 0;
      const strokesPerHole = calculateStrokesPerHole(hcp, course);
      const playerScores = scores.get(playerId) || [];
      const score = playerScores.find(s => s.confirmed && s.holeNumber === holeNum);
      if (!score || !score.strokes) return null;
      return score.strokes - (strokesPerHole[holeNum - 1] || 0);
    };

    const getStrokesReceived = (playerId: string, holeNum: number): number => {
      const ph = cfg.playerHandicaps?.find(h => h.playerId === playerId);
      const hcp = ph?.handicap ?? players.find(p => p.id === playerId)?.handicap ?? 0;
      return calculateStrokesPerHole(hcp, course)[holeNum - 1] || 0;
    };

    const processSegment = (holes: number[], amount: number, segment: 'front' | 'back') => {
      const empty = { holes: [] as Array<{ holeNum: number; nets: Array<{ playerId: string; net: number; strokesReceived: number }>; winnerId: string | null; accumulated: number; skinValue: number }>, totalByPlayer: new Map<string, number>(), skinCountByPlayer: new Map<string, number>() };
      if (amount <= 0) return empty;
      
      const modality = cfg.modality ?? 'acumulados';
      const holeResults: typeof empty.holes = [];
      const totalByPlayer = new Map<string, number>(participants.map(p => [p.id, 0]));
      const skinCountByPlayer = new Map<string, number>(participants.map(p => [p.id, 0]));

      if (modality === 'sinAcumular') {
        holes.forEach(holeNum => {
          const nets = participants.map(p => ({ playerId: p.id, net: getNetScore(p.id, holeNum), strokesReceived: getStrokesReceived(p.id, holeNum) }))
            .filter(x => x.net !== null) as Array<{ playerId: string; net: number; strokesReceived: number }>;
          if (nets.length < 2) { holeResults.push({ holeNum, nets, winnerId: null, accumulated: 0, skinValue: 0 }); return; }
          const minNet = Math.min(...nets.map(x => x.net));
          const winners = nets.filter(x => x.net === minNet);
          const winnerId = winners.length === 1 ? winners[0].playerId : null;
          if (winnerId) {
            skinCountByPlayer.set(winnerId, (skinCountByPlayer.get(winnerId) || 0) + 1);
            totalByPlayer.set(winnerId, (totalByPlayer.get(winnerId) || 0) + 1);
          }
          holeResults.push({ holeNum, nets, winnerId, accumulated: 0, skinValue: winnerId ? 1 : 0 });
        });
      } else {
        let accumulated = 0;
        holes.forEach(holeNum => {
          const nets = participants.map(p => ({ playerId: p.id, net: getNetScore(p.id, holeNum), strokesReceived: getStrokesReceived(p.id, holeNum) }))
            .filter(x => x.net !== null) as Array<{ playerId: string; net: number; strokesReceived: number }>;
          accumulated += amount;
          if (nets.length < 2) { holeResults.push({ holeNum, nets, winnerId: null, accumulated, skinValue: 0 }); return; }
          const minNet = Math.min(...nets.map(x => x.net));
          const winners = nets.filter(x => x.net === minNet);
          if (winners.length === 1) {
            skinCountByPlayer.set(winners[0].playerId, (skinCountByPlayer.get(winners[0].playerId) || 0) + 1);
            holeResults.push({ holeNum, nets, winnerId: winners[0].playerId, accumulated: 0, skinValue: accumulated });
            totalByPlayer.set(winners[0].playerId, (totalByPlayer.get(winners[0].playerId) || 0) + accumulated);
            accumulated = 0;
          } else {
            holeResults.push({ holeNum, nets, winnerId: null, accumulated, skinValue: 0 });
          }
        });
      }

      return { holes: holeResults, totalByPlayer, skinCountByPlayer };
    };

    const frontHoles = Array.from({ length: 9 }, (_, i) => i + 1);
    const backHoles = Array.from({ length: 9 }, (_, i) => i + 10);
    const front = processSegment(frontHoles, cfg.frontAmount, 'front');
    const back = processSegment(backHoles, cfg.backAmount, 'back');

    return { front, back, participants, cfg };
  }, [betConfig.skinsGrupal, sameGroupPlayers, scores, course, players]);

  // Check if any group bet is enabled
  const hasAnyBet = medalGeneralGroupResult || medalGeneralGlobalResult || culebrasResult || pinguinosResult || zoologicoResults.length > 0 || conejaResult || betConfig.stableford?.enabled || manchasSummary || unidadesSummary || oyesesSummary || skinsGrupalResult;

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
        {/* Culebras - Simplified view with collapsible detail */}
        {culebrasResult && (
          <div className="space-y-2">
            <div 
              className="flex items-start justify-between cursor-pointer hover:bg-muted/20 rounded-lg p-2 -m-2 transition-colors"
              onClick={() => setShowCulebrasDetail(!showCulebrasDetail)}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{culebrasResult.emoji}</span>
                <span className="font-medium text-sm">{culebrasResult.title}</span>
                <span className="text-lg font-bold text-destructive">({culebrasResult.totalCount})</span>
              </div>
              <div className="flex items-center gap-2">
                {culebrasResult.hasTie && (
                  <span className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Empate
                  </span>
                )}
                {culebrasResult.loser && (
                  <div className="flex flex-col items-end">
                    <span className="text-destructive font-bold text-sm">-${culebrasResult.loser.totalLoss}</span>
                    <span className="text-xs text-muted-foreground">{formatPlayerNameTwoWords(culebrasResult.loser.name)}</span>
                  </div>
                )}
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", showCulebrasDetail && "rotate-180")} />
              </div>
            </div>
            
            {/* Tie-breaker UI */}
            {culebrasResult.hasTie && culebrasResult.tiedPlayers.length > 0 && onBetConfigChange && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 ml-6">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    Empate en Hoyo {culebrasResult.tieHole} - Selecciona quién paga
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {culebrasResult.tiedPlayers.map(player => (
                    <Button
                      key={player.id}
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => handleSelectTieBreakLoser('culebras', culebrasResult.tieHole || 0, player.id)}
                    >
                      <PlayerAvatar initials={player.initials} background={player.color} size="sm" isLoggedInUser={player.id === basePlayerId} />
                      <span className="ml-1.5">{formatPlayerName(player.name).split(' ')[0]}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
            
            {showCulebrasDetail && (culebrasResult.loser || culebrasResult.hasTie) && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 ml-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">Hoyos con culebras:</span>
                  <span className="text-xs">${culebrasResult.valuePerOccurrence} c/u × {culebrasResult.totalCount} = ${culebrasResult.amountPerPlayer}/jug</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {culebrasResult.occurrences.map((occ, idx) => {
                    const player = players.find(p => p.id === occ.playerId);
                    return (
                      <Popover key={idx}>
                        <PopoverTrigger asChild>
                          <span className="text-xs bg-muted/50 px-2 py-1 rounded font-medium cursor-pointer hover:bg-muted transition-colors">
                            H{occ.holeNumber} - {player?.initials || occ.playerInitial}
                          </span>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-2" side="top">
                          <div className="text-xs">
                            <p className="font-medium">{formatPlayerName(player?.name || 'Jugador')}</p>
                            <p className="text-muted-foreground">Hoyo {occ.holeNumber} - 3+ putts</p>
                          </div>
                        </PopoverContent>
                      </Popover>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pinguinos - Simplified view with collapsible detail */}
        {pinguinosResult && (
          <>
            {culebrasResult && <div className="border-t border-border/50" />}
            <div className="space-y-2">
              <div 
                className="flex items-start justify-between cursor-pointer hover:bg-muted/20 rounded-lg p-2 -m-2 transition-colors"
                onClick={() => setShowPinguinosDetail(!showPinguinosDetail)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{pinguinosResult.emoji}</span>
                  <span className="font-medium text-sm">{pinguinosResult.title}</span>
                  <span className="text-lg font-bold text-destructive">({pinguinosResult.totalCount})</span>
                </div>
                <div className="flex items-center gap-2">
                  {pinguinosResult.hasTie && (
                    <span className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Empate
                    </span>
                  )}
                  {pinguinosResult.loser && (
                    <div className="flex flex-col items-end">
                      <span className="text-destructive font-bold text-sm">-${pinguinosResult.loser.totalLoss}</span>
                      <span className="text-xs text-muted-foreground">{formatPlayerNameTwoWords(pinguinosResult.loser.name)}</span>
                    </div>
                  )}
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", showPinguinosDetail && "rotate-180")} />
                </div>
              </div>
              
              {/* Tie-breaker UI */}
              {pinguinosResult.hasTie && pinguinosResult.tiedPlayers.length > 0 && onBetConfigChange && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 ml-6">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      Empate en Hoyo {pinguinosResult.tieHole} - Selecciona quién paga
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {pinguinosResult.tiedPlayers.map(player => (
                      <Button
                        key={player.id}
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => handleSelectTieBreakLoser('pinguinos', pinguinosResult.tieHole || 0, player.id)}
                      >
                        <PlayerAvatar initials={player.initials} background={player.color} size="sm" isLoggedInUser={player.id === basePlayerId} />
                        <span className="ml-1.5">{formatPlayerName(player.name).split(' ')[0]}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              
              {showPinguinosDetail && (pinguinosResult.loser || pinguinosResult.hasTie) && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 ml-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Hoyos con pingüinos:</span>
                    <span className="text-xs">${pinguinosResult.valuePerOccurrence} c/u × {pinguinosResult.totalCount} = ${pinguinosResult.amountPerPlayer}/jug</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {pinguinosResult.occurrences.map((occ, idx) => {
                      const player = players.find(p => p.id === occ.playerId);
                      return (
                        <Popover key={idx}>
                          <PopoverTrigger asChild>
                            <span className="text-xs bg-muted/50 px-2 py-1 rounded font-medium cursor-pointer hover:bg-muted transition-colors">
                              H{occ.holeNumber} - {player?.initials || occ.playerInitial}
                            </span>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-2" side="top">
                            <div className="text-xs">
                              <p className="font-medium">{formatPlayerName(player?.name || 'Jugador')}</p>
                              <p className="text-muted-foreground">Hoyo {occ.holeNumber} - +3 o más sobre par</p>
                            </div>
                          </PopoverContent>
                        </Popover>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Zoologico - Camellos, Peces, Gorilas (after Pingüinos, before Coneja) */}
        {zoologicoResults.map((result, idx) => (
          <React.Fragment key={result.animalType}>
            {(idx === 0 && (culebrasResult || pinguinosResult)) && <div className="border-t border-border/50" />}
            {idx > 0 && <div className="border-t border-border/30" />}
            <div className="space-y-2">
              <div 
                className="flex items-start justify-between cursor-pointer hover:bg-muted/20 rounded-lg p-2 -m-2 transition-colors"
                onClick={() => setShowZooDetail(showZooDetail === result.animalType ? null : result.animalType)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{result.emoji}</span>
                  <span className="font-medium text-sm">{result.labelPlural}</span>
                  <span className="text-lg font-bold text-destructive">({result.totalOccurrences})</span>
                </div>
                <div className="flex items-center gap-2">
                  {result.hasTie && (
                    <span className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Empate
                    </span>
                  )}
                  {result.loser && (
                    <div className="flex flex-col items-end">
                      <span className="text-destructive font-bold text-sm">-${result.loser.totalLoss}</span>
                      <span className="text-xs text-muted-foreground">{formatPlayerNameTwoWords(result.loser.name)}</span>
                    </div>
                  )}
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", showZooDetail === result.animalType && "rotate-180")} />
                </div>
              </div>
              
              {/* Tie-breaker UI */}
              {result.hasTie && result.tiedPlayers.length > 0 && onBetConfigChange && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 ml-6">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      Empate en Hoyo {result.tieHole} - Selecciona quién paga
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {result.tiedPlayers.map(player => (
                      <Button
                        key={player.id}
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => handleSelectZooTieBreakLoser(result.animalType, result.tieHole || 0, player.id)}
                      >
                        <PlayerAvatar initials={player.initials} background={player.color} size="sm" isLoggedInUser={player.id === basePlayerId} />
                        <span className="ml-1.5">{formatPlayerName(player.name).split(' ')[0]}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              
              {showZooDetail === result.animalType && (result.loser || result.hasTie) && result.events.length > 0 && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 ml-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Incidencias:</span>
                    <span className="text-xs">${result.valuePerOccurrence} c/u × {result.totalOccurrences} = ${result.amountPerPlayer}/jug</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {result.events.map((event, eventIdx) => (
                      <Popover key={eventIdx}>
                        <PopoverTrigger asChild>
                          <span className="text-xs bg-muted/50 px-2 py-1 rounded font-medium cursor-pointer hover:bg-muted transition-colors">
                            H{event.holeNumber} - {event.playerInitials}{event.count > 1 ? ` (×${event.count})` : ''}
                          </span>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-2" side="top">
                          <div className="text-xs">
                            <p className="font-medium">{formatPlayerName(event.playerName)}</p>
                            <p className="text-muted-foreground">
                              Hoyo {event.holeNumber} - {result.emoji} {ZOO_ANIMALS[result.animalType].description}
                              {event.count > 1 && ` (${event.count} veces)`}
                            </p>
                          </div>
                        </PopoverContent>
                      </Popover>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </React.Fragment>
        ))}

        {/* Manchas & Unidades toggle buttons - Informational */}
        {(manchasSummary || unidadesSummary || oyesesSummary) && (
          <>
            {(culebrasResult || pinguinosResult || zoologicoResults.length > 0) && <div className="border-t border-border/50" />}
            {/* Toggle buttons row — order: Oyeses, Unidades, Manchas */}
            <div className="flex justify-center gap-6">
              {oyesesSummary && (
                <button
                  onClick={() => setShowOyesesPanel(v => !v)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl px-5 py-2 transition-colors border',
                    showOyesesPanel
                      ? 'bg-blue-500/10 border-blue-500/40'
                      : 'bg-muted/40 border-transparent hover:bg-muted/70'
                  )}
                >
                  <div className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center transition-all',
                    showOyesesPanel || oyesesSummary.holesWithData > 0
                      ? 'bg-blue-500 text-white'
                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  )}>
                    <Target className="h-5 w-5" strokeWidth={2} />
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground">Oyeses</span>
                  {oyesesSummary.totalPar3 > 0 && (
                    <span className="text-lg font-bold text-blue-600 leading-none">{oyesesSummary.holesWithData}/{oyesesSummary.totalPar3}</span>
                  )}
                </button>
              )}
              {unidadesSummary && (
                <button
                  onClick={() => setShowUnidadesPanel(v => !v)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl px-5 py-2 transition-colors border',
                    showUnidadesPanel
                      ? 'bg-green-500/10 border-green-500/40'
                      : 'bg-muted/40 border-transparent hover:bg-muted/70'
                  )}
                >
                  <div className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center transition-all',
                    showUnidadesPanel || unidadesSummary.totalUnidades > 0
                      ? 'bg-green-500 text-white'
                      : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                  )}>
                    <Check className="h-5 w-5" strokeWidth={2.5} />
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground">Unidades</span>
                  {unidadesSummary.totalUnidades > 0 && (
                    <span className="text-lg font-bold text-green-600 leading-none">{unidadesSummary.totalUnidades}</span>
                  )}
                </button>
              )}
              {manchasSummary && (
                <button
                  onClick={() => setShowManchasPanel(v => !v)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl px-5 py-2 transition-colors border',
                    showManchasPanel
                      ? 'bg-destructive/10 border-destructive/40'
                      : 'bg-muted/40 border-transparent hover:bg-muted/70'
                  )}
                >
                  <div className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center transition-all',
                    showManchasPanel || manchasSummary.totalManchas > 0
                      ? 'bg-destructive text-destructive-foreground'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  )}>
                    <X className="h-5 w-5" strokeWidth={2.5} />
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground">Manchas</span>
                  {manchasSummary.totalManchas > 0 && (
                    <span className="text-lg font-bold text-destructive leading-none">{manchasSummary.totalManchas}</span>
                  )}
                </button>
              )}
            </div>

            {/* Manchas panel — columns: each player's incidents stacked vertically */}
            {showManchasPanel && manchasSummary && (
              <div className="space-y-1">
                {(() => {
                  const allPlayerData = manchasSummary.playerData;
                  if (allPlayerData.length === 0) return <p className="text-xs text-muted-foreground text-center py-2">Sin manchas aún</p>;
                  const colCount = allPlayerData.length;
                  return (
                    <div className="w-full px-2">
                      {/* Header: initials */}
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0,1fr))` }}>
                        {allPlayerData.map(({ player }) => (
                          <div key={player.id} className="text-center text-[11px] font-bold text-destructive py-1">
                            {getPlayerAbbr(player)}
                          </div>
                        ))}
                      </div>
                      {/* Counts row */}
                      <div className="grid gap-2 border-b border-destructive/30 pb-1.5" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0,1fr))` }}>
                        {allPlayerData.map(({ player, total }) => (
                          <div key={player.id} className={cn('text-center text-lg font-bold leading-none', total > 0 ? 'text-destructive' : 'text-muted-foreground/40')}>
                            {total}
                          </div>
                        ))}
                      </div>
                      {/* Per-player columns with stacked incidents */}
                      <div className="grid gap-2 mt-1" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0,1fr))` }}>
                        {allPlayerData.map(({ player, manchas }) => {
                          const sorted = [...manchas].sort((a, b) => a.holeNumber - b.holeNumber);
                          // Deduplicate
                          const unique = sorted.filter((m, i) => !sorted.slice(0, i).find(prev => prev.holeNumber === m.holeNumber && prev.label === m.label));
                          return (
                            <div key={player.id} className="flex flex-col items-center px-0.5">
                              {unique.map((m, i) => (
                                <div key={i} className="flex items-baseline gap-0.5 leading-tight">
                                  <span className="text-[9px] text-destructive font-mono w-[18px] text-right shrink-0">H{m.holeNumber}</span>
                                  <span className="text-[9px] text-destructive font-medium">{m.short}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                      {manchasSummary.totalManchas === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-2">Sin manchas aún</p>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Unidades panel — columns: each player's incidents stacked vertically */}
            {showUnidadesPanel && unidadesSummary && (
              <div className="space-y-1">
                {(() => {
                  const allPlayerData = unidadesSummary.playerData;
                  if (allPlayerData.length === 0) return <p className="text-xs text-muted-foreground text-center py-2">Sin unidades aún</p>;
                  const colCount = allPlayerData.length;
                  return (
                    <div className="w-full px-2">
                      {/* Header: initials */}
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0,1fr))` }}>
                        {allPlayerData.map(({ player }) => (
                          <div key={player.id} className="text-center text-[11px] font-bold text-green-600 py-1">
                            {getPlayerAbbr(player)}
                          </div>
                        ))}
                      </div>
                      {/* Counts row */}
                       <div className="grid gap-2 border-b border-green-600/30 pb-1.5" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0,1fr))` }}>
                        {allPlayerData.map(({ player, total }) => (
                          <div key={player.id} className={cn('text-center text-lg font-bold leading-none', total > 0 ? 'text-green-600' : 'text-muted-foreground/40')}>
                            {total}
                          </div>
                        ))}
                      </div>
                      {/* Per-player columns with stacked incidents */}
                      <div className="grid gap-2 mt-1" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0,1fr))` }}>
                        {allPlayerData.map(({ player, unidades }) => {
                          const sorted = [...unidades].sort((a, b) => a.holeNumber - b.holeNumber);
                          const unique = sorted.filter((u, i) => !sorted.slice(0, i).find(prev => prev.holeNumber === u.holeNumber && prev.label === u.label));
                          return (
                            <div key={player.id} className="flex flex-col items-center px-0.5">
                              {unique.map((u, i) => (
                                <div key={i} className="flex items-baseline gap-0.5 leading-tight">
                                  <span className="text-[9px] text-green-600 font-mono w-[18px] text-right shrink-0">H{u.holeNumber}</span>
                                   <span className="text-[9px] text-green-600 font-medium">{u.short}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                      {unidadesSummary.totalUnidades === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-2">Sin unidades aún</p>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Oyeses panel — tabla con columna de posiciones y columnas por hoyo */}
            {showOyesesPanel && oyesesSummary && (
              <div className="space-y-3">
                {oyesesSummary.holesWithData === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">Sin datos de Oyeses aún</p>
                ) : (
                  <>
                    {/* Tab toggle when both modalities coexist */}
                    {oyesesSummary.hasAcumulados && oyesesSummary.hasSangron && (
                      <div className="flex gap-1 p-0.5 bg-muted/60 rounded-lg">
                        <button
                          onClick={() => setOyesesPanelTab('acumulado')}
                          className={cn(
                            'flex-1 py-1 px-2 text-[10px] font-medium rounded-md transition-all text-center',
                            oyesesPanelTab === 'acumulado'
                              ? 'bg-background shadow text-foreground'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          Acumulado
                        </button>
                        <button
                          onClick={() => setOyesesPanelTab('sangron')}
                          className={cn(
                            'flex-1 py-1 px-2 text-[10px] font-medium rounded-md transition-all text-center',
                            oyesesPanelTab === 'sangron'
                              ? 'bg-background shadow text-foreground'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          ⚡ Sangrón
                        </button>
                      </div>
                    )}

                    {/* Determine which tab to show */}
                    {(() => {
                      // If only one modality, show that one; if both, use tab selection
                      const showAcumulado = oyesesSummary.hasAcumulados && (!oyesesSummary.hasSangron || oyesesPanelTab === 'acumulado');
                      const showSangron = oyesesSummary.hasSangron && (!oyesesSummary.hasAcumulados || oyesesPanelTab === 'sangron');

                      if (showAcumulado) {
                        const acumHoles = oyesesSummary.holeSummaries.filter(h => h.acumuladosRankings);
                        if (acumHoles.length === 0) return null;
                        const maxRows = Math.max(...acumHoles.map(h => {
                          const ranked = (h.acumuladosRankings || []).filter(r => r.rank !== null).length;
                          const unrankedConfirmed = (h.acumuladosRankings || []).filter(r =>
                            r.rank === null && scores.get(r.playerId)?.some(sc => sc.holeNumber === h.holeNumber && sc.confirmed)
                          ).length;
                          return ranked + unrankedConfirmed;
                        }));
                        if (maxRows === 0) return <p className="text-xs text-muted-foreground text-center py-2">Sin datos de Acumulado aún</p>;
                        return (
                          <div className="space-y-1">
                            {!oyesesSummary.hasSangron && (
                              <span className="text-[9px] text-muted-foreground">Modalidad Acumulado</span>
                            )}
                            <div className="grid w-full" style={{ gridTemplateColumns: `20px repeat(${acumHoles.length}, 1fr)` }}>
                              <div className="text-[9px] text-muted-foreground text-center pb-1" />
                              {acumHoles.map(hole => (
                                <div key={hole.holeNumber} className="text-[10px] font-bold text-blue-500 text-center pb-1">
                                  H{hole.holeNumber}
                                </div>
                              ))}
                              <div className="col-span-full h-px bg-border/50 mb-1" />
                              {Array.from({ length: maxRows }, (_, rowIdx) => (
                                <React.Fragment key={rowIdx}>
                                  <div className="text-[10px] text-muted-foreground text-center flex items-center justify-center min-h-[22px] font-medium">
                                    {rowIdx + 1}
                                  </div>
                                  {acumHoles.map(hole => {
                                    const ranked = (hole.acumuladosRankings || []).filter(r => r.rank !== null);
                                    const entry = ranked[rowIdx];
                                    const p = entry ? (oyesesSummary.activePlayers || sameGroupPlayers).find(pl => pl.id === entry.playerId) : null;
                                    const showNoGir = !entry && (() => {
                                      const allEntries = hole.acumuladosRankings || [];
                                      const unranked = allEntries.filter(r => r.rank === null);
                                      const unrankedIdx = rowIdx - ranked.length;
                                      if (unrankedIdx >= 0 && unrankedIdx < unranked.length) {
                                        const pid = unranked[unrankedIdx].playerId;
                                        return scores.get(pid)?.some(sc => sc.holeNumber === hole.holeNumber && sc.confirmed);
                                      }
                                      return false;
                                    })();
                                    return (
                                      <div key={hole.holeNumber} className="text-center flex items-center justify-center min-h-[22px] px-0.5">
                                        {p ? (
                                          <span className={cn(
                                            'text-[11px] font-semibold leading-tight block truncate',
                                            rowIdx === 0 ? 'text-foreground' : 'text-muted-foreground'
                                          )}>
                                            {getPlayerAbbr(p)}
                                          </span>
                                        ) : showNoGir ? (
                                          <span className="text-[11px] font-bold text-destructive">✕</span>
                                        ) : (
                                          <span className="text-[11px] text-muted-foreground/40">—</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                        );
                      }

                      if (showSangron) {
                        const sangronHoles = oyesesSummary.holeSummaries.filter(h => h.sangronRankings);
                        if (sangronHoles.length === 0) return null;
                        const numPlayers = oyesesSummary.activePlayers?.length || sameGroupPlayers.length;
                        return (
                          <div className="space-y-1">
                            {!oyesesSummary.hasAcumulados && (
                              <span className="text-[9px] text-muted-foreground">Modalidad Sangrón</span>
                            )}
                            <div className="grid w-full" style={{ gridTemplateColumns: `20px repeat(${sangronHoles.length}, 1fr)` }}>
                              <div className="text-[9px] text-muted-foreground text-center pb-1" />
                              {sangronHoles.map(hole => (
                                <div key={hole.holeNumber} className="text-[10px] font-bold text-amber-500 text-center pb-1">
                                  H{hole.holeNumber}
                                </div>
                              ))}
                              <div className="col-span-full h-px bg-border/50 mb-1" />
                              {Array.from({ length: numPlayers }, (_, rowIdx) => (
                                <React.Fragment key={rowIdx}>
                                  <div className="text-[10px] text-muted-foreground text-center flex items-center justify-center min-h-[22px] font-medium">
                                    {rowIdx + 1}
                                  </div>
                                  {sangronHoles.map(hole => {
                                    const sorted = [...(hole.sangronRankings || [])].sort((a, b) => {
                                      if (a.rank === null) return 1;
                                      if (b.rank === null) return -1;
                                      return a.rank - b.rank;
                                    });
                                    const entry = sorted[rowIdx];
                                    const p = entry ? (oyesesSummary.activePlayers || sameGroupPlayers).find(pl => pl.id === entry.playerId) : null;
                                    return (
                                      <div key={hole.holeNumber} className="text-center flex items-center justify-center min-h-[22px] px-0.5">
                                        {p && entry?.rank !== null ? (
                                          <span className={cn(
                                            'text-[11px] font-semibold leading-tight block truncate',
                                            rowIdx === 0 ? 'text-foreground' : 'text-muted-foreground'
                                          )}>
                                            {getPlayerAbbr(p)}
                                          </span>
                                        ) : (
                                          <span className="text-[11px] text-muted-foreground/40">—</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                        );
                      }

                      return null;
                    })()}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* Coneja - Patas system (before Medal General) */}
        {conejaResult && (
          <>
            {(culebrasResult || pinguinosResult || zoologicoResults.length > 0 || manchasSummary) && <div className="border-t border-border/50" />}
            <ConejaSection
              conejaResult={conejaResult}
              players={sameGroupPlayers}
              scores={scores}
              course={course}
              betConfig={betConfig}
              confirmedHoles={confirmedHoles}
              basePlayerId={basePlayerId}
              getPlayer={getPlayer}
            />
          </>
        )}

        {/* Medal General - Scope-aware rendering */}
        {(medalGeneralGroupResult || medalGeneralGlobalResult) && (
          <>
            {(culebrasResult || pinguinosResult || zoologicoResults.length > 0 || conejaResult) && <div className="border-t border-border/50" />}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-yellow-500" />
                  <span className="font-medium text-sm">Medal General</span>
                  {hasMultipleGroups && medalScope !== 'global' && (
                    <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {medalScope === 'group' ? 'Grupo' : 'Ambas'}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">${betConfig.medalGeneral?.amount ?? 100} c/u</span>
              </div>
              
              {/* Group result */}
              {medalGeneralGroupResult && (
                <MedalResultBlock
                  result={medalGeneralGroupResult}
                  all18HolesConfirmed={all18HolesConfirmed}
                  basePlayerId={basePlayerId}
                  label={medalScope === 'both' ? 'Grupo' : undefined}
                  sameGroupPlayerIds={new Set(sameGroupPlayers.map(p => p.id))}
                />
              )}
              
              {/* Global result */}
              {medalGeneralGlobalResult && (
                <MedalResultBlock
                  result={medalGeneralGlobalResult}
                  all18HolesConfirmed={all18HolesConfirmed}
                  basePlayerId={basePlayerId}
                  label={medalScope === 'both' ? 'General' : undefined}
                  sameGroupPlayerIds={new Set(sameGroupPlayers.map(p => p.id))}
                />
              )}
            </div>
          </>
        )}
        
        {/* Stableford - Scope-aware rendering */}
        {betConfig.stableford?.enabled && (stablefordGroupResults.length > 0 || stablefordGlobalResults.length > 0) && (
          <>
            <div className="border-t border-border/50" />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500" />
                  <span className="font-medium text-sm">Stableford</span>
                  {hasMultipleGroups && stablefordScope !== 'global' && (
                    <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {stablefordScope === 'group' ? 'Grupo' : 'Ambas'}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">${betConfig.stableford.amount ?? 100} c/u</span>
              </div>
              
              {/* Group result */}
              {stablefordGroupResults.length > 0 && (
                <StablefordResultBlock
                  results={stablefordGroupResults}
                  amount={betConfig.stableford.amount ?? 100}
                  basePlayerId={basePlayerId}
                  label={stablefordScope === 'both' ? 'Grupo' : undefined}
                  sameGroupPlayerIds={new Set(sameGroupPlayers.map(p => p.id))}
                />
              )}
              
              {/* Global result */}
              {stablefordGlobalResults.length > 0 && (
                <StablefordResultBlock
                  results={stablefordGlobalResults}
                  amount={betConfig.stableford.amount ?? 100}
                  basePlayerId={basePlayerId}
                  label={stablefordScope === 'both' ? 'General' : undefined}
                  sameGroupPlayerIds={new Set(sameGroupPlayers.map(p => p.id))}
                />
              )}
            </div>
          </>
        )}

        {/* Skins Grupal */}
        {skinsGrupalResult && (
          <>
            <div className="border-t border-border/50" />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-emerald-500" />
                  <span className="font-medium text-sm">Skins Grupal</span>
                  <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {skinsGrupalResult.cfg.modality === 'sinAcumular' ? 'Sin Acum' : 'Acumulados'}
                  </span>
                </div>
              </div>

              {/* Front 9 */}
              {skinsGrupalResult.cfg.frontAmount > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <div className="cursor-pointer hover:bg-muted/20 rounded-lg p-2 transition-colors space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">Front 9</span>
                        <span className="text-xs text-muted-foreground">${skinsGrupalResult.cfg.frontAmount}/skin</span>
                      </div>
                      <div className="grid grid-cols-9 gap-0.5">
                        {skinsGrupalResult.front.holes.map(hole => {
                          const winner = hole.winnerId ? getPlayer(hole.winnerId) : null;
                          return (
                            <div key={hole.holeNum} className="flex flex-col items-center">
                              <span className="text-[8px] text-muted-foreground">{hole.holeNum}</span>
                              <div className={cn(
                                'w-full h-6 flex items-center justify-center text-[9px] font-bold rounded',
                                winner ? 'bg-green-100 dark:bg-green-900/30 text-green-700' :
                                hole.accumulated > 0 ? 'bg-muted text-muted-foreground' :
                                'bg-muted/50 text-muted-foreground'
                              )}>
                                {winner ? getPlayerAbbr(winner) : hole.accumulated > 0 ? `(${hole.accumulated})` : '·'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto max-w-[340px] p-3" side="top">
                    <SkinsGrupalPopover segment="Front 9" holes={skinsGrupalResult.front.holes} participants={skinsGrupalResult.participants} getPlayerAbbr={getPlayerAbbr} basePlayerId={basePlayerId} />
                  </PopoverContent>
                </Popover>
              )}

              {/* Back 9 */}
              {skinsGrupalResult.cfg.backAmount > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <div className="cursor-pointer hover:bg-muted/20 rounded-lg p-2 transition-colors space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">Back 9</span>
                        <span className="text-xs text-muted-foreground">${skinsGrupalResult.cfg.backAmount}/skin</span>
                      </div>
                      <div className="grid grid-cols-9 gap-0.5">
                        {skinsGrupalResult.back.holes.map(hole => {
                          const winner = hole.winnerId ? getPlayer(hole.winnerId) : null;
                          return (
                            <div key={hole.holeNum} className="flex flex-col items-center">
                              <span className="text-[8px] text-muted-foreground">{hole.holeNum}</span>
                              <div className={cn(
                                'w-full h-6 flex items-center justify-center text-[9px] font-bold rounded',
                                winner ? 'bg-green-100 dark:bg-green-900/30 text-green-700' :
                                hole.accumulated > 0 ? 'bg-muted text-muted-foreground' :
                                'bg-muted/50 text-muted-foreground'
                              )}>
                                {winner ? getPlayerAbbr(winner) : hole.accumulated > 0 ? `(${hole.accumulated})` : '·'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto max-w-[340px] p-3" side="top">
                    <SkinsGrupalPopover segment="Back 9" holes={skinsGrupalResult.back.holes} participants={skinsGrupalResult.participants} getPlayerAbbr={getPlayerAbbr} basePlayerId={basePlayerId} />
                  </PopoverContent>
                </Popover>
              )}

              {/* Totals per player — unified format: #skins + $amount */}
              {(() => {
                // Merge front + back skin counts
                const mergedCount = new Map<string, number>();
                skinsGrupalResult.front.skinCountByPlayer.forEach((val, pid) => {
                  mergedCount.set(pid, (mergedCount.get(pid) || 0) + val);
                });
                skinsGrupalResult.back.skinCountByPlayer.forEach((val, pid) => {
                  mergedCount.set(pid, (mergedCount.get(pid) || 0) + val);
                });

                // Merge front + back raw skin values (for acumulados)
                const mergedValues = new Map<string, number>();
                skinsGrupalResult.front.totalByPlayer.forEach((val, pid) => {
                  mergedValues.set(pid, (mergedValues.get(pid) || 0) + val);
                });
                skinsGrupalResult.back.totalByPlayer.forEach((val, pid) => {
                  mergedValues.set(pid, (mergedValues.get(pid) || 0) + val);
                });

                const numOthers = skinsGrupalResult.participants.length - 1;
                const isAcumulados = skinsGrupalResult.cfg.modality !== 'sinAcumular';

                // Compute gross winnings per player (what they collect from others)
                // Both modalities: each skin won = winner collects value from each other participant
                const grossWinnings = new Map<string, number>();
                if (isAcumulados) {
                  // mergedValues already has the accumulated skin values
                  mergedValues.forEach((val, pid) => {
                    grossWinnings.set(pid, val * numOthers);
                  });
                } else {
                  // sinAcumular: each skin = flat amount × numOthers
                  const frontAmt = skinsGrupalResult.cfg.frontAmount;
                  const backAmt = skinsGrupalResult.cfg.backAmount;
                  mergedCount.forEach((_, pid) => {
                    const frontSkins = skinsGrupalResult.front.skinCountByPlayer.get(pid) || 0;
                    const backSkins = skinsGrupalResult.back.skinCountByPlayer.get(pid) || 0;
                    const gross = (frontSkins * frontAmt + backSkins * backAmt) * numOthers;
                    grossWinnings.set(pid, gross);
                  });
                }

                const allWithSkins = Array.from(mergedCount.entries())
                  .filter(([, count]) => count > 0)
                  .sort((a, b) => (netMoney.get(b[0]) || 0) - (netMoney.get(a[0]) || 0));
                if (allWithSkins.length === 0) return null;

                return (
                  <div className="space-y-1 mt-1">
                    {allWithSkins.map(([pid, skinCount]) => {
                      const p = getPlayer(pid);
                      if (!p) return null;
                      const displayAmount = netMoney.get(pid) || 0;
                      const isPositive = displayAmount > 0;
                      const isNegative = displayAmount < 0;
                      return (
                        <div key={pid} className={cn(
                          'flex items-center justify-between rounded-lg px-2 py-1',
                          isPositive ? 'bg-green-500/10 border border-green-500/30' : 'bg-muted/30 border border-border/50'
                        )}>
                          <div className="flex items-center gap-2">
                            {isPositive && <span className="text-green-500 text-xs">🏆</span>}
                            <PlayerAvatar initials={p.initials} background={p.color} size="sm" isLoggedInUser={p.id === basePlayerId} />
                            <span className="font-medium text-sm">{formatPlayerNameTwoWords(p.name)}</span>
                            <span className="text-[10px] text-muted-foreground bg-golf-gold/20 text-golf-dark rounded-full px-1.5 py-0.5 font-semibold">
                              {skinCount} skin{skinCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <span className={cn('font-bold text-sm', isPositive ? 'text-green-600' : isNegative ? 'text-red-500' : 'text-muted-foreground')}>
                            {isPositive ? '+' : isNegative ? '-' : ''}${Math.abs(displayAmount)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

// Helper to compute medal general bilateral for a specific player pool
const computeMedalBilateralForPool = (
  pool: Player[],
  player: Player,
  rival: Player,
  scores: Map<string, PlayerScore[]>,
  betConfig: BetConfig,
  course: GolfCourse
): { isWinner: boolean; isTied: boolean; amount: number; playerNet: number; rivalNet: number } | null => {
  const playerHandicaps = betConfig.medalGeneral?.playerHandicaps || [];
  const amount = betConfig.medalGeneral?.amount ?? 100;

  const netTotals: Array<{ playerId: string; netTotal: number }> = [];

  pool.forEach((p) => {
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

  if (netTotals.length < 2) return null;

  // Both player and rival must be in the pool
  const playerEntry = netTotals.find(n => n.playerId === player.id);
  const rivalEntry = netTotals.find(n => n.playerId === rival.id);
  if (!playerEntry || !rivalEntry) return null;

  const minNetTotal = Math.min(...netTotals.map((p) => p.netTotal));
  const winnerIds = new Set(netTotals.filter((p) => p.netTotal === minNetTotal).map((p) => p.playerId));
  const winnersCount = winnerIds.size;
  const losersCount = netTotals.length - winnersCount;

  if (losersCount === 0) return null;

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
    isWinner: playerEntry.netTotal < rivalEntry.netTotal,
    isTied: playerEntry.netTotal === rivalEntry.netTotal,
    amount: bilateralAmount,
    playerNet: playerEntry.netTotal,
    rivalNet: rivalEntry.netTotal,
  };
};

// Utility function to calculate Medal General result for bilateral view
// Respects scope setting: group, global, or both (summing both pools)
export const getMedalGeneralBilateralResult = (
  allPlayers: Player[],
  player: Player,
  rival: Player,
  scores: Map<string, PlayerScore[]>,
  betConfig: BetConfig,
  course: GolfCourse
): { isWinner: boolean; isTied: boolean; amount: number; playerNet: number; rivalNet: number } | null => {
  if (!betConfig.medalGeneral?.enabled) return null;

  const scope = betConfig.medalGeneral?.scope ?? 'global';
  const hasMultipleGroups = new Set(allPlayers.map(p => p.groupId).filter(Boolean)).size > 1;

  if (!hasMultipleGroups || scope === 'global') {
    return computeMedalBilateralForPool(allPlayers, player, rival, scores, betConfig, course);
  }

  // For 'group' or 'both': calculate within group
  const playerGroupId = player.groupId;
  const groupPool = playerGroupId
    ? allPlayers.filter(p => p.groupId === playerGroupId)
    : allPlayers;

  if (scope === 'group') {
    return computeMedalBilateralForPool(groupPool, player, rival, scores, betConfig, course);
  }

  // scope === 'both': sum group + global results
  const groupResult = computeMedalBilateralForPool(groupPool, player, rival, scores, betConfig, course);
  const globalResult = computeMedalBilateralForPool(allPlayers, player, rival, scores, betConfig, course);

  if (!groupResult && !globalResult) return null;

  const totalAmount = (groupResult?.amount ?? 0) + (globalResult?.amount ?? 0);
  const playerNet = globalResult?.playerNet ?? groupResult?.playerNet ?? 0;
  const rivalNet = globalResult?.rivalNet ?? groupResult?.rivalNet ?? 0;

  return {
    isWinner: playerNet < rivalNet,
    isTied: playerNet === rivalNet,
    amount: totalAmount,
    playerNet,
    rivalNet,
  };
};

// Utility function to calculate Stableford result for bilateral view
// Respects scope setting: group, global, or both (summing both pools)
export const getStablefordBilateralResult = (
  allPlayers: Player[],
  player: Player,
  rival: Player,
  scores: Map<string, PlayerScore[]>,
  betConfig: BetConfig,
  course: GolfCourse
): { amount: number } | null => {
  if (!betConfig.stableford?.enabled) return null;

  const scope = betConfig.stableford?.scope ?? 'global';
  const hasMultipleGroups = new Set(allPlayers.map(p => p.groupId).filter(Boolean)).size > 1;

  const computeForPool = (pool: Player[]): { amount: number } | null => {
    const points = betConfig.stableford!.points || DEFAULT_STABLEFORD_POINTS;
    const playerHandicaps = betConfig.stableford!.playerHandicaps || [];
    const amount = betConfig.stableford!.amount ?? 100;

    const calcPoints = (p: Player): number => {
      const pScores = scores.get(p.id) || [];
      const confirmed = pScores.filter(s => s.confirmed && s.strokes > 0);
      const hcp = playerHandicaps.find(ph => ph.playerId === p.id)?.handicap ?? p.handicap;
      const strokesPerHole = calculateStrokesPerHole(hcp, course);

      return confirmed.reduce((sum, s) => {
        const holePar = course.holes[s.holeNumber - 1]?.par || 4;
        const received = strokesPerHole[s.holeNumber - 1] || 0;
        const netScore = s.strokes - received;
        const toPar = netScore - holePar;

        if (toPar <= -3) return sum + points.albatross;
        if (toPar === -2) return sum + points.eagle;
        if (toPar === -1) return sum + points.birdie;
        if (toPar === 0) return sum + points.par;
        if (toPar === 1) return sum + points.bogey;
        if (toPar === 2) return sum + points.doubleBogey;
        if (toPar === 3) return sum + points.tripleBogey;
        return sum + points.quadrupleOrWorse;
      }, 0);
    };

    // Both must be in pool
    if (!pool.some(p => p.id === player.id) || !pool.some(p => p.id === rival.id)) return null;

    const allPoints = pool.map(p => ({ playerId: p.id, points: calcPoints(p) }));
    const maxPoints = Math.max(...allPoints.map(p => p.points));
    const winnerIds = new Set(allPoints.filter(p => p.points === maxPoints).map(p => p.playerId));
    const winnersCount = winnerIds.size;
    const losersCount = allPoints.length - winnersCount;

    if (losersCount === 0) return null;

    const amountFromLoserToWinner = amount / winnersCount;
    const isPlayerWinner = winnerIds.has(player.id);
    const isRivalWinner = winnerIds.has(rival.id);

    const bilateralAmount =
      isPlayerWinner && !isRivalWinner ? amountFromLoserToWinner :
      !isPlayerWinner && isRivalWinner ? -amountFromLoserToWinner : 0;

    return { amount: bilateralAmount };
  };

  if (!hasMultipleGroups || scope === 'global') {
    return computeForPool(allPlayers);
  }

  const playerGroupId = player.groupId;
  const groupPool = playerGroupId
    ? allPlayers.filter(p => p.groupId === playerGroupId)
    : allPlayers;

  if (scope === 'group') {
    return computeForPool(groupPool);
  }

  // scope === 'both': sum group + global
  const groupResult = computeForPool(groupPool);
  const globalResult = computeForPool(allPlayers);

  if (!groupResult && !globalResult) return null;

  return { amount: (groupResult?.amount ?? 0) + (globalResult?.amount ?? 0) };
};