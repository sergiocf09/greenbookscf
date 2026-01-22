// Complete Bet Dashboard - reorganized with bet type rows and bet override capability
import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Player, PlayerScore, BetConfig, GolfCourse, MarkerState, markerInfo, BetOverride, CarritosTeamBet, BilateralHandicap } from '@/types/golf';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { 
  calculateAllBets, 
  getPlayerBalance, 
  getBilateralBalance,
  groupSummariesByType,
  BetSummary 
} from '@/lib/betCalculations';
import { getOyesesDisplayData, getOyesesPairResult } from '@/lib/oyesesCalculations';
import { getRayasDetailForPair, RayasPairResult } from '@/lib/rayasCalculations';
import { GroupBetsCard, getMedalGeneralBilateralResult } from './GroupBetsCard';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  ChevronDown, 
  ChevronUp,
  Settings2,
  Users,
  XCircle,
  Edit2,
  Check,
  X,
  Plus,
  Minus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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

// BilateralHandicap is now imported from types/golf.ts

interface BetDashboardProps {
  players: Player[];
  scores: Map<string, PlayerScore[]>;
  betConfig: BetConfig;
  course: GolfCourse;
  basePlayerId?: string;
  confirmedHoles?: Set<number>;
  onBetConfigChange?: (config: BetConfig) => void;
}

