import React, { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Player, PlayerScore, GolfCourse, PlayerGroup } from '@/types/golf';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { cn } from '@/lib/utils';

interface LeaderboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: Player[];
  playerGroups?: PlayerGroup[];
  scores: Map<string, PlayerScore[]>;
  course: GolfCourse | null;
  confirmedHoles: Set<number>;
}

interface LeaderboardEntry {
  player: Player;
  groupName?: string;
  lastConfirmedHole: number;
  grossScore: number;
  netScore: number;
  grossVsPar: number;
  netVsPar: number;
  holesPlayed: number;
}

export const LeaderboardDialog: React.FC<LeaderboardDialogProps> = ({
  open,
  onOpenChange,
  players,
  playerGroups = [],
  scores,
  course,
  confirmedHoles,
}) => {
  const leaderboard = useMemo((): LeaderboardEntry[] => {
    if (!course) return [];

    const entries: LeaderboardEntry[] = [];

    // Combine main group players with additional groups
    // Main group players (labeled as "Mi Grupo" or no label if no additional groups)
    const mainGroupPlayers = players.map(p => ({ 
      ...p, 
      groupName: playerGroups.length > 0 ? 'Mi Grupo' : undefined 
    }));
    
    // Additional groups players
    const additionalGroupPlayers = playerGroups.flatMap(g => 
      g.players.map(p => ({ ...p, groupName: g.name }))
    );

    const allPlayers = [...mainGroupPlayers, ...additionalGroupPlayers];

    for (const player of allPlayers) {
      const playerScores = scores.get(player.id) || [];
      
      let grossScore = 0;
      let netScore = 0;
      let parForPlayed = 0;
      let lastConfirmedHole = 0;
      let holesPlayed = 0;

      for (let h = 1; h <= 18; h++) {
        if (!confirmedHoles.has(h)) continue;
        
        const score = playerScores.find(s => s.holeNumber === h);
        if (!score || !score.strokes || score.strokes <= 0) continue;

        const holePar = course.holes[h - 1]?.par || 4;
        grossScore += score.strokes;
        netScore += score.netScore ?? (score.strokes - (score.strokesReceived || 0));
        parForPlayed += holePar;
        holesPlayed++;
        lastConfirmedHole = Math.max(lastConfirmedHole, h);
      }

      entries.push({
        player,
        groupName: (player as any).groupName,
        lastConfirmedHole,
        grossScore,
        netScore,
        grossVsPar: holesPlayed > 0 ? grossScore - parForPlayed : 0,
        netVsPar: holesPlayed > 0 ? netScore - parForPlayed : 0,
        holesPlayed,
      });
    }

    // Sort by net vs par (ascending - lower is better)
    return entries.sort((a, b) => {
      if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0;
      if (a.holesPlayed === 0) return 1;
      if (b.holesPlayed === 0) return -1;
      return a.netVsPar - b.netVsPar;
    });
  }, [players, playerGroups, scores, course, confirmedHoles]);

  const formatVsPar = (value: number): string => {
    if (value === 0) return 'E';
    return value > 0 ? `+${value}` : `${value}`;
  };

  const getVsParColor = (value: number): string => {
    if (value < 0) return 'text-green-600 font-semibold';
    if (value === 0) return 'text-foreground font-semibold';
    if (value <= 3) return 'text-orange-500 font-semibold';
    return 'text-destructive font-semibold';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg">🏆 Leaderboard General</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {leaderboard.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No hay jugadores registrados
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="w-[40px] text-center">#</TableHead>
                  <TableHead>Jugador</TableHead>
                  <TableHead className="text-center w-[50px]">Hoyo</TableHead>
                  <TableHead className="text-center w-[60px]">Gross</TableHead>
                  <TableHead className="text-center w-[60px]">Neto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.map((entry, idx) => (
                  <TableRow key={entry.player.id} className="text-sm">
                    <TableCell className="text-center font-medium text-muted-foreground">
                      {entry.holesPlayed > 0 ? idx + 1 : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <PlayerAvatar 
                          initials={entry.player.initials} 
                          background={entry.player.color} 
                          size="sm" 
                        />
                        <div className="flex flex-col">
                          <span className="font-medium text-sm truncate max-w-[100px]">
                            {entry.player.name.split(' ')[0]}
                          </span>
                          {entry.groupName && (
                            <span className="text-[10px] text-muted-foreground">
                              {entry.groupName}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {entry.holesPlayed > 0 ? `${entry.lastConfirmedHole}` : '-'}
                    </TableCell>
                    <TableCell className={cn('text-center', getVsParColor(entry.grossVsPar))}>
                      {entry.holesPlayed > 0 ? formatVsPar(entry.grossVsPar) : '-'}
                    </TableCell>
                    <TableCell className={cn('text-center', getVsParColor(entry.netVsPar))}>
                      {entry.holesPlayed > 0 ? formatVsPar(entry.netVsPar) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
