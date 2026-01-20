// Complete Bet Dashboard - reorganized with bet type rows
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
  Settings2
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
          betConfig={betConfig}
          confirmedScores={confirmedScores}
          course={course}
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
    </div>
  );
};

// Bilateral Detail Component - Reorganized with bet type rows
interface BilateralDetailProps {
  player: Player;
  rival: Player;
  groupedSummaries: Record<string, { total: number; details: BetSummary[] }>;
  totalBalance: number;
  expandedTypes: string[];
  onToggleExpand: (type: string) => void;
  bilateralHandicap?: BilateralHandicap;
  onUpdateBilateralHandicap: (handicap: BilateralHandicap) => void;
  betConfig: BetConfig;
  confirmedScores: Map<string, PlayerScore[]>;
  course: GolfCourse;
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
  betConfig,
  confirmedScores,
  course,
}) => {
  const [editingHandicap, setEditingHandicap] = useState(false);
  
  // Calculate net scores for display
  const getNetScoreForSegment = (playerId: string, segment: 'front' | 'back' | 'total') => {
    const scores = confirmedScores.get(playerId) || [];
    let filtered: PlayerScore[];
    if (segment === 'front') {
      filtered = scores.filter(s => s.holeNumber >= 1 && s.holeNumber <= 9);
    } else if (segment === 'back') {
      filtered = scores.filter(s => s.holeNumber >= 10 && s.holeNumber <= 18);
    } else {
      filtered = scores;
    }
    return filtered.reduce((sum, s) => sum + s.netScore, 0);
  };
  
  // Group bet types for organized display
  const betTypeGroups = useMemo(() => {
    const groups: {
      key: string;
      label: string;
      segments: { label: string; key: string }[];
      getTotal: () => number;
      getSegmentData: (segmentKey: string) => { playerNet: number; rivalNet: number; amount: number };
    }[] = [];
    
    // Medal
    if (betConfig.medal.enabled) {
      groups.push({
        key: 'medal',
        label: 'Medal',
        segments: [
          { label: 'Front 9', key: 'medal_front' },
          { label: 'Back 9', key: 'medal_back' },
          { label: 'Total 18', key: 'medal_total' },
        ],
        getTotal: () => {
          const front = groupedSummaries['Medal Front 9']?.total || 0;
          const back = groupedSummaries['Medal Back 9']?.total || 0;
          const total = groupedSummaries['Medal Total']?.total || 0;
          return front + back + total;
        },
        getSegmentData: (segmentKey) => {
          const segment = segmentKey === 'medal_front' ? 'front' : segmentKey === 'medal_back' ? 'back' : 'total';
          const summaryKey = segmentKey === 'medal_front' ? 'Medal Front 9' : segmentKey === 'medal_back' ? 'Medal Back 9' : 'Medal Total';
          return {
            playerNet: getNetScoreForSegment(player.id, segment),
            rivalNet: getNetScoreForSegment(rival.id, segment),
            amount: groupedSummaries[summaryKey]?.total || 0,
          };
        },
      });
    }
    
    // Presiones
    if (betConfig.pressures.enabled) {
      groups.push({
        key: 'pressures',
        label: 'Presiones',
        segments: [
          { label: 'Front 9', key: 'pressure_front' },
          { label: 'Back 9', key: 'pressure_back' },
          { label: 'Total 18', key: 'pressure_total' },
        ],
        getTotal: () => {
          const front = groupedSummaries['Presiones Front']?.total || 0;
          const back = groupedSummaries['Presiones Back']?.total || 0;
          return front + back;
        },
        getSegmentData: (segmentKey) => {
          const summaryKey = segmentKey === 'pressure_front' ? 'Presiones Front' : segmentKey === 'pressure_back' ? 'Presiones Back' : '';
          const segment = segmentKey === 'pressure_front' ? 'front' : segmentKey === 'pressure_back' ? 'back' : 'total';
          return {
            playerNet: getNetScoreForSegment(player.id, segment),
            rivalNet: getNetScoreForSegment(rival.id, segment),
            amount: groupedSummaries[summaryKey]?.total || 0,
          };
        },
      });
    }
    
    // Skins
    if (betConfig.skins.enabled) {
      groups.push({
        key: 'skins',
        label: 'Skins',
        segments: [
          { label: 'Front 9', key: 'skins_front' },
          { label: 'Back 9', key: 'skins_back' },
        ],
        getTotal: () => groupedSummaries['Skin']?.total || 0,
        getSegmentData: (segmentKey) => {
          // Get skins count from details
          const skinDetails = groupedSummaries['Skin']?.details || [];
          const segment = segmentKey === 'skins_front' ? 'front' : 'back';
          const segmentSkins = skinDetails.filter(d => 
            segment === 'front' 
              ? (d.holeNumber && d.holeNumber <= 9)
              : (d.holeNumber && d.holeNumber > 9)
          );
          const segmentAmount = segmentSkins.reduce((sum, d) => sum + d.amount, 0);
          const playerWins = segmentSkins.filter(d => d.amount > 0).length;
          const rivalWins = segmentSkins.filter(d => d.amount < 0).length;
          return {
            playerNet: playerWins,
            rivalNet: rivalWins,
            amount: segmentAmount,
          };
        },
      });
    }
    
    // Caros
    if (betConfig.caros.enabled) {
      groups.push({
        key: 'caros',
        label: 'Caros',
        segments: [
          { label: 'Hoyos 15-18', key: 'caros_all' },
        ],
        getTotal: () => groupedSummaries['Caro']?.total || 0,
        getSegmentData: () => {
          const caroDetails = groupedSummaries['Caro']?.details || [];
          const playerWins = caroDetails.filter(d => d.amount > 0).length;
          const rivalWins = caroDetails.filter(d => d.amount < 0).length;
          return {
            playerNet: playerWins,
            rivalNet: rivalWins,
            amount: groupedSummaries['Caro']?.total || 0,
          };
        },
      });
    }
    
    // Unidades
    if (betConfig.units.enabled) {
      groups.push({
        key: 'units',
        label: 'Unidades',
        segments: [],
        getTotal: () => groupedSummaries['Unidades']?.total || 0,
        getSegmentData: () => ({ playerNet: 0, rivalNet: 0, amount: 0 }),
      });
    }
    
    // Manchas
    if (betConfig.manchas.enabled) {
      groups.push({
        key: 'manchas',
        label: 'Manchas',
        segments: [],
        getTotal: () => groupedSummaries['Manchas']?.total || 0,
        getSegmentData: () => ({ playerNet: 0, rivalNet: 0, amount: 0 }),
      });
    }
    
    // Culebras
    if (betConfig.culebras.enabled) {
      groups.push({
        key: 'culebras',
        label: 'Culebras',
        segments: [],
        getTotal: () => groupedSummaries['Culebras']?.total || 0,
        getSegmentData: () => ({ playerNet: 0, rivalNet: 0, amount: 0 }),
      });
    }
    
    // Pingüinos
    if (betConfig.pinguinos.enabled) {
      groups.push({
        key: 'pinguinos',
        label: 'Pingüinos',
        segments: [],
        getTotal: () => groupedSummaries['Pingüinos']?.total || 0,
        getSegmentData: () => ({ playerNet: 0, rivalNet: 0, amount: 0 }),
      });
    }
    
    return groups;
  }, [betConfig, groupedSummaries, confirmedScores, player.id, rival.id]);
  
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
      </CardHeader>
      
      <CardContent className="pt-0 space-y-2">
        {betTypeGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Sin apuestas calculadas aún
          </p>
        ) : (
          betTypeGroups.map((group) => {
            const total = group.getTotal();
            const isExpanded = expandedTypes.includes(group.key);
            const hasSegments = group.segments.length > 0;
            
            return (
              <div key={group.key} className="border border-border/50 rounded-lg overflow-hidden">
                {/* Main bet type row */}
                <div 
                  className={cn(
                    'flex items-center justify-between p-3 bg-muted/30',
                    hasSegments && 'cursor-pointer hover:bg-muted/50'
                  )}
                  onClick={() => hasSegments && onToggleExpand(group.key)}
                >
                  <div className="flex items-center gap-2">
                    {hasSegments && (
                      isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )
                    )}
                    <span className="font-semibold text-sm">{group.label}</span>
                  </div>
                  <span className={cn(
                    'text-lg font-bold',
                    total > 0 ? 'text-green-500' : total < 0 ? 'text-destructive' : 'text-muted-foreground'
                  )}>
                    {total >= 0 ? '+' : ''}${total}
                  </span>
                </div>
                
                {/* Segment rows */}
                {hasSegments && isExpanded && (
                  <div className="divide-y divide-border/30">
                    {group.segments.map((segment) => {
                      const data = group.getSegmentData(segment.key);
                      // Skip if no data yet
                      if (data.amount === 0 && data.playerNet === 0 && data.rivalNet === 0) {
                        return (
                          <div key={segment.key} className="flex items-center justify-between px-4 py-2 pl-10 bg-background/50">
                            <span className="text-xs text-muted-foreground">{segment.label}</span>
                            <span className="text-xs text-muted-foreground">-</span>
                          </div>
                        );
                      }
                      
                      return (
                        <div key={segment.key} className="flex items-center justify-between px-4 py-2 pl-10 bg-background/50">
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground w-16">{segment.label}</span>
                            {/* Score comparison */}
                            <div className="flex items-center gap-1 text-xs">
                              <span className={cn(
                                'font-medium min-w-[24px] text-center',
                                data.playerNet < data.rivalNet ? 'text-green-500' : 
                                data.playerNet > data.rivalNet ? 'text-destructive' : ''
                              )}>
                                {group.key === 'skins' || group.key === 'caros' 
                                  ? `${data.playerNet}W` 
                                  : data.playerNet || '-'}
                              </span>
                              <span className="text-muted-foreground">vs</span>
                              <span className={cn(
                                'font-medium min-w-[24px] text-center',
                                data.rivalNet < data.playerNet ? 'text-green-500' : 
                                data.rivalNet > data.playerNet ? 'text-destructive' : ''
                              )}>
                                {group.key === 'skins' || group.key === 'caros' 
                                  ? `${data.rivalNet}W` 
                                  : data.rivalNet || '-'}
                              </span>
                            </div>
                          </div>
                          <span className={cn(
                            'text-sm font-bold min-w-[50px] text-right',
                            data.amount > 0 ? 'text-green-500' : data.amount < 0 ? 'text-destructive' : 'text-muted-foreground'
                          )}>
                            {data.amount >= 0 ? '+' : ''}${data.amount}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
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

export default BetDashboard;