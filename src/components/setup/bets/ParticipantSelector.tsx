import React from 'react';
import { Player } from '@/types/golf';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { formatPlayerName } from '@/lib/playerInput';

interface ParticipantSelectorProps {
  players: Player[];
  participantIds?: string[];
  onParticipantsChange: (participantIds: string[]) => void;
  label?: string;
}

export const ParticipantSelector: React.FC<ParticipantSelectorProps> = ({
  players,
  participantIds,
  onParticipantsChange,
  label = 'Participantes de la apuesta',
}) => {
  // If participantIds is undefined or empty, all players participate by default
  // Filter out stale/orphaned IDs that don't match any current player
  const validParticipantIds = participantIds?.filter(id => players.some(p => p.id === id));
  const activeParticipants = validParticipantIds && validParticipantIds.length > 0
    ? validParticipantIds
    : players.map(p => p.id);

  const togglePlayer = (playerId: string) => {
    const isCurrentlyActive = activeParticipants.includes(playerId);
    
    if (isCurrentlyActive) {
      // Don't allow deactivating if it would leave less than 2 participants
      if (activeParticipants.length <= 2) return;
      onParticipantsChange(activeParticipants.filter(id => id !== playerId));
    } else {
      onParticipantsChange([...activeParticipants, playerId]);
    }
  };

  return (
    <div className="mt-3 space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="space-y-1.5">
        {players.map(player => {
          const isActive = activeParticipants.includes(player.id);
          const canDeactivate = activeParticipants.length > 2;
          
          return (
            <div 
              key={player.id}
              className={cn(
                "flex items-center justify-between p-2 rounded-lg transition-colors",
                isActive ? "bg-muted/50" : "bg-muted/20 opacity-60"
              )}
            >
              <div className="flex items-center gap-2">
                <div 
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                  style={{ backgroundColor: player.color }}
                >
                  {player.initials}
                </div>
                <span className="text-xs">{formatPlayerName(player.name)}</span>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={() => togglePlayer(player.id)}
                disabled={isActive && !canDeactivate}
                className="scale-75"
              />
            </div>
          );
        })}
      </div>
      <p className="text-[9px] text-muted-foreground">
        Mínimo 2 participantes requeridos. Los jugadores desactivados no participan en esta apuesta.
      </p>
    </div>
  );
};
