import React, { useMemo, useState, useEffect } from 'react';
import { Player, BetConfig } from '@/types/golf';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Target } from 'lucide-react';
import { hasAnySangronPairs, getOyesModalityForPair } from '@/lib/rayasCalculations';
import { cn } from '@/lib/utils';

interface OyesSangronDialogProps {
  players: Player[];
  betConfig: BetConfig;
  basePlayerId?: string;
  currentHole: number;
  trigger?: React.ReactNode;
  // Map of playerId -> proximity (1-4 or null)
  sangronProximities: Map<string, number | null>;
  onProximityChange: (playerId: string, proximity: number | null) => void;
  isPar3: boolean;
}

export const OyesSangronDialog: React.FC<OyesSangronDialogProps> = ({
  players,
  betConfig,
  basePlayerId,
  currentHole,
  trigger,
  sangronProximities,
  onProximityChange,
  isPar3,
}) => {
  const [open, setOpen] = useState(false);

  // Get players who have at least one Sangrón pair
  const sangronPlayers = useMemo(() => {
    const playerIds = new Set<string>();
    
    for (const player of players) {
      for (const rival of players) {
        if (player.id === rival.id) continue;
        const modality = getOyesModalityForPair(betConfig, player.id, rival.id);
        if (modality === 'sangron') {
          playerIds.add(player.id);
          break; // Player participates in at least one Sangrón, move to next player
        }
      }
    }
    
    return players.filter(p => playerIds.has(p.id));
  }, [players, betConfig]);

  // Check if there are any sangrón pairs at all
  const hasSangron = useMemo(() => {
    return hasAnySangronPairs(betConfig, players);
  }, [betConfig, players]);

  // Don't show if no sangrón pairs or not a par 3
  if (!hasSangron || !isPar3) {
    return null;
  }

  const proximityOptions = [1, 2, 3, 4];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="icon" className="shrink-0">
            <Target className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Oyes Sangrón - Hoyo {currentHole}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Selecciona el orden de proximidad para jugadores con Oyes Sangrón
          </p>
          
          {sangronPlayers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay jugadores con apuestas de Oyes Sangrón
            </p>
          ) : (
            <div className="space-y-3">
              {sangronPlayers.map((player) => {
                const currentProximity = sangronProximities.get(player.id);
                
                return (
                  <div key={player.id} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <PlayerAvatar 
                        initials={player.initials} 
                        background={player.color} 
                        size="sm" 
                        isLoggedInUser={player.id === basePlayerId || player.profileId === basePlayerId}
                      />
                      <span className="font-medium text-sm">{player.name}</span>
                    </div>
                    
                    <div className="flex gap-1">
                      {proximityOptions.map((pos) => {
                        const isSelected = currentProximity === pos;
                        return (
                          <button
                            key={pos}
                            onClick={() => onProximityChange(player.id, isSelected ? null : pos)}
                            className={cn(
                              "w-8 h-8 rounded-full text-sm font-bold transition-all",
                              isSelected 
                                ? "bg-golf-gold text-golf-dark" 
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            )}
                          >
                            {pos}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        <div className="flex justify-end pt-2">
          <Button onClick={() => setOpen(false)}>
            Listo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
