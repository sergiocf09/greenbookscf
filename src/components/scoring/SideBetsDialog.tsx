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
import { DollarSign, Plus, X, Check, Trash2, Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PlayerAvatar } from '@/components/PlayerAvatar';

interface SideBetsDialogProps {
  players: Player[];
  sideBets: SideBet[];
  onAddSideBet: (bet: SideBet) => void;
  onUpdateSideBet?: (bet: SideBet) => void;
  onDeleteSideBet?: (betId: string) => void;
  trigger?: React.ReactNode;
  basePlayerId?: string;
  currentHole?: number; // Current hole for new side bets
}

export const SideBetsDialog: React.FC<SideBetsDialogProps> = ({
  players,
  sideBets,
  onAddSideBet,
  onUpdateSideBet,
  onDeleteSideBet,
  trigger,
  basePlayerId,
  currentHole,
}) => {
  const [open, setOpen] = useState(false);
  const [winners, setWinners] = useState<string[]>([]);
  const [losers, setLosers] = useState<string[]>([]);
  const [amount, setAmount] = useState(25);
  const [description, setDescription] = useState('');
  const [editingBet, setEditingBet] = useState<SideBet | null>(null);

  const resetForm = () => {
    setWinners([]);
    setLosers([]);
    setAmount(25);
    setDescription('');
    setEditingBet(null);
  };

  const toggleWinner = (playerId: string) => {
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

    if (editingBet && onUpdateSideBet) {
      onUpdateSideBet({
        ...editingBet,
        winners,
        losers,
        amount,
        description: description.trim() || undefined,
      });
    } else {
      const newBet: SideBet = {
        id: `side-${Date.now()}`,
        winners,
        losers,
        amount,
        description: description.trim() || undefined,
        holeNumber: currentHole,
        createdAt: new Date().toISOString(),
      };
      onAddSideBet(newBet);
    }
    
    resetForm();
  };

  const handleEdit = (bet: SideBet) => {
    setEditingBet(bet);
    setWinners(bet.winners);
    setLosers(bet.losers);
    setAmount(bet.amount);
    setDescription(bet.description || '');
  };

  const handleDelete = (betId: string) => {
    if (onDeleteSideBet) {
      onDeleteSideBet(betId);
    }
  };

  const canSubmit = winners.length > 0 && losers.length > 0 && amount > 0;

  const getPlayerName = (id: string) => {
    const player = players.find(p => p.id === id);
    return player?.name.split(' ')[0] || 'Desconocido';
  };

  const getPlayer = (id: string) => players.find(p => p.id === id);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-1">
            <DollarSign className="h-3.5 w-3.5" />
            Side Bet
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {editingBet ? 'Editar Side Bet' : 'Side Bets'}
          </DialogTitle>
          <DialogDescription>
            Captura rápida de apuestas entre jugadores (sin hándicap)
          </DialogDescription>
        </DialogHeader>

        {/* Existing Side Bets List */}
        {sideBets.length > 0 && !editingBet && (
          <div className="space-y-2 border-b border-border pb-3">
            <Label className="text-xs font-medium text-muted-foreground">Side Bets Capturados</Label>
            {sideBets.map(bet => {
              const winnersStr = bet.winners.map(id => getPlayerName(id)).join(', ');
              const losersStr = bet.losers.map(id => getPlayerName(id)).join(', ');
              return (
                <div 
                  key={bet.id} 
                  className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-green-600 font-medium truncate">{winnersStr}</span>
                      <span className="text-muted-foreground">←</span>
                      <span className="text-destructive truncate">{losersStr}</span>
                    </div>
                    {bet.description && (
                      <p className="text-[10px] text-muted-foreground truncate">{bet.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <span className="font-bold">${bet.amount}</span>
                    {onUpdateSideBet && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleEdit(bet)}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    )}
                    {onDeleteSideBet && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(bet.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-4 py-2">
          <Label className="text-sm font-medium">
            {editingBet ? 'Editando apuesta' : 'Nueva Side Bet'}
          </Label>
          
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
                      style={{ 
                        backgroundColor: isSelected ? 'white' : player.color, 
                        color: isSelected ? player.color : 'white' 
                      }}
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

        <DialogFooter className="gap-2">
          {editingBet && (
            <Button variant="outline" onClick={resetForm} className="flex-1">
              Cancelar Edición
            </Button>
          )}
          <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>
            Cerrar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-1">
            <Plus className="h-4 w-4" />
            {editingBet ? 'Guardar' : 'Agregar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Side Bets Summary Display (for dashboard) - Enhanced with edit/delete
interface SideBetsSummaryProps {
  sideBets: SideBet[];
  players: Player[];
  basePlayerId?: string;
  onUpdateSideBet?: (bet: SideBet) => void;
  onDeleteSideBet?: (betId: string) => void;
  showManagement?: boolean;
}

export const SideBetsSummary: React.FC<SideBetsSummaryProps> = ({
  sideBets,
  players,
  basePlayerId,
  onUpdateSideBet,
  onDeleteSideBet,
  showManagement = false,
}) => {
  // Filter out invalid side bets (must have winners, losers, and positive amount)
  const validBets = sideBets.filter(bet => 
    bet.winners?.length > 0 && 
    bet.losers?.length > 0 && 
    bet.amount > 0
  );
  
  if (validBets.length === 0) return null;

  const getPlayerName = (id: string) => {
    const player = players.find(p => p.id === id);
    return player?.name.split(' ')[0] || 'Desconocido';
  };

  const getPlayerBalance = (playerId: string): number => {
    let balance = 0;
    for (const bet of validBets) {
      if (bet.winners.includes(playerId)) {
        balance += bet.amount * bet.losers.length / bet.winners.length;
      }
      if (bet.losers.includes(playerId)) {
        balance -= bet.amount;
      }
    }
    return balance;
  };

  const baseBalance = basePlayerId ? getPlayerBalance(basePlayerId) : 0;

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium flex items-center gap-1">
          <DollarSign className="h-4 w-4" />
          Side Bets
        </span>
        <span className={cn(
          'text-sm font-bold',
          baseBalance > 0 ? 'text-green-600' : baseBalance < 0 ? 'text-destructive' : 'text-muted-foreground'
        )}>
          {baseBalance >= 0 ? '+' : ''}${baseBalance}
        </span>
      </div>
      
      <div className="space-y-1">
        {validBets.map(bet => (
          <div key={bet.id} className="flex items-center justify-between text-xs gap-2">
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <span className="text-green-600 font-medium truncate">
                {bet.winners.map(id => getPlayerName(id)).join(', ')}
              </span>
              <span className="text-muted-foreground shrink-0">←</span>
              <span className="text-destructive truncate">
                {bet.losers.map(id => getPlayerName(id)).join(', ')}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="font-medium">${bet.amount}</span>
              {showManagement && onDeleteSideBet && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-destructive hover:text-destructive"
                  onClick={() => onDeleteSideBet(bet.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Bilateral Side Bets - shows side bets between two specific players
interface BilateralSideBetsProps {
  sideBets: SideBet[];
  players: Player[];
  playerId: string;
  rivalId: string;
  onDeleteSideBet?: (betId: string) => void;
}

export const BilateralSideBets: React.FC<BilateralSideBetsProps> = ({
  sideBets,
  players,
  playerId,
  rivalId,
  onDeleteSideBet,
}) => {
  // Filter to only bets involving both players
  const relevantBets = sideBets.filter(bet => {
    const hasPlayer = bet.winners.includes(playerId) || bet.losers.includes(playerId);
    const hasRival = bet.winners.includes(rivalId) || bet.losers.includes(rivalId);
    return hasPlayer && hasRival;
  });

  if (relevantBets.length === 0) return null;

  const getPlayerName = (id: string) => {
    const player = players.find(p => p.id === id);
    return player?.name.split(' ')[0] || 'Desconocido';
  };

  // Calculate balance from playerId's perspective
  const balance = relevantBets.reduce((sum, bet) => {
    if (bet.winners.includes(playerId) && bet.losers.includes(rivalId)) {
      return sum + (bet.amount / bet.winners.length);
    }
    if (bet.losers.includes(playerId) && bet.winners.includes(rivalId)) {
      return sum - (bet.amount / bet.winners.length);
    }
    return sum;
  }, 0);

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3 bg-muted/30">
        <span className="font-semibold text-sm flex items-center gap-1">
          <DollarSign className="h-4 w-4" />
          Side Bets
        </span>
        <span className={cn(
          'text-lg font-bold',
          balance > 0 ? 'text-green-600' : balance < 0 ? 'text-destructive' : 'text-muted-foreground'
        )}>
          {balance >= 0 ? '+' : ''}${balance}
        </span>
      </div>
      
      <div className="divide-y divide-border/30">
        {relevantBets.map(bet => {
          const isWinner = bet.winners.includes(playerId);
          const betAmount = isWinner ? (bet.amount / bet.winners.length) : -(bet.amount / bet.winners.length);
          
          return (
            <div key={bet.id} className="flex items-center justify-between p-2 bg-background/50 text-xs">
              <div className="flex-1 min-w-0">
                <span className={cn(
                  'font-medium',
                  isWinner ? 'text-green-600' : 'text-destructive'
                )}>
                  {isWinner ? 'Cobras' : 'Pagas'}
                </span>
                {bet.description && (
                  <span className="text-muted-foreground ml-1">- {bet.description}</span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className={cn(
                  'font-bold',
                  betAmount > 0 ? 'text-green-600' : 'text-destructive'
                )}>
                  {betAmount >= 0 ? '+' : ''}${betAmount}
                </span>
                {onDeleteSideBet && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-destructive hover:text-destructive"
                    onClick={() => onDeleteSideBet(bet.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
