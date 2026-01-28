import React from 'react';
import { cn } from '@/lib/utils';
import { Player, PlayerGroup } from '@/types/golf';
import { Users } from 'lucide-react';

interface GroupSelectorProps {
  currentGroupIndex: number; // 0 = main group, 1+ = additional groups
  players: Player[]; // Main group players
  playerGroups: PlayerGroup[]; // Additional groups
  onGroupChange: (groupIndex: number) => void;
  compact?: boolean;
}

export const GroupSelector: React.FC<GroupSelectorProps> = ({
  currentGroupIndex,
  players,
  playerGroups,
  onGroupChange,
  compact = false,
}) => {
  const totalGroups = 1 + playerGroups.length;
  
  // Don't show if only one group
  if (totalGroups <= 1) return null;

  const getGroupLabel = (index: number): string => {
    if (index === 0) return 'Grupo 1';
    return playerGroups[index - 1]?.name || `Grupo ${index + 1}`;
  };

  const getGroupPlayerCount = (index: number): number => {
    if (index === 0) return players.length;
    return playerGroups[index - 1]?.players.length || 0;
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {Array.from({ length: totalGroups }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onGroupChange(i)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all',
              currentGroupIndex === i
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            <Users className="h-3 w-3" />
            {i + 1}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {Array.from({ length: totalGroups }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onGroupChange(i)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap',
            currentGroupIndex === i
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          <Users className="h-3.5 w-3.5" />
          <span>{getGroupLabel(i)}</span>
          <span className="text-[10px] opacity-75">({getGroupPlayerCount(i)})</span>
        </button>
      ))}
    </div>
  );
};

// Helper to get players for a specific group index
export const getPlayersForGroup = (
  groupIndex: number,
  mainPlayers: Player[],
  playerGroups: PlayerGroup[]
): Player[] => {
  if (groupIndex === 0) return mainPlayers;
  return playerGroups[groupIndex - 1]?.players || [];
};

// Helper to get all players from all groups
export const getAllPlayersFromAllGroups = (
  mainPlayers: Player[],
  playerGroups: PlayerGroup[]
): Player[] => {
  const all = [...mainPlayers];
  playerGroups.forEach(g => all.push(...g.players));
  return all;
};
