import React, { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Player, PlayerScore, GolfCourse, PlayerGroup, BetConfig, DEFAULT_STABLEFORD_POINTS } from '@/types/golf';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { cn } from '@/lib/utils';
import { ArrowUpDown } from 'lucide-react';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { formatPlayerNameShort, disambiguateInitials } from '@/lib/playerInput';

interface LeaderboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: Player[];
  playerGroups?: PlayerGroup[];
  scores: Map<string, PlayerScore[]>;
  course: GolfCourse | null;
  confirmedHoles: Set<number>;
  betConfig?: BetConfig;
  basePlayerId?: string;
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
  stablefordPoints: number;
}

type SortMode = 'net' | 'gross' | 'stableford';

export const LeaderboardDialog: React.FC<LeaderboardDialogProps> = ({
  open,
  onOpenChange,
  players,
  playerGroups = [],
  scores,
  course,
  confirmedHoles,
  betConfig,
  basePlayerId,
}) => {
  const [sortMode, setSortMode] = useState<SortMode>('net');

  // Disambiguate initials across all players
  const allPlayersFlat = useMemo(() => {
    const all = [...players];
    playerGroups.forEach(g => all.push(...g.players));
    return all;
  }, [players, playerGroups]);
  const disambiguatedInitials = useMemo(() => disambiguateInitials(allPlayersFlat), [allPlayersFlat]);

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

    // Get Medal General handicap overrides if enabled
    const medalGeneralEnabled = betConfig?.medalGeneral?.enabled ?? false;
    const medalGeneralHandicaps = betConfig?.medalGeneral?.playerHandicaps || [];

    for (const { player, groupNumber } of allPlayers) {
      const playerScores = scores.get(player.id) || [];
      
      // Determine handicap to use: Medal General override if enabled, else player's base handicap
      let effectiveHandicap = player.handicap;
      if (medalGeneralEnabled) {
        const override = medalGeneralHandicaps.find(pc => pc.playerId === player.id);
        if (override !== undefined) {
          effectiveHandicap = override.handicap;
        }
      }

      // Calculate strokes per hole based on effective handicap
      const strokesPerHole = calculateStrokesPerHole(effectiveHandicap, course);
      
      let grossScore = 0;
      let netScore = 0;
      let parForPlayed = 0;
      let lastConfirmedHole = 0;
      let holesPlayed = 0;
      let stablefordPoints = 0;
      
      // Get stableford config
      const stablefordEnabled = betConfig?.stableford?.enabled ?? false;
      const stablefordPlayerHandicaps = betConfig?.stableford?.playerHandicaps || [];
      const stablefordPointsConfig = betConfig?.stableford?.points || DEFAULT_STABLEFORD_POINTS;
      
      // Stableford uses its own handicap if configured
      let stablefordHandicap = effectiveHandicap;
      if (stablefordEnabled) {
        const stablefordOverride = stablefordPlayerHandicaps.find(pc => pc.playerId === player.id);
        if (stablefordOverride !== undefined) {
          stablefordHandicap = stablefordOverride.handicap;
        }
      }
      const stablefordStrokesPerHole = calculateStrokesPerHole(stablefordHandicap, course);

      for (let h = 1; h <= 18; h++) {
        const score = playerScores.find(s => s.holeNumber === h);
        if (!score || !score.confirmed) continue;
        if (!score.strokes || score.strokes <= 0) continue;

        const holePar = course.holes[h - 1]?.par || 4;
        const strokesReceivedOnHole = strokesPerHole[h - 1] || 0;
        
        grossScore += score.strokes;
        // Calculate net score using the effective handicap strokes
        netScore += score.strokes - strokesReceivedOnHole;
        parForPlayed += holePar;
        holesPlayed++;
        lastConfirmedHole = Math.max(lastConfirmedHole, h);
        
        // Calculate stableford points for this hole
        if (stablefordEnabled) {
          const stablefordStrokesReceived = stablefordStrokesPerHole[h - 1] || 0;
          const stablefordNet = score.strokes - stablefordStrokesReceived;
          const toPar = stablefordNet - holePar;
          
          if (toPar <= -3) stablefordPoints += stablefordPointsConfig.albatross;
          else if (toPar === -2) stablefordPoints += stablefordPointsConfig.eagle;
          else if (toPar === -1) stablefordPoints += stablefordPointsConfig.birdie;
          else if (toPar === 0) stablefordPoints += stablefordPointsConfig.par;
          else if (toPar === 1) stablefordPoints += stablefordPointsConfig.bogey;
          else if (toPar === 2) stablefordPoints += stablefordPointsConfig.doubleBogey;
          else if (toPar === 3) stablefordPoints += stablefordPointsConfig.tripleBogey;
          else stablefordPoints += stablefordPointsConfig.quadrupleOrWorse;
        }
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
        stablefordPoints,
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
      if (sortMode === 'stableford') {
        return b.stablefordPoints - a.stablefordPoints; // Higher is better
      }
      return a.netVsPar - b.netVsPar;
    });
  }, [players, playerGroups, scores, course, confirmedHoles, sortMode, betConfig]);

  const stablefordEnabled = betConfig?.stableford?.enabled ?? false;

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
            <table className="table-fixed w-full caption-bottom text-sm">
              <thead className="sticky top-0 z-10 bg-background [&_tr]:border-b">
                <tr className="text-xs border-b">
                  <th className="h-9 w-7 text-center px-1 py-1.5 align-middle font-medium text-muted-foreground">#</th>
                  <th className="h-9 px-1 py-1.5 text-left align-middle font-medium text-muted-foreground">Jugador</th>
                  <th className="h-9 text-center w-8 px-1 py-1.5 align-middle font-medium text-muted-foreground">Grp</th>
                  <th className="h-9 text-center w-9 px-1 py-1.5 align-middle font-medium text-muted-foreground">Hoyo</th>
                  <th 
                    className={cn(
                      "h-9 text-center w-12 px-1 py-1.5 align-middle font-medium text-muted-foreground cursor-pointer hover:bg-muted/50 transition-colors",
                      sortMode === 'gross' && "bg-muted"
                    )}
                    onClick={() => handleSortClick('gross')}
                  >
                    <div className="flex items-center justify-center gap-0.5">
                      Gross
                      {sortMode === 'gross' && <ArrowUpDown className="h-3 w-3" />}
                    </div>
                  </th>
                  <th 
                    className={cn(
                      "h-9 text-center w-12 px-1 py-1.5 align-middle font-medium text-muted-foreground cursor-pointer hover:bg-muted/50 transition-colors",
                      sortMode === 'net' && "bg-muted"
                    )}
                    onClick={() => handleSortClick('net')}
                  >
                    <div className="flex items-center justify-center gap-0.5">
                      Neto
                      {sortMode === 'net' && <ArrowUpDown className="h-3 w-3" />}
                    </div>
                  </th>
                  {stablefordEnabled && (
                    <th 
                      className={cn(
                        "h-9 text-center w-10 px-1 py-1.5 align-middle font-medium text-muted-foreground cursor-pointer hover:bg-muted/50 transition-colors",
                        sortMode === 'stableford' && "bg-muted"
                      )}
                      onClick={() => handleSortClick('stableford')}
                    >
                      <div className="flex items-center justify-center gap-0.5">
                        Stb
                        {sortMode === 'stableford' && <ArrowUpDown className="h-3 w-3" />}
                      </div>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {leaderboard.map((entry, idx) => (
                  <tr key={entry.player.id} className="text-sm border-b transition-colors hover:bg-muted/50">
                    <td className="text-center font-bold text-muted-foreground px-1 py-1.5 text-base align-middle">
                      {entry.holesPlayed > 0 ? idx + 1 : '-'}
                    </td>
                    <td className="px-1 py-1.5 align-middle">
                      <div className="flex items-center gap-1.5">
                        <PlayerAvatar 
                          initials={disambiguatedInitials.get(entry.player.id) || entry.player.initials} 
                          background={entry.player.color} 
                          size="sm" 
                          isLoggedInUser={entry.player.id === basePlayerId}
                        />
                        <span className="font-semibold text-sm truncate">
                          {formatPlayerNameShort(entry.player.name)}
                        </span>
                      </div>
                    </td>
                    <td className="text-center text-sm font-semibold text-muted-foreground px-1 py-1.5 align-middle">
                      {entry.groupNumber}
                    </td>
                    <td className="text-center text-sm font-semibold text-muted-foreground px-1 py-1.5 align-middle">
                      {entry.holesPlayed > 0 ? entry.lastConfirmedHole : '-'}
                    </td>
                    <td className={cn('text-center text-base px-1 py-1.5 align-middle', getVsParColor(entry.grossVsPar))}>
                      {entry.holesPlayed > 0 ? formatVsPar(entry.grossVsPar) : '-'}
                    </td>
                    <td className={cn('text-center text-base px-1 py-1.5 align-middle', getVsParColor(entry.netVsPar))}>
                      {entry.holesPlayed > 0 ? formatVsPar(entry.netVsPar) : '-'}
                    </td>
                    {stablefordEnabled && (
                      <td className="text-center text-base px-1 py-1.5 font-extrabold text-amber-600 align-middle">
                        {entry.holesPlayed > 0 ? entry.stablefordPoints : '-'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
