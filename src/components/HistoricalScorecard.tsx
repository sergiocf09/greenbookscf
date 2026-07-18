import React from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/dateUtils';
import { GolfCourse } from '@/types/golf';
import { formatPlayerName } from '@/lib/playerInput';

interface PlayerScoreData {
  playerId: string;
  playerName: string;
  initials: string;
  color: string;
  handicap: number;
  scores: { holeNumber: number; strokes: number; putts: number }[];
  totalStrokes: number;
  teeColor?: string;
}

const TEE_LABEL: Record<string, string> = {
  blue: 'Azul',
  white: 'Blanco',
  yellow: 'Amarillo',
  red: 'Rojo',
  black: 'Negro',
  gold: 'Dorado',
};

const TEE_DOT_COLOR: Record<string, string> = {
  blue: '#2563eb',
  white: '#ffffff',
  yellow: '#eab308',
  red: '#dc2626',
  black: '#111111',
  gold: '#d4af37',
};

interface HistoricalScorecardProps {
  course: GolfCourse;
  players: PlayerScoreData[];
  teeColor: string;
  date: string;
  roundHoles?: 9 | 18;
}

export const HistoricalScorecard: React.FC<HistoricalScorecardProps> = ({
  course,
  players,
  teeColor,
  date,
  roundHoles = 18,
}) => {

  const getPlayerScoreForHole = (player: PlayerScoreData, holeNumber: number): number => {
    return player.scores.find(s => s.holeNumber === holeNumber)?.strokes || 0;
  };

  const getPlayerTotal = (player: PlayerScoreData, startHole: number, endHole: number): number => {
    return player.scores
      .filter(s => s.holeNumber >= startHole && s.holeNumber <= endHole)
      .reduce((sum, s) => sum + (s.strokes || 0), 0);
  };

  const renderScoreCell = (strokes: number, par: number) => {
    if (strokes === 0) return <span className="text-muted-foreground">-</span>;
    const toPar = strokes - par;
    const num = <span className="font-bold text-foreground">{strokes}</span>;
    if (toPar <= -2) {
      return (
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-foreground/60">
          <span className="inline-flex items-center justify-center w-[14px] h-[14px] rounded-full border border-foreground/60">
            {num}
          </span>
        </span>
      );
    }
    if (toPar === -1) {
      return (
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-foreground/60">
          {num}
        </span>
      );
    }
    if (toPar === 1) {
      return (
        <span className="inline-flex items-center justify-center w-5 h-5 border border-foreground/60">
          {num}
        </span>
      );
    }
    if (toPar >= 2) {
      return (
        <span className="inline-flex items-center justify-center w-5 h-5 border border-foreground/60">
          <span className="inline-flex items-center justify-center w-[14px] h-[14px] border border-foreground/60">
            {num}
          </span>
        </span>
      );
    }
    return num;
  };

  const frontNine = course.holes.slice(0, 9);
  const backNine = course.holes.slice(9, 18);
  const frontPar = frontNine.reduce((sum, h) => sum + h.par, 0);
  const backPar = backNine.reduce((sum, h) => sum + h.par, 0);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-primary/10 px-3 py-2 border-b border-border">
        <h3 className="text-sm font-semibold text-primary">{course.name}</h3>
        <p className="text-[10px] text-muted-foreground">
          {format(parseLocalDate(date), "d 'de' MMMM, yyyy", { locale: es })} • Tee {teeColor}
        </p>
      </div>

      {/* Front 9 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-1 py-1.5 font-medium text-muted-foreground sticky left-0 bg-muted/50 min-w-[56px]">
                Hoyo
              </th>
              {frontNine.map(hole => (
                <th 
                  key={hole.number}
                  className="px-0 py-1.5 font-medium min-w-[22px] text-center"
                >
                  {hole.number}
                </th>
              ))}
              <th className="px-1 py-1.5 font-semibold text-center bg-muted min-w-[28px]">OUT</th>
            </tr>
            <tr className="bg-muted/30 text-muted-foreground">
              <td className="px-1 py-1 sticky left-0 bg-muted/30">Par</td>
              {frontNine.map(hole => (
                <td key={hole.number} className="text-center px-0 py-1">{hole.par}</td>
              ))}
              <td className="text-center px-1 py-1 font-medium bg-muted/50">{frontPar}</td>
            </tr>
          </thead>
          <tbody>
            {players.map(player => (
              <tr key={player.playerId} className="border-t border-border/50">
                <td className="px-1 py-1 sticky left-0 bg-card">
                  <span className="font-medium truncate max-w-[56px] block text-[11px]">{formatPlayerName(player.playerName).split(' ')[0]}</span>
                </td>
                {frontNine.map(hole => {
                  const strokes = getPlayerScoreForHole(player, hole.number);
                  return (
                    <td 
                      key={hole.number}
                      className="text-center px-0 py-1.5"
                    >
                      {renderScoreCell(strokes, hole.par)}
                    </td>
                  );
                })}
                <td className="text-center px-1 py-1.5 font-semibold bg-muted/30">
                  {getPlayerTotal(player, 1, 9) || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Separator + Back 9 (only on 18-hole rounds) */}
      {roundHoles !== 9 && (
        <>
          <div className="h-1 bg-border" />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-1 py-1.5 font-medium text-muted-foreground sticky left-0 bg-muted/50 min-w-[56px]">
                    Hoyo
                  </th>
                  {backNine.map(hole => (
                    <th
                      key={hole.number}
                      className="px-0 py-1.5 font-medium min-w-[22px] text-center"
                    >
                      {hole.number}
                    </th>
                  ))}
                  <th className="px-1 py-1.5 font-semibold text-center bg-muted min-w-[28px]">IN</th>
                  <th className="px-1 py-1.5 font-semibold text-center bg-primary/20 text-primary min-w-[30px]">TOT</th>
                </tr>
                <tr className="bg-muted/30 text-muted-foreground">
                  <td className="px-1 py-1 sticky left-0 bg-muted/30">Par</td>
                  {backNine.map(hole => (
                    <td key={hole.number} className="text-center px-0 py-1">{hole.par}</td>
                  ))}
                  <td className="text-center px-1 py-1 font-medium bg-muted/50">{backPar}</td>
                  <td className="text-center px-1 py-1 font-medium bg-primary/10">{frontPar + backPar}</td>
                </tr>
              </thead>
              <tbody>
                {players.map(player => {
                  const frontTotal = getPlayerTotal(player, 1, 9);
                  const backTotal = getPlayerTotal(player, 10, 18);
                  return (
                    <tr key={player.playerId} className="border-t border-border/50">
                      <td className="px-1 py-1 sticky left-0 bg-card">
                        <span className="font-medium truncate max-w-[56px] block text-[11px]">{formatPlayerName(player.playerName).split(' ')[0]}</span>
                      </td>
                      {backNine.map(hole => {
                        const strokes = getPlayerScoreForHole(player, hole.number);
                        return (
                          <td
                            key={hole.number}
                            className="text-center px-0 py-1.5"
                          >
                            {renderScoreCell(strokes, hole.par)}
                          </td>
                      );
                    })}
                      <td className="text-center px-1 py-1.5 font-semibold bg-muted/30">
                        {backTotal || '-'}
                      </td>
                      <td className="text-center px-1 py-1.5 font-bold bg-primary/10 text-primary">
                        {(frontTotal + backTotal) || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}


      {/* Player Handicaps Summary */}
      <div className="border-t border-border p-3">
        <p className="text-xs text-muted-foreground mb-2">Handicaps utilizados:</p>
        <div className="flex flex-wrap gap-2">
          {players.map(player => (
            <div 
              key={player.playerId}
              className="flex items-center gap-1.5 bg-muted/50 rounded-full px-2 py-1"
            >
              <div 
                className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                style={{ backgroundColor: player.color }}
              >
                {player.initials}
              </div>
              <span className="text-xs">{player.handicap}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