export const BetDashboard: React.FC<BetDashboardProps> = ({
  players,
  scores,
  betConfig,
  course,
  basePlayerId,
  confirmedHoles = new Set(),
  onBetConfigChange,
}) => {
  const [selectedRival, setSelectedRival] = useState<string | null>(null);
  const [expandedTypes, setExpandedTypes] = useState<string[]>([]);
  const [expandedLeaderboard, setExpandedLeaderboard] = useState<string | null>(null);
  // Bilateral handicaps are now stored in betConfig and persisted via onBetConfigChange
  
  // Filter scores to only include confirmed scores.
  // NOTE: We intentionally *do not* rely on `confirmedHoles` here because it can get out of sync
  // when players join late (historical holes may be "confirmed" for some but not all).
  const confirmedScores = useMemo(() => {
    const filtered = new Map<string, PlayerScore[]>();
    scores.forEach((playerScores, playerId) => {
      filtered.set(
        playerId,
        playerScores.filter(
          (s) =>
            s.confirmed &&
            typeof s.strokes === 'number' &&
            Number.isFinite(s.strokes)
        )
      );
    });
    return filtered;
  }, [scores]);

  // Calculate all bets using only confirmed scores
  const betSummaries = useMemo(() => 
    calculateAllBets(players, confirmedScores, betConfig, course),
    [players, confirmedScores, betConfig, course]
  );
  
  // Calculate ALL Carritos results (primary + additional teams)
  // NEW SCORING: Per hole - lowball wins 1pt, highball wins 1pt, combined wins 1pt (0-3 pts per hole)
  const allCarritosResults = useMemo(() => {
    const results: Array<{
      teamA: [string, string];
      teamB: [string, string];
      // Net points by hole from Team A perspective (A points - B points). null = skipped (missing confirmation)
      netByHoleFront: Array<number | null>; // holes 1-9
      netByHoleBack: Array<number | null>; // holes 10-18
      // Points per segment
      pointsAFront: number;
      pointsBFront: number;
      pointsABack: number;
      pointsBBack: number;
      pointsATotal: number;
      pointsBTotal: number;
      // Accumulated points (running total)
      pointsAAccumulated: number;
      pointsBAccumulated: number;
      moneyA: number;
      moneyB: number;
      amount: number;
      id?: string;
    }> = [];

    const calculateCarritosResult = (
      teamA: [string, string],
      teamB: [string, string],
      frontAmount: number,
      backAmount: number,
      totalAmount: number,
      scoringType: 'lowBall' | 'highBall' | 'combined' | 'all',
      opts?: {
        useTeamHandicaps?: boolean;
        teamHandicaps?: Record<string, number>;
        id?: string;
      }
    ) => {
      const { useTeamHandicaps, teamHandicaps, id } = opts ?? {};

      // Defensive: carritos config can store either `player.id` or `player.profileId`.
      // Normalize to the ids used by `scores/confirmedScores`.
      const resolvePlayerId = (pid: string): string => {
        if (confirmedScores.has(pid) || scores.has(pid)) return pid;
        const match = players.find((p) => p.profileId === pid);
        return match?.id ?? pid;
      };

      const resolvedTeamA: [string, string] = [resolvePlayerId(teamA[0]), resolvePlayerId(teamA[1])];
      const resolvedTeamB: [string, string] = [resolvePlayerId(teamB[0]), resolvePlayerId(teamB[1])];

      const getPlayerHandicapForCarritos = (playerId: string): number => {
        if (useTeamHandicaps) {
          const teamHcp = teamHandicaps?.[playerId];
          if (typeof teamHcp === 'number' && Number.isFinite(teamHcp)) return teamHcp;
        }
        return players.find((p) => p.id === playerId)?.handicap ?? 0;
      };

      const strokesReceivedByPlayer = new Map<string, number[]>();
      const allPlayers = [...new Set([...resolvedTeamA, ...resolvedTeamB])];
      allPlayers.forEach((pid) => {
        strokesReceivedByPlayer.set(pid, calculateStrokesPerHole(getPlayerHandicapForCarritos(pid), course));
      });

      const getCarritosNet = (playerId: string, holeNum: number): number | null => {
        const score = confirmedScores.get(playerId)?.find((s) => s.holeNumber === holeNum);
        if (!score) return null;
        const strokesReceived = strokesReceivedByPlayer.get(playerId)?.[holeNum - 1] ?? 0;
        return (typeof score.strokes === 'number' ? score.strokes : 0) - strokesReceived;
      };

      const includeLowBall = scoringType === 'lowBall' || scoringType === 'all';
      const includeHighBall = scoringType === 'highBall' || scoringType === 'all';
      const includeCombined = scoringType === 'combined' || scoringType === 'all';

      const getHolePoints = (holeNum: number): { pointsA: number; pointsB: number } | null => {
        const netA1 = getCarritosNet(resolvedTeamA[0], holeNum);
        const netA2 = getCarritosNet(resolvedTeamA[1], holeNum);
        const netB1 = getCarritosNet(resolvedTeamB[0], holeNum);
        const netB2 = getCarritosNet(resolvedTeamB[1], holeNum);

        // Skip if not all four have a score for this hole
        if (netA1 === null || netA2 === null || netB1 === null || netB2 === null) return null;

        let pointsA = 0;
        let pointsB = 0;

        if (includeLowBall) {
          const lowballA = Math.min(netA1, netA2);
          const lowballB = Math.min(netB1, netB2);
          if (lowballA < lowballB) pointsA += 1;
          else if (lowballB < lowballA) pointsB += 1;
        }

        if (includeHighBall) {
          const highballA = Math.max(netA1, netA2);
          const highballB = Math.max(netB1, netB2);
          if (highballA < highballB) pointsA += 1;
          else if (highballB < highballA) pointsB += 1;
        }

        if (includeCombined) {
          const combinedA = netA1 + netA2;
          const combinedB = netB1 + netB2;
          if (combinedA < combinedB) pointsA += 1;
          else if (combinedB < combinedA) pointsB += 1;
        }

        return { pointsA, pointsB };
      };

      const calculatePointsForHoles = (holes: number[]): { pointsA: number; pointsB: number; netByHole: Array<number | null> } => {
        let pointsA = 0;
        let pointsB = 0;
        const netByHole: Array<number | null> = [];

        holes.forEach((holeNum) => {
          const holePoints = getHolePoints(holeNum);
          if (!holePoints) {
            netByHole.push(null);
            return;
          }
          pointsA += holePoints.pointsA;
          pointsB += holePoints.pointsB;
          netByHole.push(holePoints.pointsA - holePoints.pointsB);
        });

        return { pointsA, pointsB, netByHole };
      };
      
      const frontHoles = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      const backHoles = [10, 11, 12, 13, 14, 15, 16, 17, 18];
      
      const frontPoints = calculatePointsForHoles(frontHoles);
      const backPoints = calculatePointsForHoles(backHoles);
      
      const pointsAFront = frontPoints.pointsA;
      const pointsBFront = frontPoints.pointsB;
      const pointsABack = backPoints.pointsA;
      const pointsBBack = backPoints.pointsB;
      
      // Total points (accumulated)
      const pointsATotal = pointsAFront + pointsABack;
      const pointsBTotal = pointsBFront + pointsBBack;
      
      // Money calculation based on who has more points per segment
      let moneyA = 0;
      
      // Front 9: who has more points wins
      if (pointsAFront > pointsBFront) moneyA += frontAmount;
      else if (pointsBFront > pointsAFront) moneyA -= frontAmount;
      
      // Back 9: who has more points wins
      if (pointsABack > pointsBBack) moneyA += backAmount;
      else if (pointsBBack > pointsABack) moneyA -= backAmount;
      
      // Total 18: who has more accumulated points wins
      if (pointsATotal > pointsBTotal) moneyA += totalAmount;
      else if (pointsBTotal > pointsATotal) moneyA -= totalAmount;
      
      return {
        teamA: resolvedTeamA,
        teamB: resolvedTeamB,
        netByHoleFront: frontPoints.netByHole,
        netByHoleBack: backPoints.netByHole,
        pointsAFront,
        pointsBFront,
        pointsABack,
        pointsBBack,
        pointsATotal,
        pointsBTotal,
        pointsAAccumulated: pointsATotal,
        pointsBAccumulated: pointsBTotal,
        moneyA,
        moneyB: -moneyA,
        amount: frontAmount + backAmount + totalAmount,
        id,
      };
    };

    // Primary carritos
    if (betConfig.carritos.enabled) {
      const { teamA, teamB, frontAmount, backAmount, totalAmount, scoringType, teamHandicaps, useTeamHandicaps } = betConfig.carritos;
      results.push(
        calculateCarritosResult(teamA, teamB, frontAmount, backAmount, totalAmount, scoringType, {
          id: undefined,
          useTeamHandicaps,
          teamHandicaps,
        })
      );
    }

    // Additional carritos teams
    betConfig.carritosTeams?.forEach(team => {
      if (team.enabled) {
        results.push(
          calculateCarritosResult(team.teamA, team.teamB, team.frontAmount, team.backAmount, team.totalAmount, team.scoringType, {
            id: team.id,
            useTeamHandicaps: true,
            teamHandicaps: team.teamHandicaps,
          })
        );
      }
    });

    return results;
  }, [betConfig.carritos, betConfig.carritosTeams, confirmedScores, players, course]);
  
  const basePlayer = players.find(p => p.id === basePlayerId || p.profileId === basePlayerId) || players[0];
  const rivals = players.filter(p => p.id !== basePlayer?.id);
  
  const toggleExpanded = (type: string) => {
    setExpandedTypes(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };
  
  // Get bilateral handicap for a pair (from betConfig)
  const getBilateralHandicap = (playerAId: string, playerBId: string): BilateralHandicap | undefined => {
    const handicaps = betConfig.bilateralHandicaps || [];
    return handicaps.find(
      h => (h.playerAId === playerAId && h.playerBId === playerBId) ||
           (h.playerAId === playerBId && h.playerBId === playerAId)
    );
  };
  
  // Update bilateral handicap for a pair (persisted via onBetConfigChange)
  const updateBilateralHandicap = (handicap: BilateralHandicap) => {
    if (!onBetConfigChange) return;
    
    const handicaps = [...(betConfig.bilateralHandicaps || [])];
    const existingIdx = handicaps.findIndex(
      h => (h.playerAId === handicap.playerAId && h.playerBId === handicap.playerBId) ||
           (h.playerAId === handicap.playerBId && h.playerBId === handicap.playerAId)
    );
    
    if (existingIdx >= 0) {
      handicaps[existingIdx] = handicap;
    } else {
      handicaps.push(handicap);
    }
    
    onBetConfigChange({ ...betConfig, bilateralHandicaps: handicaps });
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

  // Get player name abbreviation (first 3 letters)
  const getPlayerAbbr = (player: Player) => player.name.substring(0, 3).toUpperCase();

  // Get carritos balance for a specific player
  const getCarritosBalanceForPlayer = (playerId: string): number => {
    let total = 0;
    allCarritosResults.forEach(result => {
      if (result.teamA.includes(playerId)) {
        total += result.moneyA / 2; // Each player gets half
      } else if (result.teamB.includes(playerId)) {
        total += result.moneyB / 2;
      }
    });
    return total;
  };
  
  // Get carritos balance between two specific players
  // Returns the balance from playerA's perspective vs playerB
  const getCarritosBalanceVsPlayer = (playerAId: string, playerBId: string): number => {
    let total = 0;
    allCarritosResults.forEach(result => {
      const teamAHasPlayerA = result.teamA.includes(playerAId);
      const teamBHasPlayerA = result.teamB.includes(playerAId);
      const teamAHasPlayerB = result.teamA.includes(playerBId);
      const teamBHasPlayerB = result.teamB.includes(playerBId);
      
      // If they're on opposite teams, calculate the 50% split
      if ((teamAHasPlayerA && teamBHasPlayerB) || (teamBHasPlayerA && teamAHasPlayerB)) {
        // PlayerA and PlayerB are opponents - 50% of team result
        const playerAMoney = teamAHasPlayerA ? result.moneyA : result.moneyB;
        // Each player pays/receives 50% to/from each opponent
        total += playerAMoney / 2;
      }
      // If they're on the same team, no money changes between them
    });
    return total;
  };
  
  // Cancel carritos bet
  const cancelCarritos = (carritosId?: string) => {
    if (!onBetConfigChange) return;
    
    if (!carritosId) {
      // Primary carritos
      onBetConfigChange({
        ...betConfig,
        carritos: { ...betConfig.carritos, enabled: false },
      });
    } else {
      // Additional carritos
      const teams = betConfig.carritosTeams || [];
      onBetConfigChange({
        ...betConfig,
        carritosTeams: teams.map(t => t.id === carritosId ? { ...t, enabled: false } : t),
      });
    }
  };
  
  return (
    <div className="space-y-4">
      {/* Tabla General */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Tabla General</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            {sortedPlayers.map((player, idx) => {
              const balance = getPlayerBalance(player.id, betSummaries);
              const carritosBalance = getCarritosBalanceForPlayer(player.id);
              const totalBalance = balance + carritosBalance;
              const isBase = player.id === basePlayer?.id || player.profileId === basePlayerId;
              const isExpanded = expandedLeaderboard === player.id;
              const otherPlayers = players.filter(p => p.id !== player.id);
              
              return (
                <div key={player.id}>
                  <div 
                    onClick={() => setExpandedLeaderboard(isExpanded ? null : player.id)}
                    className={cn(
                      'flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors',
                      isBase ? 'bg-primary/10 border border-primary/30' : 'bg-muted/30 hover:bg-muted/50'
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
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{ backgroundColor: player.color }}
                      >
                        {getPlayerAbbr(player)}
                      </div>
                      <div>
                        <span className="font-medium text-sm">{player.name.split(' ')[0]}</span>
                        <span className="text-[10px] text-muted-foreground ml-1">HCP {player.handicap}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        'text-lg font-bold',
                        totalBalance > 0 ? 'text-green-500' : totalBalance < 0 ? 'text-destructive' : 'text-muted-foreground'
                      )}>
                        {totalBalance >= 0 ? '+' : ''}${totalBalance}
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>
                  
                  {/* Expanded view: balance vs each other player + carritos per rival */}
                  {isExpanded && (
                    <div className="ml-8 mt-1 space-y-1 pb-2">
                      {otherPlayers.map(other => {
                        const vsIndividualBalance = getBilateralBalance(player.id, other.id, betSummaries);
                        const vsCarritosBalance = getCarritosBalanceVsPlayer(player.id, other.id);
                        const vsTotalBalance = vsIndividualBalance + vsCarritosBalance;
                        
                        return (
                          <div key={other.id} className="flex items-center justify-between px-2 py-1 bg-background/50 rounded text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">vs</span>
                              <div 
                                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
                                style={{ backgroundColor: other.color }}
                              >
                                {getPlayerAbbr(other)}
                              </div>
                              {vsCarritosBalance !== 0 && (
                                <span className="text-[9px] text-muted-foreground">
                                  Ind: ${vsIndividualBalance >= 0 ? '+' : ''}{vsIndividualBalance} | Car: ${vsCarritosBalance >= 0 ? '+' : ''}{vsCarritosBalance}
                                </span>
                              )}
                            </div>
                            <span className={cn(
                              'font-bold',
                              vsTotalBalance > 0 ? 'text-green-500' : vsTotalBalance < 0 ? 'text-destructive' : 'text-muted-foreground'
                            )}>
                              {vsTotalBalance >= 0 ? '+' : ''}${vsTotalBalance}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* Verification */}
          <div className="bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground border-t mt-3">
            Σ = ${sortedPlayers.reduce((sum, p) => sum + getPlayerBalance(p.id, betSummaries) + getCarritosBalanceForPlayer(p.id), 0)} 
            <span className="ml-1">(debe ser $0)</span>
          </div>
        </CardContent>
      </Card>

      {/* Balance vs */}
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
                    className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold mb-1"
                    style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : rival.color }}
                  >
                    {getPlayerAbbr(rival)}
                  </div>
                  <div className={cn(
                    'text-sm font-bold flex items-center gap-0.5',
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
          allScores={scores}
          onBetConfigChange={onBetConfigChange}
        />
      )}

      {/* All Carritos Results */}
      {allCarritosResults.map((result, idx) => (
        <CarritosResultsCard 
          key={result.id || idx}
          results={result} 
          players={players}
          basePlayerId={basePlayer?.id}
          title={idx === 0 ? 'Carritos' : `Carritos ${idx + 1}`}
          onCancel={onBetConfigChange ? () => cancelCarritos(result.id) : undefined}
        />
      ))}

      {/* Grupales */}
      <GroupBetsCard
        players={players}
        scores={confirmedScores}
        betConfig={betConfig}
        course={course}
        basePlayerId={basePlayer?.id || basePlayer?.profileId}
      />
    </div>
  );
};

// Carritos Results Card - Updated for point-based scoring
interface CarritosResultsCardProps {
  results: {
    teamA: [string, string];
    teamB: [string, string];
    netByHoleFront: Array<number | null>;
    netByHoleBack: Array<number | null>;
    pointsAFront: number;
    pointsBFront: number;
    pointsABack: number;
    pointsBBack: number;
    pointsATotal: number;
    pointsBTotal: number;
    pointsAAccumulated: number;
    pointsBAccumulated: number;
    moneyA: number;
    moneyB: number;
    amount: number;
    id?: string;
  };
  players: Player[];
  basePlayerId?: string;
  title?: string;
  onCancel?: () => void;
}

const CarritosResultsCard: React.FC<CarritosResultsCardProps> = ({ results, players, basePlayerId, title = 'Carritos (Equipos)', onCancel }) => {
  const getPlayer = (id: string) => players.find(p => p.id === id);
  const getPlayerAbbr = (player: Player) => player.name.substring(0, 3).toUpperCase();
  const teamAPlayers = [getPlayer(results.teamA[0]), getPlayer(results.teamA[1])].filter(Boolean) as Player[];
  const teamBPlayers = [getPlayer(results.teamB[0]), getPlayer(results.teamB[1])].filter(Boolean) as Player[];
  
  const isBaseInTeamA = results.teamA.includes(basePlayerId || '');
  const displayTeamAPlayers = isBaseInTeamA ? teamAPlayers : teamBPlayers;
  const displayTeamBPlayers = isBaseInTeamA ? teamBPlayers : teamAPlayers;

  const baseTeamMoney = isBaseInTeamA ? results.moneyA : results.moneyB;
  const baseTeamNetFront = isBaseInTeamA ? (results.pointsAFront - results.pointsBFront) : (results.pointsBFront - results.pointsAFront);
  const baseTeamNetBack = isBaseInTeamA ? (results.pointsABack - results.pointsBBack) : (results.pointsBBack - results.pointsABack);
  const baseTeamNetTotal = isBaseInTeamA ? (results.pointsATotal - results.pointsBTotal) : (results.pointsBTotal - results.pointsATotal);

  const baseNetByHoleFront = isBaseInTeamA ? results.netByHoleFront : results.netByHoleFront.map(v => (v === null ? null : -v));
  const baseNetByHoleBack = isBaseInTeamA ? results.netByHoleBack : results.netByHoleBack.map(v => (v === null ? null : -v));

  const getNetTone = (n: number) => (n > 0 ? 'text-primary' : n < 0 ? 'text-destructive' : 'text-muted-foreground');
  const getNetPill = (n: number) => (n > 0 ? 'border-primary/40 text-primary' : n < 0 ? 'border-destructive/40 text-destructive' : 'border-border text-muted-foreground');
  
  // Payment: each losing player pays 50% of total to EACH winning player
  const getPaymentBreakdown = () => {
    if (results.moneyA === 0) return null;
    
    const winningTeam = results.moneyA > 0 ? teamAPlayers : teamBPlayers;
    const losingTeam = results.moneyA > 0 ? teamBPlayers : teamAPlayers;
    const totalWon = Math.abs(results.moneyA);
    
    // Each loser pays (totalWon / 2) to EACH winner
    const perLoserPayToEachWinner = totalWon / 2;
    
    return { winningTeam, losingTeam, perLoserPayToEachWinner, totalWon };
  };
  
  const payment = getPaymentBreakdown();
  
  return (
    <Card className="border-accent/50">
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {title}
          </div>
          {onCancel && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={onCancel}
              title="Cancelar Carritos"
            >
              <XCircle className="h-4 w-4" />
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Solo vista Pareja A (tu equipo) */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-1">
              {displayTeamAPlayers.map((p) => (
                <div
                  key={p.id}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold"
                  style={{ backgroundColor: p.color }}
                  title={p.name}
                >
                  {getPlayerAbbr(p)}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Pareja A (tu equipo)</p>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1">
              {displayTeamBPlayers.map((p) => (
                <div
                  key={p.id}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold opacity-80"
                  style={{ backgroundColor: p.color }}
                  title={p.name}
                >
                  {getPlayerAbbr(p)}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Rival</p>
          </div>
        </div>
        
        {/* Puntos por hoyo (netos de tu pareja) */}
        <div className="bg-muted/30 rounded-lg p-2 space-y-2">
          <div className="text-[10px] text-muted-foreground text-center">
            Carritos se calcula con neto (golpes - strokes recibidos) y solo cuenta hoyos con score confirmado en los 4.
          </div>

          {/* Front 9 */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Front 9</span>
              <span className={cn('text-xs font-bold tabular-nums', getNetTone(baseTeamNetFront))}>
                {baseTeamNetFront >= 0 ? '+' : ''}{baseTeamNetFront} pts
              </span>
            </div>
            <div className="grid grid-cols-9 gap-1">
              {baseNetByHoleFront.map((net, idx) => {
                const hole = idx + 1;
                if (net === null) {
                  return (
                    <div key={hole} className="h-8 rounded border border-border bg-background/60 flex flex-col items-center justify-center">
                      <span className="text-[9px] text-muted-foreground">{hole}</span>
                      <span className="text-[11px] font-semibold text-muted-foreground">–</span>
                    </div>
                  );
                }
                return (
                  <div key={hole} className={cn('h-8 rounded border bg-background/60 flex flex-col items-center justify-center', getNetPill(net))}>
                    <span className="text-[9px] opacity-80">{hole}</span>
                    <span className="text-[11px] font-semibold tabular-nums">{net > 0 ? `+${net}` : `${net}`}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Back 9 */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Back 9</span>
              <span className={cn('text-xs font-bold tabular-nums', getNetTone(baseTeamNetBack))}>
                {baseTeamNetBack >= 0 ? '+' : ''}{baseTeamNetBack} pts
              </span>
            </div>
            <div className="grid grid-cols-9 gap-1">
              {baseNetByHoleBack.map((net, idx) => {
                const hole = idx + 10;
                if (net === null) {
                  return (
                    <div key={hole} className="h-8 rounded border border-border bg-background/60 flex flex-col items-center justify-center">
                      <span className="text-[9px] text-muted-foreground">{hole}</span>
                      <span className="text-[11px] font-semibold text-muted-foreground">–</span>
                    </div>
                  );
                }
                return (
                  <div key={hole} className={cn('h-8 rounded border bg-background/60 flex flex-col items-center justify-center', getNetPill(net))}>
                    <span className="text-[9px] opacity-80">{hole}</span>
                    <span className="text-[11px] font-semibold tabular-nums">{net > 0 ? `+${net}` : `${net}`}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Total */}
          <div className="flex items-center justify-between border-t border-border/50 pt-2">
            <span className="text-xs font-medium">Total 18</span>
            <span className={cn('text-sm font-bold tabular-nums', getNetTone(baseTeamNetTotal))}>
              {baseTeamNetTotal >= 0 ? '+' : ''}{baseTeamNetTotal} pts
            </span>
          </div>
        </div>
        
        {/* Money result */}
        <div className="text-center">
          <span className={cn(
            'text-xl font-bold',
            baseTeamMoney > 0 ? 'text-primary' : baseTeamMoney < 0 ? 'text-destructive' : 'text-muted-foreground'
          )}>
            {baseTeamMoney >= 0 ? '+' : ''}${baseTeamMoney}
          </span>
          <p className="text-[10px] text-muted-foreground">Tu equipo (neto {baseTeamNetTotal >= 0 ? '+' : ''}{baseTeamNetTotal} pts)</p>
        </div>
        
        {/* Payment breakdown */}
        {payment && (
          <div className="text-[10px] text-muted-foreground bg-muted/20 rounded p-2">
            <p className="font-medium mb-1">Desglose de pago (cada perdedor paga a cada ganador):</p>
            {payment.losingTeam.map(loser => (
              <p key={loser.id}>
                {loser.name.split(' ')[0]} paga ${payment.perLoserPayToEachWinner} a {payment.winningTeam[0].name.split(' ')[0]} y ${payment.perLoserPayToEachWinner} a {payment.winningTeam[1].name.split(' ')[0]}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Bilateral Detail Component - Reorganized with bet type rows and override capability
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
  allScores: Map<string, PlayerScore[]>;
  onBetConfigChange?: (config: BetConfig) => void;
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
  allScores,
  onBetConfigChange,
}) => {
  const [editingHandicap, setEditingHandicap] = useState(false);
  const [editingBetType, setEditingBetType] = useState<string | null>(null);
  
  const getPlayerAbbr = (p: Player) => p.name.substring(0, 3).toUpperCase();

  // Get bet override for this pair
  const getBetOverride = (betType: string): BetOverride | undefined => {
    return betConfig.betOverrides?.find(
      o => o.betType === betType && 
      ((o.playerAId === player.id && o.playerBId === rival.id) ||
       (o.playerAId === rival.id && o.playerBId === player.id))
    );
  };

  // Update bet override
  const updateBetOverride = (betType: string, updates: Partial<BetOverride>) => {
    if (!onBetConfigChange) return;
    
    const overrides = [...(betConfig.betOverrides || [])];
    const existingIdx = overrides.findIndex(
      o => o.betType === betType && 
      ((o.playerAId === player.id && o.playerBId === rival.id) ||
       (o.playerAId === rival.id && o.playerBId === player.id))
    );

    if (existingIdx >= 0) {
      overrides[existingIdx] = { ...overrides[existingIdx], ...updates };
    } else {
      overrides.push({
        playerAId: player.id,
        playerBId: rival.id,
        betType,
        enabled: true,
        ...updates,
      });
    }

    onBetConfigChange({ ...betConfig, betOverrides: overrides });
  };

  // Toggle bet enabled/disabled
  const toggleBetEnabled = (betType: string, enabled: boolean) => {
    updateBetOverride(betType, { enabled });
  };
  
  // Calculate net scores for display with bilateral handicap overrides
  const getNetScoreForSegmentWithBilateral = (
    playerId: string, 
    rivalId: string, 
    segment: 'front' | 'back' | 'total'
  ): number => {
    const playerScores = confirmedScores.get(playerId) || [];
    
    // Check if there's a bilateral handicap override for this pair
    const override = betConfig.bilateralHandicaps?.find(
      h => (h.playerAId === playerId && h.playerBId === rivalId) ||
           (h.playerAId === rivalId && h.playerBId === playerId)
    );
    
    const [start, end] = segment === 'front' ? [1, 9] : segment === 'back' ? [10, 18] : [1, 18];
    // Medal display mode: sum ALL confirmed holes for this player in the segment
    const filtered = playerScores.filter((s) => s.holeNumber >= start && s.holeNumber <= end);
    
    // If no override, use existing net scores
    if (!override) {
      return filtered.reduce((sum, s) => sum + (Number.isFinite(s.netScore) ? s.netScore : s.strokes), 0);
    }
    
    // Apply bilateral handicap override
    const isPlayerA = override.playerAId === playerId;
    const overrideHandicap = isPlayerA ? override.playerAHandicap : override.playerBHandicap;
    
    const strokesPerHole = calculateStrokesPerHole(overrideHandicap, course);
    
    // Calculate net with overridden strokes received
    return filtered.reduce((sum, s) => {
      const adjustedNet = (typeof s.strokes === 'number' ? s.strokes : 0) - (strokesPerHole[s.holeNumber - 1] ?? 0);
      return sum + adjustedNet;
    }, 0);
  };

  // Get units/manchas details for display - including Cuatriput in manchas with color coding
  // Green = positive for base player (they receive), Red = negative for base player (they pay)
  const getMarkerDetails = (playerId: string, type: 'units' | 'manchas') => {
    const playerScores = allScores.get(playerId) || [];
    const details: { holeNumber: number; marker: string; emoji: string; isPositive: boolean }[] = [];
    const isBasePlayer = playerId === player.id;
    
    playerScores.forEach(score => {
      const holePar = course.holes[score.holeNumber - 1]?.par || 4;
      const toPar = score.strokes - holePar;
      
      if (type === 'units') {
        // Auto-detected units - positive for the player who got them
        if (toPar === -1) details.push({ holeNumber: score.holeNumber, marker: 'Birdie', emoji: '🐦', isPositive: isBasePlayer });
        if (toPar === -2) details.push({ holeNumber: score.holeNumber, marker: 'Águila', emoji: '🦅', isPositive: isBasePlayer });
        if (toPar <= -3) details.push({ holeNumber: score.holeNumber, marker: 'Albatros', emoji: '🦢', isPositive: isBasePlayer });
        // Manual units
        if (score.markers.sandyPar) details.push({ holeNumber: score.holeNumber, marker: 'Sandy Par', emoji: '🏖️', isPositive: isBasePlayer });
        if (score.markers.aquaPar) details.push({ holeNumber: score.holeNumber, marker: 'Aqua Par', emoji: '💧', isPositive: isBasePlayer });
        if (score.markers.holeOut) details.push({ holeNumber: score.holeNumber, marker: 'Hole Out', emoji: '🎯', isPositive: isBasePlayer });
      } else {
        // Manchas - negative for the player who commits them
        // When it's the base player's mancha, it's negative (red). When it's rival's mancha, it's positive (green).
        const isManchaPositiveForBasePlayer = !isBasePlayer; // Rival's mancha = positive for base player
        
        if (score.markers.ladies) details.push({ holeNumber: score.holeNumber, marker: 'Pinkies', emoji: '👠', isPositive: isManchaPositiveForBasePlayer });
        if (score.markers.swingBlanco) details.push({ holeNumber: score.holeNumber, marker: 'Paloma', emoji: '💨', isPositive: isManchaPositiveForBasePlayer });
        if (score.markers.retruje) details.push({ holeNumber: score.holeNumber, marker: 'Retruje', emoji: '↩️', isPositive: isManchaPositiveForBasePlayer });
        if (score.markers.trampa) details.push({ holeNumber: score.holeNumber, marker: 'Trampa', emoji: '⚠️', isPositive: isManchaPositiveForBasePlayer });
        if (score.markers.dobleAgua) details.push({ holeNumber: score.holeNumber, marker: 'Doble Agua', emoji: '🌊', isPositive: isManchaPositiveForBasePlayer });
        if (score.markers.dobleOB) details.push({ holeNumber: score.holeNumber, marker: 'Doble OB', emoji: '🚫', isPositive: isManchaPositiveForBasePlayer });
        if (score.markers.par3GirMas3) details.push({ holeNumber: score.holeNumber, marker: 'Par3 +3', emoji: '3️⃣', isPositive: isManchaPositiveForBasePlayer });
        if (score.markers.dobleDigito) details.push({ holeNumber: score.holeNumber, marker: 'Doble Dígito', emoji: '🔟', isPositive: isManchaPositiveForBasePlayer });
        // Cuatriput - 4+ putts - negative for the player who commits it
        if (score.putts >= 4 || score.markers.cuatriput) {
          details.push({ holeNumber: score.holeNumber, marker: 'Cuatriput', emoji: '😱', isPositive: isManchaPositiveForBasePlayer });
        }
      }
    });
    
    return details;
  };
  
  // Group bet types for organized display
  const betTypeGroups = useMemo(() => {
    const groups: {
      key: string;
      label: string;
      segments: { label: string; key: string }[];
      getTotal: () => number;
      getSegmentData: (segmentKey: string) => { playerNet: number; rivalNet: number; amount: number; description?: string };
      configKey: string;
    }[] = [];
    
    // Medal
    if (betConfig.medal.enabled) {
      groups.push({
        key: 'medal',
        label: 'Medal',
        configKey: 'medal',
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
            playerNet: getNetScoreForSegmentWithBilateral(player.id, rival.id, segment),
            rivalNet: getNetScoreForSegmentWithBilateral(rival.id, player.id, segment),
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
        configKey: 'pressures',
        segments: [
          { label: 'Front 9', key: 'pressure_front' },
          { label: 'Back 9', key: 'pressure_back' },
          { label: 'Total 18', key: 'pressure_total' },
        ],
        getTotal: () => {
          const front = groupedSummaries['Presiones Front']?.total || 0;
          // Back can be regular or carry
          const backRegular = groupedSummaries['Presiones Back']?.total || 0;
          const backCarry = groupedSummaries['Presiones Back (Carry x2+Match)']?.total || 0;
          const back = backRegular + backCarry;
          const total = groupedSummaries['Presiones Match 18']?.total || 0;
          return front + back + total;
        },
        getSegmentData: (segmentKey) => {
          let summaryKey: string;
          if (segmentKey === 'pressure_front') {
            summaryKey = 'Presiones Front';
          } else if (segmentKey === 'pressure_back') {
            // Check for carry version first
            const carryKey = 'Presiones Back (Carry x2+Match)';
            if (groupedSummaries[carryKey]) {
              summaryKey = carryKey;
            } else {
              summaryKey = 'Presiones Back';
            }
          } else {
            summaryKey = 'Presiones Match 18';
          }
          const summary = groupedSummaries[summaryKey];
          const description = summary?.details?.[0]?.description || '';
          return {
            playerNet: 0,
            rivalNet: 0,
            amount: summary?.total || 0,
            description,
          };
        },
      });
    }
    
    // Skins
    if (betConfig.skins.enabled) {
      groups.push({
        key: 'skins',
        label: 'Skins',
        configKey: 'skins',
        segments: [
          { label: 'Front 9', key: 'skins_front' },
          { label: 'Back 9', key: 'skins_back' },
        ],
        getTotal: () => {
          const front = groupedSummaries['Skins Front']?.total || 0;
          const back = groupedSummaries['Skins Back']?.total || 0;
          return front + back;
        },
        getSegmentData: (segmentKey) => {
          const summaryKey = segmentKey === 'skins_front' ? 'Skins Front' : 'Skins Back';
          const summary = groupedSummaries[summaryKey];
          const description = summary?.details?.[0]?.description || '';
          const match = description.match(/(\d+) vs (\d+)/);
          return {
            playerNet: match ? parseInt(match[1]) : 0,
            rivalNet: match ? parseInt(match[2]) : 0,
            amount: summary?.total || 0,
            description,
          };
        },
      });
    }
    
    // Caros
    if (betConfig.caros.enabled) {
      groups.push({
        key: 'caros',
        label: 'Caros',
        configKey: 'caros',
        segments: [
          { label: 'Hoyos 15-18', key: 'caros_all' },
        ],
        getTotal: () => groupedSummaries['Caros']?.total || 0,
        getSegmentData: () => {
          const summary = groupedSummaries['Caros'];
          const description = summary?.details?.[0]?.description || '';
          const match = description.match(/(\d+) vs (\d+)/);
          return {
            playerNet: match ? parseInt(match[1]) : 0,
            rivalNet: match ? parseInt(match[2]) : 0,
            amount: summary?.total || 0,
            description,
          };
        },
      });
    }
    
    // Oyeses (before Units as per spec)
    if (betConfig.oyeses.enabled) {
      groups.push({
        key: 'oyeses',
        label: 'Oyeses',
        configKey: 'oyeses',
        segments: [{ label: 'Par 3s', key: 'oyeses_detail' }],
        getTotal: () => groupedSummaries['Oyes']?.total || 0,
        getSegmentData: () => {
          const oyesSummary = groupedSummaries['Oyes'];
          const details = oyesSummary?.details || [];
          const wins = details.filter(d => d.amount > 0).length;
          const losses = details.filter(d => d.amount < 0).length;
          return { 
            playerNet: wins, 
            rivalNet: losses, 
            amount: oyesSummary?.total || 0 
          };
        },
      });
    }
    
    // Unidades
    if (betConfig.units.enabled) {
      groups.push({
        key: 'units',
        label: 'Unidades',
        configKey: 'units',
        segments: [{ label: 'Detalle', key: 'units_detail' }],
        getTotal: () => groupedSummaries['Unidades']?.total || 0,
        getSegmentData: () => {
          const playerDetails = getMarkerDetails(player.id, 'units');
          const rivalDetails = getMarkerDetails(rival.id, 'units');
          return { 
            playerNet: playerDetails.length, 
            rivalNet: rivalDetails.length, 
            amount: groupedSummaries['Unidades']?.total || 0 
          };
        },
      });
    }
    
    // Manchas
    if (betConfig.manchas.enabled) {
      groups.push({
        key: 'manchas',
        label: 'Manchas',
        configKey: 'manchas',
        segments: [{ label: 'Detalle', key: 'manchas_detail' }],
        getTotal: () => groupedSummaries['Manchas']?.total || 0,
        getSegmentData: () => {
          const playerDetails = getMarkerDetails(player.id, 'manchas');
          const rivalDetails = getMarkerDetails(rival.id, 'manchas');
          return { 
            playerNet: playerDetails.length, 
            rivalNet: rivalDetails.length, 
            amount: groupedSummaries['Manchas']?.total || 0 
          };
        },
      });
    }
    
    // Culebras
    if (betConfig.culebras?.enabled) {
      groups.push({
        key: 'culebras',
        label: 'Culebras',
        configKey: 'culebras',
        segments: [],
        getTotal: () => groupedSummaries['Culebras']?.total || 0,
        getSegmentData: () => ({ playerNet: 0, rivalNet: 0, amount: 0 }),
      });
    }
    
    // Pingüinos
    if (betConfig.pinguinos?.enabled) {
      groups.push({
        key: 'pinguinos',
        label: 'Pingüinos',
        configKey: 'pinguinos',
        segments: [],
        getTotal: () => groupedSummaries['Pingüinos']?.total || 0,
        getSegmentData: () => ({ playerNet: 0, rivalNet: 0, amount: 0 }),
      });
    }
    
    // Rayas (Aggregator bet)
    if (betConfig.rayas?.enabled) {
      groups.push({
        key: 'rayas',
        label: 'Rayas',
        configKey: 'rayas',
        segments: [
          { label: 'Front 9', key: 'rayas_front' },
          { label: 'Back 9', key: 'rayas_back' },
          { label: 'Medal Total', key: 'rayas_medal' },
        ],
        getTotal: () => {
          const front = groupedSummaries['Rayas Front']?.total || 0;
          const back = groupedSummaries['Rayas Back']?.total || 0;
          const oyes = groupedSummaries['Rayas Oyes']?.total || 0;
          const medal = groupedSummaries['Rayas Medal Total']?.total || 0;
          return front + back + oyes + medal;
        },
        getSegmentData: (segmentKey) => {
          if (segmentKey === 'rayas_front') {
            const summary = groupedSummaries['Rayas Front'];
            const match = summary?.details?.[0]?.description?.match(/(\d+) vs (\d+)/);
            return {
              playerNet: match ? parseInt(match[1]) : 0,
              rivalNet: match ? parseInt(match[2]) : 0,
              amount: (summary?.total || 0) + (groupedSummaries['Rayas Oyes']?.details?.filter(d => d.segment === 'front').reduce((s, d) => s + d.amount, 0) || 0),
              description: summary?.details?.[0]?.description,
            };
          } else if (segmentKey === 'rayas_back') {
            const summary = groupedSummaries['Rayas Back'];
            const match = summary?.details?.[0]?.description?.match(/(\d+) vs (\d+)/);
            return {
              playerNet: match ? parseInt(match[1]) : 0,
              rivalNet: match ? parseInt(match[2]) : 0,
              amount: (summary?.total || 0) + (groupedSummaries['Rayas Oyes']?.details?.filter(d => d.segment === 'back').reduce((s, d) => s + d.amount, 0) || 0),
              description: summary?.details?.[0]?.description,
            };
          } else {
            const summary = groupedSummaries['Rayas Medal Total'];
            return {
              playerNet: 0,
              rivalNet: 0,
              amount: summary?.total || 0,
              description: summary?.details?.[0]?.description,
            };
          }
        },
      });
    }
    
    // Medal General (Group bet shown in bilateral view) - only after 18 holes confirmed
    // Check if both player and rival have 18 holes confirmed
    const bothPlayersComplete = Array.from({ length: 18 }, (_, i) => i + 1).every(h => {
      const playerScores = confirmedScores.get(player.id) || [];
      const rivalScores = confirmedScores.get(rival.id) || [];
      return playerScores.some(s => s.holeNumber === h) && rivalScores.some(s => s.holeNumber === h);
    });
    
    if (betConfig.medalGeneral?.enabled && bothPlayersComplete) {
      const medalResult = getMedalGeneralBilateralResult(player, rival, confirmedScores, betConfig, course);
      if (medalResult) {
        groups.push({
          key: 'medalGeneral',
          label: 'Medal General',
          configKey: 'medalGeneral',
          segments: [],
          getTotal: () => medalResult.amount,
          getSegmentData: () => ({
            playerNet: medalResult.playerNet,
            rivalNet: medalResult.rivalNet,
            amount: medalResult.amount,
            description: `Neto: ${medalResult.playerNet} vs ${medalResult.rivalNet}`,
          }),
        });
      }
    }
    
    return groups;
  }, [betConfig, groupedSummaries, confirmedScores, player.id, rival.id, allScores, course.holes]);
  
  // Effective handicaps (with override or original)
  const effectivePlayerHcp = bilateralHandicap?.playerAHandicap ?? player.handicap;
  const effectiveRivalHcp = bilateralHandicap?.playerBHandicap ?? rival.handicap;
  const hasOverride = !!bilateralHandicap;

  // Render units/manchas detail with proper colors
  const renderMarkerDetail = (type: 'units' | 'manchas') => {
    const playerDetails = getMarkerDetails(player.id, type);
    const rivalDetails = getMarkerDetails(rival.id, type);
    const allDetails = [...playerDetails, ...rivalDetails].sort((a, b) => a.holeNumber - b.holeNumber);
    
    return (
      <div className="px-4 py-2 pl-10 bg-background/50 space-y-2">
        {allDetails.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {allDetails.map((d, i) => (
              <span 
                key={i} 
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]',
                  d.isPositive 
                    ? 'bg-green-500/20 text-green-600' 
                    : 'bg-destructive/20 text-destructive'
                )}
              >
                <span>H{d.holeNumber}</span>
                <span>{d.emoji}</span>
                <span className="hidden sm:inline">{d.marker}</span>
                <span className="font-bold">{d.isPositive ? '+' : '-'}${betConfig[type === 'units' ? 'units' : 'manchas'].valuePerPoint}</span>
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Sin {type === 'units' ? 'unidades' : 'manchas'} registradas</span>
        )}
      </div>
    );
  };
  
  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ backgroundColor: player.color }}
            >
              {getPlayerAbbr(player)}
            </div>
            <span className="text-muted-foreground text-sm">vs</span>
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ backgroundColor: rival.color }}
            >
              {getPlayerAbbr(rival)}
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
        
        {/* Bilateral Handicap Editor */}
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
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
                style={{ backgroundColor: player.color }}
              >
                {getPlayerAbbr(player)}
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
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
                style={{ backgroundColor: rival.color }}
              >
                {getPlayerAbbr(rival)}
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
            const override = getBetOverride(group.key);
            const isDisabled = override?.enabled === false;
            
            return (
              <div 
                key={group.key} 
                className={cn(
                  'border border-border/50 rounded-lg overflow-hidden',
                  isDisabled && 'opacity-50'
                )}
              >
                {/* Main bet type row */}
                <div 
                  className={cn(
                    'flex items-center justify-between p-3 bg-muted/30',
                    hasSegments && !isDisabled && 'cursor-pointer hover:bg-muted/50'
                  )}
                  onClick={() => hasSegments && !isDisabled && onToggleExpand(group.key)}
                >
                  <div className="flex items-center gap-2">
                    {/* Cancel/Enable toggle */}
                    {onBetConfigChange && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBetEnabled(group.key, isDisabled);
                        }}
                        className={cn(
                          'p-1 rounded-full transition-colors',
                          isDisabled 
                            ? 'text-muted-foreground hover:text-green-500' 
                            : 'text-muted-foreground hover:text-destructive'
                        )}
                        title={isDisabled ? 'Habilitar apuesta' : 'Cancelar apuesta'}
                      >
                        {isDisabled ? <Check className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      </button>
                    )}
                    
                    {hasSegments && !isDisabled && (
                      isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )
                    )}
                    <span className={cn('font-semibold text-sm', isDisabled && 'line-through')}>
                      {group.label}
                    </span>
                    {isDisabled && (
                      <span className="text-[10px] text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                        Cancelada
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* Edit amount button */}
                    {onBetConfigChange && !isDisabled && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingBetType(group.key);
                        }}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    )}
                    
                    <span className={cn(
                      'text-lg font-bold',
                      isDisabled ? 'text-muted-foreground' :
                      total > 0 ? 'text-green-500' : total < 0 ? 'text-destructive' : 'text-muted-foreground'
                    )}>
                      {isDisabled ? '$0' : `${total >= 0 ? '+' : ''}$${total}`}
                    </span>
                  </div>
                </div>
                
                {/* Segment rows */}
                {hasSegments && isExpanded && !isDisabled && (
                  <div className="divide-y divide-border/30">
                    {group.key === 'units' || group.key === 'manchas' ? (
                      renderMarkerDetail(group.key === 'units' ? 'units' : 'manchas')
                    ) : group.key === 'oyeses' ? (
                      // Oyeses detail - show proximity order per player per hole
                      (() => {
                        // Use confirmedScores for display to match calculation
                        const oyesesData = getOyesesDisplayData(
                          player.id,
                          rival.id,
                          confirmedScores,
                          betConfig,
                          course
                        );
                        const { playerAHoles, playerBHoles } = oyesesData;
                        
                        // Get zapato (100% bonus) data - also use confirmedScores
                        const pairResult = getOyesesPairResult(
                          player.id,
                          rival.id,
                          confirmedScores,
                          betConfig,
                          course
                        );
                        
                        if (playerAHoles.length === 0) {
                          return (
                            <div className="px-4 py-2 pl-10 bg-background/50 text-xs text-muted-foreground">
                              Sin datos de Oyeses registrados
                            </div>
                          );
                        }
                        
                        const oyesTotal = groupedSummaries['Oyes']?.total || 0;
                        const hasZapato = pairResult?.hasZapato || false;
                        const zapatoBonus = pairResult?.zapatoBonus || 0;
                        const zapatoWinnerId = pairResult?.zapatoWinnerId;
                        const isPlayerZapatoWinner = zapatoWinnerId === player.id;
                        
                        // Base amount is total minus zapato bonus (which is half of total when zapato is active)
                        const baseAmount = hasZapato ? Math.abs(oyesTotal) / 2 : Math.abs(oyesTotal);
                        
                        return (
                          <div className="px-4 py-3 pl-10 bg-background/50 space-y-3">
                            {/* Header row with hole numbers */}
                            <div className="flex items-center gap-2 text-[10px]">
                              <div className="w-12 shrink-0 font-medium text-muted-foreground">Jugador</div>
                              <div className="flex gap-1 overflow-x-auto">
                                {playerAHoles.map(h => (
                                  <div key={h.holeNumber} className="w-8 text-center font-medium text-muted-foreground">
                                    H{h.holeNumber}
                                  </div>
                                ))}
                                <div className="w-12 text-center font-bold text-muted-foreground">Total</div>
                              </div>
                            </div>
                            
                            {/* Player A row */}
                            <div className="flex items-center gap-2 text-xs">
                              <div 
                                className="w-8 h-8 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                                style={{ backgroundColor: player.color }}
                              >
                                {player.name.substring(0, 3).toUpperCase()}
                              </div>
                              <div className="flex gap-1 overflow-x-auto">
                                {playerAHoles.map(h => (
                                  <div 
                                    key={h.holeNumber} 
                                    className={cn(
                                      'w-8 h-7 flex items-center justify-center rounded text-xs font-bold',
                                      h.isWin ? 'bg-green-500/20 text-green-600' :
                                      h.isLoss ? 'bg-destructive/20 text-destructive' :
                                      h.isAccumulated ? 'bg-accent/30 text-accent-foreground' :
                                      'bg-muted/30 text-muted-foreground'
                                    )}
                                    title={h.isWin && h.accumulatedAmount ? `Ganó $${h.accumulatedAmount}` : undefined}
                                  >
                                    {h.playerOrder !== null ? `#${h.playerOrder}` : '✗'}
                                  </div>
                                ))}
                                <div className={cn(
                                  'w-12 h-7 flex items-center justify-center rounded text-xs font-bold',
                                  oyesTotal > 0 ? 'bg-green-500/20 text-green-600' :
                                  oyesTotal < 0 ? 'bg-destructive/20 text-destructive' :
                                  'bg-muted/30 text-muted-foreground'
                                )}>
                                  ${Math.abs(oyesTotal)}
                                </div>
                              </div>
                            </div>
                            
                            {/* Player B row */}
                            <div className="flex items-center gap-2 text-xs">
                              <div 
                                className="w-8 h-8 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                                style={{ backgroundColor: rival.color }}
                              >
                                {rival.name.substring(0, 3).toUpperCase()}
                              </div>
                              <div className="flex gap-1 overflow-x-auto">
                                {playerBHoles.map(h => (
                                  <div 
                                    key={h.holeNumber} 
                                    className={cn(
                                      'w-8 h-7 flex items-center justify-center rounded text-xs font-bold',
                                      h.isWin ? 'bg-green-500/20 text-green-600' :
                                      h.isLoss ? 'bg-destructive/20 text-destructive' :
                                      h.isAccumulated ? 'bg-accent/30 text-accent-foreground' :
                                      'bg-muted/30 text-muted-foreground'
                                    )}
                                    title={h.isWin && h.accumulatedAmount ? `Ganó $${h.accumulatedAmount}` : undefined}
                                  >
                                    {h.playerOrder !== null ? `#${h.playerOrder}` : '✗'}
                                  </div>
                                ))}
                                <div className={cn(
                                  'w-12 h-7 flex items-center justify-center rounded text-xs font-bold',
                                  oyesTotal < 0 ? 'bg-green-500/20 text-green-600' :
                                  oyesTotal > 0 ? 'bg-destructive/20 text-destructive' :
                                  'bg-muted/30 text-muted-foreground'
                                )}>
                                  ${Math.abs(oyesTotal)}
                                </div>
                              </div>
                            </div>
                            
                            {/* Zapato bonus display when 100% winner */}
                            {hasZapato && (
                              <div className={cn(
                                'flex items-center justify-between p-2 rounded-lg border',
                                isPlayerZapatoWinner 
                                  ? 'bg-green-500/10 border-green-500/30' 
                                  : 'bg-destructive/10 border-destructive/30'
                              )}>
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">🥾</span>
                                  <div>
                                    <span className="font-bold text-sm">Zapato</span>
                                    <span className="text-xs text-muted-foreground ml-1">(100% ganados)</span>
                                  </div>
                                </div>
                                <div className={cn(
                                  'font-bold text-sm',
                                  isPlayerZapatoWinner ? 'text-green-600' : 'text-destructive'
                                )}>
                                  {isPlayerZapatoWinner ? '+' : '-'}${zapatoBonus}
                                </div>
                              </div>
                            )}
                            
                            {/* Debug info - shows holes won per player for verification */}
                            {pairResult && (
                              <div className="text-[9px] text-muted-foreground bg-muted/20 p-1 rounded mb-1">
                                Hoyos ganados: {player.name.substring(0,3)}={pairResult.winsA}, {rival.name.substring(0,3)}={pairResult.winsB} | 
                                Total jugados: {pairResult.settledHoles} | 
                                Zapato: {pairResult.hasZapato ? `Sí (+$${pairResult.zapatoBonus})` : 'No'}
                              </div>
                            )}
                            
                            {/* Legend */}
                            <div className="flex flex-wrap gap-2 text-[9px] text-muted-foreground pt-1 border-t border-border/30">
                              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500/20"></span>Ganado</span>
                              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-destructive/20"></span>Perdido</span>
                              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-accent/30"></span>Acumulado</span>
                              <span className="flex items-center gap-1">✗ = Sin green</span>
                              {hasZapato && <span className="flex items-center gap-1">🥾 = Bonus 100%</span>}
                            </div>
                          </div>
                        );
                      })()
                    ) : group.key === 'rayas' ? (
                      // Rayas detail - show net won per source (skins, unidades, oyes, medal)
                      (() => {
                        const rayasResult = getRayasDetailForPair(
                          player,
                          rival,
                          confirmedScores,
                          betConfig,
                          course,
                          betConfig.bilateralHandicaps
                        );
                        
                        // Group details by source - counting net rayas won (positive = player wins)
                        const sourceGroups: Record<string, { front: number; back: number; total: number }> = {
                          skins: { front: 0, back: 0, total: 0 },
                          units: { front: 0, back: 0, total: 0 },
                          oyes: { front: 0, back: 0, total: 0 },
                          medal: { front: 0, back: 0, total: 0 },
                        };
                        
                        rayasResult.details.forEach(d => {
                          const grp = sourceGroups[d.source];
                          if (grp) {
                            const count = d.rayasCount;
                            if (d.appliedSegment === 'front') grp.front += count;
                            else if (d.appliedSegment === 'back') grp.back += count;
                            else grp.total += count;
                          }
                        });
                        
                        const frontValue = betConfig.rayas?.frontValue || 0;
                        const backValue = betConfig.rayas?.backValue || 0;
                        const medalValue = betConfig.rayas?.medalTotalValue || 0;
                        
                        // Include Oyes summaries from groupedSummaries
                        const oyesFrontAmount = groupedSummaries['Rayas Oyes']?.details
                          ?.filter(d => d.segment === 'front')
                          .reduce((s, d) => s + d.amount, 0) || 0;
                        const oyesBackAmount = groupedSummaries['Rayas Oyes']?.details
                          ?.filter(d => d.segment === 'back')
                          .reduce((s, d) => s + d.amount, 0) || 0;
                        
                        // Calculate oyes rayas count from amount
                        const oyesFrontRayas = frontValue > 0 ? Math.round(oyesFrontAmount / frontValue) : 0;
                        const oyesBackRayas = backValue > 0 ? Math.round(oyesBackAmount / backValue) : 0;
                        
                        // Calculate net rayas per source for display
                        const getSourceNet = (source: string) => {
                          const data = sourceGroups[source];
                          if (source === 'oyes') {
                            return {
                              front: oyesFrontRayas,
                              back: oyesBackRayas,
                              total: oyesFrontRayas + oyesBackRayas,
                            };
                          }
                          return {
                            front: data.front,
                            back: data.back,
                            total: data.front + data.back + data.total,
                          };
                        };
                        
                        const skinsNet = getSourceNet('skins');
                        const unitsNet = getSourceNet('units');
                        const oyesNet = getSourceNet('oyes');
                        const medalNet = getSourceNet('medal');
                        
                        // Calculate total rayas per segment
                        const frontTotalRayas = skinsNet.front + unitsNet.front + oyesNet.front + medalNet.front;
                        const backTotalRayas = skinsNet.back + unitsNet.back + oyesNet.back + medalNet.back;
                        const totalRayasAll = frontTotalRayas + backTotalRayas;
                        
                        // Calculate amounts
                        const frontTotalAmount = frontTotalRayas * frontValue;
                        const backTotalAmount = backTotalRayas * backValue;
                        const medalTotalAmount = rayasResult.medalTotalAmountA;
                        const grandTotal = frontTotalAmount + backTotalAmount + medalTotalAmount;
                        
                        // Check if we have all 18 holes confirmed
                        const confirmedHolesCount = confirmedScores.get(player.id)?.length || 0;
                        const hasAll18 = confirmedHolesCount >= 18;
                        
                        return (
                          <div className="px-4 py-3 pl-6 bg-background/50 space-y-2">
                            {/* Header row */}
                            <div className="grid grid-cols-5 gap-1 text-[10px] font-medium text-muted-foreground border-b border-border/30 pb-1">
                              <div>Fuente</div>
                              <div className="text-center">Skins</div>
                              <div className="text-center">Unidades</div>
                              <div className="text-center">Oyes</div>
                              <div className="text-center">Medal</div>
                            </div>
                            
                            {/* Front 9 row */}
                            <div className="grid grid-cols-5 gap-1 items-center text-xs py-1">
                              <div className="font-medium text-muted-foreground">Front 9</div>
                              <div className={cn('text-center font-bold', skinsNet.front > 0 ? 'text-green-500' : skinsNet.front < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                                {skinsNet.front !== 0 ? skinsNet.front : '-'}
                              </div>
                              <div className={cn('text-center font-bold', unitsNet.front > 0 ? 'text-green-500' : unitsNet.front < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                                {unitsNet.front !== 0 ? unitsNet.front : '-'}
                              </div>
                              <div className={cn('text-center font-bold', oyesNet.front > 0 ? 'text-green-500' : oyesNet.front < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                                {oyesNet.front !== 0 ? oyesNet.front : '-'}
                              </div>
                              <div className={cn('text-center font-bold', medalNet.front > 0 ? 'text-green-500' : medalNet.front < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                                {medalNet.front !== 0 ? medalNet.front : '-'}
                              </div>
                            </div>
                            
                            {/* Front 9 total */}
                            <div className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1">
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Total Front:</span>
                                <span className={cn('font-bold', frontTotalRayas > 0 ? 'text-green-500' : frontTotalRayas < 0 ? 'text-destructive' : '')}>
                                  {frontTotalRayas}
                                </span>
                                <span className="text-muted-foreground">× ${frontValue} =</span>
                              </div>
                              <span className={cn('font-bold', frontTotalAmount > 0 ? 'text-green-500' : frontTotalAmount < 0 ? 'text-destructive' : '')}>
                                {frontTotalAmount >= 0 ? '+' : ''}${frontTotalAmount}
                              </span>
                            </div>
                            
                            {/* Back 9 row */}
                            <div className="grid grid-cols-5 gap-1 items-center text-xs py-1 border-t border-border/20 pt-2">
                              <div className="font-medium text-muted-foreground">Back 9</div>
                              <div className={cn('text-center font-bold', skinsNet.back > 0 ? 'text-green-500' : skinsNet.back < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                                {skinsNet.back !== 0 ? skinsNet.back : '-'}
                              </div>
                              <div className={cn('text-center font-bold', unitsNet.back > 0 ? 'text-green-500' : unitsNet.back < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                                {unitsNet.back !== 0 ? unitsNet.back : '-'}
                              </div>
                              <div className={cn('text-center font-bold', oyesNet.back > 0 ? 'text-green-500' : oyesNet.back < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                                {oyesNet.back !== 0 ? oyesNet.back : '-'}
                              </div>
                              <div className={cn('text-center font-bold', medalNet.back > 0 ? 'text-green-500' : medalNet.back < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                                {medalNet.back !== 0 ? medalNet.back : '-'}
                              </div>
                            </div>
                            
                            {/* Back 9 total */}
                            <div className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1">
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Total Back:</span>
                                <span className={cn('font-bold', backTotalRayas > 0 ? 'text-green-500' : backTotalRayas < 0 ? 'text-destructive' : '')}>
                                  {backTotalRayas}
                                </span>
                                <span className="text-muted-foreground">× ${backValue} =</span>
                              </div>
                              <span className={cn('font-bold', backTotalAmount > 0 ? 'text-green-500' : backTotalAmount < 0 ? 'text-destructive' : '')}>
                                {backTotalAmount >= 0 ? '+' : ''}${backTotalAmount}
                              </span>
                            </div>
                            
                            {/* Medal Total row - only show when all 18 holes confirmed */}
                            {hasAll18 && medalTotalAmount !== 0 && (
                              <div className="flex items-center justify-between text-xs bg-primary/10 rounded px-2 py-1.5 border border-primary/20">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">Medal Total</span>
                                  <span className="text-muted-foreground text-[10px]">(1 raya)</span>
                                </div>
                                <span className={cn('font-bold', medalTotalAmount > 0 ? 'text-green-500' : 'text-destructive')}>
                                  {medalTotalAmount >= 0 ? '+' : ''}${medalTotalAmount}
                                </span>
                              </div>
                            )}
                            
                            {/* Grand Total */}
                            <div className="flex items-center justify-between text-sm font-bold border-t border-border/50 pt-2 mt-2">
                              <span>TOTAL RAYAS</span>
                              <span className={cn(grandTotal > 0 ? 'text-green-500' : grandTotal < 0 ? 'text-destructive' : '')}>
                                {grandTotal >= 0 ? '+' : ''}${grandTotal}
                              </span>
                            </div>
                            
                            {/* Variant indicator */}
                            <div className="text-[9px] text-muted-foreground bg-muted/30 rounded px-2 py-1">
                              {betConfig.rayas?.skinVariant === 'acumulados' ? 'Acumulados' : 'Sin Acumulación'} | 
                              Front ${frontValue}, Back ${backValue}, Medal ${medalValue}
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      group.segments.map((segment) => {
                        const data = group.getSegmentData(segment.key);
                        
                        // For pressures, show "Even" when tied (amount is 0 or description indicates no activity)
                        const isPressures = group.key === 'pressures';
                        const isPressureEven = isPressures && data.amount === 0 && 
                          (!data.description || data.description === '' || data.description === '+0');
                        
                        return (
                          <div key={segment.key} className="flex items-center justify-between px-4 py-2 pl-10 bg-background/50">
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground w-16">{segment.label}</span>
                              {/* Score comparison */}
                              <div className="flex items-center gap-1 text-xs">
                                {group.key === 'pressures' ? (
                                  <span className={cn(
                                    'font-medium',
                                    data.amount > 0 ? 'text-green-500' : data.amount < 0 ? 'text-destructive' : 'text-muted-foreground'
                                  )}>
                                    {isPressureEven ? 'Even' : (data.description || 'Even')}
                                  </span>
                                ) : (
                                  <>
                                    <span className={cn(
                                      'font-medium min-w-[24px] text-center',
                                      data.playerNet < data.rivalNet ? 'text-green-500' : 
                                      data.playerNet > data.rivalNet ? 'text-destructive' : ''
                                    )}>
                                      {group.key === 'skins' ? `${data.playerNet}` : data.playerNet || '-'}
                                    </span>
                                    <span className="text-muted-foreground">vs</span>
                                    <span className={cn(
                                      'font-medium min-w-[24px] text-center',
                                      data.rivalNet < data.playerNet ? 'text-green-500' : 
                                      data.rivalNet > data.playerNet ? 'text-destructive' : ''
                                    )}>
                                      {group.key === 'skins' ? `${data.rivalNet}` : data.rivalNet || '-'}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            <span className={cn(
                              'text-sm font-bold min-w-[50px] text-right',
                              data.amount > 0 ? 'text-green-500' : data.amount < 0 ? 'text-destructive' : 'text-muted-foreground'
                            )}>
                              {isPressureEven ? 'Even' : `${data.amount >= 0 ? '+' : ''}$${data.amount}`}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>

      {/* Edit Amount Dialog */}
      <Dialog open={!!editingBetType} onOpenChange={() => setEditingBetType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modificar importe de apuesta</DialogTitle>
          </DialogHeader>
          <BetAmountEditor
            betType={editingBetType || ''}
            currentOverride={getBetOverride(editingBetType || '')}
            betConfig={betConfig}
            onSave={(overrides) => {
                if (editingBetType && onBetConfigChange) {
                // Update the bet config with the new amounts for this pair
                // This is a simplified approach - in production you'd want per-pair overrides
                const newConfig = { ...betConfig };
                if (editingBetType === 'medal' && overrides.front !== undefined) {
                  newConfig.medal = { ...newConfig.medal, frontAmount: overrides.front, backAmount: overrides.back ?? newConfig.medal.backAmount, totalAmount: overrides.total ?? newConfig.medal.totalAmount };
                } else if (editingBetType === 'pressures' && overrides.front !== undefined) {
                  newConfig.pressures = { ...newConfig.pressures, frontAmount: overrides.front, backAmount: overrides.back ?? newConfig.pressures.backAmount, totalAmount: overrides.total ?? newConfig.pressures.totalAmount };
                } else if (editingBetType === 'skins' && overrides.front !== undefined) {
                  newConfig.skins = { ...newConfig.skins, frontValue: overrides.front, backValue: overrides.back ?? newConfig.skins.backValue };
                } else if (editingBetType === 'rayas' && overrides.front !== undefined) {
                  newConfig.rayas = { 
                    ...newConfig.rayas, 
                    frontValue: overrides.front, 
                    backValue: overrides.back ?? newConfig.rayas?.backValue ?? 25, 
                    medalTotalValue: overrides.total ?? newConfig.rayas?.medalTotalValue ?? 50 
                  };
                } else if (overrides.total !== undefined) {
                  if (editingBetType === 'caros') newConfig.caros = { ...newConfig.caros, amount: overrides.total };
                  else if (editingBetType === 'oyeses') newConfig.oyeses = { ...newConfig.oyeses, amount: overrides.total };
                  else if (editingBetType === 'units') newConfig.units = { ...newConfig.units, valuePerPoint: overrides.total };
                  else if (editingBetType === 'manchas') newConfig.manchas = { ...newConfig.manchas, valuePerPoint: overrides.total };
                  else if (editingBetType === 'culebras') newConfig.culebras = { ...newConfig.culebras, valuePerOccurrence: overrides.total };
                  else if (editingBetType === 'pinguinos') newConfig.pinguinos = { ...newConfig.pinguinos, valuePerOccurrence: overrides.total };
                }
                onBetConfigChange(newConfig);
              }
              setEditingBetType(null);
            }}
            onClose={() => setEditingBetType(null)}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
};

// Bet Amount Editor Component - Shows front/back/total for each bet type
interface BetAmountEditorProps {
  betType: string;
  currentOverride?: BetOverride;
  betConfig: BetConfig;
  onSave: (overrides: { front?: number; back?: number; total?: number }) => void;
  onClose: () => void;
}

const BetAmountEditor: React.FC<BetAmountEditorProps> = ({
  betType,
  currentOverride,
  betConfig,
  onSave,
  onClose,
}) => {
  // Get default amounts based on bet type with segments
  const getSegmentConfig = (): { front?: number; back?: number; total?: number } => {
    switch (betType) {
      case 'medal': 
        return { 
          front: betConfig.medal.frontAmount, 
          back: betConfig.medal.backAmount, 
          total: betConfig.medal.totalAmount 
        };
      case 'pressures': 
        return { 
          front: betConfig.pressures.frontAmount, 
          back: betConfig.pressures.backAmount, 
          total: betConfig.pressures.totalAmount 
        };
      case 'skins': 
        return { 
          front: betConfig.skins.frontValue, 
          back: betConfig.skins.backValue 
        };
      case 'caros': 
        return { total: betConfig.caros.amount };
      case 'oyeses':
        return { total: betConfig.oyeses.amount };
      case 'units': 
        return { total: betConfig.units.valuePerPoint };
      case 'manchas': 
        return { total: betConfig.manchas.valuePerPoint };
      case 'culebras': 
        return { total: betConfig.culebras.valuePerOccurrence };
      case 'pinguinos': 
        return { total: betConfig.pinguinos.valuePerOccurrence };
      case 'rayas':
        return { 
          front: betConfig.rayas?.frontValue || 25, 
          back: betConfig.rayas?.backValue || 25, 
          total: betConfig.rayas?.medalTotalValue || 50 
        };
      default: 
        return {};
    }
  };

  const segmentConfig = getSegmentConfig();
  const [frontAmount, setFrontAmount] = useState(segmentConfig.front ?? 0);
  const [backAmount, setBackAmount] = useState(segmentConfig.back ?? 0);
  const [totalAmount, setTotalAmount] = useState(segmentConfig.total ?? 0);

  const hasFront = segmentConfig.front !== undefined;
  const hasBack = segmentConfig.back !== undefined;
  const hasTotal = segmentConfig.total !== undefined;

  const handleSave = () => {
    onSave({
      ...(hasFront && { front: frontAmount }),
      ...(hasBack && { back: backAmount }),
      ...(hasTotal && { total: totalAmount }),
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Modifica el importe de esta apuesta solo para este par de jugadores.
      </p>
      
      {hasFront && (
        <div className="flex items-center justify-between">
          <Label className="text-sm">Front 9:</Label>
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setFrontAmount(Math.max(0, frontAmount - 25))}><Minus className="h-3 w-3" /></Button>
            <div className="flex items-center gap-0.5">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <Input type="number" value={frontAmount} onChange={(e) => setFrontAmount(parseInt(e.target.value) || 0)} className="w-20 h-8 text-center" min={0} step={25} />
            </div>
            <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setFrontAmount(frontAmount + 25)}><Plus className="h-3 w-3" /></Button>
          </div>
        </div>
      )}
      
      {hasBack && (
        <div className="flex items-center justify-between">
          <Label className="text-sm">Back 9:</Label>
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setBackAmount(Math.max(0, backAmount - 25))}><Minus className="h-3 w-3" /></Button>
            <div className="flex items-center gap-0.5">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <Input type="number" value={backAmount} onChange={(e) => setBackAmount(parseInt(e.target.value) || 0)} className="w-20 h-8 text-center" min={0} step={25} />
            </div>
            <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setBackAmount(backAmount + 25)}><Plus className="h-3 w-3" /></Button>
          </div>
        </div>
      )}
      
      {hasTotal && (
        <div className="flex items-center justify-between">
          <Label className="text-sm">{hasFront || hasBack ? 'Total 18:' : 'Importe:'}</Label>
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setTotalAmount(Math.max(0, totalAmount - 25))}><Minus className="h-3 w-3" /></Button>
            <div className="flex items-center gap-0.5">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <Input type="number" value={totalAmount} onChange={(e) => setTotalAmount(parseInt(e.target.value) || 0)} className="w-20 h-8 text-center" min={0} step={25} />
            </div>
            <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setTotalAmount(totalAmount + 25)}><Plus className="h-3 w-3" /></Button>
          </div>
        </div>
      )}
      
      <p className="text-xs text-muted-foreground">
        Valores originales: {hasFront && `Front $${segmentConfig.front}`} {hasBack && `Back $${segmentConfig.back}`} {hasTotal && `${hasFront || hasBack ? 'Total' : ''} $${segmentConfig.total}`}
      </p>
      
      <div className="flex gap-2">
        <Button variant="outline" onClick={onClose} className="flex-1">
          Cancelar
        </Button>
        <Button onClick={handleSave} className="flex-1">
          Guardar
        </Button>
      </div>
    </div>
  );
};

// Bilateral Handicap Editor
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
  
  const getPlayerAbbr = (p: Player) => p.name.substring(0, 3).toUpperCase();
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
              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
              style={{ backgroundColor: player.color }}
            >
              {getPlayerAbbr(player)}
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
              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
              style={{ backgroundColor: rival.color }}
            >
              {getPlayerAbbr(rival)}
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