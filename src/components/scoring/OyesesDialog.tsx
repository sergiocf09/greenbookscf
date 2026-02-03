import React, { useMemo, useState } from 'react';
import { Player, BetConfig } from '@/types/golf';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Target, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getOyesModalityForPair, hasAnySangronPairs } from '@/lib/rayasCalculations';

interface OyesesDialogProps {
  players: Player[];
  betConfig: BetConfig;
  basePlayerId?: string;
  currentHole: number;
  isPar3: boolean;
  // Map of playerId -> proximity (1-6 or null)
  proximities: Map<string, number | null>;
  onProximityChange: (playerId: string, proximity: number | null) => void;
  trigger?: React.ReactNode;
}

/**
 * Check if Oyeses is enabled (either as standalone bet or as Rayas segment)
 */
const isOyesesEnabled = (config: BetConfig): boolean => {
  // Check standalone Oyeses bet
  if (config.oyeses?.enabled) return true;
  
  // Check Rayas Oyes segment
  if (config.rayas?.enabled) {
    const oyesSegment = config.rayas.segments?.oyes;
    return oyesSegment?.enabled ?? true; // Default to enabled if not specified
  }
  
  return false;
};

/**
 * Get which Oyeses modes are active for display purposes
 */
const getActiveOyesesModes = (
  config: BetConfig,
  players: Player[]
): { hasStandalone: boolean; hasRayas: boolean; hasAnySangron: boolean } => {
  const hasStandalone = config.oyeses?.enabled ?? false;
  const hasRayas = config.rayas?.enabled && (config.rayas.segments?.oyes?.enabled ?? true);
  
  // Check for any Sangrón pairs (either in standalone or Rayas)
  let hasAnySangron = false;
  
  // Check Rayas Sangrón
  if (hasRayas) {
    hasAnySangron = hasAnySangronPairs(config, players);
  }
  
  // Check standalone Oyeses for Sangrón
  if (hasStandalone && config.oyeses?.playerConfigs) {
    const hasSangronPlayer = config.oyeses.playerConfigs.some(pc => pc.modality === 'sangron' && pc.enabled);
    if (hasSangronPlayer) hasAnySangron = true;
  }
  
  return { hasStandalone, hasRayas, hasAnySangron };
};

export const OyesesDialog: React.FC<OyesesDialogProps> = ({
  players,
  betConfig,
  basePlayerId,
  currentHole,
  isPar3,
  proximities,
  onProximityChange,
  trigger,
}) => {
  const [open, setOpen] = useState(false);

  // Check if Oyeses is enabled at all
  const oyesesEnabled = useMemo(() => isOyesesEnabled(betConfig), [betConfig]);
  
  // Get active modes info
  const modes = useMemo(() => getActiveOyesesModes(betConfig, players), [betConfig, players]);

  // Don't render if not a Par 3 or Oyeses not enabled
  if (!isPar3 || !oyesesEnabled) {
    return null;
  }

  const proximityOptions = [1, 2, 3, 4, 5, 6];

  // Check how many proximities are set (for display purposes)
  const setCount = Array.from(proximities.values()).filter(v => v !== null).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button 
            variant="outline" 
            size="icon" 
            className={cn(
              "shrink-0 relative",
              setCount > 0 && "border-primary"
            )}
          >
            <Target className="h-4 w-4" />
            {modes.hasAnySangron && (
              <Zap className="h-2.5 w-2.5 absolute -top-0.5 -right-0.5 text-golf-gold fill-golf-gold" />
            )}
            {setCount > 0 && (
              <span className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">
                {setCount}
              </span>
            )}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Oyes - Hoyo {currentHole}
            {modes.hasAnySangron && (
              <span className="flex items-center gap-1 text-xs font-normal text-golf-gold">
                <Zap className="h-3 w-3 fill-golf-gold" />
                Sangrón
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Selecciona el orden de proximidad al hoyo (1 = más cerca)
          </p>
          
          {/* Active modes indicator */}
          <div className="flex gap-2 text-[10px]">
            {modes.hasStandalone && (
              <span className="bg-muted px-2 py-0.5 rounded">📍 Oyes</span>
            )}
            {modes.hasRayas && (
              <span className="bg-muted px-2 py-0.5 rounded">📊 Rayas</span>
            )}
          </div>
          
          {players.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay jugadores
            </p>
          ) : (
            <div className="space-y-3">
              {players.map((player) => {
                const currentProximity = proximities.get(player.id);
                const isLoggedInUser = player.id === basePlayerId || player.profileId === basePlayerId;
                
                return (
                  <div key={player.id} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <PlayerAvatar 
                        initials={player.initials} 
                        background={player.color} 
                        size="sm" 
                        isLoggedInUser={isLoggedInUser}
                      />
                      <span className="font-medium text-sm truncate">{player.name}</span>
                    </div>
                    
                    <div className="flex gap-1 shrink-0">
                      {proximityOptions.map((pos) => {
                        const isSelected = currentProximity === pos;
                        return (
                          <button
                            key={pos}
                            onClick={() => onProximityChange(player.id, isSelected ? null : pos)}
                            className={cn(
                              "w-7 h-7 rounded-full text-xs font-bold transition-all",
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
          
          {/* Help text */}
          <div className="text-[10px] text-muted-foreground space-y-1 pt-2 border-t">
            <p>• Sin selección = no subió al green (acumula en modo Acumulado)</p>
            <p>• El número más bajo gana el hoyo</p>
            {modes.hasAnySangron && (
              <p className="text-golf-gold">• Sangrón: se define ganador en cada hoyo, sin acumulación</p>
            )}
          </div>
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
