import React from 'react';
import { cn } from '@/lib/utils';
import { Player, GolfCourse, PlayerScore, MarkerState } from '@/types/golf';
import { calculateScoreToPar, getScoreName } from '@/lib/handicapUtils';

interface ScorecardProps {
  players: Player[];
  course: GolfCourse;
  scores: Map<string, PlayerScore[]>; // playerId -> scores for all holes
  currentHole: number;
  onHoleClick?: (hole: number) => void;
}

export const Scorecard: React.FC<ScorecardProps> = ({
  players,
  course,
  scores,
  currentHole,
  onHoleClick,
}) => {
  const getPlayerScoreForHole = (playerId: string, holeNumber: number): PlayerScore | undefined => {
    return scores.get(playerId)?.find(s => s.holeNumber === holeNumber);
  };

  const getPlayerTotal = (playerId: string, startHole: number, endHole: number): number => {
    let total = 0;
    for (let h = startHole; h <= endHole; h++) {
      const score = getPlayerScoreForHole(playerId, h);
      if (score && score.strokes > 0) {
        total += score.strokes;
      }
    }
    return total;
  };

  const getScoreColor = (strokes: number, par: number): string => {
    if (strokes === 0) return 'text-muted-foreground';
    const toPar = strokes - par;
    if (toPar <= -2) return 'text-golf-gold font-bold';
    if (toPar === -1) return 'text-green-500 font-bold';
    if (toPar === 0) return 'text-foreground';
    if (toPar === 1) return 'text-orange-500';
    if (toPar >= 2) return 'text-destructive';
    return 'text-foreground';
  };

  const getScoreBg = (strokes: number, par: number): string => {
    if (strokes === 0) return '';
    const toPar = strokes - par;
    if (toPar <= -2) return 'bg-golf-gold/20 rounded';
    if (toPar === -1) return 'bg-green-500/20 rounded';
    return '';
  };

  const frontNine = course.holes.slice(0, 9);
  const backNine = course.holes.slice(9, 18);
  const frontPar = frontNine.reduce((sum, h) => sum + h.par, 0);
  const backPar = backNine.reduce((sum, h) => sum + h.par, 0);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-primary/10 px-3 py-2 border-b border-border">
        <h3 className="text-sm font-semibold text-primary">Scorecard</h3>
        <p className="text-[10px] text-muted-foreground">{course.name}</p>
      </div>

      {/* Front 9 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-2 py-1.5 font-medium text-muted-foreground sticky left-0 bg-muted/50 min-w-[80px]">
                Hoyo
              </th>
              {frontNine.map(hole => (
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
              <th className="px-2 py-1.5 font-semibold text-center bg-muted min-w-[36px]">OUT</th>
            </tr>
            <tr className="bg-muted/30 text-muted-foreground">
              <td className="px-2 py-1 sticky left-0 bg-muted/30">Par</td>
              {frontNine.map(hole => (
                <td key={hole.number} className="text-center px-1.5 py-1">{hole.par}</td>
              ))}
              <td className="text-center px-2 py-1 font-medium bg-muted/50">{frontPar}</td>
            </tr>
          </thead>
          <tbody>
            {players.map(player => (
              <tr key={player.id} className="border-t border-border/50">
                <td className="px-2 py-1.5 sticky left-0 bg-card">
                  <div className="flex items-center gap-1.5">
                    <div className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold', player.color)}>
                      {player.initials}
                    </div>
                    <span className="font-medium truncate max-w-[60px]">{player.name.split(' ')[0]}</span>
                  </div>
                </td>
                {frontNine.map(hole => {
                  const score = getPlayerScoreForHole(player.id, hole.number);
                  const strokes = score?.strokes || 0;
                  return (
                    <td 
                      key={hole.number}
                      onClick={() => onHoleClick?.(hole.number)}
                      className={cn(
                        'text-center px-1.5 py-1.5 cursor-pointer',
                        getScoreColor(strokes, hole.par),
                        getScoreBg(strokes, hole.par)
                      )}
                    >
                      {strokes > 0 ? strokes : '-'}
                    </td>
                  );
                })}
                <td className="text-center px-2 py-1.5 font-semibold bg-muted/30">
                  {getPlayerTotal(player.id, 1, 9) || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Separator */}
      <div className="h-1 bg-border" />

      {/* Back 9 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-2 py-1.5 font-medium text-muted-foreground sticky left-0 bg-muted/50 min-w-[80px]">
                Hoyo
              </th>
              {backNine.map(hole => (
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
              <th className="px-2 py-1.5 font-semibold text-center bg-muted min-w-[36px]">IN</th>
              <th className="px-2 py-1.5 font-semibold text-center bg-primary/20 text-primary min-w-[40px]">TOT</th>
            </tr>
            <tr className="bg-muted/30 text-muted-foreground">
              <td className="px-2 py-1 sticky left-0 bg-muted/30">Par</td>
              {backNine.map(hole => (
                <td key={hole.number} className="text-center px-1.5 py-1">{hole.par}</td>
              ))}
              <td className="text-center px-2 py-1 font-medium bg-muted/50">{backPar}</td>
              <td className="text-center px-2 py-1 font-medium bg-primary/10">{frontPar + backPar}</td>
            </tr>
          </thead>
          <tbody>
            {players.map(player => {
              const frontTotal = getPlayerTotal(player.id, 1, 9);
              const backTotal = getPlayerTotal(player.id, 10, 18);
              return (
                <tr key={player.id} className="border-t border-border/50">
                  <td className="px-2 py-1.5 sticky left-0 bg-card">
                    <div className="flex items-center gap-1.5">
                      <div className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold', player.color)}>
                        {player.initials}
                      </div>
                      <span className="font-medium truncate max-w-[60px]">{player.name.split(' ')[0]}</span>
                    </div>
                  </td>
                  {backNine.map(hole => {
                    const score = getPlayerScoreForHole(player.id, hole.number);
                    const strokes = score?.strokes || 0;
                    return (
                      <td 
                        key={hole.number}
                        onClick={() => onHoleClick?.(hole.number)}
                        className={cn(
                          'text-center px-1.5 py-1.5 cursor-pointer',
                          getScoreColor(strokes, hole.par),
                          getScoreBg(strokes, hole.par)
                        )}
                      >
                        {strokes > 0 ? strokes : '-'}
                      </td>
                    );
                  })}
                  <td className="text-center px-2 py-1.5 font-semibold bg-muted/30">
                    {backTotal || '-'}
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
