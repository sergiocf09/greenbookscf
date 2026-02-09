import React from 'react';
import { cn } from '@/lib/utils';
import { Player, BetConfig } from '@/types/golf';
import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { formatPlayerName } from '@/lib/playerInput';

interface BetSummary {
  playerId: string;
  vsPlayer: string;
  betType: string;
  amount: number; // positive = winning, negative = losing
  segment: string;
}

interface PlayerBetIconsProps {
  player: Player;
  allPlayers: Player[];
  betConfig: BetConfig;
  betSummaries: BetSummary[];
  onPlayerClick: (rivalId: string) => void;
  selectedRival: string | null;
  basePlayerId?: string;
}

export const PlayerBetIcons: React.FC<PlayerBetIconsProps> = ({
  player,
  allPlayers,
  betConfig,
  betSummaries,
  onPlayerClick,
  selectedRival,
  basePlayerId,
}) => {
  const rivals = allPlayers.filter(p => p.id !== player.id);

  const getRivalBalance = (rivalId: string): number => {
    return betSummaries
      .filter(b => b.playerId === player.id && b.vsPlayer === rivalId)
      .reduce((sum, b) => sum + b.amount, 0);
  };

  return (
    <div className="flex items-center gap-2">
      {rivals.map(rival => {
        const balance = getRivalBalance(rival.id);
        const isSelected = selectedRival === rival.id;
        
        return (
          <button
            key={rival.id}
            onClick={() => onPlayerClick(rival.id)}
            className={cn(
              'flex flex-col items-center p-2 rounded-lg transition-all',
              isSelected 
                ? 'bg-primary/20 ring-2 ring-primary' 
                : 'bg-muted/50 hover:bg-muted'
            )}
          >
            <PlayerAvatar initials={rival.initials} background={rival.color} size="md" isLoggedInUser={rival.id === basePlayerId} />
            <div className={cn(
              'text-[10px] font-semibold mt-1 flex items-center gap-0.5',
              balance > 0 ? 'text-green-600' : balance < 0 ? 'text-destructive' : 'text-muted-foreground'
            )}>
              {balance !== 0 && (
                balance > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />
              )}
              ${Math.abs(balance)}
            </div>
          </button>
        );
      })}
    </div>
  );
};

interface BetDetailViewProps {
  player: Player;
  rival: Player;
  summaries: BetSummary[];
  betConfig: BetConfig;
  basePlayerId?: string;
}

export const BetDetailView: React.FC<BetDetailViewProps> = ({
  player,
  rival,
  summaries,
  betConfig,
  basePlayerId,
}) => {
  const relevantSummaries = summaries.filter(
    s => s.playerId === player.id && s.vsPlayer === rival.id
  );

  const totalBalance = relevantSummaries.reduce((sum, b) => sum + b.amount, 0);

  const groupedByType = relevantSummaries.reduce((acc, b) => {
    if (!acc[b.betType]) acc[b.betType] = [];
    acc[b.betType].push(b);
    return acc;
  }, {} as Record<string, BetSummary[]>);

  return (
    <div className="bg-card border border-border rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PlayerAvatar initials={player.initials} background={player.color} size="md" isLoggedInUser={player.id === basePlayerId} />
          <span className="text-sm text-muted-foreground">vs</span>
          <PlayerAvatar initials={rival.initials} background={rival.color} size="md" isLoggedInUser={rival.id === basePlayerId} />
        </div>
        <div className={cn(
          'text-xl font-bold flex items-center gap-1',
          totalBalance > 0 ? 'text-green-600' : totalBalance < 0 ? 'text-destructive' : 'text-muted-foreground'
        )}>
          {totalBalance > 0 && <TrendingUp className="h-5 w-5" />}
          {totalBalance < 0 && <TrendingDown className="h-5 w-5" />}
          <DollarSign className="h-4 w-4" />
          {Math.abs(totalBalance)}
        </div>
      </div>

      {/* Breakdown by bet type */}
      <div className="space-y-2">
        {Object.entries(groupedByType).map(([betType, bets]) => {
          const typeTotal = bets.reduce((sum, b) => sum + b.amount, 0);
          return (
            <div key={betType} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
              <span className="text-sm font-medium">{betType}</span>
              <span className={cn(
                'text-sm font-semibold',
                typeTotal > 0 ? 'text-green-600' : typeTotal < 0 ? 'text-destructive' : 'text-muted-foreground'
              )}>
                {typeTotal >= 0 ? '+' : ''}${typeTotal}
              </span>
            </div>
          );
        })}
      </div>

      {relevantSummaries.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          Sin apuestas registradas aún
        </p>
      )}
    </div>
  );
};

interface GeneralBetTableProps {
  players: Player[];
  summaries: BetSummary[];
  basePlayerId?: string;
}

export const GeneralBetTable: React.FC<GeneralBetTableProps> = ({
  players,
  summaries,
  basePlayerId,
}) => {
  const getPlayerTotalBalance = (playerId: string): number => {
    return summaries
      .filter(b => b.playerId === playerId)
      .reduce((sum, b) => sum + b.amount, 0);
  };

  const sortedPlayers = [...players].sort(
    (a, b) => getPlayerTotalBalance(b.id) - getPlayerTotalBalance(a.id)
  );

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="bg-primary/10 px-3 py-2 border-b border-border">
        <h3 className="text-sm font-semibold text-primary">Resumen General</h3>
      </div>

      <div className="divide-y divide-border">
        {sortedPlayers.map((player, index) => {
          const balance = getPlayerTotalBalance(player.id);
          return (
            <div key={player.id} className="flex items-center justify-between p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground w-5">{index + 1}</span>
                <PlayerAvatar initials={player.initials} background={player.color} size="md" isLoggedInUser={player.id === basePlayerId} />
                <span className="font-medium">{formatPlayerName(player.name)}</span>
              </div>
              <div className={cn(
                'text-lg font-bold flex items-center gap-1',
                balance > 0 ? 'text-green-600' : balance < 0 ? 'text-destructive' : 'text-muted-foreground'
              )}>
                {balance > 0 && '+'}
                ${balance}
              </div>
            </div>
          );
        })}
      </div>

      {/* Verification: Sum should be 0 */}
      <div className="bg-muted/50 px-3 py-2 text-center text-xs text-muted-foreground">
        Total: ${summaries.reduce((sum, b) => sum + b.amount, 0)} (debe ser $0)
      </div>
    </div>
  );
};
