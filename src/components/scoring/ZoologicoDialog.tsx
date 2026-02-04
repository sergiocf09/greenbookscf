import React, { useState, useMemo } from 'react';
import { ZooEvent, ZooAnimalType, ZOO_ANIMALS, Player } from '@/types/golf';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ZoologicoDialogProps {
  players: Player[];
  events: ZooEvent[];
  enabledAnimals: ZooAnimalType[];
  valuePerOccurrence: number;
  onAddEvent: (event: ZooEvent) => void;
  onUpdateEvent: (event: ZooEvent) => void;
  onDeleteEvent: (eventId: string) => void;
  trigger?: React.ReactNode;
  basePlayerId?: string;
  currentHole?: number;
}

export const ZoologicoDialog: React.FC<ZoologicoDialogProps> = ({
  players,
  events,
  enabledAnimals,
  valuePerOccurrence,
  onAddEvent,
  onDeleteEvent,
  trigger,
  currentHole,
}) => {
  const [open, setOpen] = useState(false);
  const [selectedAnimal, setSelectedAnimal] = useState<ZooAnimalType | null>(null);
  // Support multiple player selection with counts
  const [selectedPlayers, setSelectedPlayers] = useState<Map<string, number>>(new Map());
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const resetForm = () => {
    setSelectedAnimal(null);
    setSelectedPlayers(new Map());
    setEditingEventId(null);
  };

  const togglePlayer = (playerId: string) => {
    setSelectedPlayers(prev => {
      const newMap = new Map(prev);
      if (newMap.has(playerId)) {
        newMap.delete(playerId);
      } else {
        newMap.set(playerId, 1);
      }
      return newMap;
    });
  };

  const updatePlayerCount = (playerId: string, delta: number) => {
    setSelectedPlayers(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(playerId) || 1;
      const newCount = Math.max(1, current + delta);
      newMap.set(playerId, newCount);
      return newMap;
    });
  };

  const handleSubmit = () => {
    if (!selectedAnimal || selectedPlayers.size === 0) return;

    // Create an event for each selected player with their count
    selectedPlayers.forEach((count, playerId) => {
      const newEvent: ZooEvent = {
        id: `zoo-${Date.now()}-${playerId}`,
        animalType: selectedAnimal,
        playerId,
        holeNumber: currentHole || 1,
        count,
        createdAt: new Date().toISOString(),
      };
      onAddEvent(newEvent);
    });
    
    resetForm();
  };

  const handleDelete = (eventId: string) => {
    onDeleteEvent(eventId);
  };

  const canSubmit = selectedAnimal && selectedPlayers.size > 0;

  const getPlayerName = (id: string) => {
    const player = players.find(p => p.id === id);
    return player?.name.split(' ')[0] || 'Desconocido';
  };

  // Calculate total cost for display
  const totalCost = useMemo(() => {
    let total = 0;
    selectedPlayers.forEach((count) => {
      total += count * valuePerOccurrence;
    });
    return total;
  }, [selectedPlayers, valuePerOccurrence]);

  // Sort events by hole number, then by creation time
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      if (a.holeNumber !== b.holeNumber) return a.holeNumber - b.holeNumber;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [events]);

  // Ordered animals as per spec: Camellos, Peces, Gorilas
  const orderedAnimals: ZooAnimalType[] = ['camello', 'pez', 'gorila'];
  const filteredAnimals = orderedAnimals.filter(a => enabledAnimals.includes(a));

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-1">
            🐾 Zoológico
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            🐾 Zoológico
          </DialogTitle>
          <DialogDescription>
            Registra eventos: Camello (bunker), Pez (agua), Gorila (OB)
          </DialogDescription>
        </DialogHeader>

        {/* Existing Events List */}
        {sortedEvents.length > 0 && !editingEventId && (
          <div className="space-y-2 border-b border-border pb-3">
            <Label className="text-xs font-medium text-muted-foreground">Eventos Registrados</Label>
            {sortedEvents.map(event => {
              const player = players.find(p => p.id === event.playerId);
              const animal = ZOO_ANIMALS[event.animalType];
              return (
                <div 
                  key={event.id} 
                  className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-lg">{animal.emoji}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-medium">{getPlayerName(event.playerId)}</span>
                        {event.count > 1 && (
                          <span className="text-destructive font-bold">×{event.count}</span>
                        )}
                      </div>
                      <span className="text-muted-foreground">H{event.holeNumber}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(event.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-4 py-2">
          <Label className="text-sm font-medium">
            Nuevo Evento (H{currentHole || 1})
          </Label>
          
          {/* Animal Selection */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Tipo de Evento</Label>
            <div className="flex flex-wrap gap-2">
              {filteredAnimals.map(animal => {
                const info = ZOO_ANIMALS[animal];
                const isSelected = selectedAnimal === animal;
                return (
                  <button
                    key={animal}
                    onClick={() => {
                      setSelectedAnimal(animal);
                      setSelectedPlayers(new Map()); // Reset players when changing animal
                    }}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all border',
                      isSelected 
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                    )}
                  >
                    <span className="text-lg">{info.emoji}</span>
                    {info.label}
                    {isSelected && <Check className="h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Player Selection - Multi-select with counts */}
          {selectedAnimal && (
            <div className="space-y-2">
              <Label className="text-xs font-medium">¿Quién cometió la incidencia? (selecciona todos)</Label>
              <div className="space-y-2">
                {players.map(player => {
                  const isSelected = selectedPlayers.has(player.id);
                  const count = selectedPlayers.get(player.id) || 0;
                  
                  return (
                    <div 
                      key={player.id}
                      className={cn(
                        'flex items-center justify-between p-2 rounded-lg border transition-all',
                        isSelected 
                          ? 'bg-destructive/10 border-destructive/50'
                          : 'bg-muted/30 border-border hover:bg-muted/50 cursor-pointer'
                      )}
                      onClick={() => !isSelected && togglePlayer(player.id)}
                    >
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
                          style={{ 
                            backgroundColor: isSelected ? 'hsl(var(--destructive))' : player.color, 
                            color: 'white' 
                          }}
                        >
                          {player.initials}
                        </div>
                        <span className="text-sm font-medium">{player.name.split(' ')[0]}</span>
                      </div>
                      
                      {isSelected ? (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (count <= 1) {
                                togglePlayer(player.id);
                              } else {
                                updatePlayerCount(player.id, -1);
                              }
                            }}
                          >
                            {count <= 1 ? <X className="h-3 w-3" /> : <span className="text-xs">−</span>}
                          </Button>
                          <span className="w-6 text-center text-sm font-bold text-destructive">{count}</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              updatePlayerCount(player.id, 1);
                            }}
                          >
                            <span className="text-xs">+</span>
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePlayer(player.id);
                          }}
                        >
                          Seleccionar
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Summary */}
          {canSubmit && (
            <div className="p-3 bg-muted/50 rounded-lg text-xs space-y-1">
              <div className="flex items-center gap-2 font-medium">
                <span className="text-lg">{selectedAnimal && ZOO_ANIMALS[selectedAnimal].emoji}</span>
                <span>H{currentHole || 1} - Resumen:</span>
              </div>
              {Array.from(selectedPlayers.entries()).map(([playerId, count]) => (
                <div key={playerId} className="flex items-center justify-between pl-7">
                  <span>{getPlayerName(playerId)}</span>
                  <span className="font-bold text-destructive">
                    {count > 1 && `×${count} = `}${valuePerOccurrence * count}
                  </span>
                </div>
              ))}
              <div className="border-t border-border pt-1 mt-1 flex justify-between font-bold">
                <span>Total:</span>
                <span className="text-destructive">${totalCost}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>
            Cerrar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-1">
            <Plus className="h-4 w-4" />
            Agregar {selectedPlayers.size > 1 ? `(${selectedPlayers.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
