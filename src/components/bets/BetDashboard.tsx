// Complete Bet Dashboard with simplified bilateral handicaps
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
  Users
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

// Simplified: One handicap override per player pair for ALL individual bets
interface BilateralHandicap {
  playerAId: string;
  playerBId: string;
  playerAHandicap: number;
  playerBHandicap: number;
}

// Separate handicap for Carritos (team bets)
interface CarritosHandicap {
  teamAHandicap: number;
  teamBHandicap: number;
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
  // One handicap per pair of players (applies to ALL individual bets)
  const [bilateralHandicaps, setBilateralHandicaps] = useState<BilateralHandicap[]>([]);
  // Separate handicap for Carritos
  const [carritosHandicap, setCarritosHandicap] = useState<CarritosHandicap | null>(null);
  
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
  
  // Get bilateral handicap for a pair
  const getBilateralHandicap = (playerAId: string, playerBId: string): BilateralHandicap | undefined => {
    return bilateralHandicaps.find(
      h => (h.playerAId === playerAId && h.playerBId === playerBId) ||
           (h.playerAId === playerBId && h.playerBId === playerAId)
    );
  };
  
  // Update bilateral handicap for a pair
  const updateBilateralHandicap = (handicap: BilateralHandicap) => {
    setBilateralHandicaps(prev => {
      const existingIdx = prev.findIndex(
        h => (h.playerAId === handicap.playerAId && h.playerBId === handicap.playerBId) ||
             (h.playerAId === handicap.playerBId && h.playerBId === handicap.playerAId)
      );
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = handicap;
        return updated;
      }
      return [...prev, handicap];
    });
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
    if (betConfig.carritos.enabled) types.add('Carritos');
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
              const pairHandicap = getBilateralHandicap(basePlayer?.id || '', rival.id);
              const hasOverride = !!pairHandicap;
              
