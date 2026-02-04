import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Player, GolfCourse, PlayerScore, MarkerState, PlayerGroup, BetConfig, DEFAULT_STABLEFORD_POINTS } from '@/types/golf';
import { calculateScoreToPar, getScoreName, calculateStrokesPerHole } from '@/lib/handicapUtils';
import { Plus, Trophy, Users, Star, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { GroupSelector, getPlayersForGroup } from '@/components/GroupSelector';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ScorecardProps {
  players: Player[];
  course: GolfCourse;
  scores: Map<string, PlayerScore[]>;
  currentHole: number;
  onHoleClick?: (hole: number) => void;
  basePlayerId?: string;
  getStrokeIndicators?: (rivalId: string, holeNumber: number) => { receiving: boolean; giving: boolean };
  confirmedHoles?: Set<number>;
  onAddPlayerClick?: () => void;
  startingHole?: 1 | 10;
  onLeaderboardClick?: () => void;
  playerGroups?: PlayerGroup[];
  betConfig?: BetConfig;
  onQuickScoreClick?: (player: Player) => void;
}

export const Scorecard: React.FC<ScorecardProps> = ({
  players,
  course,
  scores,
  currentHole,
  onHoleClick,
  basePlayerId,
  getStrokeIndicators,
  confirmedHoles = new Set(),
  onAddPlayerClick,
  startingHole = 1,
  onLeaderboardClick,
  playerGroups = [],
  betConfig,
  onQuickScoreClick,
}) => {
  // State for which group to display
  const [displayGroupIndex, setDisplayGroupIndex] = useState(0);
  
  // Get players to display based on selected group, with logged-in player first
  const displayPlayers = useMemo(() => {
    const groupPlayers = getPlayersForGroup(displayGroupIndex, players, playerGroups);
    // Sort to put logged-in player first
    return [...groupPlayers].sort((a, b) => {
      const aIsBase = a.id === basePlayerId || a.profileId === basePlayerId;
      const bIsBase = b.id === basePlayerId || b.profileId === basePlayerId;
      if (aIsBase && !bIsBase) return -1;
      if (!aIsBase && bIsBase) return 1;
      return 0;
    });
  }, [displayGroupIndex, players, playerGroups, basePlayerId]);
  
  const hasMultipleGroups = playerGroups.length > 0;
  // IMPORTANT: Confirmation is per-player (score.confirmed).
  // We keep the confirmedHoles prop only for backwards compatibility, but we don't
  // rely on it for rendering or totals.
  const isHoleConfirmedForPlayer = (playerId: string, holeNumber: number): boolean => {
    const score = scores.get(playerId)?.find((s) => s.holeNumber === holeNumber);
    return Boolean(score?.confirmed);
  };

  const getPlayerScoreForHole = (playerId: string, holeNumber: number): PlayerScore | undefined => {
    return scores.get(playerId)?.find(s => s.holeNumber === holeNumber);
  };

  const getPlayerTotal = (playerId: string, startHole: number, endHole: number): number => {
    let total = 0;
    for (let h = startHole; h <= endHole; h++) {
      // Only count confirmed holes for THIS player
      if (!isHoleConfirmedForPlayer(playerId, h)) continue;
      const score = getPlayerScoreForHole(playerId, h);
      if (score && score.strokes > 0) {
        total += score.strokes;
      }
    }
    return total;
  };

  const getScoreColor = (strokes: number, par: number, confirmed: boolean): string => {
    if (!confirmed) return 'text-muted-foreground/40 font-bold';
    if (strokes === 0) return 'text-muted-foreground font-bold';
    const toPar = strokes - par;
    if (toPar <= -2) return 'text-golf-gold font-bold';
    if (toPar === -1) return 'text-green-500 font-bold';
    if (toPar === 0) return 'text-foreground font-bold';
    if (toPar === 1) return 'text-orange-500 font-bold';
    if (toPar >= 2) return 'text-destructive font-bold';
    return 'text-foreground font-bold';
  };

  const getScoreBg = (strokes: number, par: number, confirmed: boolean): string => {
    if (!confirmed) return '';
    if (strokes === 0) return '';
    const toPar = strokes - par;
    if (toPar <= -2) return 'bg-golf-gold/20 rounded';
    if (toPar === -1) return 'bg-green-500/20 rounded';
    return '';
  };

  // Determine display order based on starting hole
  // When starting at hole 10, show holes 10-18 first, then 1-9
  const firstNine = startingHole === 10 
    ? course.holes.slice(9, 18)  // holes 10-18
    : course.holes.slice(0, 9);   // holes 1-9
  const secondNine = startingHole === 10
    ? course.holes.slice(0, 9)   // holes 1-9
    : course.holes.slice(9, 18);  // holes 10-18
  const firstNinePar = firstNine.reduce((sum, h) => sum + h.par, 0);
  const secondNinePar = secondNine.reduce((sum, h) => sum + h.par, 0);
  
  // Labels for the nine sections
  const firstNineLabel = startingHole === 10 ? 'OUT' : 'OUT';
  const secondNineLabel = startingHole === 10 ? 'IN' : 'IN';
  
  // For total calculations - always holes 1-9 and 10-18
  const frontNine = course.holes.slice(0, 9);
  const backNine = course.holes.slice(9, 18);
  const frontPar = frontNine.reduce((sum, h) => sum + h.par, 0);
  const backPar = backNine.reduce((sum, h) => sum + h.par, 0);

  // Calculate Stableford points for each player if enabled
  const stablefordByPlayer = useMemo(() => {
    if (!betConfig?.stableford?.enabled) return null;
    
    const points = betConfig.stableford.points || DEFAULT_STABLEFORD_POINTS;
    const playerHandicaps = betConfig.stableford.playerHandicaps || [];
    
    const results: Map<string, { front: number; back: number; total: number }> = new Map();
    
    displayPlayers.forEach(player => {
      const playerScores = scores.get(player.id) || [];
      const playerHcp = playerHandicaps.find(ph => ph.playerId === player.id);
      const handicap = playerHcp?.handicap ?? player.handicap;
      const strokesPerHole = calculateStrokesPerHole(handicap, course);
      
      let front = 0;
      let back = 0;
      
      playerScores.filter(s => s.confirmed && s.strokes > 0).forEach(score => {
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
        
        if (score.holeNumber <= 9) front += holePoint;
        else back += holePoint;
      });
      
      results.set(player.id, { front, back, total: front + back });
    });
    
    return results;
  }, [betConfig, displayPlayers, scores, course]);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-primary/10 px-3 py-2 border-b border-border space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-primary">Scorecard</h3>
            <p className="text-[10px] text-muted-foreground">{course.name}</p>
          </div>

          <div className="flex items-center gap-2">
            {onLeaderboardClick && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 px-2 text-xs"
                onClick={onLeaderboardClick}
              >
                <Trophy className="h-3.5 w-3.5 mr-1" />
                Leaderboard
              </Button>
            )}
            {onAddPlayerClick && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 px-2 text-xs"
                onClick={onAddPlayerClick}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Jugador
              </Button>
            )}
          </div>
        </div>
        
        {/* Group Selector */}
        {hasMultipleGroups && (
          <GroupSelector
            currentGroupIndex={displayGroupIndex}
            players={players}
            playerGroups={playerGroups}
            onGroupChange={setDisplayGroupIndex}
            compact
          />
        )}
      </div>

      {/* First Nine (holes 1-9 when starting at 1, holes 10-18 when starting at 10) */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-2 py-1.5 font-medium text-muted-foreground sticky left-0 bg-muted/50 min-w-[80px]">
                Hoyo
              </th>
              {firstNine.map(hole => (
                <th 
                  key={hole.number}
                  onClick={() => onHoleClick?.(hole.number)}
                  className={cn(
                    'px-1.5 py-1.5 font-medium min-w-[28px] text-center cursor-pointer transition-colors',
                    hole.number === currentHole ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  )}
                >
                  {hole.number}
                </th>
              ))}
              <th className="px-2 py-1.5 font-semibold text-center bg-muted min-w-[36px]">{firstNineLabel}</th>
            </tr>
            <tr className="bg-muted/30 text-muted-foreground">
              <td className="px-2 py-1 sticky left-0 bg-muted/30 font-medium">Par</td>
              {firstNine.map(hole => (
                <td key={hole.number} className="text-center px-1.5 py-1 font-medium">{hole.par}</td>
              ))}
              <td className="text-center px-2 py-1 font-semibold bg-muted/50">{firstNinePar}</td>
            </tr>
            <tr className="bg-muted/20 text-muted-foreground text-[10px]">
              <td className="px-2 py-0.5 sticky left-0 bg-muted/20">Index</td>
              {firstNine.map(hole => (
                <td key={hole.number} className="text-center px-1.5 py-0.5">{hole.handicapIndex}</td>
              ))}
              <td className="text-center px-2 py-0.5 bg-muted/30"></td>
            </tr>
          </thead>
          <tbody>
            {displayPlayers.map(player => {
              const firstNineTotal = firstNine.reduce((sum, hole) => {
                if (!isHoleConfirmedForPlayer(player.id, hole.number)) return sum;
                const score = getPlayerScoreForHole(player.id, hole.number);
                return sum + (score?.strokes && score.strokes > 0 ? score.strokes : 0);
              }, 0);
              return (
              <tr key={player.id} className="border-t border-border/50">
                <td className="px-2 py-1 sticky left-0 bg-card">
                  <div className="flex items-center gap-1">
                    <PlayerAvatar initials={player.initials} background={player.color} size="sm" isLoggedInUser={player.id === basePlayerId} />
                    <span className="font-medium truncate max-w-[50px] text-xs">{player.name.split(' ')[0]}</span>
                    {onQuickScoreClick && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onQuickScoreClick(player);
                              }}
                              className="p-0.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                            >
                              <Zap className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="text-xs">
                            Captura rápida
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </td>
                {firstNine.map(hole => {
                  const score = getPlayerScoreForHole(player.id, hole.number);
                  const strokes = score?.strokes || 0;
                  const confirmed = isHoleConfirmedForPlayer(player.id, hole.number);
                  return (
                    <td 
                      key={hole.number}
                      onClick={() => onHoleClick?.(hole.number)}
                      className={cn(
                        'text-center px-1.5 py-1 cursor-pointer',
                        getScoreColor(strokes, hole.par, confirmed),
                        getScoreBg(strokes, hole.par, confirmed)
                      )}
                    >
                      {confirmed ? (strokes > 0 ? strokes : '-') : '-'}
                    </td>
                  );
                })}
                <td className="text-center px-2 py-1 font-semibold bg-muted/30">
                  {firstNineTotal || '-'}
                </td>
              </tr>
            );})}
          </tbody>
        </table>
      </div>

      {/* Separator */}
      <div className="h-1 bg-border" />

      {/* Second Nine */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-2 py-1.5 font-medium text-muted-foreground sticky left-0 bg-muted/50 min-w-[80px]">
                Hoyo
              </th>
              {secondNine.map(hole => (
                <th 
                  key={hole.number}
                  onClick={() => onHoleClick?.(hole.number)}
                  className={cn(
                    'px-1.5 py-1.5 font-medium min-w-[28px] text-center cursor-pointer transition-colors',
                    hole.number === currentHole ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  )}
                >
                  {hole.number}
                </th>
              ))}
              <th className="px-2 py-1.5 font-semibold text-center bg-muted min-w-[36px]">{secondNineLabel}</th>
              <th className="px-2 py-1.5 font-semibold text-center bg-primary/20 text-primary min-w-[40px]">TOT</th>
            </tr>
            <tr className="bg-muted/30 text-muted-foreground">
              <td className="px-2 py-1 sticky left-0 bg-muted/30 font-medium">Par</td>
              {secondNine.map(hole => (
                <td key={hole.number} className="text-center px-1.5 py-1 font-medium">{hole.par}</td>
              ))}
              <td className="text-center px-2 py-1 font-semibold bg-muted/50">{secondNinePar}</td>
              <td className="text-center px-2 py-1 font-semibold bg-primary/10">{frontPar + backPar}</td>
            </tr>
            <tr className="bg-muted/20 text-muted-foreground text-[10px]">
              <td className="px-2 py-0.5 sticky left-0 bg-muted/20">Index</td>
              {secondNine.map(hole => (
                <td key={hole.number} className="text-center px-1.5 py-0.5">{hole.handicapIndex}</td>
              ))}
              <td className="text-center px-2 py-0.5 bg-muted/30"></td>
              <td className="text-center px-2 py-0.5 bg-primary/5"></td>
            </tr>
          </thead>
          <tbody>
            {displayPlayers.map(player => {
              const frontTotal = getPlayerTotal(player.id, 1, 9);
              const backTotal = getPlayerTotal(player.id, 10, 18);
              const secondNineTotal = secondNine.reduce((sum, hole) => {
                  if (!isHoleConfirmedForPlayer(player.id, hole.number)) return sum;
                const score = getPlayerScoreForHole(player.id, hole.number);
                return sum + (score?.strokes && score.strokes > 0 ? score.strokes : 0);
              }, 0);
              return (
                <tr key={player.id} className="border-t border-border/50">
                  <td className="px-2 py-1 sticky left-0 bg-card">
                    <div className="flex items-center gap-1">
                      <PlayerAvatar initials={player.initials} background={player.color} size="sm" isLoggedInUser={player.id === basePlayerId} />
                      <span className="font-medium truncate max-w-[50px] text-xs">{player.name.split(' ')[0]}</span>
                      {onQuickScoreClick && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onQuickScoreClick(player);
                                }}
                                className="p-0.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                              >
                                <Zap className="h-3 w-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="text-xs">
                              Captura rápida
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </td>
                  {secondNine.map(hole => {
                    const score = getPlayerScoreForHole(player.id, hole.number);
                    const strokes = score?.strokes || 0;
                    const confirmed = isHoleConfirmedForPlayer(player.id, hole.number);
                    return (
                      <td 
                        key={hole.number}
                        onClick={() => onHoleClick?.(hole.number)}
                        className={cn(
                          'text-center px-1.5 py-1 cursor-pointer',
                          getScoreColor(strokes, hole.par, confirmed),
                          getScoreBg(strokes, hole.par, confirmed)
                        )}
                      >
                        {confirmed ? (strokes > 0 ? strokes : '-') : '-'}
                      </td>
                    );
                  })}
                  <td className="text-center px-2 py-1 font-semibold bg-muted/30">
                    {secondNineTotal || '-'}
                  </td>
                  <td className="text-center px-2 py-1 font-bold bg-primary/10 text-primary">
                    {(frontTotal + backTotal) || '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {/* Stableford Points Row */}
      {stablefordByPlayer && (
        <div className="border-t border-border p-2 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-1.5">
            <Star className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Stableford</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {displayPlayers.map(player => {
              const pts = stablefordByPlayer.get(player.id);
              const maxPts = Math.max(...Array.from(stablefordByPlayer.values()).map(v => v.total));
              const isLeader = pts?.total === maxPts && pts.total > 0;
              return (
                <div 
                  key={player.id}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs",
                    isLeader ? "bg-amber-500/20 border border-amber-500/40" : "bg-muted/50"
                  )}
                >
                  <PlayerAvatar initials={player.initials} background={player.color} size="sm" isLoggedInUser={player.id === basePlayerId} />
                  <div className="flex flex-col">
                    <span className={cn("font-bold", isLeader && "text-amber-600")}>
                      {pts?.total ?? 0} pts
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      F:{pts?.front ?? 0} B:{pts?.back ?? 0}
                    </span>
                  </div>
                  {isLeader && <Trophy className="h-3 w-3 text-amber-500" />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
