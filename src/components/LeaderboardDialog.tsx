import React, { useMemo, useState } from 'react';
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
import { ArrowUpDown } from 'lucide-react';

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
  groupNumber: number;
  lastConfirmedHole: number;
  grossScore: number;
  netScore: number;
  grossVsPar: number;
  netVsPar: number;
  holesPlayed: number;
}

type SortMode = 'net' | 'gross';

export const LeaderboardDialog: React.FC<LeaderboardDialogProps> = ({
  open,
  onOpenChange,
  players,
  playerGroups = [],
  scores,
  course,
  confirmedHoles,
}) => {
  const [sortMode, setSortMode] = useState<SortMode>('net');

  const leaderboard = useMemo((): LeaderboardEntry[] => {
    if (!course) return [];

    const entries: LeaderboardEntry[] = [];

    // Main group players (group 1)
    const mainGroupPlayers = players.map(p => ({ 
      player: p,
      groupNumber: 1,
    }));
    
    // Additional groups players (group 2, 3, etc.)
    const additionalGroupPlayers = playerGroups.flatMap((g, idx) => 
      g.players.map(p => ({ 
        player: p, 
        groupNumber: idx + 2, // Groups start at 2 for additional groups
      }))
    );

    const allPlayers = [...mainGroupPlayers, ...additionalGroupPlayers];

    for (const { player, groupNumber } of allPlayers) {
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
        // Use the net score from the score object which includes handicap strokes
        netScore += score.netScore ?? (score.strokes - (score.strokesReceived || 0));
        parForPlayed += holePar;
        holesPlayed++;
        lastConfirmedHole = Math.max(lastConfirmedHole, h);
      }

      entries.push({
        player,
        groupNumber,
        lastConfirmedHole,
        grossScore,
        netScore,
        grossVsPar: holesPlayed > 0 ? grossScore - parForPlayed : 0,
        netVsPar: holesPlayed > 0 ? netScore - parForPlayed : 0,
        holesPlayed,
      });
    }

    // Sort based on selected mode
    return entries.sort((a, b) => {
      if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0;
      if (a.holesPlayed === 0) return 1;
      if (b.holesPlayed === 0) return -1;
      
      if (sortMode === 'gross') {
        return a.grossVsPar - b.grossVsPar;
      }
      return a.netVsPar - b.netVsPar;
    });
  }, [players, playerGroups, scores, course, confirmedHoles, sortMode]);

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

  const handleSortClick = (mode: SortMode) => {
    setSortMode(mode);
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
                  <TableHead className="w-[30px] text-center p-1">#</TableHead>
                  <TableHead className="p-1">Jugador</TableHead>
                  <TableHead className="text-center w-[36px] p-1">Grp</TableHead>
                  <TableHead className="text-center w-[36px] p-1">Hoyo</TableHead>
                  <TableHead 
                    className={cn(
                      "text-center w-[50px] p-1 cursor-pointer hover:bg-muted/50 transition-colors",
                      sortMode === 'gross' && "bg-muted"
                    )}
                    onClick={() => handleSortClick('gross')}
                  >
                    <div className="flex items-center justify-center gap-0.5">
                      Gross
                      {sortMode === 'gross' && <ArrowUpDown className="h-3 w-3" />}
                    </div>
                  </TableHead>
                  <TableHead 
                    className={cn(
                      "text-center w-[50px] p-1 cursor-pointer hover:bg-muted/50 transition-colors",
                      sortMode === 'net' && "bg-muted"
                    )}
                    onClick={() => handleSortClick('net')}
                  >
                    <div className="flex items-center justify-center gap-0.5">
                      Neto
                      {sortMode === 'net' && <ArrowUpDown className="h-3 w-3" />}
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.map((entry, idx) => (
                  <TableRow key={entry.player.id} className="text-xs">
                    <TableCell className="text-center font-medium text-muted-foreground p-1">
                      {entry.holesPlayed > 0 ? idx + 1 : '-'}
                    </TableCell>
                    <TableCell className="p-1">
                      <div className="flex items-center gap-1.5">
                        <PlayerAvatar 
                          initials={entry.player.initials} 
                          background={entry.player.color} 
                          size="sm" 
                        />
                        <span className="font-medium text-xs truncate max-w-[80px]">
                          {entry.player.name.split(' ')[0]}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground p-1">
                      {entry.groupNumber}
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground p-1">
                      {entry.holesPlayed > 0 ? `${entry.lastConfirmedHole}` : '-'}
                    </TableCell>
                    <TableCell className={cn('text-center p-1', getVsParColor(entry.grossVsPar))}>
                      {entry.holesPlayed > 0 ? formatVsPar(entry.grossVsPar) : '-'}
                    </TableCell>
                    <TableCell className={cn('text-center p-1', getVsParColor(entry.netVsPar))}>
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