              return (
                <button
                  key={rival.id}
                  onClick={() => setSelectedRival(isSelected ? null : rival.id)}
                  className={cn(
                    'flex flex-col items-center p-3 rounded-xl transition-all min-w-[70px] relative',
                    isSelected 
                      ? 'bg-primary text-primary-foreground shadow-lg scale-105' 
                      : 'bg-muted/50 hover:bg-muted'
                  )}
                >
                  {hasOverride && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-accent rounded-full" />
                  )}
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
          bilateralHandicap={getBilateralHandicap(basePlayer.id, selectedRival)}
          onUpdateBilateralHandicap={updateBilateralHandicap}
          carritosHandicap={carritosHandicap}
          onUpdateCarritosHandicap={setCarritosHandicap}
          betConfig={betConfig}
        />
      )}
      
      {/* General Leaderboard */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Tabla General</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            {sortedPlayers.map((player, idx) => {
              const balance = getPlayerBalance(player.id, betSummaries);
              const isBase = player.id === basePlayer?.id || player.profileId === basePlayerId;
              
              return (
                <div 
                  key={player.id}
                  className={cn(
                    'flex items-center justify-between p-2 rounded-lg',
                    isBase ? 'bg-primary/10 border border-primary/30' : 'bg-muted/30'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                      idx === 0 ? 'bg-golf-gold text-golf-gold-foreground' :
                      idx === sortedPlayers.length - 1 ? 'bg-destructive text-destructive-foreground' :
                      'bg-muted text-muted-foreground'
                    )}>
                      {idx + 1}
                    </span>
                    <div 
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{ backgroundColor: player.color }}
                    >
                      {player.initials}
                    </div>
                    <div>
                      <span className="font-medium text-sm">{player.name.split(' ')[0]}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">HCP {player.handicap}</span>
                    </div>
                  </div>
                  <div className={cn(
                    'text-lg font-bold',
                    balance > 0 ? 'text-green-500' : balance < 0 ? 'text-destructive' : 'text-muted-foreground'
                  )}>
                    {balance >= 0 ? '+' : ''}${balance}
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Verification */}
          <div className="bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground border-t mt-3">
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
  bilateralHandicap?: BilateralHandicap;
  onUpdateBilateralHandicap: (handicap: BilateralHandicap) => void;
  carritosHandicap: CarritosHandicap | null;
  onUpdateCarritosHandicap: (handicap: CarritosHandicap) => void;
  betConfig: BetConfig;
}

const BilateralDetail: React.FC<BilateralDetailProps> = ({
  player,
  rival,
  groupedSummaries,
  totalBalance,
  expandedTypes,
  onToggleExpand,
  bilateralHandicap,
  onUpdateBilateralHandicap,
  carritosHandicap,
  onUpdateCarritosHandicap,
  betConfig,
}) => {
  const [editingHandicap, setEditingHandicap] = useState(false);
  const [editingCarritos, setEditingCarritos] = useState(false);
  
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
  
  // Effective handicaps (with override or original)
  const effectivePlayerHcp = bilateralHandicap?.playerAHandicap ?? player.handicap;
  const effectiveRivalHcp = bilateralHandicap?.playerBHandicap ?? rival.handicap;
  const hasOverride = !!bilateralHandicap;
  
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
        
        {/* Bilateral Handicap Editor - applies to ALL individual bets */}
        <div className="mt-3 p-2 bg-muted/30 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium">Handicaps Bilaterales</span>
              {hasOverride && (
                <span className="text-[10px] bg-accent text-accent-foreground px-1.5 py-0.5 rounded">
                  Modificado
                </span>
              )}
            </div>
            <Dialog open={editingHandicap} onOpenChange={setEditingHandicap}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs">
                  Editar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Handicaps para {player.name} vs {rival.name}</DialogTitle>
                </DialogHeader>
                <BilateralHandicapEditor
                  player={player}
                  rival={rival}
                  currentHandicap={bilateralHandicap}
                  onSave={(h) => {
                    onUpdateBilateralHandicap(h);
                    setEditingHandicap(false);
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>
          
          <div className="flex justify-between mt-2 text-xs">
            <div className="flex items-center gap-1">
              <div 
                className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold"
                style={{ backgroundColor: player.color }}
              >
                {player.initials}
              </div>
              <span className={cn(hasOverride && 'text-accent font-medium')}>
                HCP {effectivePlayerHcp}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className={cn(hasOverride && 'text-accent font-medium')}>
                HCP {effectiveRivalHcp}
              </span>
              <div 
                className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold"
                style={{ backgroundColor: rival.color }}
              >
                {rival.initials}
              </div>
            </div>
          </div>
          
          <p className="text-[10px] text-muted-foreground mt-1 text-center">
            Aplica a todas las apuestas individuales
          </p>
        </div>
        
        {/* Carritos Handicap - separate */}
        {betConfig.carritos.enabled && (
          <div className="mt-2 p-2 bg-primary/10 rounded-lg border border-primary/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-primary">Carritos (Equipos)</span>
              </div>
              <Dialog open={editingCarritos} onOpenChange={setEditingCarritos}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs">
                    Editar
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Handicaps para Carritos</DialogTitle>
                  </DialogHeader>
                  <CarritosHandicapEditor
                    betConfig={betConfig}
                    currentHandicap={carritosHandicap}
                    onSave={(h) => {
                      onUpdateCarritosHandicap(h);
                      setEditingCarritos(false);
                    }}
                  />
                </DialogContent>
              </Dialog>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Handicap separado para apuestas por equipos
            </p>
          </div>
        )}
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
                  
                  <span className={cn(
                    'text-sm font-bold min-w-[60px] text-right',
                    total > 0 ? 'text-green-500' : total < 0 ? 'text-destructive' : 'text-muted-foreground'
                  )}>
                    {total >= 0 ? '+' : ''}${total}
                  </span>
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

// Bilateral Handicap Editor - single handicap for all individual bets
interface BilateralHandicapEditorProps {
  player: Player;
  rival: Player;
  currentHandicap?: BilateralHandicap;
  onSave: (handicap: BilateralHandicap) => void;
}

const BilateralHandicapEditor: React.FC<BilateralHandicapEditorProps> = ({
  player,
  rival,
  currentHandicap,
  onSave,
}) => {
  const [playerAHcp, setPlayerAHcp] = useState(
    currentHandicap?.playerAHandicap ?? player.handicap
  );
  const [playerBHcp, setPlayerBHcp] = useState(
    currentHandicap?.playerBHandicap ?? rival.handicap
  );
  
  const difference = Math.abs(playerAHcp - playerBHcp);
  const playerReceives = playerAHcp > playerBHcp;
  
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Este handicap se usará para <strong>todas las apuestas individuales</strong> entre estos dos jugadores (Medal, Presiones, Skins, Caros, Unidades, Manchas, etc.)
      </p>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs flex items-center gap-2">
            <div 
              className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold"
              style={{ backgroundColor: player.color }}
            >
              {player.initials}
            </div>
            {player.name}
          </Label>
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
          <Label className="text-xs flex items-center gap-2">
            <div 
              className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold"
              style={{ backgroundColor: rival.color }}
            >
              {rival.initials}
            </div>
            {rival.name}
          </Label>
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
      
      {difference > 0 && (
        <div className="bg-muted/50 p-3 rounded-lg text-center">
          <p className="text-sm">
            <strong>{playerReceives ? player.name : rival.name}</strong> recibe{' '}
            <span className="text-lg font-bold text-primary">{difference}</span> golpes
          </p>
        </div>
      )}
      
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setPlayerAHcp(player.handicap);
            setPlayerBHcp(rival.handicap);
          }}
          className="flex-1"
        >
          Restaurar Originales
        </Button>
        <Button
          onClick={() => onSave({
            playerAId: player.id,
            playerBId: rival.id,
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

// Carritos Handicap Editor - separate from bilateral
interface CarritosHandicapEditorProps {
  betConfig: BetConfig;
  currentHandicap: CarritosHandicap | null;
  onSave: (handicap: CarritosHandicap) => void;
}

const CarritosHandicapEditor: React.FC<CarritosHandicapEditorProps> = ({
  betConfig,
  currentHandicap,
  onSave,
}) => {
  const [teamAHcp, setTeamAHcp] = useState(currentHandicap?.teamAHandicap ?? 0);
  const [teamBHcp, setTeamBHcp] = useState(currentHandicap?.teamBHandicap ?? 0);
  
  const difference = Math.abs(teamAHcp - teamBHcp);
  
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Handicap específico para las apuestas de <strong>Carritos</strong> (equipos). 
        Este es independiente del handicap bilateral individual.
      </p>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">Equipo A</Label>
          <Input
            type="number"
            value={teamAHcp}
            onChange={(e) => setTeamAHcp(Number(e.target.value))}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Equipo B</Label>
          <Input
            type="number"
            value={teamBHcp}
            onChange={(e) => setTeamBHcp(Number(e.target.value))}
            className="mt-1"
          />
        </div>
      </div>
      
      {difference > 0 && (
        <div className="bg-muted/50 p-3 rounded-lg text-center">
          <p className="text-sm">
            <strong>Equipo {teamAHcp > teamBHcp ? 'A' : 'B'}</strong> recibe{' '}
            <span className="text-lg font-bold text-primary">{difference}</span> golpes
          </p>
        </div>
      )}
      
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setTeamAHcp(0);
            setTeamBHcp(0);
          }}
          className="flex-1"
        >
          Reiniciar
        </Button>
        <Button
          onClick={() => onSave({
            teamAHandicap: teamAHcp,
            teamBHandicap: teamBHcp,
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
