// Complete Bet Dashboard - reorganized with bet type rows and bet override capability
import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Player, PlayerScore, BetConfig, GolfCourse, MarkerState, markerInfo, BetOverride, CarritosTeamBet, BilateralHandicap, PlayerGroup } from '@/types/golf';
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
import { GroupSelector, getPlayersForGroup, getAllPlayersFromAllGroups } from '@/components/GroupSelector';
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
  UserPlus,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';
import { PlayerAvatar } from '@/components/PlayerAvatar';

// BilateralHandicap is now imported from types/golf.ts

interface BetDashboardProps {
  players: Player[];
  scores: Map<string, PlayerScore[]>;
  betConfig: BetConfig;
  course: GolfCourse;
  basePlayerId?: string;
  confirmedHoles?: Set<number>;
  onBetConfigChange?: (config: BetConfig) => void;
  startingHole?: 1 | 10;
  playerGroups?: PlayerGroup[];
}

export const BetDashboard: React.FC<BetDashboardProps> = ({
  players,
  scores,
  betConfig,
  course,
  basePlayerId,
  confirmedHoles = new Set(),
  onBetConfigChange,
  startingHole = 1,
  playerGroups = [],
}) => {
  const [selectedRival, setSelectedRival] = useState<string | null>(null);
  const [expandedTypes, setExpandedTypes] = useState<string[]>([]);
  const [expandedLeaderboard, setExpandedLeaderboard] = useState<string | null>(null);
  const [balanceBasePlayerId, setBalanceBasePlayerId] = useState<string | null>(null);
  const [showCrossGroupPicker, setShowCrossGroupPicker] = useState(false);
  const [displayGroupIndex, setDisplayGroupIndex] = useState(0); // For group selector in detail view
  
  // Tabla General view mode: 'group' = show selected group only, 'all' = show all groups combined
  const [tablaGeneralMode, setTablaGeneralMode] = useState<'group' | 'all'>('group');
  // Selected group for Tabla General when in 'all' mode (to show in Balance vs)
  const [tablaGeneralSelectedGroup, setTablaGeneralSelectedGroup] = useState(0);
  
  // Cross-group rivals are now stored in betConfig as a per-player map
  // Structure: { [basePlayerId]: string[] } - each player has their own exclusive selections
  const crossGroupRivalsMap = betConfig.crossGroupRivals || {};
  
  // Get cross-group rivals for the current base player only
  const getCrossGroupRivalsForBase = (baseId: string | null | undefined): string[] => {
    if (!baseId) return [];
    return crossGroupRivalsMap[baseId] || [];
  };
  
  // Set cross-group rivals for current base player
  const setCrossGroupRivalsForBase = (updater: string[] | ((prev: string[]) => string[])) => {
    if (!onBetConfigChange || !balanceBasePlayerId) return;
    const currentRivals = getCrossGroupRivalsForBase(balanceBasePlayerId);
    const newRivals = typeof updater === 'function' ? updater(currentRivals) : updater;
    onBetConfigChange({ 
      ...betConfig, 
      crossGroupRivals: { 
        ...crossGroupRivalsMap, 
        [balanceBasePlayerId]: newRivals 
      } 
    });
  };
  
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
  
  // Players from other groups (used for cross-group rival selection)
  const otherGroupPlayers = useMemo(() => {
    return getAllPlayersFromAllGroups([], playerGroups); // Only players from additional groups
  }, [playerGroups]);

  // All players across all groups (for calculations). Important: must NOT depend on the selected base player.
  const allPlayersForCalculations = useMemo(() => {
    return getAllPlayersFromAllGroups(players, playerGroups);
  }, [players, playerGroups]);

  // Calculate all bets using only confirmed scores (all groups). UI will filter per mode.
  const betSummaries = useMemo(
    () => calculateAllBets(allPlayersForCalculations, confirmedScores, betConfig, course, startingHole),
    [allPlayersForCalculations, confirmedScores, betConfig, course, startingHole]
  );
  
  // Calculate ALL Carritos results (primary + additional teams)
  // NEW SCORING: Per hole - lowball wins 1pt, highball wins 1pt, combined wins 1pt (0-3 pts per hole)
  const allCarritosResults = useMemo(() => {
    const results: Array<{
      teamA: [string, string];
      teamB: [string, string];
      scoringType: 'lowBall' | 'highBall' | 'combined' | 'all';
      // Net points by hole from Team A perspective (A points - B points). null = skipped (missing confirmation)
      netByHoleFront: Array<number | null>; // holes 1-9
      netByHoleBack: Array<number | null>; // holes 10-18
      holeDetailsFront: Array<{
        holeNumber: number;
         grossA1: number;
         hcpA1: number;
        netA1: number;
         grossA2: number;
         hcpA2: number;
        netA2: number;
         grossB1: number;
         hcpB1: number;
        netB1: number;
         grossB2: number;
         hcpB2: number;
        netB2: number;
        lowBallWinner?: 'A' | 'B' | 'tie';
        highBallWinner?: 'A' | 'B' | 'tie';
        combinedWinner?: 'A' | 'B' | 'tie';
        pointsA: number;
        pointsB: number;
      } | null>;
      holeDetailsBack: Array<{
        holeNumber: number;
         grossA1: number;
         hcpA1: number;
        netA1: number;
         grossA2: number;
         hcpA2: number;
        netA2: number;
         grossB1: number;
         hcpB1: number;
        netB1: number;
         grossB2: number;
         hcpB2: number;
        netB2: number;
        lowBallWinner?: 'A' | 'B' | 'tie';
        highBallWinner?: 'A' | 'B' | 'tie';
        combinedWinner?: 'A' | 'B' | 'tie';
        pointsA: number;
        pointsB: number;
      } | null>;
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
        // Prefer the handicap explicitly defined in the Carritos bet setup (teamHandicaps),
        // even if the feature-flag `useTeamHandicaps` is not set (some older configs may omit it).
        const direct = teamHandicaps?.[playerId];
        if (typeof direct === 'number' && Number.isFinite(direct)) return direct;

        const byProfileId = players.find((p) => p.id === playerId)?.profileId;
        if (byProfileId) {
          const h = teamHandicaps?.[byProfileId];
          if (typeof h === 'number' && Number.isFinite(h)) return h;
        }

        // Back-compat: honor the toggle if present
        if (useTeamHandicaps) {
          const teamHcp = teamHandicaps?.[playerId];
          if (typeof teamHcp === 'number' && Number.isFinite(teamHcp)) return teamHcp;
        }

        // Fallback to the player's round handicap stored in the players array
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

      const getCarritosHoleScore = (
        playerId: string,
        holeNum: number
      ): { gross: number; hcp: number; net: number } | null => {
        const score = confirmedScores.get(playerId)?.find((s) => s.holeNumber === holeNum);
        if (!score || typeof score.strokes !== 'number' || !Number.isFinite(score.strokes)) return null;
        const hcp = strokesReceivedByPlayer.get(playerId)?.[holeNum - 1] ?? 0;
        return { gross: score.strokes, hcp, net: score.strokes - hcp };
      };

      const includeLowBall = scoringType === 'lowBall' || scoringType === 'all';
      const includeHighBall = scoringType === 'highBall' || scoringType === 'all';
      const includeCombined = scoringType === 'combined' || scoringType === 'all';

      const getHolePoints = (holeNum: number): {
        pointsA: number;
        pointsB: number;
        detail: {
          holeNumber: number;
          grossA1: number;
          hcpA1: number;
          netA1: number;
          grossA2: number;
          hcpA2: number;
          netA2: number;
          grossB1: number;
          hcpB1: number;
          netB1: number;
          grossB2: number;
          hcpB2: number;
          netB2: number;
          lowBallWinner?: 'A' | 'B' | 'tie';
          highBallWinner?: 'A' | 'B' | 'tie';
          combinedWinner?: 'A' | 'B' | 'tie';
          pointsA: number;
          pointsB: number;
        };
      } | null => {
        const a1 = getCarritosHoleScore(resolvedTeamA[0], holeNum);
        const a2 = getCarritosHoleScore(resolvedTeamA[1], holeNum);
        const b1 = getCarritosHoleScore(resolvedTeamB[0], holeNum);
        const b2 = getCarritosHoleScore(resolvedTeamB[1], holeNum);

        // Skip if not all four have a score for this hole
        if (!a1 || !a2 || !b1 || !b2) return null;

        const netA1 = a1.net;
        const netA2 = a2.net;
        const netB1 = b1.net;
        const netB2 = b2.net;

        let pointsA = 0;
        let pointsB = 0;
        let lowBallWinner: 'A' | 'B' | 'tie' | undefined;
        let highBallWinner: 'A' | 'B' | 'tie' | undefined;
        let combinedWinner: 'A' | 'B' | 'tie' | undefined;

        if (includeLowBall) {
          const lowballA = Math.min(netA1, netA2);
          const lowballB = Math.min(netB1, netB2);
          if (lowballA < lowballB) {
            pointsA += 1;
            lowBallWinner = 'A';
          } else if (lowballB < lowballA) {
            pointsB += 1;
            lowBallWinner = 'B';
          } else {
            lowBallWinner = 'tie';
          }
        }

        if (includeHighBall) {
          const highballA = Math.max(netA1, netA2);
          const highballB = Math.max(netB1, netB2);
          if (highballA < highballB) {
            pointsA += 1;
            highBallWinner = 'A';
          } else if (highballB < highballA) {
            pointsB += 1;
            highBallWinner = 'B';
          } else {
            highBallWinner = 'tie';
          }
        }

        if (includeCombined) {
          const combinedA = netA1 + netA2;
          const combinedB = netB1 + netB2;
          if (combinedA < combinedB) {
            pointsA += 1;
            combinedWinner = 'A';
          } else if (combinedB < combinedA) {
            pointsB += 1;
            combinedWinner = 'B';
          } else {
            combinedWinner = 'tie';
          }
        }

        return {
          pointsA,
          pointsB,
          detail: {
            holeNumber: holeNum,
            grossA1: a1.gross,
            hcpA1: a1.hcp,
            netA1,
            grossA2: a2.gross,
            hcpA2: a2.hcp,
            netA2,
            grossB1: b1.gross,
            hcpB1: b1.hcp,
            netB1,
            grossB2: b2.gross,
            hcpB2: b2.hcp,
            netB2,
            lowBallWinner,
            highBallWinner,
            combinedWinner,
            pointsA,
            pointsB,
          },
        };
      };

      const calculatePointsForHoles = (holes: number[]): {
        pointsA: number;
        pointsB: number;
        netByHole: Array<number | null>;
        details: Array<{
          holeNumber: number;
          grossA1: number;
          hcpA1: number;
          netA1: number;
          grossA2: number;
          hcpA2: number;
          netA2: number;
          grossB1: number;
          hcpB1: number;
          netB1: number;
          grossB2: number;
          hcpB2: number;
          netB2: number;
          lowBallWinner?: 'A' | 'B' | 'tie';
          highBallWinner?: 'A' | 'B' | 'tie';
          combinedWinner?: 'A' | 'B' | 'tie';
          pointsA: number;
          pointsB: number;
        } | null>;
      } => {
        let pointsA = 0;
        let pointsB = 0;
        const netByHole: Array<number | null> = [];
        const details: Array<{
          holeNumber: number;
          grossA1: number;
          hcpA1: number;
          netA1: number;
          grossA2: number;
          hcpA2: number;
          netA2: number;
          grossB1: number;
          hcpB1: number;
          netB1: number;
          grossB2: number;
          hcpB2: number;
          netB2: number;
          lowBallWinner?: 'A' | 'B' | 'tie';
          highBallWinner?: 'A' | 'B' | 'tie';
          combinedWinner?: 'A' | 'B' | 'tie';
          pointsA: number;
          pointsB: number;
        } | null> = [];

        holes.forEach((holeNum) => {
          const holePoints = getHolePoints(holeNum);
          if (!holePoints) {
            netByHole.push(null);
            details.push(null);
            return;
          }
          pointsA += holePoints.pointsA;
          pointsB += holePoints.pointsB;
          netByHole.push(holePoints.pointsA - holePoints.pointsB);
          details.push(holePoints.detail);
        });

        return { pointsA, pointsB, netByHole, details };
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
        scoringType,
        netByHoleFront: frontPoints.netByHole,
        netByHoleBack: backPoints.netByHole,
        holeDetailsFront: frontPoints.details,
        holeDetailsBack: backPoints.details,
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
  
  // Default base player = logged-in user (via basePlayerId prop). User can override for this session.
  useEffect(() => {
    if (!players.length) return;

    const defaultBaseId =
      players.find((p) => p.id === basePlayerId || p.profileId === basePlayerId)?.id ??
      players[0]?.id ??
      null;

    // If nothing selected yet (or selection is no longer valid), reset to default.
    if (!balanceBasePlayerId || !players.some((p) => p.id === balanceBasePlayerId)) {
      setBalanceBasePlayerId(defaultBaseId);
      setSelectedRival(null);
    }
  }, [players, basePlayerId, balanceBasePlayerId]);

  // Base player, sameGroupRivals, rivals are calculated after balanceVsPlayers is defined
  
  // Players available to add as cross-group rivals for current base player
  const availableCrossGroupPlayers = otherGroupPlayers.filter(
    p => !getCrossGroupRivalsForBase(balanceBasePlayerId).includes(p.id)
  );
  
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

  // Sort players by total balance for leaderboard (computed in render based on displayPlayers)
  const getSortedPlayersForDisplay = (playersToSort: Player[]) => {
    return [...playersToSort].sort((a, b) => 
      getPlayerBalance(b.id, betSummaries) + getCarritosBalanceForPlayer(b.id) - 
      (getPlayerBalance(a.id, betSummaries) + getCarritosBalanceForPlayer(a.id))
    );
  };
  
  // For verification calculation, still use all players from current group
  const sortedPlayers = useMemo(() => {
    return getSortedPlayersForDisplay(players);
  }, [players, betSummaries, allCarritosResults]);

  // Get player name abbreviation (first 3 letters)
  const getPlayerAbbr = (player: Player) => player.name.substring(0, 3).toUpperCase();
  
  // Get carritos balance between two specific players
  // Returns the balance from playerA's perspective vs playerB
  // 
  // Settlement logic for Carritos (team bets):
  // - Team result moneyA is the total the team wins/loses
  // - Each player on a team gets/pays half: moneyA / 2
  // - That half is split evenly between the two opponents: (moneyA / 2) / 2 = moneyA / 4
  // 
  // Example: Team A wins $200
  // - Player A1 gets $100 total ($50 from B1 + $50 from B2)
  // - Player A2 gets $100 total ($50 from B1 + $50 from B2)
  // - So vs any single opponent, the amount is moneyA / 4
  const getCarritosBalanceVsPlayer = (playerAId: string, playerBId: string): number => {
    let total = 0;
    allCarritosResults.forEach(result => {
      const teamAHasPlayerA = result.teamA.includes(playerAId);
      const teamBHasPlayerA = result.teamB.includes(playerAId);
      const teamAHasPlayerB = result.teamA.includes(playerBId);
      const teamBHasPlayerB = result.teamB.includes(playerBId);
      
      // If they're on opposite teams, calculate the correct split
      if ((teamAHasPlayerA && teamBHasPlayerB) || (teamBHasPlayerA && teamAHasPlayerB)) {
        // PlayerA and PlayerB are opponents
        const playerAMoney = teamAHasPlayerA ? result.moneyA : result.moneyB;
        // Each player pays/receives 25% of total to/from each opponent (1/4)
        // Because: (team total / 2 players on winning team) / 2 opponents = total / 4
        total += playerAMoney / 4;
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
  
  // Get players to display based on selected group
  const hasMultipleGroups = playerGroups.length > 0;
  
  // All players from all groups combined
  const allGroupsPlayers = useMemo(() => {
    return getAllPlayersFromAllGroups(players, playerGroups);
  }, [players, playerGroups]);
  
  // Players to display in Tabla General based on mode
  // 'group' mode: Only players from the selected group
  // 'all' mode: Players from selected group + cross-group rivals of each player (for expanded view)
  const tablaGeneralPlayers = useMemo(() => {
    // Both modes show only the selected group's players in the main list
    // The difference is in the expanded view (handled separately)
    return getPlayersForGroup(displayGroupIndex, players, playerGroups);
  }, [displayGroupIndex, players, playerGroups]);

  // Summaries restricted to bets where BOTH players belong to the currently selected group.
  // This is what "Solo Grupo" should use for the main totals/sum.
  const tablaGeneralPlayerIds = useMemo(() => {
    return new Set(tablaGeneralPlayers.map((p) => p.id));
  }, [tablaGeneralPlayers]);

  const tablaGeneralGroupOnlySummaries = useMemo(() => {
    return betSummaries.filter(
      (s) => tablaGeneralPlayerIds.has(s.playerId) && tablaGeneralPlayerIds.has(s.vsPlayer)
    );
  }, [betSummaries, tablaGeneralPlayerIds]);
  
  // Players for the old displayPlayers (used in other sections)
  const displayPlayers = useMemo(() => {
    return getPlayersForGroup(displayGroupIndex, players, playerGroups);
  }, [displayGroupIndex, players, playerGroups]);
  
  // Players to show in "Balance vs" section
  // - In 'group' mode: show players from displayGroupIndex
  // - In 'all' mode: show players from tablaGeneralSelectedGroup
  const balanceVsPlayers = useMemo(() => {
    if (tablaGeneralMode === 'all' && hasMultipleGroups) {
      return getPlayersForGroup(tablaGeneralSelectedGroup, players, playerGroups);
    }
    // In 'group' mode, use displayGroupIndex (same group shown in Tabla General)
    return getPlayersForGroup(displayGroupIndex, players, playerGroups);
  }, [tablaGeneralMode, tablaGeneralSelectedGroup, displayGroupIndex, players, playerGroups, hasMultipleGroups]);
  
  // Base player for "Balance vs" - must be from balanceVsPlayers or fallback
  const basePlayer = useMemo(() => {
    const fromBalanceVs = balanceVsPlayers.find((p) => p.id === balanceBasePlayerId);
    if (fromBalanceVs) return fromBalanceVs;
    // If base player is not in current balanceVsPlayers, reset to first in that list
    return balanceVsPlayers[0] || players[0];
  }, [balanceVsPlayers, players, balanceBasePlayerId]);
  
  const activeBalanceGroupIndex = tablaGeneralMode === 'all' ? tablaGeneralSelectedGroup : displayGroupIndex;

  // Auto-update balanceBasePlayerId when the active Balance-vs group changes
  useEffect(() => {
    const groupPlayers = getPlayersForGroup(activeBalanceGroupIndex, players, playerGroups);
    if (groupPlayers.length > 0 && !groupPlayers.some(p => p.id === balanceBasePlayerId)) {
      setBalanceBasePlayerId(groupPlayers[0].id);
      setSelectedRival(null);
    }
  }, [activeBalanceGroupIndex, players, playerGroups, balanceBasePlayerId]);
  
  // Rivals = players in the same group as base player + cross-group players selected by THIS base player
  const sameGroupRivals = balanceVsPlayers.filter((p) => p.id !== basePlayer?.id);
  const selectedCrossGroupPlayers = otherGroupPlayers.filter(
    p => getCrossGroupRivalsForBase(basePlayer?.id).includes(p.id)
  );
  const rivals = [...sameGroupRivals, ...selectedCrossGroupPlayers];

  return (
    <div className="space-y-4">
      
      {/* Tabla General */}
      <Card>
        <CardHeader className="py-3 space-y-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Tabla General</span>
            {hasMultipleGroups && tablaGeneralMode === 'group' && displayGroupIndex > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                {playerGroups[displayGroupIndex - 1]?.name || `Grupo ${displayGroupIndex + 1}`}
              </span>
            )}
          </CardTitle>
          
          {/* Mode toggle + Group selector controls */}
          {hasMultipleGroups && (
            <div className="flex flex-col gap-2">
              {/* FIRST: Group selector (Ver Grupos 1, 2, 3...) */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Ver Grupo:</span>
                <GroupSelector
                  currentGroupIndex={displayGroupIndex}
                  players={players}
                  playerGroups={playerGroups}
                  onGroupChange={(idx) => {
                    setDisplayGroupIndex(idx);
                    // When changing group in selector, switch to 'group' mode
                    setTablaGeneralMode('group');
                    // Update Balance vs section to show players from this group
                    const groupPlayers = getPlayersForGroup(idx, players, playerGroups);
                    if (groupPlayers.length > 0) {
                      setBalanceBasePlayerId(groupPlayers[0].id);
                      setSelectedRival(null);
                    }
                  }}
                  compact
                />
              </div>
              
              {/* SECOND: Toggle between "Solo Grupo" and "Todos los Grupos" */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Vista:</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTablaGeneralMode('group')}
                    className={cn(
                      'px-2 py-1 rounded-full text-xs font-medium transition-all',
                      tablaGeneralMode === 'group'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    Solo Grupo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTablaGeneralMode('all');
                      // When switching to 'all' mode, set selected group for Balance vs
                      setTablaGeneralSelectedGroup(displayGroupIndex);
                    }}
                    className={cn(
                      'px-2 py-1 rounded-full text-xs font-medium transition-all',
                      tablaGeneralMode === 'all'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    + Apuestas Cruzadas
                  </button>
                </div>
              </div>
              
              {/* Show Balance vs group selector only in 'all' mode */}
              {tablaGeneralMode === 'all' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Balance vs grupo:</span>
                  <GroupSelector
                    currentGroupIndex={tablaGeneralSelectedGroup}
                    players={players}
                    playerGroups={playerGroups}
                    onGroupChange={(idx) => {
                      setTablaGeneralSelectedGroup(idx);
                      // Reset base player when switching groups in 'all' mode
                      const groupPlayers = getPlayersForGroup(idx, players, playerGroups);
                      if (groupPlayers.length > 0) {
                        setBalanceBasePlayerId(groupPlayers[0].id);
                        setSelectedRival(null);
                      }
                    }}
                    compact
                  />
                </div>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            {getSortedPlayersForDisplay(tablaGeneralPlayers).map((player, idx) => {
              // Base total: ONLY bets vs players inside the selected group
              const balance = getPlayerBalance(player.id, tablaGeneralGroupOnlySummaries);
              const carritosBalance = getCarritosBalanceForPlayer(player.id);
              const totalBalance = balance + carritosBalance;
              const isBase = player.id === basePlayer?.id || player.profileId === basePlayerId;
              const isExpanded = expandedLeaderboard === player.id;
              
              // Get other players for the expanded view based on mode:
              // 'group' mode: only other players from the same group
              // 'all' mode: other players from group + this player's specific cross-group rivals
              const sameGroupOthers = tablaGeneralPlayers.filter(p => p.id !== player.id);
              const playerCrossGroupRivals = getCrossGroupRivalsForBase(player.id);
              const crossGroupOthers = tablaGeneralMode === 'all' 
                ? otherGroupPlayers.filter(p => playerCrossGroupRivals.includes(p.id))
                : [];
              const otherPlayers = [...sameGroupOthers, ...crossGroupOthers];
              
              // Determine which group this player belongs to
              const playerGroupIdx = players.some(p => p.id === player.id) ? 0 : 
                playerGroups.findIndex(g => g.players.some(p => p.id === player.id)) + 1;
              
              // Calculate total for "all" mode including cross-group bets
              const crossGroupBalance = crossGroupOthers.reduce((sum, rival) => {
                // Cross-group: only this player's explicitly selected rivals
                return sum + getBilateralBalance(player.id, rival.id, betSummaries);
              }, 0);
              const displayBalance = tablaGeneralMode === 'all' ? totalBalance + crossGroupBalance : totalBalance;
              
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
                        idx === getSortedPlayersForDisplay(tablaGeneralPlayers).length - 1 ? 'bg-destructive text-destructive-foreground' :
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
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-sm">{player.name.split(' ')[0]}</span>
                          <span className="text-[10px] text-muted-foreground">HCP {player.handicap}</span>
                        </div>
                        {tablaGeneralMode === 'all' && hasMultipleGroups && crossGroupOthers.length > 0 && (
                          <span className="text-[9px] text-muted-foreground/70">
                            +{crossGroupOthers.length} de otros grupos
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        'text-lg font-bold',
                        displayBalance > 0 ? 'text-green-500' : displayBalance < 0 ? 'text-destructive' : 'text-muted-foreground'
                      )}>
                        {displayBalance >= 0 ? '+' : ''}${displayBalance}
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>
                  
                  {/* Expanded view: balance vs each other player + carritos per rival */}
                  {isExpanded && (
                    <div className="ml-8 mt-1 space-y-1 pb-2">
                      {otherPlayers.map(other => {
                        // Use full summaries so cross-group pairs work here too.
                        const vsIndividualBalance = getBilateralBalance(player.id, other.id, betSummaries);
                        const vsCarritosBalance = getCarritosBalanceVsPlayer(player.id, other.id);
                        const vsTotalBalance = vsIndividualBalance + vsCarritosBalance;
                        
                        // Check if this is a cross-group rival
                        const isCrossGroupRival = crossGroupOthers.some(p => p.id === other.id);
                        
                        // Other player's group
                        const otherGroupIdx = players.some(p => p.id === other.id) ? 0 : 
                          playerGroups.findIndex(g => g.players.some(p => p.id === other.id)) + 1;
                        
                        return (
                          <div 
                            key={other.id} 
                            className={cn(
                              'flex items-center justify-between px-2 py-1 rounded text-sm',
                              isCrossGroupRival ? 'bg-accent/20 border border-accent/30' : 'bg-background/50'
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">vs</span>
                              <div 
                                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
                                style={{ backgroundColor: other.color }}
                              >
                                {getPlayerAbbr(other)}
                              </div>
                              {isCrossGroupRival && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-accent/30 rounded text-accent-foreground">
                                  G{otherGroupIdx + 1}
                                </span>
                              )}
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
            Σ = ${tablaGeneralPlayers.reduce((sum, p) => sum + getPlayerBalance(p.id, tablaGeneralGroupOnlySummaries) + getCarritosBalanceForPlayer(p.id), 0)} 
            <span className="ml-1">(debe ser $0)</span>
          </div>
        </CardContent>
      </Card>

      {/* Balance vs */}
      <Card>
        <CardHeader className="py-3 space-y-2">
          <CardTitle className="text-sm flex items-center gap-2 min-w-0">
            <span className="text-muted-foreground">Balance de</span>
            <span className="font-bold truncate">{basePlayer?.name || '—'}</span>
            <span className="text-muted-foreground">vs:</span>
          </CardTitle>

          {/* Show group indicator when in 'all' mode */}
          {tablaGeneralMode === 'all' && hasMultipleGroups && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>
                Grupo {tablaGeneralSelectedGroup + 1}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-[10px] text-muted-foreground shrink-0">Base:</span>
            {balanceVsPlayers.map((p) => {
              const isActive = p.id === basePlayer?.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setBalanceBasePlayerId(p.id);
                    setSelectedRival(null);
                  }}
                  className={cn(
                    'shrink-0 rounded-full transition-all',
                    isActive ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'opacity-80 hover:opacity-100'
                  )}
                  aria-pressed={isActive}
                >
                  <PlayerAvatar initials={p.initials} background={p.color} size="md" className="w-9 h-9 text-sm" />
                </button>
              );
            })}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="flex flex-wrap gap-2 justify-center">
            {rivals.map(rival => {
              const balance = getRivalBalance(rival.id);
              const isSelected = selectedRival === rival.id;
              const pairHandicap = getBilateralHandicap(basePlayer?.id || '', rival.id);
              const hasOverride = !!pairHandicap;
              const isCrossGroup = getCrossGroupRivalsForBase(basePlayer?.id).includes(rival.id);
              return (
                <div key={rival.id} className="relative">
                  <button
                    onClick={() => setSelectedRival(isSelected ? null : rival.id)}
                    className={cn(
                      'flex flex-col items-center p-3 rounded-xl transition-all min-w-[70px] relative',
                      isSelected 
                        ? 'bg-primary text-primary-foreground shadow-lg scale-105' 
                        : 'bg-muted/50 hover:bg-muted',
                      isCrossGroup && 'ring-2 ring-accent ring-offset-1 ring-offset-background'
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
                  {/* Remove cross-group rival button */}
                  {isCrossGroup && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCrossGroupRivalsForBase(prev => prev.filter(id => id !== rival.id));
                        if (selectedRival === rival.id) setSelectedRival(null);
                      }}
                      className="absolute -top-1.5 -left-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-xs hover:bg-destructive/80"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
            
            {/* Add cross-group player button */}
            {availableCrossGroupPlayers.length > 0 && (
              <Dialog open={showCrossGroupPicker} onOpenChange={setShowCrossGroupPicker}>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="flex flex-col items-center p-3 rounded-xl transition-all min-w-[70px] bg-muted/30 hover:bg-muted/50 border-2 border-dashed border-muted-foreground/30"
                  >
                    <div className="w-14 h-14 rounded-full flex items-center justify-center bg-muted/50 mb-1">
                      <UserPlus className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <span className="text-xs text-muted-foreground">Otro Grupo</span>
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle className="text-base">Agregar Jugadores de Otros Grupos</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {playerGroups.map((group, groupIdx) => (
                      <div key={group.id} className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {group.name}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {group.players.map(player => {
                            const isAdded = getCrossGroupRivalsForBase(balanceBasePlayerId).includes(player.id);
                            return (
                              <button
                                key={player.id}
                                type="button"
                                onClick={() => {
                                  if (isAdded) {
                                    setCrossGroupRivalsForBase(prev => prev.filter(id => id !== player.id));
                                  } else {
                                    setCrossGroupRivalsForBase(prev => [...prev, player.id]);
                                  }
                                }}
                                className={cn(
                                  'flex items-center gap-2 px-3 py-2 rounded-lg transition-all',
                                  isAdded 
                                    ? 'bg-primary text-primary-foreground' 
                                    : 'bg-muted hover:bg-muted/80'
                                )}
                              >
                                <PlayerAvatar 
                                  initials={player.initials} 
                                  background={isAdded ? 'rgba(255,255,255,0.2)' : player.color} 
                                  size="sm" 
                                />
                                <span className="text-sm font-medium">{player.name.split(' ')[0]}</span>
                                {isAdded && <Check className="h-4 w-4" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {playerGroups.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No hay otros grupos de juego
                      </p>
                    )}
                  </div>
                  <Button 
                    onClick={() => setShowCrossGroupPicker(false)}
                    className="w-full mt-2"
                  >
                    Listo
                  </Button>
                </DialogContent>
              </Dialog>
            )}
          </div>
          
          {/* Cross-group players info */}
          {selectedCrossGroupPlayers.length > 0 && (
            <div className="text-xs text-muted-foreground text-center">
              <Users className="h-3 w-3 inline mr-1" />
              {selectedCrossGroupPlayers.length} jugador(es) de otros grupos
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Bilateral Detail View */}
      {selectedRival && basePlayer && rivals.find(p => p.id === selectedRival) && (
        <BilateralDetail
          players={players}
          player={basePlayer}
          rival={rivals.find(p => p.id === selectedRival)!}
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
    scoringType: 'lowBall' | 'highBall' | 'combined' | 'all';
    netByHoleFront: Array<number | null>;
    netByHoleBack: Array<number | null>;
    holeDetailsFront: Array<{
      holeNumber: number;
      grossA1: number;
      hcpA1: number;
      netA1: number;
      grossA2: number;
      hcpA2: number;
      netA2: number;
      grossB1: number;
      hcpB1: number;
      netB1: number;
      grossB2: number;
      hcpB2: number;
      netB2: number;
      lowBallWinner?: 'A' | 'B' | 'tie';
      highBallWinner?: 'A' | 'B' | 'tie';
      combinedWinner?: 'A' | 'B' | 'tie';
      pointsA: number;
      pointsB: number;
    } | null>;
    holeDetailsBack: Array<{
      holeNumber: number;
      grossA1: number;
      hcpA1: number;
      netA1: number;
      grossA2: number;
      hcpA2: number;
      netA2: number;
      grossB1: number;
      hcpB1: number;
      netB1: number;
      grossB2: number;
      hcpB2: number;
      netB2: number;
      lowBallWinner?: 'A' | 'B' | 'tie';
      highBallWinner?: 'A' | 'B' | 'tie';
      combinedWinner?: 'A' | 'B' | 'tie';
      pointsA: number;
      pointsB: number;
    } | null>;
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
  const isMobile = useIsMobile();
  const [holeDialogOpen, setHoleDialogOpen] = useState(false);
  const [selectedHole, setSelectedHole] = useState<{
    holeNumber: number;
    net: number | null;
    detail:
      | CarritosResultsCardProps['results']['holeDetailsFront'][number]
      | CarritosResultsCardProps['results']['holeDetailsBack'][number];
  } | null>(null);

  const getPlayer = (id: string) => players.find(p => p.id === id);
  const getPlayerAbbr = (player: Player) => player.name.substring(0, 3).toUpperCase();
  const teamAPlayers = [getPlayer(results.teamA[0]), getPlayer(results.teamA[1])].filter(Boolean) as Player[];
  const teamBPlayers = [getPlayer(results.teamB[0]), getPlayer(results.teamB[1])].filter(Boolean) as Player[];

  type Winner = 'A' | 'B' | 'tie';
  const invertWinner = (w?: Winner): Winner | undefined => {
    if (!w) return undefined;
    if (w === 'tie') return 'tie';
    return w === 'A' ? 'B' : 'A';
  };
  
  const isBaseInTeamA = results.teamA.includes(basePlayerId || '');
  const displayTeamAPlayers = isBaseInTeamA ? teamAPlayers : teamBPlayers;
  const displayTeamBPlayers = isBaseInTeamA ? teamBPlayers : teamAPlayers;

  const baseTeamMoney = isBaseInTeamA ? results.moneyA : results.moneyB;
  const baseTeamNetFront = isBaseInTeamA ? (results.pointsAFront - results.pointsBFront) : (results.pointsBFront - results.pointsAFront);
  const baseTeamNetBack = isBaseInTeamA ? (results.pointsABack - results.pointsBBack) : (results.pointsBBack - results.pointsABack);
  const baseTeamNetTotal = isBaseInTeamA ? (results.pointsATotal - results.pointsBTotal) : (results.pointsBTotal - results.pointsATotal);

  const baseNetByHoleFront = isBaseInTeamA ? results.netByHoleFront : results.netByHoleFront.map(v => (v === null ? null : -v));
  const baseNetByHoleBack = isBaseInTeamA ? results.netByHoleBack : results.netByHoleBack.map(v => (v === null ? null : -v));

  const baseHoleDetailsFront = isBaseInTeamA
    ? results.holeDetailsFront
    : results.holeDetailsFront.map((d) => {
        if (!d) return null;
        return {
          ...d,
          // swap teams for display
          grossA1: d.grossB1,
          hcpA1: d.hcpB1,
          netA1: d.netB1,
          grossA2: d.grossB2,
          hcpA2: d.hcpB2,
          netA2: d.netB2,
          grossB1: d.grossA1,
          hcpB1: d.hcpA1,
          netB1: d.netA1,
          grossB2: d.grossA2,
          hcpB2: d.hcpA2,
          netB2: d.netA2,
          lowBallWinner: invertWinner(d.lowBallWinner as Winner | undefined),
          highBallWinner: invertWinner(d.highBallWinner as Winner | undefined),
          combinedWinner: invertWinner(d.combinedWinner as Winner | undefined),
          pointsA: d.pointsB,
          pointsB: d.pointsA,
        };
      });

  const baseHoleDetailsBack = isBaseInTeamA
    ? results.holeDetailsBack
    : results.holeDetailsBack.map((d) => {
        if (!d) return null;
        return {
          ...d,
          grossA1: d.grossB1,
          hcpA1: d.hcpB1,
          netA1: d.netB1,
          grossA2: d.grossB2,
          hcpA2: d.hcpB2,
          netA2: d.netB2,
          grossB1: d.grossA1,
          hcpB1: d.hcpA1,
          netB1: d.netA1,
          grossB2: d.grossA2,
          hcpB2: d.hcpA2,
          netB2: d.netA2,
          lowBallWinner: invertWinner(d.lowBallWinner as Winner | undefined),
          highBallWinner: invertWinner(d.highBallWinner as Winner | undefined),
          combinedWinner: invertWinner(d.combinedWinner as Winner | undefined),
          pointsA: d.pointsB,
          pointsB: d.pointsA,
        };
      });

  const openHoleDetail = (
    holeNumber: number,
    net: number | null,
    detail: CarritosResultsCardProps['results']['holeDetailsFront'][number] | CarritosResultsCardProps['results']['holeDetailsBack'][number]
  ) => {
    setSelectedHole({ holeNumber, net, detail });
    setHoleDialogOpen(true);
  };

  const ScoreLine = ({ name, hcp, net }: { name: string; hcp: number; net: number }) => (
    <p className="flex items-center justify-between gap-2 text-sm">
      <span className="truncate">{name}</span>
      <span className="flex items-center gap-2 tabular-nums">
        <span>{net}</span>
        {hcp > 0 && <span className="h-2 w-2 rounded-full bg-foreground" aria-label="Stroke aplicado" />}
      </span>
    </p>
  );

  const getNetTone = (n: number) => (n > 0 ? 'text-primary' : n < 0 ? 'text-destructive' : 'text-muted-foreground');
  const getNetPill = (n: number) => (n > 0 ? 'border-primary/40 text-primary' : n < 0 ? 'border-destructive/40 text-destructive' : 'border-border text-muted-foreground');

  const getWinnerText = (w?: Winner) => {
    if (!w) return '—';
    if (w === 'tie') return 'Empate';
    return w === 'A' ? 'A' : 'B';
  };

  const scoringLabel = results.scoringType === 'all'
    ? 'LowBall + HighBall + Suma'
    : results.scoringType === 'lowBall'
      ? 'LowBall'
      : results.scoringType === 'highBall'
        ? 'HighBall'
        : 'Suma';
  
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
      <CardContent className="pt-0">
        <Collapsible>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium min-w-0">
                <span className="truncate">
                  {displayTeamAPlayers.map((p) => getPlayerAbbr(p)).join('/')}
                  {'  vs  '}
                  {displayTeamBPlayers.map((p) => getPlayerAbbr(p)).join('/')}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground truncate">
                {scoringLabel}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[11px] tabular-nums">
                  <span className={cn('font-semibold', getNetTone(baseTeamNetFront))}>F9 {baseTeamNetFront >= 0 ? '+' : ''}{baseTeamNetFront}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span className={cn('font-semibold', getNetTone(baseTeamNetBack))}>B9 {baseTeamNetBack >= 0 ? '+' : ''}{baseTeamNetBack}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span className={cn('font-bold', getNetTone(baseTeamNetTotal))}>T {baseTeamNetTotal >= 0 ? '+' : ''}{baseTeamNetTotal}</span>
                </div>
                 <div className={cn('text-sm font-bold tabular-nums', getNetTone(baseTeamMoney))}>
                  {baseTeamMoney >= 0 ? '+' : ''}${baseTeamMoney}
                </div>
              </div>

              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <ChevronDown className="h-4 w-4" />
                  <span className="sr-only">Ver detalle</span>
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>

          <CollapsibleContent className="mt-3 space-y-3">
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
            
            {/* Puntos por hoyo */}
            <div className="bg-muted/30 rounded-lg p-2 space-y-2">
              <div className="text-[10px] text-muted-foreground text-center">
                Toca/hover en un hoyo para ver el desglose (• = stroke aplicado).
              </div>

          {/* Front 9 */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Front 9</span>
              <span className={cn('text-xs font-bold tabular-nums', getNetTone(baseTeamNetFront))}>
                {baseTeamNetFront >= 0 ? '+' : ''}{baseTeamNetFront} pts
              </span>
            </div>
            <TooltipProvider>
              <div className="grid grid-cols-9 gap-1">
                {baseNetByHoleFront.map((net, idx) => {
                const hole = idx + 1;
                const detail = baseHoleDetailsFront[idx];

                const pill = (
                  <div
                    className={cn(
                      'h-8 rounded border bg-background/60 flex flex-col items-center justify-center',
                      net === null ? 'border-border text-muted-foreground' : getNetPill(net),
                      isMobile ? 'cursor-pointer' : 'cursor-default'
                    )}
                    onClick={isMobile ? () => openHoleDetail(hole, net, detail) : undefined}
                    role={isMobile ? 'button' : undefined}
                    tabIndex={isMobile ? 0 : undefined}
                  >
                    <span className={cn('text-[9px] opacity-80', net === null && 'text-muted-foreground')}>{hole}</span>
                    <span className={cn('text-[11px] font-semibold tabular-nums', net === null && 'text-muted-foreground')}>
                      {net === null ? '–' : net > 0 ? `+${net}` : `${net}`}
                    </span>
                  </div>
                );

                if (isMobile || net === null) return <div key={hole}>{pill}</div>;

                return (
                  <Tooltip key={hole}>
                    <TooltipTrigger asChild>{pill}</TooltipTrigger>
                    <TooltipContent side="top" className="w-80">
                      {!detail ? (
                        <div className="text-xs">
                          <p className="font-medium">Hoyo {hole}</p>
                          <p className="text-muted-foreground">Sin scores confirmados de los 4 jugadores.</p>
                        </div>
                      ) : (
                        <div className="text-xs space-y-1">
                          <p className="font-medium">Hoyo {detail.holeNumber} • {net > 0 ? `+${net}` : `${net}`} pts</p>
                          <div className="grid grid-cols-2 gap-x-3">
                            <div>
                              <p className="text-[10px] text-muted-foreground mb-0.5">Pareja A</p>
                              <ScoreLine name={displayTeamAPlayers[0]?.name.split(' ')[0] ?? 'Jugador'} hcp={detail.hcpA1} net={detail.netA1} />
                              <ScoreLine name={displayTeamAPlayers[1]?.name.split(' ')[0] ?? 'Jugador'} hcp={detail.hcpA2} net={detail.netA2} />
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground mb-0.5">Rival</p>
                              <ScoreLine name={displayTeamBPlayers[0]?.name.split(' ')[0] ?? 'Jugador'} hcp={detail.hcpB1} net={detail.netB1} />
                              <ScoreLine name={displayTeamBPlayers[1]?.name.split(' ')[0] ?? 'Jugador'} hcp={detail.hcpB2} net={detail.netB2} />
                            </div>
                          </div>

                          <div className="pt-1 border-t border-border/50">
                            {(results.scoringType === 'lowBall' || results.scoringType === 'all') && (
                              <p className="flex justify-between">
                                <span>LowBall</span>
                                <span className="tabular-nums">{getWinnerText(detail.lowBallWinner)}</span>
                              </p>
                            )}
                            {(results.scoringType === 'highBall' || results.scoringType === 'all') && (
                              <p className="flex justify-between">
                                <span>HighBall</span>
                                <span className="tabular-nums">{getWinnerText(detail.highBallWinner)}</span>
                              </p>
                            )}
                            {(results.scoringType === 'combined' || results.scoringType === 'all') && (
                              <p className="flex justify-between">
                                <span>Suma</span>
                                <span className="tabular-nums">{getWinnerText(detail.combinedWinner)}</span>
                              </p>
                            )}
                            <p className="flex justify-between font-medium">
                              <span>Puntos (A-B)</span>
                              <span className="tabular-nums">{detail.pointsA} - {detail.pointsB}</span>
                            </p>
                          </div>
                        </div>
                      )}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
              </div>
            </TooltipProvider>
          </div>

          {/* Back 9 */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Back 9</span>
              <span className={cn('text-xs font-bold tabular-nums', getNetTone(baseTeamNetBack))}>
                {baseTeamNetBack >= 0 ? '+' : ''}{baseTeamNetBack} pts
              </span>
            </div>
            <TooltipProvider>
              <div className="grid grid-cols-9 gap-1">
                {baseNetByHoleBack.map((net, idx) => {
                const hole = idx + 10;
                const detail = baseHoleDetailsBack[idx];

                const pill = (
                  <div
                    className={cn(
                      'h-8 rounded border bg-background/60 flex flex-col items-center justify-center',
                      net === null ? 'border-border text-muted-foreground' : getNetPill(net),
                      isMobile ? 'cursor-pointer' : 'cursor-default'
                    )}
                    onClick={isMobile ? () => openHoleDetail(hole, net, detail) : undefined}
                    role={isMobile ? 'button' : undefined}
                    tabIndex={isMobile ? 0 : undefined}
                  >
                    <span className={cn('text-[9px] opacity-80', net === null && 'text-muted-foreground')}>{hole}</span>
                    <span className={cn('text-[11px] font-semibold tabular-nums', net === null && 'text-muted-foreground')}>
                      {net === null ? '–' : net > 0 ? `+${net}` : `${net}`}
                    </span>
                  </div>
                );

                if (isMobile || net === null) return <div key={hole}>{pill}</div>;

                return (
                  <Tooltip key={hole}>
                    <TooltipTrigger asChild>{pill}</TooltipTrigger>
                    <TooltipContent side="top" className="w-80">
                      {!detail ? (
                        <div className="text-xs">
                          <p className="font-medium">Hoyo {hole}</p>
                          <p className="text-muted-foreground">Sin scores confirmados de los 4 jugadores.</p>
                        </div>
                      ) : (
                        <div className="text-xs space-y-1">
                          <p className="font-medium">Hoyo {detail.holeNumber} • {net > 0 ? `+${net}` : `${net}`} pts</p>
                          <div className="grid grid-cols-2 gap-x-3">
                            <div>
                              <p className="text-[10px] text-muted-foreground mb-0.5">Pareja A</p>
                              <ScoreLine name={displayTeamAPlayers[0]?.name.split(' ')[0] ?? 'Jugador'} hcp={detail.hcpA1} net={detail.netA1} />
                              <ScoreLine name={displayTeamAPlayers[1]?.name.split(' ')[0] ?? 'Jugador'} hcp={detail.hcpA2} net={detail.netA2} />
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground mb-0.5">Rival</p>
                              <ScoreLine name={displayTeamBPlayers[0]?.name.split(' ')[0] ?? 'Jugador'} hcp={detail.hcpB1} net={detail.netB1} />
                              <ScoreLine name={displayTeamBPlayers[1]?.name.split(' ')[0] ?? 'Jugador'} hcp={detail.hcpB2} net={detail.netB2} />
                            </div>
                          </div>

                          <div className="pt-1 border-t border-border/50">
                            {(results.scoringType === 'lowBall' || results.scoringType === 'all') && (
                              <p className="flex justify-between">
                                <span>LowBall</span>
                                <span className="tabular-nums">{getWinnerText(detail.lowBallWinner)}</span>
                              </p>
                            )}
                            {(results.scoringType === 'highBall' || results.scoringType === 'all') && (
                              <p className="flex justify-between">
                                <span>HighBall</span>
                                <span className="tabular-nums">{getWinnerText(detail.highBallWinner)}</span>
                              </p>
                            )}
                            {(results.scoringType === 'combined' || results.scoringType === 'all') && (
                              <p className="flex justify-between">
                                <span>Suma</span>
                                <span className="tabular-nums">{getWinnerText(detail.combinedWinner)}</span>
                              </p>
                            )}
                            <p className="flex justify-between font-medium">
                              <span>Puntos (A-B)</span>
                              <span className="tabular-nums">{detail.pointsA} - {detail.pointsB}</span>
                            </p>
                          </div>
                        </div>
                      )}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
              </div>
            </TooltipProvider>
          </div>

              {/* Total */}
              <div className="flex items-center justify-between border-t border-border/50 pt-2">
                <span className="text-xs font-medium">Total 18</span>
                <span className={cn('text-sm font-bold tabular-nums', getNetTone(baseTeamNetTotal))}>
                  {baseTeamNetTotal >= 0 ? '+' : ''}{baseTeamNetTotal} pts
                </span>
              </div>
            </div>

            {/* Modal en móvil para detalle por hoyo */}
            {isMobile && (
              <Dialog open={holeDialogOpen} onOpenChange={setHoleDialogOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>
                      {selectedHole ? `Hoyo ${selectedHole.holeNumber}` : 'Detalle de hoyo'}
                    </DialogTitle>
                  </DialogHeader>

                  {!selectedHole ? null : !selectedHole.detail ? (
                    <div className="text-sm text-muted-foreground">
                      Sin scores confirmados de los 4 jugadores.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-xs text-muted-foreground">
                        Hoyo:{' '}
                        {selectedHole.net === null
                          ? '–'
                          : selectedHole.net > 0
                            ? `+${selectedHole.net}`
                            : `${selectedHole.net}`}{' '}
                        pts
                      </div>

                  <div className="space-y-2">
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1">Pareja A</p>
                      <ScoreLine
                        name={displayTeamAPlayers[0]?.name.split(' ')[0] ?? 'Jugador'}
                        hcp={selectedHole.detail.hcpA1}
                        net={selectedHole.detail.netA1}
                      />
                      <ScoreLine
                        name={displayTeamAPlayers[1]?.name.split(' ')[0] ?? 'Jugador'}
                        hcp={selectedHole.detail.hcpA2}
                        net={selectedHole.detail.netA2}
                      />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1">Rival</p>
                      <ScoreLine
                        name={displayTeamBPlayers[0]?.name.split(' ')[0] ?? 'Jugador'}
                        hcp={selectedHole.detail.hcpB1}
                        net={selectedHole.detail.netB1}
                      />
                      <ScoreLine
                        name={displayTeamBPlayers[1]?.name.split(' ')[0] ?? 'Jugador'}
                        hcp={selectedHole.detail.hcpB2}
                        net={selectedHole.detail.netB2}
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border/50 text-sm">
                    {(results.scoringType === 'lowBall' || results.scoringType === 'all') && (
                      <p className="flex justify-between">
                        <span>LowBall</span>
                        <span className="tabular-nums">{getWinnerText(selectedHole.detail.lowBallWinner as Winner | undefined)}</span>
                      </p>
                    )}
                    {(results.scoringType === 'highBall' || results.scoringType === 'all') && (
                      <p className="flex justify-between">
                        <span>HighBall</span>
                        <span className="tabular-nums">{getWinnerText(selectedHole.detail.highBallWinner as Winner | undefined)}</span>
                      </p>
                    )}
                    {(results.scoringType === 'combined' || results.scoringType === 'all') && (
                      <p className="flex justify-between">
                        <span>Suma</span>
                        <span className="tabular-nums">{getWinnerText(selectedHole.detail.combinedWinner as Winner | undefined)}</span>
                      </p>
                    )}
                    <p className="flex justify-between font-medium pt-1">
                      <span>Puntos (A-B)</span>
                      <span className="tabular-nums">{selectedHole.detail.pointsA} - {selectedHole.detail.pointsB}</span>
                    </p>
                  </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            )}

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
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
};

// Bilateral Detail Component - Reorganized with bet type rows and override capability
interface BilateralDetailProps {
  players: Player[];
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
  players,
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

  // Get bet override for this pair (stored as a label substring; bet engine matches via "includes")
  const getBetOverride = (overrideLabel: string): BetOverride | undefined => {
    return betConfig.betOverrides?.find(
      (o) =>
        o.betType === overrideLabel &&
        ((o.playerAId === player.id && o.playerBId === rival.id) ||
          (o.playerAId === rival.id && o.playerBId === player.id))
    );
  };

  // Update bet override
  const updateBetOverride = (overrideLabel: string, updates: Partial<BetOverride>) => {
    if (!onBetConfigChange) return;
    
    const overrides = [...(betConfig.betOverrides || [])];
    const existingIdx = overrides.findIndex(
      o => o.betType === overrideLabel && 
      ((o.playerAId === player.id && o.playerBId === rival.id) ||
       (o.playerAId === rival.id && o.playerBId === player.id))
    );

    if (existingIdx >= 0) {
      overrides[existingIdx] = { ...overrides[existingIdx], ...updates };
    } else {
      overrides.push({
        playerAId: player.id,
        playerBId: rival.id,
        betType: overrideLabel,
        enabled: true,
        ...updates,
      });
    }

    onBetConfigChange({ ...betConfig, betOverrides: overrides });
  };

  // Toggle bet enabled/disabled
  const toggleBetEnabled = (overrideLabel: string, enabled: boolean) => {
    updateBetOverride(overrideLabel, { enabled });
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
      // overrideLabel is the persisted key used by betOverrides. Optional because some rows are informational.
      segments: { label: string; key: string; overrideLabel?: string }[];
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
          { label: 'Front 9', key: 'medal_front', overrideLabel: 'Medal Front 9' },
          { label: 'Back 9', key: 'medal_back', overrideLabel: 'Medal Back 9' },
          { label: 'Total 18', key: 'medal_total', overrideLabel: 'Medal Total' },
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
          // NOTE: override labels MUST match calculatePressureBets() betType strings (Spanish).
          { label: 'Front 9', key: 'pressure_front', overrideLabel: 'Presiones Front' },
          // Matches both "Presiones Back" and "Presiones Back (Carry x2+Match)" via includes().
          { label: 'Back 9', key: 'pressure_back', overrideLabel: 'Presiones Back' },
          { label: 'Total 18', key: 'pressure_total', overrideLabel: 'Presiones Match 18' },
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
          { label: 'Front 9', key: 'skins_front', overrideLabel: 'Skins Front' },
          { label: 'Back 9', key: 'skins_back', overrideLabel: 'Skins Back' },
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
    
    // Medal General (Group bet shown in bilateral view) - only after the round is complete (all players 18 confirmed)
    const allPlayersComplete = Array.from({ length: 18 }, (_, i) => i + 1).every((h) => {
      return players.every((p) => {
        const pScores = confirmedScores.get(p.id) || [];
        return pScores.some((s) => s.holeNumber === h);
      });
    });
    
    if (betConfig.medalGeneral?.enabled && allPlayersComplete) {
      const medalResult = getMedalGeneralBilateralResult(players, player, rival, confirmedScores, betConfig, course);
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
  }, [betConfig, groupedSummaries, confirmedScores, players, player.id, rival.id, allScores, course.holes]);
  
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
                        
                        const showSkinsShoe =
                          group.key === 'skins' &&
                          typeof data.description === 'string' &&
                          data.description.includes('🥾');

                        return (
                          <div key={segment.key} className="relative flex items-center justify-between px-4 py-2 pl-10 bg-background/50">
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
                            <span
                              className={cn(
                                'text-sm font-bold min-w-[50px] text-right',
                                data.amount > 0
                                  ? 'text-green-500'
                                  : data.amount < 0
                                    ? 'text-destructive'
                                    : 'text-muted-foreground'
                              )}
                            >
                              {isPressureEven ? 'Even' : `${data.amount >= 0 ? '+' : ''}$${data.amount}`}
                            </span>

                            {showSkinsShoe && (
                              <span
                                className="pointer-events-none absolute left-[62%] top-1/2 -translate-x-1/2 -translate-y-1/2 text-xl leading-none"
                                aria-hidden="true"
                              >
                                🥾
                              </span>
                            )}
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
            initialValues={(() => {
              const byLabel = (label: string) => getBetOverride(label)?.amountOverride;

              switch (editingBetType) {
                case 'medal':
                  return {
                    front: byLabel('Medal Front 9') ?? betConfig.medal.frontAmount,
                    back: byLabel('Medal Back 9') ?? betConfig.medal.backAmount,
                    total: byLabel('Medal Total') ?? betConfig.medal.totalAmount,
                  };
                case 'pressures':
                  return {
                    front: byLabel('Presiones Front') ?? betConfig.pressures.frontAmount,
                    back: byLabel('Presiones Back') ?? betConfig.pressures.backAmount,
                    total: byLabel('Presiones Match 18') ?? betConfig.pressures.totalAmount,
                  };
                case 'skins':
                  return {
                    front: byLabel('Skins Front') ?? betConfig.skins.frontValue,
                    back: byLabel('Skins Back') ?? betConfig.skins.backValue,
                  };
                case 'caros':
                  return {
                    total: byLabel('Caros') ?? betConfig.caros.amount,
                  };
                case 'rayas':
                  return {
                    front: byLabel('Rayas Front') ?? (betConfig.rayas?.frontValue || 25),
                    back: byLabel('Rayas Back') ?? (betConfig.rayas?.backValue || 25),
                    total: byLabel('Rayas Medal') ?? (betConfig.rayas?.medalTotalValue || 50),
                  };
                default:
                  return undefined;
              }
            })()}
            betConfig={betConfig}
            onSave={(overrides) => {
              if (!editingBetType || !onBetConfigChange) return;

              // IMPORTANT: amounts edited here must be per-pair.
              // We persist them as BetOverrides (playerAId/playerBId + betType label substring)
              // so they don't affect other pairs.
              const nextOverrides = [...(betConfig.betOverrides || [])];
              const upsert = (betTypeLabel: string, amountOverride?: number) => {
                if (amountOverride === undefined) return;

                const existingIdx = nextOverrides.findIndex(
                  (o) =>
                    o.betType === betTypeLabel &&
                    ((o.playerAId === player.id && o.playerBId === rival.id) ||
                      (o.playerAId === rival.id && o.playerBId === player.id))
                );

                if (existingIdx >= 0) {
                  nextOverrides[existingIdx] = {
                    ...nextOverrides[existingIdx],
                    enabled: true,
                    amountOverride,
                  };
                } else {
                  nextOverrides.push({
                    playerAId: player.id,
                    playerBId: rival.id,
                    betType: betTypeLabel,
                    enabled: true,
                    amountOverride,
                  });
                }
              };

              switch (editingBetType) {
                case 'medal':
                  upsert('Medal Front 9', overrides.front);
                  upsert('Medal Back 9', overrides.back);
                  upsert('Medal Total', overrides.total);
                  break;
                case 'pressures':
                  // IMPORTANT: must match betType strings produced by calculatePressureBets()
                  // so overrides actually apply.
                  upsert('Presiones Front', overrides.front);
                  upsert('Presiones Back', overrides.back);
                  upsert('Presiones Match 18', overrides.total);
                  break;
                case 'skins':
                  // Bet engine uses "Skins Front" / "Skins Back" labels.
                  upsert('Skins Front', overrides.front);
                  upsert('Skins Back', overrides.back);
                  break;
                case 'rayas':
                  upsert('Rayas Front', overrides.front);
                  upsert('Rayas Back', overrides.back);
                  upsert('Rayas Medal', overrides.total);
                  break;
                case 'caros':
                  upsert('Caros', overrides.total);
                  break;
                case 'oyeses':
                  // Engine uses per-hole labels like "Oyes (Hole X)".
                  upsert('Oyes', overrides.total);
                  break;
                case 'units':
                  upsert('Unidades', overrides.total);
                  break;
                case 'manchas':
                  upsert('Manchas', overrides.total);
                  break;
                case 'culebras':
                  upsert('Culebras', overrides.total);
                  break;
                case 'pinguinos':
                  upsert('Pinguinos', overrides.total);
                  break;
              }

              onBetConfigChange({ ...betConfig, betOverrides: nextOverrides });
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
  initialValues?: { front?: number; back?: number; total?: number };
  betConfig: BetConfig;
  onSave: (overrides: { front?: number; back?: number; total?: number }) => void;
  onClose: () => void;
}

const BetAmountEditor: React.FC<BetAmountEditorProps> = ({
  betType,
  initialValues,
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
  const [frontAmount, setFrontAmount] = useState(initialValues?.front ?? segmentConfig.front ?? 0);
  const [backAmount, setBackAmount] = useState(initialValues?.back ?? segmentConfig.back ?? 0);
  const [totalAmount, setTotalAmount] = useState(initialValues?.total ?? segmentConfig.total ?? 0);

  // When switching bet type (or reopening dialog), rehydrate from the per-pair overrides.
  React.useEffect(() => {
    setFrontAmount(initialValues?.front ?? segmentConfig.front ?? 0);
    setBackAmount(initialValues?.back ?? segmentConfig.back ?? 0);
    setTotalAmount(initialValues?.total ?? segmentConfig.total ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [betType]);

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