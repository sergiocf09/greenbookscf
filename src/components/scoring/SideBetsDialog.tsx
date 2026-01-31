import React, { useState } from 'react';
import { SideBet, Player } from '@/types/golf';
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
import { DollarSign, Plus, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SideBetsDialogProps {
  players: Player[];
  sideBets: SideBet[];
  onAddSideBet: (bet: SideBet) => void;
  trigger?: React.ReactNode;
  basePlayerId?: string;
}

export const SideBetsDialog: React.FC<SideBetsDialogProps> = ({
  players,
  sideBets,
  onAddSideBet,
  trigger,
  basePlayerId,
}) => {
  const [open, setOpen] = useState(false);
  const [winners, setWinners] = useState<string[]>([]);
  const [losers, setLosers] = useState<string[]>([]);
  const [amount, setAmount] = useState(25);
  const [description, setDescription] = useState('');

  const toggleWinner = (playerId: string) => {
    // Can't be both winner and loser
    if (losers.includes(playerId)) {
      setLosers(prev => prev.filter(id => id !== playerId));
    }
    setWinners(prev => 
      prev.includes(playerId) 
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };

  const toggleLoser = (playerId: string) => {
    // Can't be both winner and loser
    if (winners.includes(playerId)) {
      setWinners(prev => prev.filter(id => id !== playerId));
    }
    setLosers(prev => 
      prev.includes(playerId) 
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };

  const handleSubmit = () => {
    if (winners.length === 0 || losers.length === 0 || amount <= 0) return;

    const newBet: SideBet = {
      id: `side-${Date.now()}`,
      winners,
      losers,
      amount,
      description: description.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    onAddSideBet(newBet);
    
    // Reset form
    setWinners([]);
    setLosers([]);
    setAmount(25);
    setDescription('');
    setOpen(false);
  };

  const canSubmit = winners.length > 0 && losers.length > 0 && amount > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-1">
            <DollarSign className="h-3.5 w-3.5" />
            Side Bet
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Side Bet
          </DialogTitle>
          <DialogDescription>
            Captura rápida de apuesta entre jugadores (sin hándicap)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Winners */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-green-600">¿Quién cobra? (Ganadores)</Label>
            <div className="flex flex-wrap gap-2">
              {players.map(player => {
                const isSelected = winners.includes(player.id);
                return (
                  <button
                    key={player.id}
                    onClick={() => toggleWinner(player.id)}
                    className={cn(
                      'flex items-center gap-1.5 px-2 py-1.5 rounded-full text-xs font-medium transition-all border',
                      isSelected 
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                    )}
                  >
                    <div 
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold"
                      style={{ backgroundColor: isSelected ? 'white' : player.color, color: isSelected ? player.color : 'white' }}
                    >
                      {player.initials}
                    </div>
                    {player.name.split(' ')[0]}
                    {isSelected && <Check className="h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Losers */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-destructive">¿Quién paga? (Perdedores)</Label>
            <div className="flex flex-wrap gap-2">
              {players.map(player => {
                const isSelected = losers.includes(player.id);
                const isWinner = winners.includes(player.id);
                return (
                  <button
                    key={player.id}
                    onClick={() => toggleLoser(player.id)}
                    disabled={isWinner}
                    className={cn(
                      'flex items-center gap-1.5 px-2 py-1.5 rounded-full text-xs font-medium transition-all border',
                      isSelected 
                        ? 'bg-destructive text-destructive-foreground border-destructive'
                        : isWinner
                          ? 'opacity-30 cursor-not-allowed bg-muted border-border'
                          : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                    )}
                  >
                    <div 
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold"
                      style={{ backgroundColor: isSelected ? 'white' : player.color, color: isSelected ? 'hsl(var(--destructive))' : 'white' }}
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

          {/* Amount */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Importe por persona</Label>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(parseInt(e.target.value) || 0)}
                className="w-24"
                min={0}
                step={25}
              />
              <div className="flex gap-1">
                {[25, 50, 100].map(val => (
                  <Button
                    key={val}
                    type="button"
                    variant={amount === val ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setAmount(val)}
                  >
                    ${val}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Description (optional) */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Descripción (opcional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Birdie en hoyo 7"
              className="text-xs"
            />
          </div>

          {/* Summary */}
          {canSubmit && (
            <div className="p-3 bg-muted/50 rounded-lg text-xs">
              <div className="flex items-center justify-between">
                <span>
                  {losers.length} paga{losers.length > 1 ? 'n' : ''} a {winners.length} ganador{winners.length > 1 ? 'es' : ''}
                </span>
                <span className="font-bold text-green-600">
                  ${amount * losers.length} total
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-1">
            <Plus className="h-4 w-4" />
            Agregar Side Bet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Side Bets Summary Display (for dashboard)
interface SideBetsSummaryProps {
  sideBets: SideBet[];
  players: Player[];
  basePlayerId?: string;
}

export const SideBetsSummary: React.FC<SideBetsSummaryProps> = ({
  sideBets,
  players,
  basePlayerId,
}) => {
  if (sideBets.length === 0) return null;

  const getPlayerName = (id: string) => {
    const player = players.find(p => p.id === id);
    return player?.name.split(' ')[0] || 'Desconocido';
  };

  const getPlayerBalance = (playerId: string): number => {
    let balance = 0;
    for (const bet of sideBets) {
      if (bet.winners.includes(playerId)) {
        // Receives from each loser
        balance += bet.amount * bet.losers.length / bet.winners.length;
      }
      if (bet.losers.includes(playerId)) {
        // Pays to winners
        balance -= bet.amount;
      }
    }
    return balance;
  };

  const baseBalance = basePlayerId ? getPlayerBalance(basePlayerId) : 0;

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Side Bets</span>
        <span className={cn(
          'text-sm font-bold',
          baseBalance > 0 ? 'text-green-600' : baseBalance < 0 ? 'text-destructive' : 'text-muted-foreground'
        )}>
          {baseBalance >= 0 ? '+' : ''}${baseBalance}
        </span>
      </div>
      
      <div className="space-y-1">
        {sideBets.map(bet => (
          <div key={bet.id} className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="text-green-600 font-medium">
              {bet.winners.map(id => getPlayerName(id)).join(', ')}
            </span>
            <span>←</span>
            <span className="text-destructive">
              {bet.losers.map(id => getPlayerName(id)).join(', ')}
            </span>
            <span className="ml-auto font-medium">${bet.amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
