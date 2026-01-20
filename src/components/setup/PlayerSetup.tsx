import React, { useState } from 'react';
import { Plus, X, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Player } from '@/types/golf';
import { cn } from '@/lib/utils';

const playerColors = [
  'bg-golf-green text-white',
  'bg-golf-gold text-golf-dark',
  'bg-golf-green-light text-golf-dark',
  'bg-golf-dark text-white',
  'bg-blue-600 text-white',
  'bg-purple-600 text-white',
];

interface PlayerSetupProps {
  players: Player[];
  onChange: (players: Player[]) => void;
  maxPlayers?: number;
}

export const PlayerSetup: React.FC<PlayerSetupProps> = ({
  players,
  onChange,
  maxPlayers = 4,
}) => {
  const [newPlayerName, setNewPlayerName] = useState('');

  const addPlayer = () => {
    if (!newPlayerName.trim() || players.length >= maxPlayers) return;
    
    const initials = newPlayerName
      .split(' ')
      .map(n => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    const newPlayer: Player = {
      id: `player-${Date.now()}`,
      name: newPlayerName.trim(),
      initials,
      color: playerColors[players.length % playerColors.length],
      handicap: 0,
    };

    onChange([...players, newPlayer]);
    setNewPlayerName('');
  };

  const removePlayer = (id: string) => {
    onChange(players.filter(p => p.id !== id));
  };

  const updatePlayer = (id: string, updates: Partial<Player>) => {
    onChange(players.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  return (
    <div className="space-y-4">
      <Label className="text-sm font-medium">Jugadores ({players.length}/{maxPlayers})</Label>
      
      {/* Player List */}
      <div className="space-y-2">
        {players.map((player, index) => (
          <div 
            key={player.id}
            className="flex items-center gap-2 bg-card border border-border rounded-lg p-2"
          >
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
              player.color
            )}>
              {player.initials}
            </div>
            
            <div className="flex-1 min-w-0">
              <Input
                value={player.name}
                onChange={(e) => updatePlayer(player.id, { 
                  name: e.target.value,
                  initials: e.target.value.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                })}
                className="h-7 text-sm"
                placeholder="Nombre del jugador"
              />
            </div>
            
            <div className="flex items-center gap-1">
              <Label className="text-[10px] text-muted-foreground">HCP</Label>
              <Input
                type="number"
                value={player.handicap}
                onChange={(e) => updatePlayer(player.id, { handicap: parseInt(e.target.value) || 0 })}
                className="h-7 w-14 text-sm text-center"
                min={0}
                max={54}
              />
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => removePlayer(player.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {/* Add Player */}
      {players.length < maxPlayers && (
        <div className="flex gap-2">
          <Input
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
            placeholder="Nombre del nuevo jugador"
            className="flex-1"
            onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
          />
          <Button onClick={addPlayer} disabled={!newPlayerName.trim()}>
            <Plus className="h-4 w-4 mr-1" />
            Agregar
          </Button>
        </div>
      )}

      {players.length === 0 && (
        <div className="text-center py-6 text-muted-foreground">
          <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Agrega jugadores para comenzar</p>
        </div>
      )}
    </div>
  );
};
