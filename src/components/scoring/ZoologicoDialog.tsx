import React, { useState, useMemo } from 'react';
import { ZooEvent, ZooAnimalType, ZOO_ANIMALS, Player } from '@/types/golf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Plus, X, Trash2, Edit2, Minus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PlayerAvatar } from '@/components/PlayerAvatar';

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
  onUpdateEvent,
  onDeleteEvent,
  trigger,
  basePlayerId,
  currentHole,
}) => {
  const [open, setOpen] = useState(false);
  const [selectedAnimal, setSelectedAnimal] = useState<ZooAnimalType | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [count, setCount] = useState(1);
  const [editingEvent, setEditingEvent] = useState<ZooEvent | null>(null);

  const resetForm = () => {
    setSelectedAnimal(null);
    setSelectedPlayer(null);
    setCount(1);
    setEditingEvent(null);
  };

  const handleSubmit = () => {
    if (!selectedAnimal || !selectedPlayer || count <= 0) return;

    if (editingEvent) {
      onUpdateEvent({
        ...editingEvent,
        animalType: selectedAnimal,
        playerId: selectedPlayer,
        count,
      });
    } else {
      const newEvent: ZooEvent = {
        id: `zoo-${Date.now()}`,
        animalType: selectedAnimal,
        playerId: selectedPlayer,
        holeNumber: currentHole || 1,
        count,
        createdAt: new Date().toISOString(),
      };
      onAddEvent(newEvent);
    }
    
    resetForm();
  };

  const handleEdit = (event: ZooEvent) => {
    setEditingEvent(event);
    setSelectedAnimal(event.animalType);
    setSelectedPlayer(event.playerId);
    setCount(event.count);
  };

  const handleDelete = (eventId: string) => {
    onDeleteEvent(eventId);
  };

  const canSubmit = selectedAnimal && selectedPlayer && count > 0;

  const getPlayerName = (id: string) => {
    const player = players.find(p => p.id === id);
    return player?.name.split(' ')[0] || 'Desconocido';
  };

  const getPlayer = (id: string) => players.find(p => p.id === id);

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
            🦁 Zoológico
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            🦁 Zoológico
          </DialogTitle>
          <DialogDescription>
            Registra eventos: Camello (bunker), Pez (agua), Gorila (OB)
          </DialogDescription>
        </DialogHeader>

        {/* Existing Events List */}
        {sortedEvents.length > 0 && !editingEvent && (
          <div className="space-y-2 border-b border-border pb-3">
            <Label className="text-xs font-medium text-muted-foreground">Eventos Registrados</Label>
            {sortedEvents.map(event => {
              const player = getPlayer(event.playerId);
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
                      className="h-6 w-6"
                      onClick={() => handleEdit(event)}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
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
            {editingEvent ? 'Editando evento' : 'Nuevo Evento'}
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
                    onClick={() => setSelectedAnimal(animal)}
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

          {/* Player Selection */}
          {selectedAnimal && (
            <div className="space-y-2">
              <Label className="text-xs font-medium">¿Quién cometió la incidencia?</Label>
              <div className="flex flex-wrap gap-2">
                {players.map(player => {
                  const isSelected = selectedPlayer === player.id;
                  return (
                    <button
                      key={player.id}
                      onClick={() => setSelectedPlayer(player.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-2 py-1.5 rounded-full text-xs font-medium transition-all border',
                        isSelected 
                          ? 'bg-destructive text-destructive-foreground border-destructive'
                          : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                      )}
                    >
                      <div 
                        className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold"
                        style={{ 
                          backgroundColor: isSelected ? 'white' : player.color, 
                          color: isSelected ? 'hsl(var(--destructive))' : 'white' 
                        }}
                      >
                        {player.initials}
                      </div>
                      {player.name.split(' ')[0]}
                      {isSelected && <X className="h-3 w-3" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Count Selector */}
          {selectedPlayer && (
            <div className="space-y-2">
              <Label className="text-xs font-medium">¿Cuántas veces?</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCount(Math.max(1, count - 1))}
                  disabled={count <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  value={count}
                  onChange={(e) => setCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 text-center"
                  min={1}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCount(count + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground">
                  ${valuePerOccurrence * count} total
                </span>
              </div>
            </div>
          )}

          {/* Summary */}
          {canSubmit && (
            <div className="p-3 bg-muted/50 rounded-lg text-xs">
              <div className="flex items-center gap-2">
                <span className="text-lg">{selectedAnimal && ZOO_ANIMALS[selectedAnimal].emoji}</span>
                <span>
                  {getPlayerName(selectedPlayer!)} en H{currentHole || 1}
                  {count > 1 && <span className="font-bold text-destructive"> ×{count}</span>}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {editingEvent && (
            <Button variant="outline" onClick={resetForm} className="flex-1">
              Cancelar Edición
            </Button>
          )}
          <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>
            Cerrar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-1">
            <Plus className="h-4 w-4" />
            {editingEvent ? 'Guardar' : 'Agregar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
