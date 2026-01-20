// Complete Bet Dashboard with editable bilateral handicaps
import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Player, PlayerScore, BetConfig, GolfCourse } from '@/types/golf';
import { 
  calculateAllBets, 
  getPlayerBalance, 
  getBilateralBalance,
  groupSummariesByType,
  BetSummary 
} from '@/lib/betCalculations';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  ChevronDown, 
  ChevronUp,
  Settings2,
  X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface BilateralHandicapOverride {
  playerAId: string;
  playerBId: string;
  betType: string;
  playerAHandicap: number;
  playerBHandicap: number;
}

interface BetDashboardProps {
  players: Player[];
  scores: Map<string, PlayerScore[]>;
  betConfig: BetConfig;
  course: GolfCourse;
  basePlayerId?: string;
  confirmedHoles?: Set<number>;
}

export const BetDashboard: React.FC<BetDashboardProps> = ({
  players,
  scores,
  betConfig,
  course,
  basePlayerId,
  confirmedHoles = new Set(),
}) => {
  const [selectedRival, setSelectedRival] = useState<string | null>(null);
  const [expandedTypes, setExpandedTypes] = useState<string[]>([]);
  const [handicapOverrides, setHandicapOverrides] = useState<BilateralHandicapOverride[]>([]);
  
  // Filter scores to only include confirmed holes
  const confirmedScores = useMemo(() => {
    const filtered = new Map<string, PlayerScore[]>();
    scores.forEach((playerScores, playerId) => {
      filtered.set(playerId, playerScores.filter(s => confirmedHoles.has(s.holeNumber)));
    });
    return filtered;
  }, [scores, confirmedHoles]);

  // Calculate all bets using only confirmed scores
  const betSummaries = useMemo(() => 
    calculateAllBets(players, confirmedScores, betConfig, course),
    [players, confirmedScores, betConfig, course]
  );
  
  const basePlayer = players.find(p => p.id === basePlayerId || p.profileId === basePlayerId) || players[0];
  const rivals = players.filter(p => p.id !== basePlayer?.id);
  
  const toggleExpanded = (type: string) => {
    setExpandedTypes(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };
  
  // Get balance for base player vs each rival
  const getRivalBalance = (rivalId: string) => 
    getBilateralBalance(basePlayer?.id || '', rivalId, betSummaries);
  
  // Get grouped summaries for selected pair
  const getGroupedSummaries = (rivalId: string) =>
    groupSummariesByType(basePlayer?.id || '', rivalId, betSummaries);
  
  // Sort players by total balance for leaderboard
  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => 
      getPlayerBalance(b.id, betSummaries) - getPlayerBalance(a.id, betSummaries)
    );
  }, [players, betSummaries]);
  
  // Count of active bet types
  const activeBetTypes = useMemo(() => {
    const types = new Set<string>();
    if (betConfig.medal.enabled) {
      if (betConfig.medal.frontAmount > 0) types.add('Medal Front');
      if (betConfig.medal.backAmount > 0) types.add('Medal Back');
      if (betConfig.medal.totalAmount > 0) types.add('Medal Total');
    }
    if (betConfig.pressures.enabled) types.add('Presiones');
    if (betConfig.skins.enabled) types.add('Skins');
    if (betConfig.caros.enabled) types.add('Caros');
    if (betConfig.units.enabled) types.add('Unidades');
    if (betConfig.manchas.enabled) types.add('Manchas');
    if (betConfig.culebras.enabled) types.add('Culebras');
    if (betConfig.pinguinos.enabled) types.add('Pingüinos');
    return types;
  }, [betConfig]);
  
  return (
    <div className="space-y-4">
      {/* Rival Selector */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="text-muted-foreground">Tu balance vs:</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2 justify-center">
            {rivals.map(rival => {
              const balance = getRivalBalance(rival.id);
              const isSelected = selectedRival === rival.id;
              
              return (
                <button
                  key={rival.id}
                  onClick={() => setSelectedRival(isSelected ? null : rival.id)}
                  className={cn(
                    'flex flex-col items-center p-3 rounded-xl transition-all min-w-[70px]',
                    isSelected 
                      ? 'bg-primary text-primary-foreground shadow-lg scale-105' 
                      : 'bg-muted/50 hover:bg-muted'
                  )}
                >
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mb-1"
                    style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : rival.color }}
                  >
                    {rival.initials}
                  </div>
                  <div className={cn(
                    'text-xs font-bold flex items-center gap-0.5',
                    isSelected ? '' : balance > 0 ? 'text-green-500' : balance < 0 ? 'text-destructive' : 'text-muted-foreground'
                  )}>
                    {balance !== 0 && (
                      balance > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />
                    )}
                    ${Math.abs(balance)}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
      
      {/* Bilateral Detail View */}
      {selectedRival && basePlayer && (
        <BilateralDetail
          player={basePlayer}
          rival={players.find(p => p.id === selectedRival)!}
          groupedSummaries={getGroupedSummaries(selectedRival)}
          totalBalance={getRivalBalance(selectedRival)}
          expandedTypes={expandedTypes}
          onToggleExpand={toggleExpanded}
          handicapOverrides={handicapOverrides}
          onUpdateOverride={(override) => {
            setHandicapOverrides(prev => {
              const existing = prev.findIndex(
                o => o.playerAId === override.playerAId && 
                     o.playerBId === override.playerBId && 
                     o.betType === override.betType
              );
              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = override;
                return updated;
              }
              return [...prev, override];
            });
          }}
        />
      )}
      
      {/* General Leaderboard */}
      <Card>
        <CardHeader className="py-3 bg-primary/5">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Tabla General
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {sortedPlayers.map((player, index) => {
              const balance = getPlayerBalance(player.id, betSummaries);
              const isBase = player.id === basePlayer?.id;
              
              return (
                <div 
                  key={player.id} 
                  className={cn(
                    'flex items-center justify-between p-3',
                    isBase && 'bg-primary/5'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                      index === 0 ? 'bg-yellow-500 text-yellow-950' :
                      index === 1 ? 'bg-gray-300 text-gray-700' :
                      index === 2 ? 'bg-amber-600 text-amber-50' :
                      'bg-muted text-muted-foreground'
                    )}>
                      {index + 1}
                    </span>
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: player.color }}
                    >
                      {player.initials}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{player.name}</p>
                      <p className="text-[10px] text-muted-foreground">HCP {player.handicap}</p>
                    </div>
                  </div>
                  <div className={cn(
                    'text-lg font-bold flex items-center gap-1',
                    balance > 0 ? 'text-green-500' : balance < 0 ? 'text-destructive' : 'text-muted-foreground'
                  )}>
                    {balance > 0 && <TrendingUp className="h-4 w-4" />}
                    {balance < 0 && <TrendingDown className="h-4 w-4" />}
                    {balance >= 0 ? '+' : ''}{balance}
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Verification */}
          <div className="bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground border-t">
            Σ = ${sortedPlayers.reduce((sum, p) => sum + getPlayerBalance(p.id, betSummaries), 0)} 
            <span className="ml-1">(debe ser $0)</span>
          </div>
        </CardContent>
      </Card>
      
      {/* Active Bets Summary */}
      <Card>
        <CardHeader className="py-2">
          <CardTitle className="text-xs text-muted-foreground">
            {activeBetTypes.size} apuestas activas: {Array.from(activeBetTypes).join(', ')}
          </CardTitle>
        </CardHeader>
      </Card>
    </div>
  );
};

// Bilateral Detail Component
interface BilateralDetailProps {
  player: Player;
  rival: Player;
  groupedSummaries: Record<string, { total: number; details: BetSummary[] }>;
  totalBalance: number;
  expandedTypes: string[];
  onToggleExpand: (type: string) => void;
  handicapOverrides: BilateralHandicapOverride[];
  onUpdateOverride: (override: BilateralHandicapOverride) => void;
}

const BilateralDetail: React.FC<BilateralDetailProps> = ({
  player,
  rival,
  groupedSummaries,
  totalBalance,
  expandedTypes,
  onToggleExpand,
  handicapOverrides,
  onUpdateOverride,
}) => {
  const [editingBet, setEditingBet] = useState<string | null>(null);
  
  const betTypeLabels: Record<string, string> = {
    'Medal Front 9': 'Medal Front',
    'Medal Back 9': 'Medal Back',
    'Medal Total': 'Medal 18',
    'Presiones Front': 'Presiones F9',
    'Presiones Back': 'Presiones B9',
    'Skin': 'Skins',
    'Caro': 'Caros',
    'Unidades': 'Unidades',
    'Manchas': 'Manchas',
    'Culebras': 'Culebras',
    'Pingüinos': 'Pingüinos',
  };
  
  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div 
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ backgroundColor: player.color }}
            >
              {player.initials}
            </div>
            <span className="text-muted-foreground text-sm">vs</span>
            <div 
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ backgroundColor: rival.color }}
            >
              {rival.initials}
            </div>
          </div>
          <div className={cn(
            'text-2xl font-bold flex items-center gap-1',
            totalBalance > 0 ? 'text-green-500' : totalBalance < 0 ? 'text-destructive' : 'text-muted-foreground'
          )}>
            {totalBalance > 0 && <TrendingUp className="h-5 w-5" />}
            {totalBalance < 0 && <TrendingDown className="h-5 w-5" />}
            ${Math.abs(totalBalance)}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 space-y-1">
        {Object.keys(groupedSummaries).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Sin apuestas calculadas aún
          </p>
        ) : (
          Object.entries(groupedSummaries).map(([betType, { total, details }]) => {
            const isExpanded = expandedTypes.includes(betType);
            const label = betTypeLabels[betType] || betType;
            
            return (
              <Collapsible key={betType} open={isExpanded} onOpenChange={() => onToggleExpand(betType)}>
                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <CollapsibleTrigger asChild>
                    <button className="flex items-center gap-2 text-left flex-1">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium text-sm">{label}</span>
                    </button>
                  </CollapsibleTrigger>
                  
                  <div className="flex items-center gap-2">
                    {/* Edit Handicaps Button */}
                    <Dialog open={editingBet === betType} onOpenChange={(open) => setEditingBet(open ? betType : null)}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <Settings2 className="h-3 w-3" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Handicaps para {label}</DialogTitle>
                        </DialogHeader>
                        <HandicapEditor
                          player={player}
                          rival={rival}
                          betType={betType}
                          currentOverride={handicapOverrides.find(
                            o => o.playerAId === player.id && o.playerBId === rival.id && o.betType === betType
                          )}
                          onSave={(override) => {
                            onUpdateOverride(override);
                            setEditingBet(null);
                          }}
                          onClose={() => setEditingBet(null)}
                        />
                      </DialogContent>
                    </Dialog>
                    
                    <span className={cn(
                      'text-sm font-bold min-w-[60px] text-right',
                      total > 0 ? 'text-green-500' : total < 0 ? 'text-destructive' : 'text-muted-foreground'
                    )}>
                      {total >= 0 ? '+' : ''}${total}
                    </span>
                  </div>
                </div>
                
                <CollapsibleContent>
                  <div className="pl-6 py-2 space-y-1 bg-muted/30 rounded-b-lg">
                    {details.map((detail, idx) => (
                      <div key={idx} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">
                          {detail.holeNumber ? `Hoyo ${detail.holeNumber}` : detail.description || detail.segment}
                        </span>
                        <span className={cn(
                          'font-medium',
                          detail.amount > 0 ? 'text-green-500' : detail.amount < 0 ? 'text-destructive' : ''
                        )}>
                          {detail.amount >= 0 ? '+' : ''}${detail.amount}
                        </span>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};

// Handicap Editor Component
interface HandicapEditorProps {
  player: Player;
  rival: Player;
  betType: string;
  currentOverride?: BilateralHandicapOverride;
  onSave: (override: BilateralHandicapOverride) => void;
  onClose: () => void;
}

const HandicapEditor: React.FC<HandicapEditorProps> = ({
  player,
  rival,
  betType,
  currentOverride,
  onSave,
  onClose,
}) => {
  const [playerAHcp, setPlayerAHcp] = useState(
    currentOverride?.playerAHandicap ?? player.handicap
  );
  const [playerBHcp, setPlayerBHcp] = useState(
    currentOverride?.playerBHandicap ?? rival.handicap
  );
  
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Ajusta los handicaps específicos para esta apuesta bilateral
      </p>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">{player.name}</Label>
          <Input
            type="number"
            value={playerAHcp}
            onChange={(e) => setPlayerAHcp(Number(e.target.value))}
            className="mt-1"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Original: {player.handicap}
          </p>
        </div>
        <div>
          <Label className="text-xs">{rival.name}</Label>
          <Input
            type="number"
            value={playerBHcp}
            onChange={(e) => setPlayerBHcp(Number(e.target.value))}
            className="mt-1"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Original: {rival.handicap}
          </p>
        </div>
      </div>
      
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setPlayerAHcp(player.handicap);
            setPlayerBHcp(rival.handicap);
          }}
          className="flex-1"
        >
          Restaurar
        </Button>
        <Button
          onClick={() => onSave({
            playerAId: player.id,
            playerBId: rival.id,
            betType,
            playerAHandicap: playerAHcp,
            playerBHandicap: playerBHcp,
          })}
          className="flex-1"
        >
          Guardar
        </Button>
      </div>
    </div>
  );
};

export default BetDashboard;
