import React from 'react';
import { cn } from '@/lib/utils';
import { Player, GolfCourse, PlayerScore, MarkerState, PlayerGroup } from '@/types/golf';
import { calculateScoreToPar, getScoreName } from '@/lib/handicapUtils';
import { Plus, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '@/components/PlayerAvatar';

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
}) => {
  const isHoleConfirmed = (holeNumber: number): boolean => {
    return confirmedHoles.has(holeNumber);
  };

  const getPlayerScoreForHole = (playerId: string, holeNumber: number): PlayerScore | undefined => {
    return scores.get(playerId)?.find(s => s.holeNumber === holeNumber);
  };

  const getPlayerTotal = (playerId: string, startHole: number, endHole: number): number => {
    let total = 0;
    for (let h = startHole; h <= endHole; h++) {
      // Only count confirmed holes
      if (!isHoleConfirmed(h)) continue;
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

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-primary/10 px-3 py-2 border-b border-border">
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
            {players.map(player => {
              const firstNineTotal = firstNine.reduce((sum, hole) => {
                if (!isHoleConfirmed(hole.number)) return sum;
                const score = getPlayerScoreForHole(player.id, hole.number);
                return sum + (score?.strokes && score.strokes > 0 ? score.strokes : 0);
              }, 0);
              return (
              <tr key={player.id} className="border-t border-border/50">
                <td className="px-2 py-1.5 sticky left-0 bg-card">
                  <div className="flex items-center gap-1.5">
                    <PlayerAvatar initials={player.initials} background={player.color} size="sm" />
                    <span className="font-medium truncate max-w-[60px]">{player.name.split(' ')[0]}</span>
                  </div>
                </td>
                {firstNine.map(hole => {
                  const score = getPlayerScoreForHole(player.id, hole.number);
                  const strokes = score?.strokes || 0;
                  const confirmed = isHoleConfirmed(hole.number);
                  return (
                    <td 
                      key={hole.number}
                      onClick={() => onHoleClick?.(hole.number)}
                      className={cn(
                        'text-center px-1.5 py-1.5 cursor-pointer',
                        getScoreColor(strokes, hole.par, confirmed),
                        getScoreBg(strokes, hole.par, confirmed)
                      )}
                    >
                      {confirmed ? (strokes > 0 ? strokes : '-') : '-'}
                    </td>
                  );
                })}
                <td className="text-center px-2 py-1.5 font-semibold bg-muted/30">
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
            {players.map(player => {
              const frontTotal = getPlayerTotal(player.id, 1, 9);
              const backTotal = getPlayerTotal(player.id, 10, 18);
              const secondNineTotal = secondNine.reduce((sum, hole) => {
                if (!isHoleConfirmed(hole.number)) return sum;
                const score = getPlayerScoreForHole(player.id, hole.number);
                return sum + (score?.strokes && score.strokes > 0 ? score.strokes : 0);
              }, 0);
              return (
                <tr key={player.id} className="border-t border-border/50">
                  <td className="px-2 py-1.5 sticky left-0 bg-card">
                    <div className="flex items-center gap-1.5">
                      <PlayerAvatar initials={player.initials} background={player.color} size="sm" />
                      <span className="font-medium truncate max-w-[60px]">{player.name.split(' ')[0]}</span>
                    </div>
                  </td>
                  {secondNine.map(hole => {
                    const score = getPlayerScoreForHole(player.id, hole.number);
                    const strokes = score?.strokes || 0;
                    const confirmed = isHoleConfirmed(hole.number);
                    return (
                      <td 
                        key={hole.number}
                        onClick={() => onHoleClick?.(hole.number)}
                        className={cn(
                          'text-center px-1.5 py-1.5 cursor-pointer',
                          getScoreColor(strokes, hole.par, confirmed),
                          getScoreBg(strokes, hole.par, confirmed)
                        )}
                      >
                        {confirmed ? (strokes > 0 ? strokes : '-') : '-'}
                      </td>
                    );
                  })}
                  <td className="text-center px-2 py-1.5 font-semibold bg-muted/30">
                    {secondNineTotal || '-'}
                  </td>
                  <td className="text-center px-2 py-1.5 font-bold bg-primary/10 text-primary">
                    {(frontTotal + backTotal) || '-'}
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
