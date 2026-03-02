// Complete Bet Dashboard - reorganized with bet type rows and bet override capability
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSlidingPersistence } from '@/hooks/useSlidingPersistence';
import { cn } from '@/lib/utils';
import { Player, PlayerScore, BetConfig, GolfCourse, MarkerState, markerInfo, BetOverride, CarritosTeamBet, BilateralHandicap, PlayerGroup } from '@/types/golf';
import { SnapshotPlayerBalance, SnapshotLedgerEntry, SnapshotPairBreakdowns, SnapshotPairSegmentResults, snapshotLedgerToBetSummaries } from '@/lib/roundSnapshot';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { resolveConfigForGroup } from '@/lib/groupBetOverrides';
import { 
  calculateAllBets, 
  getPlayerBalance, 
  getBilateralBalance,
  groupSummariesByType,
  BetSummary,
  getPressureEvolution,
  getSkinsEvolution,
} from '@/lib/betCalculations';
import { getCrossGroupPairBalance, isCrossGroupPairInMap } from '@/lib/crossGroupBalance';
import { getOyesesDisplayData, getOyesesPairResult } from '@/lib/oyesesCalculations';
import { getRayasDetailForPair, RayasPairResult, isRayasActiveForPair, getSkinVariantConflict, getPairKey, RayaDetail } from '@/lib/rayasCalculations';
import { RayasSegmentPopover } from './RayasSegmentPopover';
import { calculateConejaBets } from '@/lib/conejaCalculations';
import { detectScoreBasedMarkers } from '@/lib/scoreDetection';
import { GroupBetsCard, getMedalGeneralBilateralResult, getStablefordBilateralResult } from './GroupBetsCard';
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
  CheckCircle,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useIsMobile } from '@/hooks/use-mobile';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { formatPlayerName, disambiguateInitials, disambiguateShortNames } from '@/lib/playerInput';

// BilateralHandicap is now imported from types/golf.ts

interface BetDashboardProps {
  players: Player[];
  scores: Map<string, PlayerScore[]>;
  betConfig: BetConfig;
  course: GolfCourse;
  basePlayerId?: string;
  confirmedHoles?: Set<number>;
  onBetConfigChange?: (config: BetConfig) => void;
  onBetSummariesChange?: (summaries: BetSummary[]) => void;
  startingHole?: 1 | 10;
  playerGroups?: PlayerGroup[];
  getStrokesForLocalPair?: (localIdA: string, localIdB: string) => number;
  setStrokesForLocalPair?: (localIdA: string, localIdB: string, strokes: number) => Promise<boolean>;
  getBilateralHandicapsForEngine?: () => BilateralHandicap[];
  snapshotBalances?: SnapshotPlayerBalance[];
  snapshotLedger?: SnapshotLedgerEntry[];
  snapshotPairBreakdowns?: SnapshotPairBreakdowns;
  snapshotPairSegmentResults?: SnapshotPairSegmentResults;
}

export const BetDashboard: React.FC<BetDashboardProps> = ({
  players,
  scores,
  betConfig,
  course,
  basePlayerId,
  confirmedHoles = new Set(),
  onBetConfigChange,
  onBetSummariesChange,
  startingHole = 1,
  playerGroups = [],
  getStrokesForLocalPair,
  setStrokesForLocalPair,
  getBilateralHandicapsForEngine,
  snapshotBalances,
  snapshotLedger,
  snapshotPairBreakdowns,
  snapshotPairSegmentResults,
}) => {
  const [selectedRival, setSelectedRival] = useState<string | null>(null);
  const [expandedTypes, setExpandedTypes] = useState<string[]>([]);
  const [expandedLeaderboard, setExpandedLeaderboard] = useState<string | null>(null);
  const [balanceBasePlayerId, setBalanceBasePlayerId] = useState<string | null>(null);
  const [showCrossGroupPicker, setShowCrossGroupPicker] = useState(false);
  const [displayGroupIndex, setDisplayGroupIndex] = useState(0); // For group selector in detail view
  
  // Tabla General view mode: 'group' = show selected group only, 'all' = show all groups combined
  const [tablaGeneralMode, setTablaGeneralMode] = useState<'group' | 'all'>('group');
  
  // Cross-group rivals are now stored in betConfig as a per-player map
  // Structure: { [basePlayerId]: string[] } - each player has their own exclusive selections
  const crossGroupRivalsMap = betConfig.crossGroupRivals || {};
  
  // Get cross-group rivals for the current base player only
  const getCrossGroupRivalsForBase = (baseId: string | null | undefined): string[] => {
    if (!baseId) return [];
    return crossGroupRivalsMap[baseId] || [];
  };
  
  // Set cross-group rivals for current base player (with reciprocity)
  const setCrossGroupRivalsForBase = (updater: string[] | ((prev: string[]) => string[])) => {
    if (!onBetConfigChange || !balanceBasePlayerId) return;
    const currentRivals = getCrossGroupRivalsForBase(balanceBasePlayerId);
    const newRivals = typeof updater === 'function' ? updater(currentRivals) : updater;
    
    // Build updated map with base player's new rivals
    const updatedMap = { 
      ...crossGroupRivalsMap, 
      [balanceBasePlayerId]: newRivals 
    };
    
    // Apply reciprocity: if adding a rival, also add base to that rival's list
    // If removing a rival, also remove base from that rival's list
    const addedRivals = newRivals.filter(id => !currentRivals.includes(id));
    const removedRivals = currentRivals.filter(id => !newRivals.includes(id));
    
    addedRivals.forEach(rivalId => {
      const rivalCurrentList = updatedMap[rivalId] || [];
      if (!rivalCurrentList.includes(balanceBasePlayerId)) {
        updatedMap[rivalId] = [...rivalCurrentList, balanceBasePlayerId];
      }
    });
    
    removedRivals.forEach(rivalId => {
      const rivalCurrentList = updatedMap[rivalId] || [];
      updatedMap[rivalId] = rivalCurrentList.filter(id => id !== balanceBasePlayerId);
    });
    
    onBetConfigChange({ 
      ...betConfig, 
      crossGroupRivals: updatedMap 
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
  // CRITICAL: This must be relative to the currently selected group (displayGroupIndex),
  // NOT hardcoded to exclude only Group 1. When viewing from Group 2, Group 1 players ARE "other group".
  const otherGroupPlayers = useMemo(() => {
    const all = getAllPlayersFromAllGroups(players, playerGroups);
    const currentGroupPlayers = getPlayersForGroup(displayGroupIndex, players, playerGroups);
    const currentIds = new Set(currentGroupPlayers.map((p) => p.id));
    return all.filter((p) => !currentIds.has(p.id));
  }, [players, playerGroups, displayGroupIndex]);

  // All players across all groups (for calculations). Important: must NOT depend on the selected base player.
  const allPlayersForCalculations = useMemo(() => {
    return getAllPlayersFromAllGroups(players, playerGroups);
  }, [players, playerGroups]);

  // Merge bilateral handicaps from matrix (source of truth) with betConfig
  const effectiveBetConfig = useMemo(() => {
    const matrixHandicaps = getBilateralHandicapsForEngine?.() ?? [];
    // If we have matrix handicaps, use them; otherwise fall back to betConfig
    return {
      ...betConfig,
      bilateralHandicaps: matrixHandicaps.length > 0 ? matrixHandicaps : betConfig.bilateralHandicaps,
    };
  }, [betConfig, getBilateralHandicapsForEngine]);

  // When snapshot ledger is available (historical view), derive bet summaries from it
  // instead of recalculating with the engine. This is the single source of truth.
  const isHistorical = !!snapshotLedger && !!snapshotBalances;

  // Calculate all bets using only confirmed scores (all groups). UI will filter per mode.
  const liveBetSummaries = useMemo(
    () => isHistorical ? [] : calculateAllBets(allPlayersForCalculations, confirmedScores, effectiveBetConfig, course, startingHole, confirmedHoles),
    [allPlayersForCalculations, confirmedScores, effectiveBetConfig, course, startingHole, confirmedHoles, isHistorical]
  );

  // Calculate cross-group bet summaries for all active cross-group pairs.
  // These pairs span different groups so the main engine (which iterates per-group) never
  // computes them. We synthesize a temporary 2-player same-group context for each pair,
  // using the bilateral strokes stored in round_handicaps via getStrokesForLocalPair.
  const crossGroupBetSummaries = useMemo((): BetSummary[] => {
    if (isHistorical || !getStrokesForLocalPair) return [];

    const summaries: BetSummary[] = [];
    const processedPairs = new Set<string>(); // Avoid double-processing (A-B and B-A)

    // Iterate all cross-group rival pairs from the config map
    Object.entries(crossGroupRivalsMap).forEach(([baseId, rivalIds]) => {
      const ids = Array.isArray(rivalIds) ? rivalIds : [];
      (ids as string[]).forEach((rivalId) => {
        // Canonical pair key (sorted) to avoid duplication
        const pairKey = [baseId, rivalId].sort().join('|');
        if (processedPairs.has(pairKey)) return;
        processedPairs.add(pairKey);

        const playerA = allPlayersForCalculations.find(p => p.id === baseId);
        const playerB = allPlayersForCalculations.find(p => p.id === rivalId);
        if (!playerA || !playerB) return;

        // Skip if they are in the same group (already handled by main engine)
        if (playerA.groupId && playerB.groupId && playerA.groupId === playerB.groupId) return;

        // Build bilateral handicap for this pair from round_handicaps
        // getStrokesForLocalPair(A, B) = strokes A gives to B (positive = A gives, negative = B gives)
        const strokesAGivesB = getStrokesForLocalPair(playerA.id, playerB.id);

        // Derive absolute handicaps for the engine: the player who RECEIVES has handicap = |strokes|
        const handicapA = strokesAGivesB < 0 ? Math.abs(strokesAGivesB) : 0;
        const handicapB = strokesAGivesB > 0 ? strokesAGivesB : 0;

        const crossGroupBilateral: BilateralHandicap = {
          playerAId: playerA.id,
          playerBId: playerB.id,
          playerAHandicap: handicapA,
          playerBHandicap: handicapB,
        };

        // Synthesize a 2-player same-group context so the engine processes this pair
        // Give them a temporary shared groupId to bypass intra-group filtering
        const tempGroupId = `__xg_${pairKey}`;
        const syntheticPlayerA: Player = { ...playerA, groupId: tempGroupId };
        const syntheticPlayerB: Player = { ...playerB, groupId: tempGroupId };

        // Build a minimal bet config for this cross-group pair:
        // - Only this pair's bilateral handicap (isolated, no G1 matrix noise)
        // - No betOverrides from other intra-group pairs (they would wrongly alter amounts)
        // - participantIds cleared so the engine always includes both cross-group players
        // - Group-scoped bets disabled (Culebras, Pinguinos, Manchas, Zoologico, Coneja)
        const crossGroupConfig: BetConfig = {
          ...effectiveBetConfig,
          // CRITICAL: Only use THIS pair's bilateral handicap — exclude all intra-group
          // handicaps so the engine doesn't accidentally find another handicap record
          // for one of these players and compute wrong net scores.
          bilateralHandicaps: [crossGroupBilateral],
          // CRITICAL: Clear all betOverrides — intra-group overrides from G1 must NOT
          // be applied to cross-group calculations. They have different playerAId/playerBId
          // but the betType matching can still produce wrong amount multiplications.
          betOverrides: [],
          // Clear groupBetOverrides so group-specific config doesn't interfere
          groupBetOverrides: {},
          // Clear participantIds so both cross-group players are always included.
          // CRITICAL: Use `undefined` (not `[]`), because `[]` means "nobody participates"
          // in resolveParticipantsForGroup, while `undefined` means "everyone participates".
          medal: { ...effectiveBetConfig.medal, participantIds: undefined },
          pressures: { ...effectiveBetConfig.pressures, participantIds: undefined },
          skins: { ...effectiveBetConfig.skins, participantIds: undefined },
          caros: { ...effectiveBetConfig.caros, participantIds: undefined },
          units: { ...effectiveBetConfig.units, participantIds: undefined },
          putts: { ...effectiveBetConfig.putts, participantIds: undefined },
          stableford: { ...effectiveBetConfig.stableford, participantIds: undefined },
          medalGeneral: { ...effectiveBetConfig.medalGeneral, participantIds: undefined },
          // Disable group-scoped bets for cross-group pairs
          manchas: { ...effectiveBetConfig.manchas, enabled: false },
          culebras: { ...effectiveBetConfig.culebras, enabled: false },
          pinguinos: { ...effectiveBetConfig.pinguinos, enabled: false },
          zoologico: { ...effectiveBetConfig.zoologico, enabled: false },
          coneja: { ...effectiveBetConfig.coneja, enabled: false },
          // Disable Oyes and Rayas for cross-group (too complex for now)
          oyeses: { ...effectiveBetConfig.oyeses, enabled: false },
          rayas: { ...effectiveBetConfig.rayas, enabled: false },
          // Disable Side Bets for cross-group — they are explicit per-player and
          // residual bets from other pairs can contaminate balances.
          sideBets: { bets: [], enabled: false },
        };

        const pairSummaries = calculateAllBets(
          [syntheticPlayerA, syntheticPlayerB],
          confirmedScores,
          crossGroupConfig,
          course,
          startingHole,
          confirmedHoles
        );

        // Map synthetic IDs back to real IDs (they're the same, groupId is the only change)
        pairSummaries.forEach(s => {
          summaries.push({
            ...s,
            playerId: s.playerId === syntheticPlayerA.id ? playerA.id : playerB.id,
            vsPlayer: s.vsPlayer === syntheticPlayerA.id ? playerA.id : playerB.id,
          });
        });
      });
    });

    return summaries;
  }, [isHistorical, crossGroupRivalsMap, allPlayersForCalculations, getStrokesForLocalPair, effectiveBetConfig, confirmedScores, course, startingHole, confirmedHoles]);

  // CRITICAL: Filter out Carritos from liveBetSummaries because they are computed
  // separately by the BetDashboard (allCarritosResults → carritosSummaries) with
  // refined logic (respects disabledTeamBetIds). Without this filter, carritos would
  // be double-counted in onBetSummariesChange emission, causing engine vs UI
  // discrepancy at closure time (e.g., $100 delta per affected player).
  const carritosEngineTypes = ['Carritos Front', 'Carritos Back', 'Carritos Total'];
  const betSummaries = useMemo(
    () => isHistorical
      ? snapshotLedgerToBetSummaries(snapshotLedger!)
      : [
          ...liveBetSummaries.filter(s => !carritosEngineTypes.includes(s.betType)),
          ...crossGroupBetSummaries,
        ],
    [isHistorical, snapshotLedger, liveBetSummaries, crossGroupBetSummaries]
  );
  
  // NOTE: onBetSummariesChange is called in a single useEffect defined after
  // allCarritosResults (computed below), so that Carritos BetSummaries can be
  // included in the emission. Do not add a separate useEffect for betSummaries here.
  
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

    // Primary carritos - show only if no carritosTeams exist (legacy pattern)
    // When carritosTeams array has entries, all carritos are managed there
    const hasCarritosTeams = (betConfig.carritosTeams?.length ?? 0) > 0;
    if (!hasCarritosTeams && betConfig.carritos.teamA[0] && betConfig.carritos.teamA[1] && betConfig.carritos.teamB[0] && betConfig.carritos.teamB[1]) {
      const { teamA, teamB, frontAmount, backAmount, totalAmount, scoringType, teamHandicaps, useTeamHandicaps } = betConfig.carritos;
      results.push(
        calculateCarritosResult(teamA, teamB, frontAmount, backAmount, totalAmount, scoringType, {
          id: undefined,
          useTeamHandicaps,
          teamHandicaps,
        })
      );
    }

    // Additional carritos teams - show if teams are configured
    betConfig.carritosTeams?.forEach(team => {
      if (team.teamA[0] && team.teamA[1] && team.teamB[0] && team.teamB[1]) {
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

  // Emit combined bet summaries (bilateral + Carritos) to parent so closeScorecard
  // can include ALL bet results in the snapshot ledger. This is the single source of
  // truth that feeds the historical view.
  //
  // Carritos settlement: each player on the losing team pays half the total loss
  // to EACH opponent individually. So vs any one opponent: moneyA / 2.
  // We generate 4 BetSummary entries per Carritos result (one per directional pair
  // between teams), which is exactly what generateRoundSnapshot expects.
  useEffect(() => {
    if (isHistorical) return; // Historical view reads from snapshot – do not re-emit

    const carritosSummaries: BetSummary[] = [];
    allCarritosResults.forEach((result, idx) => {
      const carritosId = result.id || `carritos-${idx}`;
      if ((betConfig.disabledTeamBetIds || []).includes(carritosId)) return;

      const [a1, a2] = result.teamA;
      const [b1, b2] = result.teamB;
      const moneyA = result.moneyA; // Team A net (positive = won)
      const moneyB = result.moneyB; // Team B net (positive = won)

      // Determine Front / Back / Total amounts from betConfig
      const teamCfg = result.id
        ? betConfig.carritosTeams?.find(t => t.id === result.id)
        : betConfig.carritos;
      const frontAmt = teamCfg?.frontAmount ?? 0;
      const backAmt = teamCfg?.backAmount ?? 0;
      const totalAmt = teamCfg?.totalAmount ?? 0;

      // Per-segment amounts from Carritos calculation
      const frontMoneyA = (() => {
        if (result.pointsAFront > result.pointsBFront) return frontAmt;
        if (result.pointsBFront > result.pointsAFront) return -frontAmt;
        return 0;
      })();
      const backMoneyA = (() => {
        if (result.pointsABack > result.pointsBBack) return backAmt;
        if (result.pointsBBack > result.pointsABack) return -backAmt;
        return 0;
      })();
      const totalMoneyA = moneyA - frontMoneyA - backMoneyA;

      const segments: Array<{ label: string; segment: 'front' | 'back' | 'total'; netA: number }> = [
        { label: 'Carritos Front', segment: 'front', netA: frontMoneyA },
        { label: 'Carritos Back', segment: 'back', netA: backMoneyA },
        { label: 'Carritos Total', segment: 'total', netA: totalMoneyA },
      ];

      segments.forEach(({ label, segment, netA }) => {
        if (netA === 0) return;

        // Settlement: each member of the losing team pays half the team loss to EACH winning-team member.
        // netA > 0 means Team A won; Team B members owe Team A members.
        const [winners, losers, netPerTeam] =
          netA > 0
            ? [[a1, a2], [b1, b2], netA]
            : [[b1, b2], [a1, a2], -netA];

        // Each loser pays (netPerTeam / 2) to EACH winner
        const perPair = netPerTeam / 2;

        winners.forEach(winnerId => {
          losers.forEach(loserId => {
            carritosSummaries.push({
              playerId: winnerId,
              vsPlayer: loserId,
              betType: label,
              amount: perPair,
              segment,
              betId: carritosId,
            });
            carritosSummaries.push({
              playerId: loserId,
              vsPlayer: winnerId,
              betType: label,
              amount: -perPair,
              segment,
              betId: carritosId,
            });
          });
        });
      });
    });

    onBetSummariesChange?.([...betSummaries, ...carritosSummaries]);
  }, [betSummaries, allCarritosResults, betConfig.disabledTeamBetIds, betConfig.carritos, betConfig.carritosTeams, isHistorical, onBetSummariesChange]);
  
  // Default base player = logged-in user (via basePlayerId prop), across ALL groups.
  // Critical: must not validate only against `players` (Group 1) or selection breaks for Groups 2/3.
  useEffect(() => {
    if (!allPlayersForCalculations.length) return;

    const defaultBaseId =
      allPlayersForCalculations.find(
        (p) => p.id === basePlayerId || p.profileId === basePlayerId
      )?.id ??
      allPlayersForCalculations[0]?.id ??
      null;

    const isValidSelection =
      !!balanceBasePlayerId &&
      allPlayersForCalculations.some((p) => p.id === balanceBasePlayerId);

    // If nothing selected yet (or selection is no longer valid), reset to default.
    if (!isValidSelection) {
      setBalanceBasePlayerId(defaultBaseId);
      setSelectedRival(null);
    }
  }, [allPlayersForCalculations, basePlayerId, balanceBasePlayerId]);

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
  
  // Get corrected bilateral balance that uses getRayasDetailForPair for Rayas consistency
  // This ensures the Tabla General uses the same Rayas calculation as the BilateralDetail
  // Helper to check if both players participate in a bet (used outside BilateralDetail)
  // Also supports oneVsAll mode: if oneVsAll is active, only the anchor needs to be one of the pair.
  const bothParticipateGlobal = (participantIds: string[] | undefined, playerId: string, rivalId: string, betConfig_?: { oneVsAll?: boolean; anchorPlayerId?: string }): boolean => {
    // oneVsAll mode: pair is valid if either player is the anchor
    if (betConfig_?.oneVsAll && betConfig_?.anchorPlayerId) {
      return playerId === betConfig_.anchorPlayerId || rivalId === betConfig_.anchorPlayerId;
    }
    if (!participantIds) return true; // undefined = all participate by default
    if (participantIds.length === 0) return false; // [] = nobody participates
    const playerIn = participantIds.includes(playerId);
    const rivalIn = participantIds.includes(rivalId);
    if (playerIn && rivalIn) return true;
    
    // Cross-group pairs: if the two players belong to different groups,
    // the cross-group engine already computed them with participantIds cleared.
    // Don't reject them here — their summaries are already in betSummaries.
    const playerObj = allPlayersForCalculations.find(p => p.id === playerId);
    const rivalObj = allPlayersForCalculations.find(p => p.id === rivalId);
    if (playerObj?.groupId && rivalObj?.groupId && playerObj.groupId !== rivalObj.groupId) {
      return true; // Cross-group pair — always pass participation check
    }
    
    // Template inheritance: if no player from the display group is in participantIds, treat as template
    const displayGroupPlayers = getPlayersForGroup(displayGroupIndex, players, playerGroups);
    const anyGroupPlayerInList = displayGroupPlayers.some(p => participantIds.includes(p.id));
    if (!anyGroupPlayerInList) return true;
    return false;
  };

  // IMPORTANT: Also respects betOverrides (cancelled bets) for each pair
  // HISTORICAL MODE: When snapshot data is available, read directly from snapshot balances
  const getCorrectedBilateralBalance = (playerId: string, rivalId: string): number => {

    // Get balance from betSummaries for non-Rayas bets
    const playerObj = allPlayersForCalculations.find(p => p.id === playerId);
    
    // CROSS-GROUP FAST PATH: For cross-group pairs, consume already computed
    // crossGroupBetSummaries but apply the same pair override cancellation logic
    // used by the bilateral header (so icon/header/table always match).
    if (playerObj) {
      // Detect cross-group pair by map (source of truth) and use centralized helper
      // so icon + bilateral header + tabla general share the exact same filtering rules.
      const isCrossGroupPair = isCrossGroupPairInMap(crossGroupRivalsMap, playerId, rivalId);

      if (isCrossGroupPair) {
        return getCrossGroupPairBalance({
          playerId,
          rivalId,
          betSummaries,
          betOverrides: betConfig.betOverrides,
          allPlayersForCalculations,
        });
      }
    }
    const rivalObj = allPlayersForCalculations.find(p => p.id === rivalId);
    
    // Helper to check if a bet is disabled for this pair.
    // IMPORTANT: overrides are stored sometimes as the UI key ("rayas") and sometimes as
    // the engine label ("Rayas"). In addition, some legacy/edge cases store partial labels.
    const isBetDisabledForPair = (betTypeLabel: string, aliases: string[] = []): boolean => {
      // Normalize bet type strings so overrides match regardless of spaces/underscores/case/accents.
      // Examples that should match:
      // - "Medal General" / "medalGeneral" / "medal_general" / "MEDALGENERAL"
      // - "Pingüinos" / "pinguinos"
      const normalizeType = (s: string): string => {
        return (s || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '');
      };

      // Collect all possible IDs for a player (id and profileId)
      const getPlayerIds = (pId: string): Set<string> => {
        const ids = new Set<string>([pId]);
        // Find by id
        const p = allPlayersForCalculations.find(x => x.id === pId);
        if (p?.profileId) ids.add(p.profileId);
        // Find by profileId
        const pByProfile = allPlayersForCalculations.find(x => x.profileId === pId);
        if (pByProfile) ids.add(pByProfile.id);
        return ids;
      };

      // Match player: check if overrideId matches any of the player's possible IDs
      const matchesPlayer = (overrideId: string, pId: string): boolean => {
        const playerIds = getPlayerIds(pId);
        return playerIds.has(overrideId);
      };

      const acceptable = [betTypeLabel, ...aliases]
        .filter(Boolean)
        .map((s) => normalizeType(s));

      const override = betConfig.betOverrides?.find((o) => {
        const type = normalizeType(o.betType || '');

        // IMPORTANT: Avoid cross-cancelling similar bet names.
        // Example bug: cancelling "Medal" was also cancelling "Medal General" because
        // we allowed reverse substring checks (a.includes(type)).
        // Strategy:
        // 1) Prefer EXACT normalized matches.
        // 2) Only if no exact match exists for ANY override type, allow forward substring
        //    matching (type.includes(a)) for legacy stored partial labels.
        const hasAnyExactForThisOverride = acceptable.some((a) => type === a);
        const matchesType = hasAnyExactForThisOverride
          ? true
          : acceptable.some((a) => type.includes(a));
        if (!matchesType) return false;

        const matchesPair =
          (matchesPlayer(o.playerAId, playerId) && matchesPlayer(o.playerBId, rivalId)) ||
          (matchesPlayer(o.playerAId, rivalId) && matchesPlayer(o.playerBId, playerId));

        return matchesPair;
      });

      return override?.enabled === false;
    };
    
    // Sum all bets from betSummaries EXCLUDING:
    // - Rayas: calculated dynamically using getRayasDetailForPair
    // - Medal General: calculated dynamically using getMedalGeneralBilateralResult
    // - Carritos: pair bets shown separately in Tabla General
    // - Presiones Parejas: pair bets shown separately in Tabla General
    // - Any bet type disabled via betOverrides for this pair
    // These exclusions ensure the bilateral balance matches the detail view and
    // separates individual bets from pair bets in the Tabla General.
    const carritosTypes = ['Carritos Front', 'Carritos Back', 'Carritos Total'];
    
    // Map engine betType labels to the override key used by isBetDisabledForPair
    const betTypeToOverrideKey = (betType: string): { label: string; aliases: string[] } => {
      if (betType.startsWith('Medal') && betType !== 'Medal General') return { label: 'Medal', aliases: ['medal'] };
      if (betType.startsWith('Presiones') && betType !== 'Presiones Parejas') return { label: 'Presiones', aliases: ['pressures'] };
      if (betType.startsWith('Skins')) return { label: 'Skins', aliases: ['skins'] };
      if (betType === 'Caros') return { label: 'Caros', aliases: ['caros'] };
      if (betType === 'Oyes') return { label: 'Oyes', aliases: ['oyeses'] };
      if (betType === 'Unidades') return { label: 'Unidades', aliases: ['units'] };
      if (betType === 'Manchas') return { label: 'Manchas', aliases: ['manchas'] };
      if (betType === 'Culebras') return { label: 'Culebras', aliases: ['culebras'] };
      if (betType.includes('Pingüino')) return { label: 'Pingüinos', aliases: ['pinguinos'] };
      if (betType === 'Coneja') return { label: 'Coneja', aliases: ['coneja'] };
      if (betType === 'Putts' || betType.startsWith('Putts')) return { label: 'Putts', aliases: ['putts'] };
      if (betType === 'Side Bet') return { label: 'Side Bet', aliases: ['sideBets', 'sidebets'] };
      if (betType === 'Stableford') return { label: 'Stableford', aliases: ['stableford'] };
      return { label: betType, aliases: [] };
    };

    // HISTORICAL MODE: The snapshot ledger is the single source of truth.
    // Overrides are already baked into the ledger at close time — do NOT re-apply them.
    // Simply sum all ledger-derived betSummaries for this pair.
    if (isHistorical) {
      // IMPORTANT: Exclude Carritos and Presiones Parejas from bilateral avatar/header.
      // Those are shown in their own team cards. The BilateralDetail header (computedTotalBalance)
      // also excludes them (they don't appear in betTypeGroups), so this keeps avatars consistent.
      const historicalCarritosTypes = ['Carritos Front', 'Carritos Back', 'Carritos Total'];
      return betSummaries
        .filter(s =>
          s.playerId === playerId &&
          s.vsPlayer === rivalId &&
          !historicalCarritosTypes.includes(s.betType) &&
          s.betType !== 'Presiones Parejas' &&
          s.betType !== 'Presiones Pareja'
        )
        .reduce((sum, s) => sum + s.amount, 0);
    }

    // Map engine betType labels to the betConfig key for participation checking
    const betTypeToConfigKey = (betType: string): string | null => {
      if (betType.startsWith('Medal') && betType !== 'Medal General') return 'medal';
      if (betType.startsWith('Presiones') && betType !== 'Presiones Parejas') return 'pressures';
      if (betType.startsWith('Skins')) return 'skins';
      if (betType === 'Caros') return 'caros';
      if (betType === 'Oyes') return 'oyeses';
      if (betType === 'Unidades') return 'units';
      if (betType === 'Manchas') return 'manchas';
      if (betType === 'Culebras') return 'culebras';
      if (betType.includes('Pingüino')) return 'pinguinos';
      if (betType === 'Coneja') return 'coneja';
      if (betType === 'Putts' || betType.startsWith('Putts')) return 'putts';
      return null;
    };

    const nonRayasNonMedalGeneralBalance = betSummaries
      .filter(s => 
        s.playerId === playerId && 
        s.vsPlayer === rivalId && 
        !s.betType.startsWith('Rayas') &&
        s.betType !== 'Medal General' &&
        s.betType !== 'Stableford' &&
        s.betType !== 'Presiones Parejas' &&
        !carritosTypes.includes(s.betType)
      )
      .filter(s => {
        // Check if this bet type is disabled via override for this pair
        const { label, aliases } = betTypeToOverrideKey(s.betType);
        return !isBetDisabledForPair(label, aliases);
      })
      .filter(s => {
        // Check if both players participate in this bet type
        const configKey = betTypeToConfigKey(s.betType);
        if (!configKey) return true; // unknown type, include by default
        const betCfg = effectiveBetConfig[configKey as keyof BetConfig] as any;
        if (!betCfg?.participantIds) return true; // undefined = all participate
        if (betCfg.participantIds.length === 0) return false; // [] = nobody
        return bothParticipateGlobal(betCfg.participantIds, playerId, rivalId, betCfg);
      })
      .reduce((sum, s) => sum + s.amount, 0);
    
    // Calculate correct Rayas total using getRayasDetailForPair
    // BUT only if Rayas is not disabled for this pair (via Dashboard override OR bilateral RayasConfig)
    let rayasTotal = 0;
    // Rayas can be stored as "rayas" (UI key) or "Rayas" (engine label)
    const isRayasDisabledByOverride = isBetDisabledForPair('Rayas', ['rayas']);
    const isRayasActiveForThisPair = isRayasActiveForPair(effectiveBetConfig, playerId, rivalId);
    
    if (effectiveBetConfig.rayas?.enabled && playerObj && rivalObj && !isRayasDisabledByOverride && isRayasActiveForThisPair && bothParticipateGlobal(effectiveBetConfig.rayas?.participantIds, playerId, rivalId, effectiveBetConfig.rayas)) {
      const rayasResult = getRayasDetailForPair(
        playerObj,
        rivalObj,
        confirmedScores,
        effectiveBetConfig,
        course,
        effectiveBetConfig.bilateralHandicaps,
        allPlayersForCalculations
      );
      
      // Get Dashboard override amounts for this pair
      const overrides = effectiveBetConfig.betOverrides || [];
      const findOverride = (betType: string): number | undefined => {
        const match = overrides.find(o =>
          o.betType === betType &&
          o.enabled !== false &&
          o.amountOverride !== undefined &&
          ((o.playerAId === playerId && o.playerBId === rivalId) ||
           (o.playerAId === rivalId && o.playerBId === playerId))
        );
        return match?.amountOverride;
      };
      const frontValue = findOverride('Rayas Front') ?? effectiveBetConfig.rayas?.frontValue ?? 0;
      const backValue = findOverride('Rayas Back') ?? effectiveBetConfig.rayas?.backValue ?? 0;
      const medalTotalValue = findOverride('Rayas Medal Total') ?? effectiveBetConfig.rayas?.medalTotalValue ?? 0;
      
      // Count rayas per segment and calculate amounts using override values
      let frontRayas = 0;
      let backRayas = 0;
      let medalTotalRayas = 0;
      rayasResult.details.forEach((d) => {
        if (d.appliedSegment === 'front') frontRayas += d.rayasCount || 0;
        else if (d.appliedSegment === 'back') backRayas += d.rayasCount || 0;
        else if (d.appliedSegment === 'total') medalTotalRayas += d.rayasCount || 0;
      });
      
      rayasTotal = (frontRayas * frontValue) + (backRayas * backValue) + (medalTotalRayas * medalTotalValue);
    }
    
    // Calculate Medal General using the same logic as the detail view
    // This ensures consistency between the Balance vs header and the detail breakdown
    let medalGeneralTotal = 0;
    const isMedalGeneralDisabled = isBetDisabledForPair('Medal General', ['medalGeneral']);
    
    if (betConfig.medalGeneral?.enabled && playerObj && rivalObj && !isMedalGeneralDisabled && bothParticipateGlobal(betConfig.medalGeneral?.participantIds, playerId, rivalId)) {
      const medalResult = getMedalGeneralBilateralResult(
        allPlayersForCalculations,
        playerObj,
        rivalObj,
        confirmedScores,
        betConfig,
        course
      );
      if (medalResult) {
        medalGeneralTotal = medalResult.amount;
      }
    }
    
    // Calculate Stableford using the same pool logic as Medal General (scope-aware)
    let stablefordTotal = 0;
    const isStablefordDisabled = isBetDisabledForPair('Stableford', ['stableford']);
    
    if (betConfig.stableford?.enabled && playerObj && rivalObj && !isStablefordDisabled && bothParticipateGlobal(betConfig.stableford?.participantIds, playerId, rivalId)) {
      const stablefordResult = getStablefordBilateralResult(
        allPlayersForCalculations,
        playerObj,
        rivalObj,
        confirmedScores,
        betConfig,
        course
      );
      if (stablefordResult) {
        stablefordTotal = stablefordResult.amount;
      }
    }
    
    return nonRayasNonMedalGeneralBalance + rayasTotal + medalGeneralTotal + stablefordTotal;
  };
  
  // Get corrected total player balance (sum of corrected bilateral balances vs all rivals)
  const getCorrectedPlayerBalance = (playerId: string, rivalIds: string[]): number => {
    return rivalIds.reduce((sum, rivalId) => {
      return sum + getCorrectedBilateralBalance(playerId, rivalId);
    }, 0);
  };

  // Historical mode: break down the pair balance by category from the snapshot ledger.
  // Individual = all non-team bets; Carritos = carritos bets; Presiones = team pressures.
  // Overrides are already baked into the ledger — no re-filtering needed.
  const getHistoricalPairBreakdown = (playerAId: string, playerBId: string): { individual: number; carritos: number; presiones: number } | null => {
    if (!isHistorical) return null;
    const pairSummaries = betSummaries.filter(s => s.playerId === playerAId && s.vsPlayer === playerBId);
    const isCarritosBet = (bt: string) => bt === 'Carritos Front' || bt === 'Carritos Back' || bt === 'Carritos Total';
    const isPresionesPareja = (bt: string) => bt === 'Presiones Parejas' || bt === 'Presiones Pareja';
    const carritos = pairSummaries.filter(s => isCarritosBet(s.betType)).reduce((s, e) => s + e.amount, 0);
    const presiones = pairSummaries.filter(s => isPresionesPareja(s.betType)).reduce((s, e) => s + e.amount, 0);
    const individual = pairSummaries.filter(s => !isCarritosBet(s.betType) && !isPresionesPareja(s.betType)).reduce((s, e) => s + e.amount, 0);
    return { individual, carritos, presiones };
  };
  
  // Historical mode: get bilateral balance directly from snapshotBalances (immutable source of truth at close time).
  // This avoids recalculating from the ledger which may have duplicate entries.
  const getSnapshotBilateralBalance = (playerAId: string, playerBId: string): number | null => {
    if (!snapshotBalances) return null;
    const playerBalance = snapshotBalances.find(b => b.playerId === playerAId);
    if (!playerBalance) return null;
    const vs = playerBalance.vsBalances.find(v => v.rivalId === playerBId);
    return vs?.netAmount ?? null;
  };

  // Historical mode: get total balance from snapshotBalances (sum of all vs rivals).
  const getSnapshotTotalBalance = (playerId: string): number | null => {
    if (!snapshotBalances) return null;
    const b = snapshotBalances.find(b => b.playerId === playerId);
    return b?.totalNet ?? null;
  };

  // Get balance for base player vs each rival (Individual bets only — excludes Carritos/Presiones Parejas)
  // HISTORICAL: Use getCorrectedBilateralBalance which filters the ledger per-pair and excludes team bets.
  //   This ensures avatar balance == bilateral header == sum(detail rows) with NO discrepancy.
  //   Note: snapshotBalances.vsBalances.netAmount is intentionally NOT used here because in older
  //   snapshots (without pairBreakdowns) it may include team bets, causing inconsistency.
  // LIVE: Use override-aware calculation.
  const getRivalBalance = (rivalId: string): number => {
    return getCorrectedBilateralBalance(basePlayer?.id || '', rivalId);
  };
  
  // Get grouped summaries for selected pair
  const getGroupedSummaries = (rivalId: string) =>
    groupSummariesByType(basePlayer?.id || '', rivalId, betSummaries);
  
  const isTeamBetDisabled = (betId: string): boolean => {
    return (betConfig.disabledTeamBetIds || []).includes(betId);
  };

  // Get carritos balance for a specific player (excluding disabled bets)
  const getCarritosBalanceForPlayer = (playerId: string): number => {
    let total = 0;
    allCarritosResults.forEach((result, idx) => {
      const carritosId = result.id || `carritos-primary-${idx}`;
      if (isTeamBetDisabled(carritosId)) return;
      if (result.teamA.includes(playerId)) {
        total += result.moneyA;
      } else if (result.teamB.includes(playerId)) {
        total += result.moneyB;
      }
    });
    return total;
  };

  // Get team pressures balance for a specific player (total from all team pressure bets)
  // Historical mode: team pressures are already included in snapshot balances
  const getTeamPressuresBalanceForPlayer = (playerId: string): number => {
    if (isHistorical) return 0;
    return betSummaries
      .filter(s => s.playerId === playerId && s.betType === 'Presiones Parejas' && !isTeamBetDisabled(s.betId || ''))
      .reduce((sum, s) => sum + s.amount, 0);
  };

  // Historical mode: sum Carritos + Presiones Parejas from the ledger for a player (all rivals combined).
  // Used in Tabla General to show the real total including team bets alongside the individual subtotal.
  const getHistoricalTeamBetsBalanceForPlayer = (playerId: string): number => {
    if (!isHistorical) return 0;
    const carritosTypes = ['Carritos Front', 'Carritos Back', 'Carritos Total'];
    return betSummaries
      .filter(s =>
        s.playerId === playerId &&
        (carritosTypes.includes(s.betType) || s.betType === 'Presiones Parejas' || s.betType === 'Presiones Pareja')
      )
      .reduce((sum, s) => sum + s.amount, 0);
  };

  // Sort players by total balance for leaderboard (computed in render based on displayPlayers)
  // HISTORICAL: Use snapshotBalances (immutable source of truth). LIVE: Use calculated values.
  const getSortedPlayersForDisplay = (playersToSort: Player[]) => {
    return [...playersToSort].sort((a, b) => {
      const snapA = isHistorical ? getSnapshotTotalBalance(a.id) : null;
      const snapB = isHistorical ? getSnapshotTotalBalance(b.id) : null;
      const balanceA = snapA !== null ? snapA : (() => {
        const rivalIds = playersToSort.filter(p => p.id !== a.id).map(p => p.id);
        return getCorrectedPlayerBalance(a.id, rivalIds) + getCarritosBalanceForPlayer(a.id) + getTeamPressuresBalanceForPlayer(a.id);
      })();
      const balanceB = snapB !== null ? snapB : (() => {
        const rivalIds = playersToSort.filter(p => p.id !== b.id).map(p => p.id);
        return getCorrectedPlayerBalance(b.id, rivalIds) + getCarritosBalanceForPlayer(b.id) + getTeamPressuresBalanceForPlayer(b.id);
      })();
      return balanceB - balanceA;
    });
  };
  
  // For verification calculation, still use all players from current group
  const sortedPlayers = useMemo(() => {
    return getSortedPlayersForDisplay(players);
  }, [players, betSummaries, allCarritosResults]);

  // Get player abbreviation with disambiguation
  const disambiguatedAbbrs = useMemo(() => disambiguateInitials(allPlayersForCalculations), [allPlayersForCalculations]);
  const disambiguatedNames = useMemo(() => disambiguateShortNames(allPlayersForCalculations), [allPlayersForCalculations]);
  const getPlayerAbbr = (player: Player) => disambiguatedAbbrs.get(player.id) || player.initials;
  
  // Get carritos balance between two specific players
  // Returns the balance from playerA's perspective vs playerB
  // 
  // Settlement logic for Carritos (team bets):
  // - Team result moneyA is the total the team wins/loses
  // - Each player on a team gets/pays half: moneyA / 2
  // - That half is split evenly between the two opponents: (moneyA / 2) / 2 = moneyA / 4
  // 
  // Example: Team A wins $200
  // Carritos payment rule:
  // Each LOSER pays 50% of the total lost to EACH winner
  // Example: Team loses $100 total
  // - Loser A pays $50 to Winner C and $50 to Winner D (total $100 out)
  // - Loser B pays $50 to Winner C and $50 to Winner D (total $100 out)
  // Each winner receives: $50 from Loser A + $50 from Loser B = $100 total
  // 
  // So vs any single opponent, the amount is totalLost / 2
  const getCarritosBalanceVsPlayer = (playerAId: string, playerBId: string): number => {
    let total = 0;
    allCarritosResults.forEach((result, idx) => {
      const carritosId = result.id || `carritos-primary-${idx}`;
      if (isTeamBetDisabled(carritosId)) return;
      const teamAHasPlayerA = result.teamA.includes(playerAId);
      const teamBHasPlayerA = result.teamB.includes(playerAId);
      const teamAHasPlayerB = result.teamA.includes(playerBId);
      const teamBHasPlayerB = result.teamB.includes(playerBId);
      
      if ((teamAHasPlayerA && teamBHasPlayerB) || (teamBHasPlayerA && teamAHasPlayerB)) {
        const playerAMoney = teamAHasPlayerA ? result.moneyA : result.moneyB;
        total += playerAMoney / 2;
      }
    });
    return total;
  };
  
  // Get team pressures balance between two specific players (excluding disabled bets)
  const getTeamPressuresBalanceVsPlayer = (playerAId: string, playerBId: string): number => {
    return betSummaries
      .filter(s => 
        s.playerId === playerAId && 
        s.vsPlayer === playerBId && 
        s.betType === 'Presiones Parejas' &&
        !isTeamBetDisabled(s.betId || '')
      )
      .reduce((sum, s) => sum + s.amount, 0);
  };
  
  // Toggle team bet override (no-compute) - does NOT delete the bet
  const toggleTeamBetDisabled = (betId: string) => {
    if (!onBetConfigChange) return;
    const disabled = betConfig.disabledTeamBetIds || [];
    const isDisabled = disabled.includes(betId);
    onBetConfigChange({
      ...betConfig,
      disabledTeamBetIds: isDisabled 
        ? disabled.filter(id => id !== betId) 
        : [...disabled, betId],
    });
  };
  
  // isTeamBetDisabled moved above getCarritosBalanceForPlayer
  
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
  // Always follows displayGroupIndex (the group selected in "Ver Grupo")
  // Sorted so that logged-in player appears first
  const balanceVsPlayers = useMemo(() => {
    const groupPlayers = getPlayersForGroup(displayGroupIndex, players, playerGroups);
    
    // Sort to put logged-in player first
    if (!basePlayerId) return groupPlayers;
    
    return [...groupPlayers].sort((a, b) => {
      const aIsBase = a.id === basePlayerId || a.profileId === basePlayerId;
      const bIsBase = b.id === basePlayerId || b.profileId === basePlayerId;
      if (aIsBase && !bIsBase) return -1;
      if (!aIsBase && bIsBase) return 1;
      return 0;
    });
  }, [displayGroupIndex, players, playerGroups, basePlayerId]);
  
  // Base player for "Balance vs" - must be from balanceVsPlayers or fallback
  const basePlayer = useMemo(() => {
    const fromBalanceVs = balanceVsPlayers.find((p) => p.id === balanceBasePlayerId);
    if (fromBalanceVs) return fromBalanceVs;
    // If base player is not in current balanceVsPlayers, reset to first in that list
    return balanceVsPlayers[0] || players[0];
  }, [balanceVsPlayers, players, balanceBasePlayerId]);
  
  // Active group index for balance calculations always follows displayGroupIndex
  const activeBalanceGroupIndex = displayGroupIndex;

  // Auto-update balanceBasePlayerId ONLY when current base is not in the new group
  // This prevents resetting selection when clicking within the same group
  useEffect(() => {
    const groupPlayers = getPlayersForGroup(activeBalanceGroupIndex, players, playerGroups);
    const currentBaseInGroup = groupPlayers.some(p => p.id === balanceBasePlayerId);
    // Only reset if the current base player is NOT in the new group
    if (groupPlayers.length > 0 && !currentBaseInGroup) {
      setBalanceBasePlayerId(groupPlayers[0].id);
      setSelectedRival(null);
    }
  }, [activeBalanceGroupIndex, players, playerGroups]);
  
  // Rivals = players in the same group as base player + cross-group players
  // Include BOTH: players THIS base selected AND players who selected THIS base (reciprocity)
  const sameGroupRivals = balanceVsPlayers.filter((p) => p.id !== basePlayer?.id);
  
  // Get players that basePlayer explicitly selected
  const directlySelectedCrossGroup = otherGroupPlayers.filter(
    p => getCrossGroupRivalsForBase(basePlayer?.id).includes(p.id)
  );
  
  // Get players who selected basePlayer (reciprocal visibility)
  const reciprocalCrossGroup = otherGroupPlayers.filter(
    p => getCrossGroupRivalsForBase(p.id).includes(basePlayer?.id || '')
  );
  
  // Combine and deduplicate
  const allCrossGroupIds = new Set([
    ...directlySelectedCrossGroup.map(p => p.id),
    ...reciprocalCrossGroup.map(p => p.id)
  ]);
  const selectedCrossGroupPlayers = otherGroupPlayers.filter(p => allCrossGroupIds.has(p.id));
  
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
              
              {/* In 'all' mode, Balance vs follows the selected group from "Ver Grupo" */}
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            {getSortedPlayersForDisplay(tablaGeneralPlayers).map((player, idx) => {
              // HISTORICAL: Use snapshotBalances as the immutable source of truth (avoids ledger duplicate issues).
              // LIVE: Use corrected calculation.
              const snapshotTotal = isHistorical ? getSnapshotTotalBalance(player.id) : null;
              let totalBalance: number;
              if (snapshotTotal !== null) {
                totalBalance = snapshotTotal;
              } else {
                const groupRivalIds = tablaGeneralPlayers.filter(p => p.id !== player.id).map(p => p.id);
                const individualBalance = getCorrectedPlayerBalance(player.id, groupRivalIds);
                const carritosBalance = getCarritosBalanceForPlayer(player.id);
                const teamPressuresBalance = getTeamPressuresBalanceForPlayer(player.id);
                totalBalance = individualBalance + carritosBalance + teamPressuresBalance;
              }
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
              
              // For 'all' mode cross-group, still use corrected balance for rivals not in snapshot
              const crossGroupBalance = crossGroupOthers.reduce((sum, rival) => {
                return sum + (isHistorical ? (getSnapshotBilateralBalance(player.id, rival.id) ?? getCorrectedBilateralBalance(player.id, rival.id)) : getCorrectedBilateralBalance(player.id, rival.id));
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
                      <PlayerAvatar 
                        initials={getPlayerAbbr(player)} 
                        background={player.color} 
                        size="lg" 
                        isLoggedInUser={player.id === basePlayerId || player.profileId === basePlayerId}
                      />
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{formatPlayerName(player.name).split(' ')[0]}</span>
                        <span className="text-[10px] text-muted-foreground">HCP {player.handicap}</span>
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
                        displayBalance > 0 ? 'text-green-600' : displayBalance < 0 ? 'text-destructive' : 'text-muted-foreground'
                      )}>
                        {displayBalance >= 0 ? '+$' : '-$'}{Math.abs(displayBalance)}
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>
                  
                  {/* Expanded view: balance vs each other player + carritos per rival */}
                  {isExpanded && (
                    <div className="ml-5 mt-1 space-y-1 pb-2">
                      {otherPlayers.map(other => {
                        // Historical: the TOTAL must come from snapshotBalances.vsBalances.netAmount
                        // (the immutable value calculated at close time).
                        // The breakdown (Ind/Car/Pres) is informational from the ledger.
                        // Live: use recalculated values.
                        const historicalBreakdown = getHistoricalPairBreakdown(player.id, other.id);
                        const vsIndividualBalance = isHistorical
                          ? (historicalBreakdown?.individual ?? 0)
                          : getCorrectedBilateralBalance(player.id, other.id);
                        const vsCarritosBalance = isHistorical
                          ? (historicalBreakdown?.carritos ?? 0)
                          : getCarritosBalanceVsPlayer(player.id, other.id);
                        const vsTeamPressuresBalance = isHistorical
                          ? (historicalBreakdown?.presiones ?? 0)
                          : getTeamPressuresBalanceVsPlayer(player.id, other.id);
                        // CRITICAL: For historical rounds, the total shown in the Tabla General expanded row
                        // is: Individual (from ledger, excl. team bets) + Carritos + Presiones.
                        // This matches the avatar (getCorrectedBilateralBalance = individual only) + team bets breakdown.
                        // We do NOT use getSnapshotBilateralBalance here because in old snapshots it may
                        // include team bets already inside the vsBalance, causing double-counting.
                        const vsTotalBalance = vsIndividualBalance + vsCarritosBalance + vsTeamPressuresBalance;
                        
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
                              <PlayerAvatar 
                                initials={getPlayerAbbr(other)} 
                                background={other.color} 
                                size="sm" 
                                isLoggedInUser={other.id === basePlayerId || other.profileId === basePlayerId}
                              />
                              {isCrossGroupRival && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-accent/30 rounded text-accent-foreground">
                                  G{otherGroupIdx + 1}
                                </span>
                              )}
                              {/* Show breakdown when there are pair bets */}
                              {(vsCarritosBalance !== 0 || vsTeamPressuresBalance !== 0) && (
                                <span className="text-xs text-muted-foreground flex flex-wrap gap-x-1">
                                  <span>Ind: <span className={cn(vsIndividualBalance > 0 ? 'text-green-600' : vsIndividualBalance < 0 ? 'text-destructive' : '')}>{vsIndividualBalance >= 0 ? '+' : ''}{vsIndividualBalance}</span></span>
                                  {vsCarritosBalance !== 0 && (
                                    <span>| Car: <span className={cn(vsCarritosBalance > 0 ? 'text-green-600' : vsCarritosBalance < 0 ? 'text-destructive' : '')}>{vsCarritosBalance >= 0 ? '+' : ''}{vsCarritosBalance}</span></span>
                                  )}
                                  {vsTeamPressuresBalance !== 0 && (
                                    <span>| Pres: <span className={cn(vsTeamPressuresBalance > 0 ? 'text-green-600' : vsTeamPressuresBalance < 0 ? 'text-destructive' : '')}>{vsTeamPressuresBalance >= 0 ? '+' : ''}{vsTeamPressuresBalance}</span></span>
                                  )}
                                </span>
                              )}
                            </div>
                            <span className={cn(
                              'font-bold',
                              vsTotalBalance > 0 ? 'text-green-600' : vsTotalBalance < 0 ? 'text-destructive' : 'text-muted-foreground'
                            )}>
                              {vsTotalBalance >= 0 ? '+$' : '-$'}{Math.abs(vsTotalBalance)}
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
            Σ = ${tablaGeneralPlayers.reduce((sum, p) => {
                const snap = isHistorical ? getSnapshotTotalBalance(p.id) : null;
                if (snap !== null) return sum + snap;
                const rivalIds = tablaGeneralPlayers.filter(x => x.id !== p.id).map(x => x.id);
                return sum + getCorrectedPlayerBalance(p.id, rivalIds) + getCarritosBalanceForPlayer(p.id) + getTeamPressuresBalanceForPlayer(p.id);
              }, 0)} 
            <span className="ml-1">(debe ser $0)</span>
          </div>
        </CardContent>
      </Card>

      {/* Balance vs */}
      <Card>
        <CardHeader className="py-3 pb-0">
          <CardTitle className="text-sm flex items-center gap-2 min-w-0">
            <span className="text-muted-foreground">Balance</span>
            <span className="font-bold truncate">{formatPlayerName(basePlayer?.name || '—')}</span>
            <span className="text-muted-foreground">vs</span>
          </CardTitle>

          {/* Show group indicator when in 'all' mode */}
          {tablaGeneralMode === 'all' && hasMultipleGroups && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <Users className="h-3 w-3" />
              <span>Grupo {displayGroupIndex + 1}</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-3 space-y-3">
          <div className="flex items-stretch gap-0">
            {/* BASE column - left side */}
            <div className="flex flex-col items-center gap-2 pr-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Base</span>
              {balanceVsPlayers.map((p) => {
                const isActive = p.id === balanceBasePlayerId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setBalanceBasePlayerId(p.id);
                      setSelectedRival(null);
                    }}
                    className={cn(
                      'shrink-0 rounded-lg transition-all',
                      isActive ? 'ring-2 ring-primary ring-offset-2 ring-offset-primary/20 bg-primary/20 rounded-full' : 'opacity-60 hover:opacity-100'
                    )}
                    aria-pressed={isActive}
                  >
                    <PlayerAvatar initials={getPlayerAbbr(p)} background={p.color} size="md" className="w-10 h-10 text-sm" isLoggedInUser={p.id === basePlayerId} />
                  </button>
                );
              })}
            </div>

            {/* Vertical separator - Augusta themed */}
            <div className="flex flex-col self-stretch mx-2">
              <div className="flex-1 w-[3px] bg-golf-green rounded-full relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 bottom-0 flex items-center">
                  <div className="w-full h-[1px] bg-augusta-gold" />
                </div>
              </div>
            </div>

            {/* RIVALS area - right side, strict 2-col grid, centered in available height */}
            <div className="flex-1 pl-3 flex items-center justify-center">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 place-items-center w-full">
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
                          'flex flex-col items-center gap-1.5 transition-all relative',
                          isCrossGroup && 'ring-2 ring-accent ring-offset-1 ring-offset-background rounded-lg'
                        )}
                      >
                        {hasOverride && (
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-accent rounded-full z-10" />
                        )}
                        {/* Pill-shaped initials label - fixed width for uniformity */}
                        <div className={cn(
                          'w-20 h-8 rounded-lg flex items-center justify-center font-bold text-sm transition-all',
                          isSelected
                            ? 'bg-primary text-primary-foreground shadow-lg'
                            : rival.id === basePlayerId || rival.profileId === basePlayerId
                              ? 'bg-augusta-green text-augusta-gold'
                              : 'bg-white border-2 border-black text-black'
                        )}>
                          {getPlayerAbbr(rival)}
                        </div>
                        {/* Balance below */}
                        <div className={cn(
                          'text-sm font-bold flex items-center gap-0.5',
                          balance > 0 ? 'text-green-600' : balance < 0 ? 'text-destructive' : 'text-muted-foreground'
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
                        className="flex flex-col items-center gap-1.5 transition-all"
                      >
                        <div className="w-20 h-8 rounded-lg flex items-center justify-center bg-muted/50 border-2 border-dashed border-muted-foreground/30">
                          <UserPlus className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <span className="text-[10px] text-muted-foreground">Grupo</span>
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
                                      background={player.color} 
                                      size="sm" 
                                      isLoggedInUser={player.id === basePlayerId}
                                    />
                                    <span className="text-sm font-medium">{formatPlayerName(player.name).split(' ')[0]}</span>
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
            </div>
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

      {/* Cross-Group Handicap Widget — shown when a rival from another group is selected */}
      {selectedRival && basePlayer && (() => {
        const rivalObj = rivals.find(p => p.id === selectedRival);
        const isCrossGroupSelected = rivalObj && selectedCrossGroupPlayers.some(p => p.id === selectedRival);
        if (!isCrossGroupSelected || !rivalObj) return null;
        return (
          <CrossGroupHandicapWidget
            basePlayer={basePlayer}
            rival={rivalObj}
            getStrokesForLocalPair={getStrokesForLocalPair}
            setStrokesForLocalPair={setStrokesForLocalPair}
            isHistorical={isHistorical}
          />
        );
      })()}
      
      {/* Bilateral Detail View */}
      {selectedRival && basePlayer && rivals.find(p => p.id === selectedRival) && (
        <BilateralDetail
          players={players}
          groupPlayers={balanceVsPlayers}
          allPlayers={allPlayersForCalculations}
          player={basePlayer}
          rival={rivals.find(p => p.id === selectedRival)!}
          groupedSummaries={getGroupedSummaries(selectedRival)}
          totalBalance={getRivalBalance(selectedRival)}
          expandedTypes={expandedTypes}
          onToggleExpand={toggleExpanded}
          bilateralHandicap={getBilateralHandicap(basePlayer.id, selectedRival)}
          onUpdateBilateralHandicap={updateBilateralHandicap}
          betConfig={betConfig}
          effectiveBetConfig={effectiveBetConfig}
          confirmedScores={confirmedScores}
          course={course}
          allScores={scores}
          onBetConfigChange={onBetConfigChange}
          basePlayerId={basePlayerId}
          confirmedHoles={confirmedHoles}
          startingHole={startingHole}
          getStrokesForLocalPair={getStrokesForLocalPair}
          snapshotVsBalance={snapshotBalances ? getRivalBalance(selectedRival) : undefined}
          snapshotPairBreakdowns={snapshotPairBreakdowns}
          snapshotPairSegmentResults={snapshotPairSegmentResults}
          isHistorical={isHistorical}
        />
      )}

      {/* All Carritos Results */}
      {allCarritosResults.map((result, idx) => {
        const carritosId = result.id || `carritos-primary-${idx}`;
        const disabled = isTeamBetDisabled(carritosId);
        return (
          <CarritosResultsCard 
            key={carritosId}
            results={result} 
            players={players}
            basePlayerId={basePlayer?.id}
            title={`Carritos ${idx + 1}`}
            isDisabled={disabled}
            onToggleDisabled={onBetConfigChange ? () => toggleTeamBetDisabled(carritosId) : undefined}
          />
        );
      })}

      {/* Team Pressures Results - displayed like Carritos (NOT in bilateral view) */}
      {betConfig.teamPressures?.bets?.filter(b => b.enabled).map((bet, idx) => {
        // Resolve config IDs (may be profileId) to actual player.id
        // IMPORTANT: Search allPlayersForCalculations (all groups) not just `players` (current group)
        const resolvePId = (pid: string): string => {
          if (allPlayersForCalculations.find(p => p.id === pid)) return pid;
          const match = allPlayersForCalculations.find(p => p.profileId === pid);
          return match?.id ?? pid;
        };
        const resolvedTeamA: [string, string] = [resolvePId(bet.teamA[0]), resolvePId(bet.teamA[1])];
        const resolvedTeamB: [string, string] = [resolvePId(bet.teamB[0]), resolvePId(bet.teamB[1])];

        // Calculate team pressures balance from betSummaries for THIS specific bet only
        const teamAPressures = betSummaries.filter(s => 
          s.betType === 'Presiones Parejas' && s.betId === bet.id && resolvedTeamA.includes(s.playerId)
        );
        const teamABalance = teamAPressures.reduce((sum, s) => sum + s.amount, 0) / 2; // Each member's share (team total / 2 members)
        
        const getPlayer = (id: string) => allPlayersForCalculations.find(p => p.id === id);
        const teamAPlayers = [getPlayer(resolvedTeamA[0]), getPlayer(resolvedTeamA[1])].filter(Boolean) as Player[];
        const teamBPlayers = [getPlayer(resolvedTeamB[0]), getPlayer(resolvedTeamB[1])].filter(Boolean) as Player[];
        
        const isBaseInTeamA = resolvedTeamA.includes(basePlayer?.id || '');
        const baseTeamBalance = isBaseInTeamA ? teamABalance : -teamABalance;
        
        if (teamAPlayers.length < 2 || teamBPlayers.length < 2) return null;
        
        // Calculate hole-by-hole details like Carritos
        const getTeamPressureHoleDetails = () => {
          const teamA = resolvedTeamA;
          const teamB = resolvedTeamB;
          const { scoringType, teamHandicaps } = bet;
          
          const getHandicap = (playerId: string): number => {
            if (teamHandicaps) {
              const direct = teamHandicaps[playerId];
              if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
              const byProfile = players.find(p => p.id === playerId)?.profileId;
              if (byProfile) {
                const h = teamHandicaps[byProfile];
                if (typeof h === 'number' && Number.isFinite(h)) return h;
              }
            }
            return players.find(p => p.id === playerId)?.handicap ?? 0;
          };
          
          const strokesMap = new Map<string, number[]>();
          [...teamA, ...teamB].forEach(pid => {
            strokesMap.set(pid, calculateStrokesPerHole(getHandicap(pid), course));
          });
          
          const getPlayerScore = (playerId: string, holeNum: number): { gross: number; hcp: number; net: number } | null => {
            const score = confirmedScores.get(playerId)?.find(s => s.holeNumber === holeNum);
            if (!score || typeof score.strokes !== 'number') return null;
            const hcp = strokesMap.get(playerId)?.[holeNum - 1] || 0;
            return { gross: score.strokes, hcp, net: score.strokes - hcp };
          };
          
          const getHoleDetail = (holeNum: number) => {
            const a1 = getPlayerScore(teamA[0], holeNum);
            const a2 = getPlayerScore(teamA[1], holeNum);
            const b1 = getPlayerScore(teamB[0], holeNum);
            const b2 = getPlayerScore(teamB[1], holeNum);
            
            if (!a1 || !a2 || !b1 || !b2) return null;
            
            let teamAPoints = 0;
            let teamBPoints = 0;
            
            const lowA = Math.min(a1.net, a2.net);
            const lowB = Math.min(b1.net, b2.net);
            const highA = Math.max(a1.net, a2.net);
            const highB = Math.max(b1.net, b2.net);
            
            let lowBallWinner: 'A' | 'B' | 'tie' | undefined;
            let highBallWinner: 'A' | 'B' | 'tie' | undefined;
            let combinedWinner: 'A' | 'B' | 'tie' | undefined;
            
            if (scoringType === 'lowBall' || scoringType === 'combined') {
              if (lowA < lowB) { teamAPoints++; lowBallWinner = 'A'; }
              else if (lowB < lowA) { teamBPoints++; lowBallWinner = 'B'; }
              else { lowBallWinner = 'tie'; }
            }
            if (scoringType === 'highBall' || scoringType === 'combined') {
              if (highA < highB) { teamAPoints++; highBallWinner = 'A'; }
              else if (highB < highA) { teamBPoints++; highBallWinner = 'B'; }
              else { highBallWinner = 'tie'; }
            }
            if (scoringType === 'lowBall' && !lowBallWinner) {
              // already handled above
            }
            if (scoringType === 'highBall' && !highBallWinner) {
              // already handled above
            }
            
            return {
              holeNumber: holeNum,
              a1, a2, b1, b2,
              lowBallWinner,
              highBallWinner,
              combinedWinner,
              pointsA: teamAPoints,
              pointsB: teamBPoints,
              net: teamAPoints - teamBPoints,
            };
          };
          
          const frontDetails = Array.from({ length: 9 }, (_, i) => getHoleDetail(i + 1));
          const backDetails = Array.from({ length: 9 }, (_, i) => getHoleDetail(i + 10));
          
          // Opening threshold is auto-determined by scoring type
          const openingThreshold = (scoringType === 'lowBall' || scoringType === 'highBall') ? 2 : 3;
          
          // Process a nine and return array of individual bet balances AND running snapshots per hole
          const processNine = (details: typeof frontDetails): { bets: number[]; snapshots: number[][] } => {
            const bets: number[] = [0];
            const snapshots: number[][] = [];
            
            details.forEach((d, idx) => {
              if (!d) {
                // No data yet - snapshot current state
                snapshots.push([...bets]);
                return;
              }
              
              // Apply result to all open bets
              for (let i = 0; i < bets.length; i++) {
                bets[i] += d.net;
              }
              
              // Snapshot after applying this hole's result
              snapshots.push([...bets]);
              
              // Check if last bet reached threshold - open new bet
              const isLastHole = idx === details.length - 1;
              if (!isLastHole) {
                const lastBet = bets[bets.length - 1];
                if (Math.abs(lastBet) >= openingThreshold) {
                  bets.push(0);
                }
              }
            });
            
            return { bets, snapshots };
          };
          
          const frontResult = processNine(frontDetails);
          const backResult = processNine(backDetails);
          const frontBets = frontResult.bets;
          const backBets = backResult.bets;
          const frontSnapshots = frontResult.snapshots;
          const backSnapshots = backResult.snapshots;
          
          // Calculate running balances for tooltip (simple cumulative)
          let runningFront = 0;
          let runningBack = 0;
          const frontBalances = frontDetails.map(d => {
            if (d) runningFront += d.net;
            return runningFront;
          });
          const backBalances = backDetails.map(d => {
            if (d) runningBack += d.net;
            return runningBack;
          });
          
          // Compute running Total 18 cumulative (main line across all 18 holes)
          let runningTotal = 0;
          const totalBalances: number[] = [];
          frontDetails.forEach(d => {
            if (d) runningTotal += d.net;
            totalBalances.push(runningTotal);
          });
          backDetails.forEach(d => {
            if (d) runningTotal += d.net;
            totalBalances.push(runningTotal);
          });
          
          return { frontDetails, backDetails, frontBalances, backBalances, frontBets, backBets, frontSnapshots, backSnapshots, totalBalances };
        };
        
        const holeDetails = getTeamPressureHoleDetails();
        const displayTeamAPlayers = isBaseInTeamA ? teamAPlayers : teamBPlayers;
        const displayTeamBPlayers = isBaseInTeamA ? teamBPlayers : teamAPlayers;
        
        // Invert details if base is in team B
        const invertW = (w?: 'A' | 'B' | 'tie') => w === 'A' ? 'B' as const : w === 'B' ? 'A' as const : w;
        const displayFrontDetails = isBaseInTeamA 
          ? holeDetails.frontDetails 
          : holeDetails.frontDetails.map(d => d ? { ...d, net: -d.net, pointsA: d.pointsB, pointsB: d.pointsA, a1: d.b1, a2: d.b2, b1: d.a1, b2: d.a2, lowBallWinner: invertW(d.lowBallWinner), highBallWinner: invertW(d.highBallWinner), combinedWinner: invertW(d.combinedWinner) } : null);
        const displayBackDetails = isBaseInTeamA 
          ? holeDetails.backDetails 
          : holeDetails.backDetails.map(d => d ? { ...d, net: -d.net, pointsA: d.pointsB, pointsB: d.pointsA, a1: d.b1, a2: d.b2, b1: d.a1, b2: d.a2, lowBallWinner: invertW(d.lowBallWinner), highBallWinner: invertW(d.highBallWinner), combinedWinner: invertW(d.combinedWinner) } : null);
        const displayFrontBalances = isBaseInTeamA 
          ? holeDetails.frontBalances 
          : holeDetails.frontBalances.map(b => -b);
        const displayBackBalances = isBaseInTeamA 
          ? holeDetails.backBalances 
          : holeDetails.backBalances.map(b => -b);
        
        // Get snapshots for hole-by-hole pressure display (inverted if needed)
        const displayFrontSnapshots = isBaseInTeamA 
          ? holeDetails.frontSnapshots 
          : holeDetails.frontSnapshots.map(snap => snap.map(b => -b));
        const displayBackSnapshots = isBaseInTeamA 
          ? holeDetails.backSnapshots 
          : holeDetails.backSnapshots.map(snap => snap.map(b => -b));
        
        // Total 18 running cumulative (18 entries)
        const displayTotalBalances = isBaseInTeamA 
          ? holeDetails.totalBalances 
          : holeDetails.totalBalances.map(b => -b);
        
        // Get individual bet results for display
        const displayFrontBets = isBaseInTeamA 
          ? holeDetails.frontBets 
          : holeDetails.frontBets.map(b => -b);
        const displayBackBets = isBaseInTeamA 
          ? holeDetails.backBets 
          : holeDetails.backBets.map(b => -b);
        
        // Format bets for display: +4+2 or -3-1
        const formatBetsDisplay = (bets: number[]): string => {
          return bets.map(b => (b >= 0 ? '+' : '') + b).join('');
        };
        
        const frontBetsDisplay = formatBetsDisplay(displayFrontBets);
        const backBetsDisplay = formatBetsDisplay(displayBackBets);
        
        // Keep totals for color coding (based on final running balance)
        const frontTotal = displayFrontBalances[8] || 0;
        const backTotal = displayBackBalances[8] || 0;
        
        // Calculate Total 18 (sum of FIRST bet from each nine)
        const total18 = displayFrontBets[0] + displayBackBets[0];
        
        const pressureDisabled = isTeamBetDisabled(bet.id);
        
        return (
          <Card key={`team-pressure-${idx}`} className={cn('border-accent/50', pressureDisabled && 'opacity-50')}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Foursome {idx + 1}
                </div>
                <div className="flex items-center gap-2">
                  {pressureDisabled ? (
                    <div className="text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">Cancelada</div>
                  ) : (
                    <span className={cn('text-base font-bold tabular-nums', baseTeamBalance > 0 ? 'text-green-600' : baseTeamBalance < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                      {baseTeamBalance >= 0 ? '+$' : '-$'}{Math.abs(baseTeamBalance)}
                    </span>
                  )}
                  {onBetConfigChange && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn('h-6 w-6', pressureDisabled ? 'text-green-600 hover:text-green-700' : 'text-muted-foreground hover:text-destructive')}
                      onClick={() => toggleTeamBetDisabled(bet.id)}
                      title={pressureDisabled ? 'Reactivar Foursome' : 'No considerar Foursome'}
                    >
                      {pressureDisabled ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Collapsible>
                <div className="space-y-1">
                  {/* Names row */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate">
                      {displayTeamAPlayers.map(p => formatPlayerName(p.name).split(' ')[0]).join(' / ')}
                    </span>
                    <span className="text-muted-foreground text-xs mx-2">vs</span>
                    <span className="font-medium truncate text-right">
                      {displayTeamBPlayers.map(p => formatPlayerName(p.name).split(' ')[0]).join(' / ')}
                    </span>
                  </div>
                  {/* Results row */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 grid grid-cols-3 gap-1 text-center text-sm tabular-nums">
                      <span className={cn('font-semibold', frontTotal > 0 ? 'text-green-600' : frontTotal < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                        F9 {frontBetsDisplay}
                      </span>
                      <span className={cn('font-semibold', backTotal > 0 ? 'text-green-600' : backTotal < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                        B9 {backBetsDisplay}
                      </span>
                      <span className={cn('font-bold', total18 > 0 ? 'text-green-600' : total18 < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                        T {total18 >= 0 ? '+' : ''}{total18}
                      </span>
                    </div>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                        <ChevronDown className="h-4 w-4" />
                        <span className="sr-only">Ver detalle</span>
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                  {/* Sub-modality breakdown (Unidades / Oyeses) with detail popovers */}
                  {(bet.unitsConfig?.enabled || bet.oyesesConfig?.enabled) && (() => {
                    // Parse breakdown from description in betSummaries
                    const mySummary = betSummaries.find(s => 
                      s.betType === 'Presiones Parejas' && s.betId === bet.id && 
                      (isBaseInTeamA ? resolvedTeamA.includes(s.playerId) : resolvedTeamB.includes(s.playerId)) &&
                      (isBaseInTeamA ? resolvedTeamB.includes(s.vsPlayer) : resolvedTeamA.includes(s.vsPlayer))
                    );
                    const desc = mySummary?.description || '';
                    const parts = desc.split(' | ');

                    // ── Build Units detail ──
                    const unitsDetail = (() => {
                      if (!bet.unitsConfig?.enabled || !bet.unitsConfig.enabledMarkers?.length) return null;
                      const enabledMarkersSet = new Set(bet.unitsConfig.enabledMarkers);
                      type UnitHit = { holeNumber: number; playerId: string; marker: string };
                      const hitsA: UnitHit[] = [];
                      const hitsB: UnitHit[] = [];
                      const countForTeam = (teamIds: string[], hits: UnitHit[]) => {
                        teamIds.forEach(pid => {
                          const playerScores = confirmedScores.get(pid) || [];
                          playerScores.forEach(s => {
                            if (!s.strokes || s.strokes <= 0) return;
                            // Merge auto-detected markers (birdie/eagle/albatross) with stored markers
                            const holePar = course.holes.find(h => h.number === s.holeNumber)?.par ?? 4;
                            const autoDetected = detectScoreBasedMarkers(s.strokes, s.putts, holePar);
                            const merged = { ...s.markers, ...autoDetected };
                            enabledMarkersSet.forEach(marker => {
                              if (merged[marker as keyof MarkerState]) {
                                hits.push({ holeNumber: s.holeNumber, playerId: pid, marker });
                              }
                            });
                          });
                        });
                      };
                      countForTeam(resolvedTeamA, hitsA);
                      countForTeam(resolvedTeamB, hitsB);
                      hitsA.sort((a, b) => a.holeNumber - b.holeNumber);
                      hitsB.sort((a, b) => a.holeNumber - b.holeNumber);
                      const diff = hitsA.length - hitsB.length;
                      const money = diff * (bet.unitsConfig.valuePerUnit || 0);
                      return { hitsA, hitsB, totalA: hitsA.length, totalB: hitsB.length, diff, money };
                    })();

                    // ── Build Oyeses detail ──
                    const oyesesDetail = (() => {
                      if (!bet.oyesesConfig?.enabled) return null;
                      const par3Holes = course.holes.filter(h => h.par === 3).map(h => h.number);
                      const modality = bet.oyesesConfig.modality || 'acumulados';
                      const valuePerOyes = bet.oyesesConfig.valuePerOyes || 25;
                      type OyesWin = { holeNumber: number; winnerId: string; worth: number };
                      const wins: OyesWin[] = [];
                      let winsA = 0, winsB = 0, accumulated = 0;
                      par3Holes.forEach(holeNum => {
                        const proximityField = modality === 'sangron' ? 'oyesProximitySangron' : 'oyesProximity';
                        type ProxEntry = { playerId: string; proximity: number };
                        const entries: ProxEntry[] = [];
                        [...resolvedTeamA, ...resolvedTeamB].forEach(pid => {
                          const score = confirmedScores.get(pid)?.find(s => s.holeNumber === holeNum);
                          if (!score) return;
                          let prox = (score as any)[proximityField] ?? null;
                          if (prox === null && modality === 'sangron') prox = score.oyesProximity ?? null;
                          if (typeof prox === 'number' && prox > 0) entries.push({ playerId: pid, proximity: prox });
                        });
                        if (entries.length === 0) { if (modality === 'acumulados') accumulated++; return; }
                        entries.sort((a, b) => a.proximity - b.proximity);
                        const winner = entries[0];
                        const isTeamA = resolvedTeamA.includes(winner.playerId);
                        if (modality === 'sangron') {
                          wins.push({ holeNumber: holeNum, winnerId: winner.playerId, worth: 1 });
                          if (isTeamA) winsA++; else winsB++;
                        } else {
                          const totalWorth = 1 + accumulated;
                          wins.push({ holeNumber: holeNum, winnerId: winner.playerId, worth: totalWorth });
                          if (isTeamA) winsA += totalWorth; else winsB += totalWorth;
                          accumulated = 0;
                        }
                      });
                      const diff = winsA - winsB;
                      return { wins, winsA, winsB, diff, money: diff * valuePerOyes, valuePerOyes, modality, par3Holes };
                    })();

                    const getPlayerInitial = (pid: string) => {
                      const p = allPlayersForCalculations.find(pl => pl.id === pid);
                      return p ? (disambiguatedAbbrs.get(p.id) || p.initials) : '?';
                    };
                    const getMarkerLabel = (marker: string) => {
                      const info = markerInfo[marker as keyof typeof markerInfo];
                      return info ? info.label : marker;
                    };

                    return (
                      <div className="flex justify-between gap-y-0.5 text-[11px] text-muted-foreground w-full">
                        {parts.map((part, i) => {
                          const isUnitsLine = part.includes('Unidades');
                          const isOyesesLine = part.includes('Oyeses');
                          const colorClass = (part.includes('+$') || part.includes('+$')) ? 'text-green-600' : (part.includes('-$') || part.includes('$-')) ? 'text-destructive' : '';

                          if (isUnitsLine && unitsDetail) {
                            return (
                              <Popover key={i}>
                                <PopoverTrigger asChild>
                                  <span className={cn(colorClass, 'underline decoration-dotted cursor-pointer')}>{part}</span>
                                </PopoverTrigger>
                                <PopoverContent side="top" className="w-80 p-3">
                                  <div className="text-xs space-y-2">
                                    <p className="font-semibold text-sm">Unidades — Detalle</p>
                                    {/* Side-by-side: A left (green), B right (red) */}
                                    <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3">
                                      {/* Team A */}
                                      <div>
                                        <p className="font-medium text-green-600 mb-1">Tu equipo ({unitsDetail.totalA})</p>
                                        {unitsDetail.hitsA.length === 0 && <p className="text-muted-foreground italic text-[10px]">—</p>}
                                        {unitsDetail.hitsA.map((h, hi) => (
                                          <p key={hi} className="text-green-600 text-[10px] flex items-center gap-1">
                                            <span className="tabular-nums">H{h.holeNumber}</span>
                                            <span>{getPlayerInitial(h.playerId)}</span>
                                            <span className="text-muted-foreground ml-auto">{getMarkerLabel(h.marker)}</span>
                                          </p>
                                        ))}
                                      </div>
                                      {/* Divider */}
                                      <div className="w-px bg-border" />
                                      {/* Team B */}
                                      <div>
                                        <p className="font-medium text-destructive mb-1">Rival ({unitsDetail.totalB})</p>
                                        {unitsDetail.hitsB.length === 0 && <p className="text-muted-foreground italic text-[10px]">—</p>}
                                        {unitsDetail.hitsB.map((h, hi) => (
                                          <p key={hi} className="text-destructive text-[10px] flex items-center gap-1">
                                            <span className="tabular-nums">H{h.holeNumber}</span>
                                            <span>{getPlayerInitial(h.playerId)}</span>
                                            <span className="text-muted-foreground ml-auto">{getMarkerLabel(h.marker)}</span>
                                          </p>
                                        ))}
                                      </div>
                                    </div>
                                    {/* Summary */}
                                    <div className="border-t border-border pt-1 space-y-0.5">
                                      <p className="flex justify-between"><span>Diferencial</span><span className="tabular-nums font-semibold">{unitsDetail.diff}</span></p>
                                      <p className="flex justify-between"><span>Valor unidad</span><span className="tabular-nums">${bet.unitsConfig?.valuePerUnit}</span></p>
                                      <p className="flex justify-between font-semibold">
                                        <span>Resultado</span>
                                        <span className={cn('tabular-nums', unitsDetail.money > 0 ? 'text-green-600' : unitsDetail.money < 0 ? 'text-destructive' : '')}>
                                          {isBaseInTeamA ? (unitsDetail.money >= 0 ? '+' : '') : (unitsDetail.money <= 0 ? '+' : '-')}${Math.abs(unitsDetail.money)}
                                        </span>
                                      </p>
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            );
                          }

                          if (isOyesesLine && oyesesDetail) {
                            return (
                              <Popover key={i}>
                                <PopoverTrigger asChild>
                                  <span className={cn(colorClass, 'underline decoration-dotted cursor-pointer')}>{part}</span>
                                </PopoverTrigger>
                                <PopoverContent side="top" className="w-80 p-3">
                                  <div className="text-xs space-y-2">
                                    <p className="font-semibold text-sm">Oyeses — Detalle</p>
                                    <p className="text-[10px] text-muted-foreground">{oyesesDetail.modality === 'sangron' ? 'Sangrón' : 'Acumulado'}</p>
                                    {/* Side-by-side: A left (green), B right (red) */}
                                    <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3">
                                      {/* Team A column */}
                                      <div>
                                        <p className="font-medium text-green-600 mb-1">Tu equipo ({oyesesDetail.winsA})</p>
                        {oyesesDetail.par3Holes.map(holeNum => {
                          const win = oyesesDetail.wins.find(w => w.holeNumber === holeNum);
                          const isTeamAWin = win && resolvedTeamA.includes(win.winnerId);
                          return (
                            <div key={holeNum} className="text-[10px] grid grid-cols-[28px_1fr] items-center">
                              <span className="text-muted-foreground tabular-nums">H{holeNum}</span>
                              {isTeamAWin ? (
                                <span className="font-medium text-green-600">
                                  {getPlayerInitial(win.winnerId)}
                                  {win.worth > 1 && <span className="text-muted-foreground ml-0.5">(×{win.worth})</span>}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </div>
                          );
                        })}
                                      </div>
                                      {/* Divider */}
                                      <div className="w-px bg-border" />
                                      {/* Team B column */}
                                      <div>
                                        <p className="font-medium text-destructive mb-1">Rival ({oyesesDetail.winsB})</p>
                        {oyesesDetail.par3Holes.map(holeNum => {
                          const win = oyesesDetail.wins.find(w => w.holeNumber === holeNum);
                          const isTeamBWin = win && resolvedTeamB.includes(win.winnerId);
                          return (
                            <div key={holeNum} className="text-[10px] grid grid-cols-[28px_1fr] items-center">
                              <span className="text-muted-foreground tabular-nums">H{holeNum}</span>
                              {isTeamBWin ? (
                                <span className="font-medium text-destructive">
                                  {getPlayerInitial(win.winnerId)}
                                  {win.worth > 1 && <span className="text-muted-foreground ml-0.5">(×{win.worth})</span>}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </div>
                          );
                        })}
                                      </div>
                                    </div>
                                    {/* Summary */}
                                    <div className="border-t border-border pt-1 space-y-0.5">
                                      <p className="flex justify-between"><span>Diferencial</span><span className="tabular-nums font-semibold">{oyesesDetail.diff}</span></p>
                                      <p className="flex justify-between"><span>Valor oyes</span><span className="tabular-nums">${oyesesDetail.valuePerOyes}</span></p>
                                      <p className="flex justify-between font-semibold">
                                        <span>Resultado</span>
                                        <span className={cn('tabular-nums', oyesesDetail.money > 0 ? 'text-green-600' : oyesesDetail.money < 0 ? 'text-destructive' : '')}>
                                          {isBaseInTeamA ? (oyesesDetail.money >= 0 ? '+' : '') : (oyesesDetail.money <= 0 ? '+' : '-')}${Math.abs(oyesesDetail.money)}
                                        </span>
                                      </p>
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            );
                          }

                          return <span key={i} className={cn(colorClass)}>{part}</span>;
                        })}
                      </div>
                    );
                  })()}
                  <p className="text-[10px] text-muted-foreground">
                    {bet.scoringType === 'lowBall' ? 'Bola Baja' :
                     bet.scoringType === 'highBall' ? 'Bola Alta' : 'Combinado'}
                  </p>
                </div>

                <CollapsibleContent className="mt-3 space-y-3">
                  
                  {/* Hole by hole grid with tooltips */}
                  <div className="bg-muted/30 rounded-lg p-2 space-y-2">
                    <div className="text-[10px] text-muted-foreground text-center">
                      Toca en un hoyo para ver el desglose
                    </div>
                    
                    {/* Front 9 */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">Front 9</span>
                        <span className={cn('text-xs font-bold tabular-nums', frontTotal > 0 ? 'text-green-600' : frontTotal < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                          {frontBetsDisplay}
                        </span>
                      </div>
                      <div className="grid grid-cols-9 gap-1">
                          {displayFrontDetails.map((detail, idx) => {
                            const holeNum = idx + 1;
                            const runningBalance = displayFrontBalances[idx];
                            const snapshot = displayFrontSnapshots[idx] || [];
                            const pressureDisplay = formatBetsDisplay(snapshot);
                            const snapshotSum = snapshot.reduce((a, b) => a + b, 0);
                            
                            const pill = (
                              <div
                                className={cn(
                                  'h-8 rounded border bg-background/60 flex flex-col items-center justify-center cursor-pointer',
                                  detail === null ? 'border-border text-muted-foreground' :
                                  snapshotSum > 0 ? 'border-green-600/40 text-green-600' :
                                  snapshotSum < 0 ? 'border-destructive/40 text-destructive' :
                                  'border-border text-muted-foreground'
                                )}
                              >
                                <span className={cn('text-[9px] opacity-80', detail === null && 'text-muted-foreground')}>{holeNum}</span>
                                <span className={cn('text-[10px] font-semibold tabular-nums leading-tight', detail === null && 'text-muted-foreground')}>
                                  {detail === null ? '–' : pressureDisplay}
                                </span>
                              </div>
                            );
                            
                            if (!detail) return <div key={holeNum}>{pill}</div>;
                            
                            return (
                              <Popover key={holeNum}>
                                <PopoverTrigger asChild>{pill}</PopoverTrigger>
                                <PopoverContent side="top" className="w-72 p-3">
                                  <div className="text-xs space-y-1">
                                    <p className="font-medium">Hoyo {holeNum} • {detail.net > 0 ? `+${detail.net}` : `${detail.net}`} pts</p>
                                    <TeamHoleGrid
                                      teamAPlayers={displayTeamAPlayers}
                                      teamBPlayers={displayTeamBPlayers}
                                      detail={{ netA1: detail.a1.net, hcpA1: detail.a1.hcp, netA2: detail.a2.net, hcpA2: detail.a2.hcp, netB1: detail.b1.net, hcpB1: detail.b1.hcp, netB2: detail.b2.net, hcpB2: detail.b2.hcp }}
                                    />
                                    <div className="pt-1 border-t border-border/50">
                                      {(bet.scoringType === 'lowBall' || bet.scoringType === 'combined') && (
                                        <p className="flex justify-between"><span>Bola Baja</span><span className="tabular-nums">{detail.lowBallWinner === 'A' ? 'Tu equipo' : detail.lowBallWinner === 'B' ? 'Rival' : 'Empate'}</span></p>
                                      )}
                                      {(bet.scoringType === 'highBall' || bet.scoringType === 'combined') && (
                                        <p className="flex justify-between"><span>Bola Alta</span><span className="tabular-nums">{detail.highBallWinner === 'A' ? 'Tu equipo' : detail.highBallWinner === 'B' ? 'Rival' : 'Empate'}</span></p>
                                      )}
                                      <p className="flex justify-between font-medium"><span>Puntos</span><span className="tabular-nums">{detail.pointsA} - {detail.pointsB}</span></p>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground border-t border-border/50 pt-1">
                                      Presiones: {pressureDisplay}
                                    </p>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            );
                          })}
                        </div>
                    </div>
                    
                    {/* Back 9 */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">Back 9</span>
                        <span className={cn('text-xs font-bold tabular-nums', backTotal > 0 ? 'text-green-600' : backTotal < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                          {backBetsDisplay}
                        </span>
                      </div>
                      <div className="grid grid-cols-9 gap-1">
                          {displayBackDetails.map((detail, idx) => {
                            const holeNum = idx + 10;
                            const snapshot = displayBackSnapshots[idx] || [];
                            const pressureDisplay = formatBetsDisplay(snapshot);
                            const snapshotSum = snapshot.reduce((a, b) => a + b, 0);
                            
                            const pill = (
                              <div
                                className={cn(
                                  'h-8 rounded border bg-background/60 flex flex-col items-center justify-center cursor-pointer',
                                  detail === null ? 'border-border text-muted-foreground' :
                                  snapshotSum > 0 ? 'border-green-600/40 text-green-600' :
                                  snapshotSum < 0 ? 'border-destructive/40 text-destructive' :
                                  'border-border text-muted-foreground'
                                )}
                              >
                                <span className={cn('text-[9px] opacity-80', detail === null && 'text-muted-foreground')}>{holeNum}</span>
                                <span className={cn('text-[10px] font-semibold tabular-nums leading-tight', detail === null && 'text-muted-foreground')}>
                                  {detail === null ? '–' : pressureDisplay}
                                </span>
                              </div>
                            );
                            
                            if (!detail) return <div key={holeNum}>{pill}</div>;
                            
                            return (
                              <Popover key={holeNum}>
                                <PopoverTrigger asChild>{pill}</PopoverTrigger>
                                <PopoverContent side="top" className="w-72 p-3">
                                  <div className="text-xs space-y-1">
                                    <p className="font-medium">Hoyo {holeNum} • {detail.net > 0 ? `+${detail.net}` : `${detail.net}`} pts</p>
                                    <TeamHoleGrid
                                      teamAPlayers={displayTeamAPlayers}
                                      teamBPlayers={displayTeamBPlayers}
                                      detail={{ netA1: detail.a1.net, hcpA1: detail.a1.hcp, netA2: detail.a2.net, hcpA2: detail.a2.hcp, netB1: detail.b1.net, hcpB1: detail.b1.hcp, netB2: detail.b2.net, hcpB2: detail.b2.hcp }}
                                    />
                                    <div className="pt-1 border-t border-border/50">
                                      {(bet.scoringType === 'lowBall' || bet.scoringType === 'combined') && (
                                        <p className="flex justify-between"><span>Bola Baja</span><span className="tabular-nums">{detail.lowBallWinner === 'A' ? 'Tu equipo' : detail.lowBallWinner === 'B' ? 'Rival' : 'Empate'}</span></p>
                                      )}
                                      {(bet.scoringType === 'highBall' || bet.scoringType === 'combined') && (
                                        <p className="flex justify-between"><span>Bola Alta</span><span className="tabular-nums">{detail.highBallWinner === 'A' ? 'Tu equipo' : detail.highBallWinner === 'B' ? 'Rival' : 'Empate'}</span></p>
                                      )}
                                      <p className="flex justify-between font-medium"><span>Puntos</span><span className="tabular-nums">{detail.pointsA} - {detail.pointsB}</span></p>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground border-t border-border/50 pt-1">
                                      Presiones: {pressureDisplay}
                                    </p>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            );
                          })}
                        </div>
                    </div>
                    
                    {/* Total 18 - Running cumulative across all 18 holes */}
                    <div className="space-y-1 pt-2 border-t border-border/50">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">Total 18</span>
                        <div className="flex items-center gap-2">
                          <span className={cn('text-xs font-bold tabular-nums', total18 > 0 ? 'text-green-600' : total18 < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                            {total18 >= 0 ? '+' : ''}{total18}
                          </span>
                          <span className={cn('text-xs font-bold tabular-nums', 
                            (() => {
                              const matchMoney = (total18 > 0 ? 1 : total18 < 0 ? -1 : 0) * bet.totalAmount;
                              return matchMoney > 0 ? 'text-green-600' : matchMoney < 0 ? 'text-destructive' : 'text-muted-foreground';
                            })()
                          )}>
                            {(() => {
                              const frontMainTied = displayFrontBets[0] === 0;
                              const matchMoney = frontMainTied ? 0 : (total18 > 0 ? 1 : total18 < 0 ? -1 : 0) * bet.totalAmount;
                              return matchMoney !== 0 ? `${matchMoney >= 0 ? '+$' : '-$'}${Math.abs(matchMoney)}` : (frontMainTied ? 'Carry' : '$0');
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        );
      })}

      {/* Grupales (Culebras/Pingüinos/Coneja/etc.)
          IMPORTANT: Use the same `scores` map as the rest of the dashboard (not `confirmedScores`)
          so the tie-breaker UI can trigger consistently even when confirmation state is inconsistent.
      */}
      <GroupBetsCard
        players={allPlayersForCalculations}
        scores={scores}
        betConfig={effectiveBetConfig}
        course={course}
        basePlayerId={basePlayer?.id || basePlayer?.profileId}
        confirmedHoles={confirmedHoles}
        onBetConfigChange={onBetConfigChange}
      />
    </div>
  );
};

// Shared aligned player grid for tooltips/popovers in Carritos and Foursomes
// Layout: Left side [Name Score Dot] | Right side [Dot Score Name]
// Scores are vertically aligned across all rows via grid columns
const TeamHoleGrid: React.FC<{
  teamAPlayers: { name: string }[];
  teamBPlayers: { name: string }[];
  detail: {
    netA1: number; hcpA1: number;
    netA2: number; hcpA2: number;
    netB1: number; hcpB1: number;
    netB2: number; hcpB2: number;
  };
}> = ({ teamAPlayers, teamBPlayers, detail }) => (
  <div className="space-y-0.5">
    <div className="flex justify-between text-[10px] text-muted-foreground">
      <span>Tu equipo</span>
      <span>Rival</span>
    </div>
    {/* Player row 1 */}
    <div className="grid text-sm tabular-nums" style={{ gridTemplateColumns: '1fr auto auto 12px auto auto 1fr' }}>
      <span className="truncate text-left">{teamAPlayers[0]?.name.split(' ')[0] ?? 'Jugador'}</span>
      <span className="font-medium text-right px-1">{detail.netA1}</span>
      <span className="flex items-center justify-center w-3">{detail.hcpA1 > 0 && <span className="h-2 w-2 rounded-full bg-foreground" />}</span>
      <span />
      <span className="flex items-center justify-center w-3">{detail.hcpB1 > 0 && <span className="h-2 w-2 rounded-full bg-foreground" />}</span>
      <span className="font-medium text-left px-1">{detail.netB1}</span>
      <span className="truncate text-right">{teamBPlayers[0]?.name.split(' ')[0] ?? 'Jugador'}</span>
    </div>
    {/* Player row 2 */}
    <div className="grid text-sm tabular-nums" style={{ gridTemplateColumns: '1fr auto auto 12px auto auto 1fr' }}>
      <span className="truncate text-left">{teamAPlayers[1]?.name.split(' ')[0] ?? 'Jugador'}</span>
      <span className="font-medium text-right px-1">{detail.netA2}</span>
      <span className="flex items-center justify-center w-3">{detail.hcpA2 > 0 && <span className="h-2 w-2 rounded-full bg-foreground" />}</span>
      <span />
      <span className="flex items-center justify-center w-3">{detail.hcpB2 > 0 && <span className="h-2 w-2 rounded-full bg-foreground" />}</span>
      <span className="font-medium text-left px-1">{detail.netB2}</span>
      <span className="truncate text-right">{teamBPlayers[1]?.name.split(' ')[0] ?? 'Jugador'}</span>
    </div>
  </div>
);

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
  isDisabled?: boolean;
  onToggleDisabled?: () => void;
}

const CarritosResultsCard: React.FC<CarritosResultsCardProps> = ({ results, players, basePlayerId, title = 'Carritos (Equipos)', onCancel, isDisabled, onToggleDisabled }) => {
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
  const disambiguatedAbbrsCarritos = useMemo(() => disambiguateInitials(players), [players]);
  const getPlayerAbbr = (player: Player) => disambiguatedAbbrsCarritos.get(player.id) || player.initials;
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

  // Unused legacy ScoreLine - replaced by TeamHoleGrid below

  const getNetTone = (n: number) => (n > 0 ? 'text-green-600' : n < 0 ? 'text-destructive' : 'text-muted-foreground');
  const getNetPill = (n: number) => (n > 0 ? 'border-green-600/40 text-green-600' : n < 0 ? 'border-destructive/40 text-destructive' : 'border-border text-muted-foreground');

  const getWinnerText = (w?: Winner) => {
    if (!w) return '—';
    if (w === 'tie') return 'Empate';
    return w === 'A' ? 'Tu equipo' : 'Rival';
  };

  const scoringLabel = results.scoringType === 'all'
    ? 'LowBall + HighBall + Suma'
    : results.scoringType === 'lowBall'
      ? 'LowBall'
      : results.scoringType === 'highBall'
        ? 'HighBall'
        : 'Suma';
  
  // Payment: Each loser pays 50% of their share to EACH winner
  // Total loss is split between 2 losers, then each loser splits their half between 2 winners
  // Example: Team loses $100 total -> each loser pays $50 total -> $25 to each winner
  const getPaymentBreakdown = () => {
    if (results.moneyA === 0) return null;
    
    const winningTeam = results.moneyA > 0 ? teamAPlayers : teamBPlayers;
    const losingTeam = results.moneyA > 0 ? teamBPlayers : teamAPlayers;
    const totalLost = Math.abs(results.moneyA);
    
    // Each loser pays 50% of total to EACH winner
    // Example: Total lost = $100
    // - Loser A pays $50 to Winner C and $50 to Winner D (total $100)
    // - Loser B pays $50 to Winner C and $50 to Winner D (total $100)
    // Each winner receives: $50 from A + $50 from B = $100
    const perLoserPayToEachWinner = totalLost / 2;
    
    return { winningTeam, losingTeam, perLoserPayToEachWinner, totalWon: totalLost };
  };
  
  const payment = getPaymentBreakdown();
  
  return (
    <Card className={cn('border-accent/50', isDisabled && 'opacity-50')}>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {title}
          </div>
          <div className="flex items-center gap-2">
            {isDisabled ? (
              <div className="text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">Cancelada</div>
            ) : (
              <span className={cn('text-base font-bold tabular-nums', getNetTone(baseTeamMoney))}>
                {baseTeamMoney >= 0 ? '+$' : '-$'}{Math.abs(baseTeamMoney)}
              </span>
            )}
            {onToggleDisabled && (
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-6 w-6', isDisabled ? 'text-green-600 hover:text-green-700' : 'text-muted-foreground hover:text-destructive')}
                onClick={onToggleDisabled}
                title={isDisabled ? 'Reactivar Carritos' : 'No considerar Carritos'}
              >
                {isDisabled ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              </Button>
            )}
            {onCancel && !onToggleDisabled && (
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
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Collapsible>
          <div className="space-y-1">
            {/* Names row */}
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium truncate">
                {displayTeamAPlayers.map(p => formatPlayerName(p.name).split(' ')[0]).join(' / ')}
              </span>
              <span className="text-muted-foreground text-xs mx-2">vs</span>
              <span className="font-medium truncate text-right">
                {displayTeamBPlayers.map(p => formatPlayerName(p.name).split(' ')[0]).join(' / ')}
              </span>
            </div>
            {/* Results row */}
            <div className="flex items-center gap-2">
              <div className="flex-1 grid grid-cols-3 gap-1 text-center text-sm tabular-nums">
                <span className={cn('font-semibold', getNetTone(baseTeamNetFront))}>
                  F9 {baseTeamNetFront >= 0 ? '+' : ''}{baseTeamNetFront}
                </span>
                <span className={cn('font-semibold', getNetTone(baseTeamNetBack))}>
                  B9 {baseTeamNetBack >= 0 ? '+' : ''}{baseTeamNetBack}
                </span>
                <span className={cn('font-bold', getNetTone(baseTeamNetTotal))}>
                  T {baseTeamNetTotal >= 0 ? '+' : ''}{baseTeamNetTotal}
                </span>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                  <ChevronDown className="h-4 w-4" />
                  <span className="sr-only">Ver detalle</span>
                </Button>
              </CollapsibleTrigger>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {scoringLabel}
            </p>
          </div>

          <CollapsibleContent className="mt-3 space-y-3">
            
            {/* Puntos por hoyo */}
            <div className="bg-muted/30 rounded-lg p-2 space-y-2">
              <div className="text-[10px] text-muted-foreground text-center">
                Toca en un hoyo para ver el desglose (• = stroke aplicado).
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
                const detail = baseHoleDetailsFront[idx];

                const pill = (
                  <div
                    className={cn(
                      'h-8 rounded border bg-background/60 flex flex-col items-center justify-center cursor-pointer',
                      net === null ? 'border-border text-muted-foreground' : getNetPill(net),
                    )}
                  >
                    <span className={cn('text-[9px] opacity-80', net === null && 'text-muted-foreground')}>{hole}</span>
                    <span className={cn('text-[11px] font-semibold tabular-nums', net === null && 'text-muted-foreground')}>
                      {net === null ? '–' : net > 0 ? `+${net}` : `${net}`}
                    </span>
                  </div>
                );

                if (net === null || !detail) {
                  return <div key={hole} onClick={() => openHoleDetail(hole, net, detail)}>{pill}</div>;
                }

                if (isMobile) {
                  return <div key={hole} onClick={() => openHoleDetail(hole, net, detail)}>{pill}</div>;
                }

                return (
                  <Popover key={hole}>
                    <PopoverTrigger asChild>{pill}</PopoverTrigger>
                    <PopoverContent side="top" className="w-72 p-3">
                      <div className="text-xs space-y-1">
                        <p className="font-medium">Hoyo {detail.holeNumber} • {net > 0 ? `+${net}` : `${net}`} pts</p>
                        <TeamHoleGrid
                          teamAPlayers={displayTeamAPlayers}
                          teamBPlayers={displayTeamBPlayers}
                          detail={detail}
                        />
                        <div className="pt-1 border-t border-border/50">
                          {(results.scoringType === 'lowBall' || results.scoringType === 'all') && (
                            <p className="flex justify-between"><span>Bola Baja</span><span className="tabular-nums">{getWinnerText(detail.lowBallWinner)}</span></p>
                          )}
                          {(results.scoringType === 'highBall' || results.scoringType === 'all') && (
                            <p className="flex justify-between"><span>Bola Alta</span><span className="tabular-nums">{getWinnerText(detail.highBallWinner)}</span></p>
                          )}
                          {(results.scoringType === 'combined' || results.scoringType === 'all') && (
                            <p className="flex justify-between"><span>Suma</span><span className="tabular-nums">{getWinnerText(detail.combinedWinner)}</span></p>
                          )}
                          <p className="flex justify-between font-medium"><span>Puntos</span><span className="tabular-nums">{detail.pointsA} - {detail.pointsB}</span></p>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
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
                const detail = baseHoleDetailsBack[idx];

                const pill = (
                  <div
                    className={cn(
                      'h-8 rounded border bg-background/60 flex flex-col items-center justify-center cursor-pointer',
                      net === null ? 'border-border text-muted-foreground' : getNetPill(net),
                    )}
                  >
                    <span className={cn('text-[9px] opacity-80', net === null && 'text-muted-foreground')}>{hole}</span>
                    <span className={cn('text-[11px] font-semibold tabular-nums', net === null && 'text-muted-foreground')}>
                      {net === null ? '–' : net > 0 ? `+${net}` : `${net}`}
                    </span>
                  </div>
                );

                if (net === null || !detail) {
                  return <div key={hole} onClick={() => openHoleDetail(hole, net, detail)}>{pill}</div>;
                }

                if (isMobile) {
                  return <div key={hole} onClick={() => openHoleDetail(hole, net, detail)}>{pill}</div>;
                }

                return (
                  <Popover key={hole}>
                    <PopoverTrigger asChild>{pill}</PopoverTrigger>
                    <PopoverContent side="top" className="w-72 p-3">
                      <div className="text-xs space-y-1">
                        <p className="font-medium">Hoyo {detail.holeNumber} • {net > 0 ? `+${net}` : `${net}`} pts</p>
                        <TeamHoleGrid
                          teamAPlayers={displayTeamAPlayers}
                          teamBPlayers={displayTeamBPlayers}
                          detail={detail}
                        />
                        <div className="pt-1 border-t border-border/50">
                          {(results.scoringType === 'lowBall' || results.scoringType === 'all') && (
                            <p className="flex justify-between"><span>Bola Baja</span><span className="tabular-nums">{getWinnerText(detail.lowBallWinner)}</span></p>
                          )}
                          {(results.scoringType === 'highBall' || results.scoringType === 'all') && (
                            <p className="flex justify-between"><span>Bola Alta</span><span className="tabular-nums">{getWinnerText(detail.highBallWinner)}</span></p>
                          )}
                          {(results.scoringType === 'combined' || results.scoringType === 'all') && (
                            <p className="flex justify-between"><span>Suma</span><span className="tabular-nums">{getWinnerText(detail.combinedWinner)}</span></p>
                          )}
                          <p className="flex justify-between font-medium"><span>Puntos</span><span className="tabular-nums">{detail.pointsA} - {detail.pointsB}</span></p>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
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

                      <TeamHoleGrid
                        teamAPlayers={displayTeamAPlayers}
                        teamBPlayers={displayTeamBPlayers}
                        detail={selectedHole.detail}
                      />

                  <div className="pt-2 border-t border-border/50 text-sm">
                    {(results.scoringType === 'lowBall' || results.scoringType === 'all') && (
                      <p className="flex justify-between">
                        <span>Bola Baja</span>
                        <span className="tabular-nums">{getWinnerText(selectedHole.detail.lowBallWinner as Winner | undefined)}</span>
                      </p>
                    )}
                    {(results.scoringType === 'highBall' || results.scoringType === 'all') && (
                      <p className="flex justify-between">
                        <span>Bola Alta</span>
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
                      <span>Puntos</span>
                      <span className="tabular-nums">{selectedHole.detail.pointsA} - {selectedHole.detail.pointsB}</span>
                    </p>
                  </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            )}

          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
};

// ─── Cross-Group Handicap Widget ─────────────────────────────────────────────
// Shown inside BetDashboard when a rival from another group is selected.
// Allows the base player to set strokes (+/-) that are persisted in round_handicaps,
// exactly like the intra-group HandicapMatrix.
interface CrossGroupHandicapWidgetProps {
  basePlayer: Player;
  rival: Player;
  getStrokesForLocalPair?: (localIdA: string, localIdB: string) => number;
  setStrokesForLocalPair?: (localIdA: string, localIdB: string, strokes: number) => Promise<boolean>;
  isHistorical?: boolean;
}

const CrossGroupHandicapWidget: React.FC<CrossGroupHandicapWidgetProps> = ({
  basePlayer,
  rival,
  getStrokesForLocalPair,
  setStrokesForLocalPair,
  isHistorical,
}) => {
  const { getSuggestedStrokes } = useSlidingPersistence();
  const [slidingSuggestion, setSlidingSuggestion] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Default strokes = rounded difference between handicaps (base - rival)
  // Positive = base gives strokes to rival; negative = rival gives strokes to base
  const defaultStrokes = Math.round(basePlayer.handicap - rival.handicap);

  // Current strokes from round_handicaps (live)
  // getStrokesForLocalPair(A, B) = strokes A gives to B
  const currentStrokes = getStrokesForLocalPair
    ? getStrokesForLocalPair(basePlayer.id, rival.id)
    : defaultStrokes;

  // Local display value (optimistic)
  const [localStrokes, setLocalStrokes] = useState<number>(currentStrokes);

  // Sync if external state changes (realtime updates from other clients)
  useEffect(() => {
    setLocalStrokes(currentStrokes);
  }, [currentStrokes]);

  // Load sliding suggestion for this pair (by profileId)
  useEffect(() => {
    if (!basePlayer.profileId || !rival.profileId) return;
    getSuggestedStrokes(basePlayer.profileId, rival.profileId).then(setSlidingSuggestion);
  }, [basePlayer.profileId, rival.profileId, getSuggestedStrokes]);

  const saveStrokes = useCallback(async (strokes: number) => {
    if (!setStrokesForLocalPair) return;
    setIsSaving(true);
    try {
      await setStrokesForLocalPair(basePlayer.id, rival.id, strokes);
    } finally {
      setIsSaving(false);
    }
  }, [setStrokesForLocalPair, basePlayer.id, rival.id]);

  const handleChange = (delta: number) => {
    const next = localStrokes + delta;
    setLocalStrokes(next);
    // Debounce save 400ms
    if (pendingRef.current) clearTimeout(pendingRef.current);
    pendingRef.current = setTimeout(() => {
      void saveStrokes(next);
    }, 400);
  };

  const handleApplySuggestion = () => {
    if (slidingSuggestion === null) return;
    setLocalStrokes(slidingSuggestion);
    if (pendingRef.current) clearTimeout(pendingRef.current);
    void saveStrokes(slidingSuggestion);
  };

  const handleApplyDefault = () => {
    setLocalStrokes(defaultStrokes);
    if (pendingRef.current) clearTimeout(pendingRef.current);
    void saveStrokes(defaultStrokes);
  };

  const canEdit = !!setStrokesForLocalPair && !isHistorical;

  // Describe who gives strokes
  const description = (() => {
    if (localStrokes === 0) return 'Scratch';
    const giver = localStrokes > 0 ? basePlayer.name.split(' ')[0] : rival.name.split(' ')[0];
    const receiver = localStrokes > 0 ? rival.name.split(' ')[0] : basePlayer.name.split(' ')[0];
    return `${giver} da ${Math.abs(localStrokes)} golpe(s) a ${receiver}`;
  })();

  return (
    <Card className="border-accent/40 bg-accent/5">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs flex items-center gap-2 text-accent-foreground">
          <Users className="h-3.5 w-3.5" />
          Ventaja entre grupos
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-3 px-3 space-y-2">
        {/* Main stepper row */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">{description}</div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 rounded-full"
                onClick={() => handleChange(-1)}
                disabled={isSaving}
              >
                <Minus className="h-3 w-3" />
              </Button>
            )}
            <div className={cn(
              'w-10 text-center text-xl font-bold',
              localStrokes > 0 ? 'text-destructive' : localStrokes < 0 ? 'text-green-600' : 'text-muted-foreground'
            )}>
              {localStrokes > 0 ? `+${localStrokes}` : localStrokes}
            </div>
            {canEdit && (
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 rounded-full"
                onClick={() => handleChange(1)}
                disabled={isSaving}
              >
                <Plus className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Helper chips */}
        {canEdit && (
          <div className="flex gap-2 flex-wrap">
            {/* Reset to USGA difference */}
            {localStrokes !== defaultStrokes && (
              <button
                type="button"
                onClick={handleApplyDefault}
                className="text-[10px] px-2 py-0.5 rounded-full border border-muted-foreground/30 text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                ↩ USGA ({defaultStrokes > 0 ? `+${defaultStrokes}` : defaultStrokes})
              </button>
            )}
            {/* Sliding suggestion */}
            {slidingSuggestion !== null && localStrokes !== slidingSuggestion && (
              <button
                type="button"
                onClick={handleApplySuggestion}
                className="text-[10px] px-2 py-0.5 rounded-full border border-amber-400/50 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors flex items-center gap-1"
              >
                ✨ Sliding ({slidingSuggestion > 0 ? `+${slidingSuggestion}` : slidingSuggestion})
              </button>
            )}
            {slidingSuggestion !== null && localStrokes === slidingSuggestion && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-600 border border-amber-400/30">
                ✨ Usando Sliding
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Bilateral Detail Component - Reorganized with bet type rows and override capability
interface BilateralDetailProps {
  players: Player[];
  groupPlayers: Player[]; // Players scoped to the current display group (for template inheritance checks)
  allPlayers: Player[]; // All players across all groups for Oyes calculations
  player: Player;
  rival: Player;
  groupedSummaries: Record<string, { total: number; details: BetSummary[] }>;
  totalBalance: number;
  expandedTypes: string[];
  onToggleExpand: (type: string) => void;
  bilateralHandicap?: BilateralHandicap;
  onUpdateBilateralHandicap: (handicap: BilateralHandicap) => void;
  betConfig: BetConfig;
  effectiveBetConfig: BetConfig;
  confirmedScores: Map<string, PlayerScore[]>;
  course: GolfCourse;
  allScores: Map<string, PlayerScore[]>;
  onBetConfigChange?: (config: BetConfig) => void;
  basePlayerId?: string;
  confirmedHoles: Set<number>;
  startingHole?: 1 | 10;
  getStrokesForLocalPair?: (localIdA: string, localIdB: string) => number;
  snapshotVsBalance?: number; // When set, this is the immutable snapshot balance for this pair
  snapshotPairBreakdowns?: SnapshotPairBreakdowns; // When set (historical), use as source of truth for betTypeGroups
  snapshotPairSegmentResults?: SnapshotPairSegmentResults; // Display-ready result text per pair+segment
  isHistorical?: boolean; // When true, skip recalculation - use groupedSummaries directly
}

const BilateralDetail: React.FC<BilateralDetailProps> = ({
  players,
  groupPlayers,
  allPlayers,
  player,
  rival,
  groupedSummaries,
  totalBalance,
  expandedTypes,
  onToggleExpand,
  bilateralHandicap,
  onUpdateBilateralHandicap,
  betConfig,
  effectiveBetConfig,
  confirmedScores,
  course,
  allScores,
  onBetConfigChange,
  basePlayerId,
  confirmedHoles,
  startingHole = 1,
  getStrokesForLocalPair,
  snapshotVsBalance,
  snapshotPairBreakdowns,
  snapshotPairSegmentResults,
  isHistorical = false,
}) => {
  const [editingBetType, setEditingBetType] = useState<string | null>(null);
  
  const disambiguatedAbbrsLocal = useMemo(() => disambiguateInitials(allPlayers), [allPlayers]);
  const getPlayerAbbr = (p: Player) => disambiguatedAbbrsLocal.get(p.id) || p.initials;

  // Get bet override for this pair (stored as a label substring; bet engine matches via "includes")
  const getBetOverride = (overrideLabel: string): BetOverride | undefined => {
    const normalizeLabel = (label: string) => {
      // The UI uses internal group keys (e.g. "rayas"), but overrides must match
      // the text labels emitted by the calculation engine (e.g. "Rayas Front").
      switch (label) {
        case 'medal':
          return 'Medal';
        case 'pressures':
          return 'Presiones';
        case 'skins':
          return 'Skins';
        case 'caros':
          return 'Caros';
        case 'oyeses':
          return 'Oyes';
        case 'units':
          return 'Unidades';
        case 'manchas':
          return 'Manchas';
        case 'culebras':
          return 'Culebras';
        case 'pinguinos':
          return 'Pingüinos';
        case 'rayas':
          return 'Rayas';
        case 'medalGeneral':
          return 'Medal General';
        case 'coneja':
          return 'Coneja';
        case 'sideBets':
          return 'Side Bet';
        case 'putts':
          return 'Putts';
        case 'stableford':
          return 'Stableford';
        case 'teamPressures':
          return 'Foursome';
        default:
          return label;
      }
    };

    const normalized = normalizeLabel(overrideLabel);

    const matchesPlayer = (overrideId: string, p: Player) =>
      overrideId === p.id || (p.profileId && overrideId === p.profileId);

    return betConfig.betOverrides?.find(
      (o) =>
        // Support legacy stored keys (e.g. "pressures") AND normalized engine labels (e.g. "Presiones")
        (o.betType === normalized || o.betType === overrideLabel) &&
        ((matchesPlayer(o.playerAId, player) && matchesPlayer(o.playerBId, rival)) ||
          (matchesPlayer(o.playerAId, rival) && matchesPlayer(o.playerBId, player)))
    );
  };

  // Update bet override
  const updateBetOverride = (overrideLabel: string, updates: Partial<BetOverride>) => {
    if (!onBetConfigChange) return;

    // Normalize group keys ("rayas") to engine labels ("Rayas") so overrides actually apply.
    const normalizedLabel = (() => {
      switch (overrideLabel) {
        case 'medal':
          return 'Medal';
        case 'pressures':
          return 'Presiones';
        case 'skins':
          return 'Skins';
        case 'caros':
          return 'Caros';
        case 'oyeses':
          return 'Oyes';
        case 'units':
          return 'Unidades';
        case 'manchas':
          return 'Manchas';
        case 'culebras':
          return 'Culebras';
        case 'pinguinos':
          return 'Pingüinos';
        case 'rayas':
          return 'Rayas';
        case 'medalGeneral':
          return 'Medal General';
        case 'coneja':
          return 'Coneja';
        case 'sideBets':
          return 'Side Bet';
        case 'putts':
          return 'Putts';
        case 'stableford':
          return 'Stableford';
         case 'teamPressures':
           return 'Foursome';
        default:
          return overrideLabel;
      }
    })();

    const matchesPlayer = (overrideId: string, p: Player) =>
      overrideId === p.id || (p.profileId && overrideId === p.profileId);
    
    const overrides = [...(betConfig.betOverrides || [])];
    const existingIdx = overrides.findIndex(
      (o) =>
        (o.betType === normalizedLabel || o.betType === overrideLabel) &&
        ((matchesPlayer(o.playerAId, player) && matchesPlayer(o.playerBId, rival)) ||
          (matchesPlayer(o.playerAId, rival) && matchesPlayer(o.playerBId, player)))
    );

    if (existingIdx >= 0) {
      overrides[existingIdx] = { ...overrides[existingIdx], ...updates };
    } else {
      overrides.push({
        playerAId: player.id,
        playerBId: rival.id,
        betType: normalizedLabel,
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
    const override = effectiveBetConfig.bilateralHandicaps?.find(
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
  // IMPORTANT: Use confirmedScores to match the calculation engine, not allScores
  const getMarkerDetails = (playerId: string, type: 'units' | 'manchas') => {
    const playerScores = confirmedScores.get(playerId) || [];
    const details: { holeNumber: number; marker: string; emoji: string; isPositive: boolean }[] = [];
    const isBasePlayer = playerId === player.id;
    
    playerScores.forEach(score => {
      // Skip if strokes is not a valid positive number (must match engine validation)
      if (!score.strokes || score.strokes <= 0) return;
      
      const holePar = course.holes[score.holeNumber - 1]?.par || 4;
      const toPar = score.strokes - holePar;
      
      if (type === 'units') {
        // Auto-detected units - positive for the player who got them
        if (toPar === -1) details.push({ holeNumber: score.holeNumber, marker: 'Birdie', emoji: '🐦', isPositive: isBasePlayer });
        if (toPar === -2) details.push({ holeNumber: score.holeNumber, marker: 'Águila', emoji: '🦅', isPositive: isBasePlayer });
        if (toPar <= -3) details.push({ holeNumber: score.holeNumber, marker: 'Albatros', emoji: '🦢', isPositive: isBasePlayer });
        // Manual units - only if strokes is valid
        if (score.markers?.sandyPar) details.push({ holeNumber: score.holeNumber, marker: 'Sandy Par', emoji: '🏖️', isPositive: isBasePlayer });
        if (score.markers?.aquaPar) details.push({ holeNumber: score.holeNumber, marker: 'Aqua Par', emoji: '💧', isPositive: isBasePlayer });
        if (score.markers?.holeOut) details.push({ holeNumber: score.holeNumber, marker: 'Hole Out', emoji: '🎯', isPositive: isBasePlayer });
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
        // DobleDigito - auto-detected when strokes >= 10 (not persisted to DB)
        if (score.strokes >= 10 || score.markers.dobleDigito) details.push({ holeNumber: score.holeNumber, marker: 'Doble Dígito', emoji: '🔟', isPositive: isManchaPositiveForBasePlayer });
        // Cuatriput - 4+ putts - negative for the player who commits it
        // Moreliana (exactly 4 putts) is a subset of cuatriput — show as cuatriput label
        if (score.putts >= 4 || score.markers.cuatriput) {
          details.push({ holeNumber: score.holeNumber, marker: score.putts === 4 ? 'Moreliana' : 'Cuatriput', emoji: '😱', isPositive: isManchaPositiveForBasePlayer });
        }
      }
    });
    
    return details;
  };
  
  // Helper: check if both player and rival participate in a given bet's participantIds
  // Applies template-inheritance logic AND group bet overrides.
  // Accepts either raw participantIds or a betKey to resolve from group overrides.
  // CROSS-GROUP: When the rival is from a different group, we only check that the
  // BASE player participates. The rival's group has its own participation config.
  // The "X" override button handles per-pair exclusion for cross-group bets.
  // Also supports oneVsAll mode: if oneVsAll is active, pair is valid if either is the anchor.
  const bothParticipate = (participantIds: string[] | undefined, betKey?: string): boolean => {
    // Detect cross-group pairing: rival is not in the base player's group
    const isCrossGroup = !groupPlayers.some(p => p.id === rival.id);
    
    // If betKey provided, resolve group override first
    let resolvedBetConfig: any = undefined;
    if (betKey) {
      const groupId = groupPlayers[0]?.groupId;
      if (groupId) {
        const resolved = resolveConfigForGroup(betConfig, groupId);
        const resolvedBet = resolved[betKey as keyof BetConfig] as any;
        if (resolvedBet?.enabled === false) return false;
        participantIds = resolvedBet?.participantIds;
        resolvedBetConfig = resolvedBet;
      } else {
        resolvedBetConfig = betConfig[betKey as keyof BetConfig] as any;
      }
    }
    
    // oneVsAll mode: pair is valid if either player or rival is the anchor
    if (resolvedBetConfig?.oneVsAll && resolvedBetConfig?.anchorPlayerId) {
      return player.id === resolvedBetConfig.anchorPlayerId || rival.id === resolvedBetConfig.anchorPlayerId;
    }
    
    if (!participantIds) return true; // undefined = all participate
    if (participantIds.length === 0) return false; // [] = nobody participates
    
    // CROSS-GROUP: The cross-group engine already computed this bet with
    // participantIds: undefined (everyone participates). The "X" override button
    // handles per-pair exclusion. So always show the bet in the detail view.
    if (isCrossGroup) {
      return true;
    }
    
    // Same-group: check if BOTH player and rival are in the list
    const playerIn = participantIds.includes(player.id);
    const rivalIn = participantIds.includes(rival.id);
    
    if (playerIn && rivalIn) return true;
    
    // Template inheritance: if NO player from the current group is in
    // participantIds, it means the list was set for a different group (template).
    // CRITICAL: Use groupPlayers (scoped to display group), NOT players (all groups).
    const anyGroupPlayerInList = groupPlayers.some(p => participantIds!.includes(p.id));
    if (!anyGroupPlayerInList) return true;
    
    // Some current-group players are explicitly listed but not both of this pair
    return false;
  };

  // Group bet types for organized display
  const betTypeGroups = useMemo(() => {
    const groups: {
      key: string;
      label: string;
      segments: { label: string; key: string; overrideLabel?: string }[];
      getTotal: () => number;
      getSegmentData: (segmentKey: string) => { playerNet: number; rivalNet: number; amount: number; description?: string };
      configKey: string;
    }[] = [];

    // ── HISTORICAL MODE ────────────────────────────────────────────────────────
    // Reads exclusively from the immutable snapshot. NO recalculation.
    // Restores the exact same look & feel as a live round:
    //   - 1 collapsible row per bet family (Medal, Presiones, Skins, Rayas, Putts…)
    //   - Sub-segments (Front / Back / Total) shown inside when expanded
    // Source priority: snapshotPairSegmentResults (display-ready) → snapshotPairBreakdowns → groupedSummaries
    if (isHistorical) {
      // Helper: get amount for a betType from either source
      const pairKey = `${player.id}::${rival.id}`;
      const breakdown = snapshotPairBreakdowns?.[pairKey];

      // Helper: get pre-saved result text from snapshot (no recalculation)
      // Key format: "playerAId::playerBId::betType::segment"
      const getSegResult = (betType: string, segment: string) => {
        if (!snapshotPairSegmentResults) return undefined;
        return snapshotPairSegmentResults[`${player.id}::${rival.id}::${betType}::${segment}`];
      };

      // Legacy helper: sum net scores from confirmedScores (no recalc, fallback when pairSegmentResults absent)
      const getNetSum = (playerId: string, startHole: number, endHole: number): number => {
        const pScores = confirmedScores.get(playerId) || [];
        return pScores
          .filter(s => s.holeNumber >= startHole && s.holeNumber <= endHole)
          .reduce((sum, s) => sum + (typeof s.netScore === 'number' && Number.isFinite(s.netScore) ? s.netScore : (s.strokes || 0)), 0);
      };
      const getPlayerNet = (startHole: number, endHole: number) => getNetSum(player.id, startHole, endHole);
      const getRivalNet  = (startHole: number, endHole: number) => getNetSum(rival.id, startHole, endHole);

      const getAmt = (betType: string): number => {
        if (breakdown) return breakdown[betType] ?? 0;
        // Legacy fallback (old snapshots without pairBreakdowns)
        const EXCLUDED = new Set(['Carritos Front', 'Carritos Back', 'Carritos Total', 'Presiones Parejas', 'Presiones Pareja']);
        if (EXCLUDED.has(betType)) return 0;
        return groupedSummaries[betType]?.total ?? 0;
      };

      // Helper to build a simple segment descriptor
      const seg = (label: string, betType: string) => ({
        label,
        key: `hist_seg_${betType}`,
        overrideLabel: betType,
      });

      // ── Medal — total único, sin desplegable ───────────────────────────────
      const medalFront = getAmt('Medal Front 9');
      const medalBack  = getAmt('Medal Back 9');
      const medalTotal = getAmt('Medal Total');
      const medalSum   = medalFront + medalBack + medalTotal;
      if (medalSum !== 0) {
        groups.push({
          key: 'hist_medal', label: 'Medal', configKey: 'medal',
          segments: [], // Sin desplegable en histórico — solo total
          getTotal: () => medalSum,
          getSegmentData: () => ({ playerNet: 0, rivalNet: 0, amount: medalSum }),
        });
      }

      // ── Presiones — sin desplegable, solo muestra el resultado del Match Total (18 hoyos) ──
      const presFront = getAmt('Presiones Front');
      const presBack  = getAmt('Presiones Back') + getAmt('Presiones Back (Carry x2+Match)');
      const presMatch = getAmt('Presiones Match 18');
      const presSum   = presFront + presBack + presMatch;
      if (presSum !== 0) {
        // Leer el resultado del match total desde el snapshot (guardado al cerrar)
        // Key: "playerAId::playerBId::Presiones Total::total"
        const matchTotalSaved = getSegResult('Presiones Total', 'total');

        // Fallback para snapshots legacy: derivar desde front/back descriptions
        let matchTotalText: string | undefined;
        if (matchTotalSaved) {
          matchTotalText = matchTotalSaved.resultText;
        } else {
          // Legacy: intentar leer de front/back guardados
          const frontSeg = getSegResult('Presiones Front', 'front');
          if (frontSeg?.hasCarry) {
            matchTotalText = 'Carry';
          } else if (frontSeg) {
            const backSeg = getSegResult('Presiones Back', 'back');
            if (frontSeg && backSeg) {
              const fv = frontSeg.resultText.match(/^([+-]?\d+)/);
              const bv = backSeg.resultText.match(/^([+-]?\d+)/);
              if (fv && bv) {
                const total = parseInt(fv[1], 10) + parseInt(bv[1], 10);
                matchTotalText = total > 0 ? `+${total}` : total < 0 ? `${total}` : 'Even';
              }
            }
          }
        }

        groups.push({
          key: 'hist_presiones', label: 'Presiones', configKey: 'pressures',
          segments: [], // Sin desplegable — resultado del match se muestra inline
          getTotal: () => presSum,
          // matchTotalText lo pasamos como description para que el render lo muestre
          getSegmentData: () => ({ playerNet: 0, rivalNet: 0, amount: presSum, description: matchTotalText }),
        });
      }

      // ── Skins — total único, sin desplegable ───────────────────────────────
      const skinsFront = getAmt('Skins Front');
      const skinsBack  = getAmt('Skins Back');
      const skinsSum   = skinsFront + skinsBack;
      if (skinsSum !== 0) {
        groups.push({
          key: 'hist_skins', label: 'Skins', configKey: 'skins',
          segments: [],
          getTotal: () => skinsSum,
          getSegmentData: () => ({ playerNet: 0, rivalNet: 0, amount: skinsSum }),
        });
      }

      // ── Rayas — total único, sin desplegable ───────────────────────────────
      const rayasFront = getAmt('Rayas Front');
      const rayasBack  = getAmt('Rayas Back');
      const rayasMedal = getAmt('Rayas Medal Total');
      const rayasOyes  = getAmt('Rayas Oyes');
      const rayasSum   = rayasFront + rayasBack + rayasMedal + rayasOyes;
      if (rayasSum !== 0) {
        groups.push({
          key: 'hist_rayas', label: 'Rayas', configKey: 'rayas',
          segments: [],
          getTotal: () => rayasSum,
          getSegmentData: () => ({ playerNet: 0, rivalNet: 0, amount: rayasSum }),
        });
      }

      // ── Putts — total único, sin desplegable ───────────────────────────────
      const puttsFront = getAmt('Putts Front');
      const puttsBack  = getAmt('Putts Back');
      const puttsTotal = getAmt('Putts Total');
      const puttsSum   = puttsFront + puttsBack + puttsTotal;
      if (puttsSum !== 0) {
        groups.push({
          key: 'hist_putts', label: 'Putts', configKey: 'putts',
          segments: [],
          getTotal: () => puttsSum,
          getSegmentData: () => ({ playerNet: 0, rivalNet: 0, amount: puttsSum }),
        });
      }

      // ── Atomic bets (1 row, no sub-segments) ──────────────────────────────
      const atomicBets: Array<{ bt: string; label: string; configKey: string }> = [
        { bt: 'Caros',        label: 'Caros',        configKey: 'caros' },
        { bt: 'Oyes',         label: 'Oyes',          configKey: 'oyeses' },
        { bt: 'Unidades',     label: 'Unidades',      configKey: 'units' },
        { bt: 'Manchas',      label: 'Manchas',       configKey: 'manchas' },
        { bt: 'Culebras',     label: 'Culebras',      configKey: 'culebras' },
        { bt: 'Pingüinos',    label: 'Pingüinos',     configKey: 'pinguinos' },
        { bt: 'Coneja',       label: 'Coneja',        configKey: 'coneja' },
        { bt: 'Medal General',label: 'Medal General', configKey: 'medalGeneral' },
        { bt: 'Stableford',   label: 'Stableford',    configKey: 'stableford' },
        { bt: 'Side Bet',     label: 'Side Bet',      configKey: 'sideBets' },
      ];
      for (const { bt, label, configKey } of atomicBets) {
        const amount = getAmt(bt);
        if (amount !== 0) {
          const descFromLedger = breakdown ? undefined : groupedSummaries[bt]?.details?.[0]?.description;
          groups.push({
            key: `hist_${bt}`, label, configKey,
            segments: [],
            getTotal: () => amount,
            getSegmentData: () => ({ playerNet: 0, rivalNet: 0, amount, description: descFromLedger }),
          });
        }
      }

      // ── Unknown / future bet types not in the map above ────────────────────
      const knownBetTypes = new Set([
        'Medal Front 9','Medal Back 9','Medal Total',
        'Presiones Front','Presiones Back','Presiones Back (Carry x2+Match)','Presiones Match 18',
        'Skins Front','Skins Back',
        'Rayas Front','Rayas Back','Rayas Medal Total','Rayas Oyes',
        'Putts Front','Putts Back','Putts Total',
        'Caros','Oyes','Unidades','Manchas','Culebras','Pingüinos',
        'Coneja','Medal General','Stableford','Side Bet',
        'Carritos Front','Carritos Back','Carritos Total','Presiones Parejas','Presiones Pareja',
      ]);
      const sourceKeys = breakdown ? Object.keys(breakdown) : Object.keys(groupedSummaries);
      for (const bt of sourceKeys) {
        if (knownBetTypes.has(bt)) continue;
        const amount = getAmt(bt);
        if (amount === 0) continue;
        groups.push({
          key: `hist_unknown_${bt}`, label: bt, configKey: bt,
          segments: [],
          getTotal: () => amount,
          getSegmentData: () => ({ playerNet: 0, rivalNet: 0, amount }),
        });
      }

      return groups;
    }

    // LIVE MODE: Build groups from betConfig and live engine calculations.

    // Medal
    if (betConfig.medal.enabled && bothParticipate(betConfig.medal.participantIds, 'medal')) {
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
    
    // Putts - Individual bet (no handicap) - Show total putts for each player (after Medal)
    if (betConfig.putts?.enabled && bothParticipate(betConfig.putts?.participantIds, 'putts')) {
      const puttsFront = groupedSummaries['Putts Front']?.total || 0;
      const puttsBack = groupedSummaries['Putts Back']?.total || 0;
      const puttsTotal = groupedSummaries['Putts Total']?.total || 0;
      const total = puttsFront + puttsBack + puttsTotal;
      
      // Calculate total putts for each player
      const getPlayerPutts = (playerId: string, startHole: number, endHole: number): number => {
        const playerScores = allScores.get(playerId) || [];
        return playerScores
          .filter(s => s.confirmed && s.holeNumber >= startHole && s.holeNumber <= endHole && typeof s.putts === 'number')
          .reduce((sum, s) => sum + (s.putts || 0), 0);
      };
      
      const playerPuttsFront = getPlayerPutts(player.id, 1, 9);
      const playerPuttsBack = getPlayerPutts(player.id, 10, 18);
      const playerPuttsTotal = playerPuttsFront + playerPuttsBack;
      const rivalPuttsFront = getPlayerPutts(rival.id, 1, 9);
      const rivalPuttsBack = getPlayerPutts(rival.id, 10, 18);
      const rivalPuttsTotal = rivalPuttsFront + rivalPuttsBack;
      
      if (total !== 0 || (betConfig.putts.frontAmount > 0 || betConfig.putts.backAmount > 0 || betConfig.putts.totalAmount > 0)) {
        groups.push({
          key: 'putts',
          label: 'Putts',
          configKey: 'putts',
          segments: [
            { label: 'Front 9', key: 'putts_front', overrideLabel: 'Putts Front 9' },
            { label: 'Back 9', key: 'putts_back', overrideLabel: 'Putts Back 9' },
            { label: 'Total', key: 'putts_total', overrideLabel: 'Putts Total' },
          ],
          getTotal: () => total,
          getSegmentData: (segmentKey) => {
            if (segmentKey === 'putts_front') {
              return { 
                playerNet: playerPuttsFront, 
                rivalNet: rivalPuttsFront, 
                amount: puttsFront, 
                description: `${playerPuttsFront} vs ${rivalPuttsFront} putts` 
              };
            } else if (segmentKey === 'putts_back') {
              return { 
                playerNet: playerPuttsBack, 
                rivalNet: rivalPuttsBack, 
                amount: puttsBack, 
                description: `${playerPuttsBack} vs ${rivalPuttsBack} putts` 
              };
            } else {
              return { 
                playerNet: playerPuttsTotal, 
                rivalNet: rivalPuttsTotal, 
                amount: puttsTotal, 
                description: `${playerPuttsTotal} vs ${rivalPuttsTotal} putts` 
              };
            }
          },
        });
      }
    }
    
    // Presiones
    if (betConfig.pressures.enabled && bothParticipate(betConfig.pressures.participantIds, 'pressures')) {
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
    if (betConfig.skins.enabled && bothParticipate(betConfig.skins.participantIds, 'skins')) {
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
    if (betConfig.caros.enabled && bothParticipate(betConfig.caros.participantIds, 'caros')) {
      groups.push({
        key: 'caros',
        label: 'Caros',
        configKey: 'caros',
        segments: [
          { label: '15-18', key: 'caros_all' },
        ],
        getTotal: () => groupedSummaries['Caros']?.total || 0,
        getSegmentData: () => {
          const summary = groupedSummaries['Caros'];
          const description = summary?.details?.[0]?.description || '';
          const match = description.match(/(\d+) vs (\d+)/);
          // Compute actual net strokes for holes 15-18 so ties show real scores (not 0 vs 0)
          const carosPlayerNet = (() => {
            if (match) return parseInt(match[1]);
            // Fallback: compute directly from confirmed scores
            const playerScores = confirmedScores.get(player.id) || [];
            return playerScores.filter(s => s.holeNumber >= 15 && s.holeNumber <= 18)
              .reduce((sum, s) => sum + (Number.isFinite(s.netScore) ? s.netScore : (s.strokes || 0)), 0);
          })();
          const carosRivalNet = (() => {
            if (match) return parseInt(match[2]);
            const rivalScores = confirmedScores.get(rival.id) || [];
            return rivalScores.filter(s => s.holeNumber >= 15 && s.holeNumber <= 18)
              .reduce((sum, s) => sum + (Number.isFinite(s.netScore) ? s.netScore : (s.strokes || 0)), 0);
          })();
          return {
            playerNet: carosPlayerNet,
            rivalNet: carosRivalNet,
            amount: summary?.total || 0,
            description,
          };
        },
      });
    }
    
    // Oyeses (before Units as per spec)
    if (betConfig.oyeses.enabled && bothParticipate(betConfig.oyeses.participantIds, 'oyeses')) {
      groups.push({
        key: 'oyeses',
        label: 'Oyes',
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
    if (betConfig.units.enabled && bothParticipate(betConfig.units.participantIds, 'units')) {
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
    if (betConfig.manchas.enabled && bothParticipate(betConfig.manchas.participantIds, 'manchas')) {
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
    if (betConfig.culebras?.enabled && bothParticipate(betConfig.culebras?.participantIds, 'culebras')) {
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
    if (betConfig.pinguinos?.enabled && bothParticipate(betConfig.pinguinos?.participantIds, 'pinguinos')) {
      groups.push({
        key: 'pinguinos',
        label: 'Pingüinos',
        configKey: 'pinguinos',
        segments: [],
        getTotal: () => groupedSummaries['Pingüinos']?.total || 0,
        getSegmentData: () => ({ playerNet: 0, rivalNet: 0, amount: 0 }),
      });
    }
    
    // Zoológico - Show enabled animals with amounts for this pair
    if (betConfig.zoologico?.enabled && bothParticipate(betConfig.zoologico?.participantIds, 'zoologico')) {
      const enabledAnimals = betConfig.zoologico.enabledAnimals || ['camello', 'pez', 'gorila'];
      const valuePerOccurrence = betConfig.zoologico.valuePerOccurrence || 10;
      
      // Calculate totals from zoo summaries for each animal
      // Note: betType uses singular labels ("Zoológico Camello", etc.)
      const animalLabels: Record<string, string> = {
        camello: 'Zoológico Camello',
        pez: 'Zoológico Pez',
        gorila: 'Zoológico Gorila',
      };
      
      const zooTotal = enabledAnimals.reduce((sum, animal) => {
        return sum + (groupedSummaries[animalLabels[animal]]?.total || 0);
      }, 0);
      
      // Build segments for each enabled animal in order: Camellos, Peces, Gorilas (display plural)
      const orderedAnimals: Array<'camello' | 'pez' | 'gorila'> = ['camello', 'pez', 'gorila'];
      const segments = orderedAnimals
        .filter(a => enabledAnimals.includes(a))
        .map(animal => ({
          label: animal === 'camello' ? '🐪 Camellos' : animal === 'pez' ? '🐟 Peces' : '🦍 Gorilas',
          key: `zoo_${animal}`,
        }));
      
      groups.push({
        key: 'zoologico',
        label: 'Zoológico 🐾',
        configKey: 'zoologico',
        segments,
        getTotal: () => zooTotal,
        getSegmentData: (segmentKey) => {
          const animal = segmentKey.replace('zoo_', '') as 'camello' | 'pez' | 'gorila';
          const summaryKey = animalLabels[animal];
          const summary = groupedSummaries[summaryKey];
          return {
            playerNet: 0,
            rivalNet: 0,
            amount: summary?.total || 0,
            description: `$${valuePerOccurrence}/incidencia`,
          };
        },
      });
    }
    
    // Rayas (Aggregator bet)
    // HISTORICAL: Read directly from snapshot ledger via groupedSummaries
    // LIVE: Recalculate from scores
    if (effectiveBetConfig.rayas?.enabled && bothParticipate(effectiveBetConfig.rayas?.participantIds, 'rayas') && isRayasActiveForPair(effectiveBetConfig, player.id, rival.id)) {
      if (isHistorical) {
        // Historical mode: use ledger-derived groupedSummaries directly
        const rayasFrontTotal = groupedSummaries['Rayas Front']?.total || 0;
        const rayasBackTotal = groupedSummaries['Rayas Back']?.total || 0;
        const rayasMedalTotal = groupedSummaries['Rayas Medal Total']?.total || 0;
        const rayasOyesTotal = groupedSummaries['Rayas Oyes']?.total || 0;
        const rayasTotalFromLedger = rayasFrontTotal + rayasBackTotal + rayasMedalTotal + rayasOyesTotal;
        
        // Build segments dynamically based on what's in the ledger
        const segments: { label: string; key: string }[] = [
          { label: 'Front 9', key: 'rayas_front' },
          { label: 'Back 9', key: 'rayas_back' },
          { label: 'Medal Total', key: 'rayas_medal' },
        ];
        if (rayasOyesTotal !== 0) {
          segments.push({ label: 'Oyes', key: 'rayas_oyes' });
        }
        
        if (rayasTotalFromLedger !== 0 || rayasFrontTotal !== 0 || rayasBackTotal !== 0 || rayasMedalTotal !== 0 || rayasOyesTotal !== 0) {
          groups.push({
            key: 'rayas',
            label: 'Rayas',
            configKey: 'rayas',
            segments,
            getTotal: () => rayasTotalFromLedger,
            getSegmentData: (segmentKey) => {
              const summaryKeyMap: Record<string, string> = {
                'rayas_front': 'Rayas Front',
                'rayas_back': 'Rayas Back',
                'rayas_medal': 'Rayas Medal Total',
                'rayas_oyes': 'Rayas Oyes',
              };
              const summaryKey = summaryKeyMap[segmentKey] || 'Rayas Front';
              const summary = groupedSummaries[summaryKey];
              return {
                playerNet: 0,
                rivalNet: 0,
                amount: summary?.total || 0,
                description: summary?.details?.[0]?.description,
              };
            },
          });
        }
      } else {
      // Pre-compute Rayas total from the same source used in the detail view
      // This ensures the header line matches the TOTAL RAYAS in the expanded detail
      const rayasResultForTotal = getRayasDetailForPair(
        player,
        rival,
        confirmedScores,
        effectiveBetConfig,
        course,
        effectiveBetConfig.bilateralHandicaps,
        allPlayers
      );
      
      // Get Dashboard override amounts for this pair
      const rayasAmountOverrides = (() => {
        const overrides = effectiveBetConfig.betOverrides || [];
        const findOverride = (betType: string): number | undefined => {
          const match = overrides.find(o =>
            o.betType === betType &&
            o.enabled !== false &&
            o.amountOverride !== undefined &&
            ((o.playerAId === player.id && o.playerBId === rival.id) ||
             (o.playerAId === rival.id && o.playerBId === player.id) ||
             (player.profileId && (o.playerAId === player.profileId || o.playerBId === player.profileId) &&
              (o.playerAId === rival.id || o.playerBId === rival.id)) ||
             (rival.profileId && (o.playerAId === rival.profileId || o.playerBId === rival.profileId) &&
              (o.playerAId === player.id || o.playerBId === player.id)))
          );
          return match?.amountOverride;
        };
        return {
          frontValue: findOverride('Rayas Front') ?? betConfig.rayas?.frontValue ?? 0,
          backValue: findOverride('Rayas Back') ?? betConfig.rayas?.backValue ?? 0,
          medalTotalValue: findOverride('Rayas Medal Total') ?? betConfig.rayas?.medalTotalValue ?? 0,
        };
      })();
      
      // Count rayas per segment from details
      const rayasCounts = (() => {
        let frontRayas = 0;
        let backRayas = 0;
        let medalTotalRayas = 0;
        rayasResultForTotal.details.forEach((d) => {
          if (d.appliedSegment === 'front') frontRayas += d.rayasCount || 0;
          else if (d.appliedSegment === 'back') backRayas += d.rayasCount || 0;
          else if (d.appliedSegment === 'total') medalTotalRayas += d.rayasCount || 0;
        });
        return { frontRayas, backRayas, medalTotalRayas };
      })();
      
      // Calculate amounts using override values (not stale d.valuePerRaya)
      const frontAmount = rayasCounts.frontRayas * rayasAmountOverrides.frontValue;
      const backAmount = rayasCounts.backRayas * rayasAmountOverrides.backValue;
      const medalAmount = rayasCounts.medalTotalRayas * rayasAmountOverrides.medalTotalValue;
      const rayasTotalFromDetails = frontAmount + backAmount + medalAmount;
      
      groups.push({
        key: 'rayas',
        label: 'Rayas',
        configKey: 'rayas',
        segments: [
          { label: 'Front 9', key: 'rayas_front' },
          { label: 'Back 9', key: 'rayas_back' },
          { label: 'Medal Total', key: 'rayas_medal' },
        ],
        getTotal: () => rayasTotalFromDetails,
        getSegmentData: (segmentKey) => {
          if (segmentKey === 'rayas_front') {
            const summary = groupedSummaries['Rayas Front'];
            const match = summary?.details?.[0]?.description?.match(/(\d+) vs (\d+)/);
            return {
              playerNet: match ? parseInt(match[1]) : 0,
              rivalNet: match ? parseInt(match[2]) : 0,
              amount: frontAmount,
              description: summary?.details?.[0]?.description,
            };
          } else if (segmentKey === 'rayas_back') {
            const summary = groupedSummaries['Rayas Back'];
            const match = summary?.details?.[0]?.description?.match(/(\d+) vs (\d+)/);
            return {
              playerNet: match ? parseInt(match[1]) : 0,
              rivalNet: match ? parseInt(match[2]) : 0,
              amount: backAmount,
              description: summary?.details?.[0]?.description,
            };
          } else {
            const summary = groupedSummaries['Rayas Medal Total'];
            // Show net scores for Medal Total so you can see who's winning
            const playerNet = getNetScoreForSegmentWithBilateral(player.id, rival.id, 'total');
            const rivalNet = getNetScoreForSegmentWithBilateral(rival.id, player.id, 'total');
            return {
              playerNet,
              rivalNet,
              amount: medalAmount,
              description: summary?.details?.[0]?.description ?? (playerNet !== rivalNet ? `${playerNet} vs ${rivalNet}` : undefined),
            };
          }
        },
      });
      } // end else (live mode)
    }
    
    // Coneja - Group bet shown in bilateral view (before Medal General)
    // HISTORICAL: Read from snapshot ledger. LIVE: Recalculate.
    if (effectiveBetConfig.coneja?.enabled && bothParticipate(effectiveBetConfig.coneja?.participantIds, 'coneja') && players.length >= 2) {
      if (isHistorical) {
        const conejaTotal = groupedSummaries['Coneja']?.total || 0;
        if (conejaTotal !== 0) {
          groups.push({
            key: 'coneja',
            label: 'Coneja',
            configKey: 'coneja',
            segments: [],
            getTotal: () => conejaTotal,
            getSegmentData: () => ({
              playerNet: 0,
              rivalNet: 0,
              amount: conejaTotal,
              description: groupedSummaries['Coneja']?.details?.[0]?.description || '',
            }),
          });
        }
      } else {
        // Calculate Coneja results for this pair
        // CRITICAL: Use groupPlayers (not allPlayers) to match the engine's per-group Coneja scoping.
        // The engine calculates Coneja per group via groupPlayersByGroup, so the detail view must too.
        // Also filter by participantIds to respect participation setup.
        const conejaParticipantIds = effectiveBetConfig.coneja?.participantIds;
        const conejaPlayers = (conejaParticipantIds && conejaParticipantIds.length > 0)
          ? groupPlayers.filter(p => conejaParticipantIds.includes(p.id))
          : groupPlayers;
        const conejaBets = calculateConejaBets(conejaPlayers.length >= 2 ? conejaPlayers : groupPlayers, confirmedScores, course, effectiveBetConfig, confirmedHoles);
        
        const playerWinsFromRival = conejaBets
          .filter(b => b.winnerId === player.id && b.loserId === rival.id)
          .reduce((sum, b) => sum + b.amount, 0);
        const rivalWinsFromPlayer = conejaBets
          .filter(b => b.winnerId === rival.id && b.loserId === player.id)
          .reduce((sum, b) => sum + b.amount, 0);
        
        const conejaBalance = playerWinsFromRival - rivalWinsFromPlayer;
        
        if (conejaBalance !== 0 || conejaBets.some(b => 
          (b.winnerId === player.id && b.loserId === rival.id) || 
          (b.winnerId === rival.id && b.loserId === player.id)
        )) {
          groups.push({
            key: 'coneja',
            label: 'Coneja',
            configKey: 'coneja',
            segments: [],
            getTotal: () => conejaBalance,
            getSegmentData: () => {
              const wonSets = conejaBets
                .filter(b => b.winnerId === player.id && b.loserId === rival.id)
                .map(b => b.setNumber);
              const lostSets = conejaBets
                .filter(b => b.winnerId === rival.id && b.loserId === player.id)
                .map(b => b.setNumber);
              const description = wonSets.length > 0 
                ? `Ganado: Set${wonSets.length > 1 ? 's' : ''} ${wonSets.join(', ')}`
                : lostSets.length > 0
                  ? `Perdido: Set${lostSets.length > 1 ? 's' : ''} ${lostSets.join(', ')}`
                  : 'Sin resultado';
              return {
                playerNet: playerWinsFromRival,
                rivalNet: rivalWinsFromPlayer,
                amount: conejaBalance,
                description,
              };
            },
          });
        }
      }
    }
    
    // Medal General (Group bet shown in bilateral view)
    // HISTORICAL: Read from snapshot ledger. LIVE: Recalculate.
    if (betConfig.medalGeneral?.enabled && bothParticipate(betConfig.medalGeneral?.participantIds, 'medalGeneral')) {
      if (isHistorical) {
        const medalTotal = groupedSummaries['Medal General']?.total || 0;
        if (medalTotal !== 0) {
          groups.push({
            key: 'medalGeneral',
            label: 'Medal General',
            configKey: 'medalGeneral',
            segments: [],
            getTotal: () => medalTotal,
            getSegmentData: () => ({
              playerNet: 0,
              rivalNet: 0,
              amount: medalTotal,
              description: groupedSummaries['Medal General']?.details?.[0]?.description || '',
            }),
          });
        }
      } else {
        // Use allPlayers versions to ensure groupId is available for scope filtering
        const playerWithGroup = allPlayers.find(p => p.id === player.id) || player;
        const rivalWithGroup = allPlayers.find(p => p.id === rival.id) || rival;
        const medalResult = getMedalGeneralBilateralResult(allPlayers, playerWithGroup, rivalWithGroup, confirmedScores, betConfig, course);
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
    }
    
    // Side Bets - Direct money between players (with hole info)
    if (betConfig.sideBets?.enabled && betConfig.sideBets.bets?.length > 0) {
      const sideBetTotal = groupedSummaries['Side Bet']?.total || 0;
      
      // Check if any side bets involve this pair (normalize profileId → local id)
      const matchesId = (rawId: string, p: Player) =>
        rawId === p.id || (p.profileId && rawId === p.profileId);
      const relevantBets = betConfig.sideBets.bets.filter(bet => {
        if (bet.deleted) return false;
        const hasPlayer = bet.winners.some(id => matchesId(id, player)) || bet.losers.some(id => matchesId(id, player));
        const hasRival = bet.winners.some(id => matchesId(id, rival)) || bet.losers.some(id => matchesId(id, rival));
        return hasPlayer && hasRival;
      });
      
      if (relevantBets.length > 0 || sideBetTotal !== 0) {
        groups.push({
          key: 'sideBets',
          label: 'Side Bets',
          configKey: 'sideBets',
          segments: relevantBets.map((bet, i) => ({
            label: bet.holeNumber ? `H${bet.holeNumber}: ${bet.description || `Side Bet ${i + 1}`}` : (bet.description || `Side Bet ${i + 1}`),
            key: `sidebet_${bet.id}`,
          })),
          getTotal: () => sideBetTotal,
          getSegmentData: (segmentKey) => {
            const betId = segmentKey.replace('sidebet_', '');
            const bet = betConfig.sideBets?.bets?.find(b => b.id === betId);
            if (!bet) return { playerNet: 0, rivalNet: 0, amount: 0 };
            
            const isWinner = bet.winners.some(id => matchesId(id, player));
            const amount = isWinner ? bet.amount : -bet.amount;
            
            return {
              playerNet: isWinner ? 1 : 0,
              rivalNet: isWinner ? 0 : 1,
              amount,
              description: bet.holeNumber 
                ? `Hoyo ${bet.holeNumber}${bet.description ? `: ${bet.description}` : ''}` 
                : (bet.description || 'Side Bet'),
            };
          },
        });
      }
    }
    
    // Stableford - Group bet shown in bilateral view (like Medal General)
    // HISTORICAL: Read from snapshot ledger. LIVE: Recalculate.
    if (betConfig.stableford?.enabled && bothParticipate(betConfig.stableford?.participantIds, 'stableford')) {
      if (isHistorical) {
        const stablefordTotal = groupedSummaries['Stableford']?.total || 0;
        if (stablefordTotal !== 0) {
          groups.push({
            key: 'stableford',
            label: 'Stableford',
            configKey: 'stableford',
            segments: [],
            getTotal: () => stablefordTotal,
            getSegmentData: () => ({
              playerNet: 0,
              rivalNet: 0,
              amount: stablefordTotal,
              description: groupedSummaries['Stableford']?.details?.[0]?.description || '',
            }),
          });
        }
      } else {
          // Use allPlayers versions to ensure groupId is available for scope filtering
          const playerWithGroup = allPlayers.find(p => p.id === player.id) || player;
          const rivalWithGroup = allPlayers.find(p => p.id === rival.id) || rival;
          const stablefordResult = getStablefordBilateralResult(
            allPlayers,
            playerWithGroup,
            rivalWithGroup,
            confirmedScores,
            betConfig,
            course
          );
          
          if (stablefordResult) {
            groups.push({
              key: 'stableford',
              label: 'Stableford',
              configKey: 'stableford',
              segments: [],
              getTotal: () => stablefordResult.amount,
              getSegmentData: () => ({
                playerNet: 0,
                rivalNet: 0,
                amount: stablefordResult.amount,
                description: '',
              }),
            });
          }
      }
    }
    
    // NOTE: Team Pressures are NOT shown in bilateral view - they're pair bets
    
    return groups;
  }, [isHistorical, snapshotPairBreakdowns, snapshotPairSegmentResults, betConfig, effectiveBetConfig, groupedSummaries, confirmedScores, players, player.id, rival.id, allScores, course.holes, confirmedHoles, allPlayers, course]);
  
  // Compute the total balance for the bilateral detail header.
  // HISTORICAL MODE: Sum betTypeGroups directly — this is the single source of truth.
  // betTypeGroups already reads exclusively from the snapshot (pairBreakdowns or ledger
  // filtered by pair), and already excludes team bets (Carritos, Presiones Parejas).
  // This guarantees the header == sum(rows) with NO discrepancy.
  // LIVE MODE: compute from betTypeGroups which respect live betOverrides.
  const computedTotalBalance = useMemo(() => {
    // Both historical and live modes derive the header from betTypeGroups to guarantee
    // that header == sum(detail rows). snapshotVsBalance is intentionally ignored here
    // because it may include Carritos/Presiones Parejas (team bets) in older snapshots
    // that don't have the pairBreakdowns field.
    if (isHistorical) {
      // Sum all betTypeGroups directly (they already exclude team bets)
      return betTypeGroups.reduce((sum, group) => sum + group.getTotal(), 0);
    }
    
    return betTypeGroups.reduce((sum, group) => {
      const normalizeLabel = (label: string) => {
        switch (label) {
          case 'medal': return 'Medal';
          case 'pressures': return 'Presiones';
          case 'skins': return 'Skins';
          case 'caros': return 'Caros';
          case 'oyeses': return 'Oyes';
          case 'units': return 'Unidades';
          case 'manchas': return 'Manchas';
          case 'culebras': return 'Culebras';
          case 'pinguinos': return 'Pingüinos';
          case 'rayas': return 'Rayas';
          case 'medalGeneral': return 'Medal General';
          case 'coneja': return 'Coneja';
          case 'putts': return 'Putts';
          case 'sideBets': return 'Side Bet';
          case 'stableford': return 'Stableford';
          case 'teamPressures': return 'Foursome';
          default: return label;
        }
      };
      
      const matchesPlayer = (overrideId: string, p: Player) =>
        overrideId === p.id || (p.profileId && overrideId === p.profileId);
      
      const override = betConfig.betOverrides?.find(
        (o) =>
          (o.betType === normalizeLabel(group.key) || o.betType === group.key) &&
          ((matchesPlayer(o.playerAId, player) && matchesPlayer(o.playerBId, rival)) ||
            (matchesPlayer(o.playerAId, rival) && matchesPlayer(o.playerBId, player)))
      );
      
      if (override?.enabled === false) return sum;
      
      return sum + group.getTotal();
    }, 0);
  }, [isHistorical, snapshotVsBalance, betTypeGroups, betConfig.betOverrides, player, rival]);
  
  // Get strokes from round_handicaps (centralized source of truth) or fallback to effectiveBetConfig
  // Positive value = player gives strokes to rival, Negative = player receives from rival
  const strokesFromMatrix = useMemo(() => {
    // First try the live matrix hook (for active rounds)
    if (getStrokesForLocalPair) {
      return getStrokesForLocalPair(player.id, rival.id);
    }
    
    // Fallback: read from effectiveBetConfig.bilateralHandicaps (for historical views)
    const bilateral = effectiveBetConfig.bilateralHandicaps?.find(
      (h) =>
        (h.playerAId === player.id && h.playerBId === rival.id) ||
        (h.playerAId === rival.id && h.playerBId === player.id)
    );
    if (!bilateral) return 0;
    
    // Convert the absolute handicaps back to strokes difference
    // In the engine format: playerAHandicap=0, playerBHandicap=N means A gives N strokes to B
    const isPlayerA = bilateral.playerAId === player.id;
    if (isPlayerA) {
      // If player is A: A.hcp=0, B.hcp=N → A gives N to B → positive
      // If player is A: A.hcp=N, B.hcp=0 → A receives N from B → negative
      return bilateral.playerBHandicap - bilateral.playerAHandicap;
    } else {
      // Player is B: A.hcp=0, B.hcp=N → B receives N from A → negative
      // Player is B: A.hcp=N, B.hcp=0 → B gives N to A → positive
      return bilateral.playerAHandicap - bilateral.playerBHandicap;
    }
  }, [getStrokesForLocalPair, effectiveBetConfig.bilateralHandicaps, player.id, rival.id]);
  
  const strokesDifference = Math.abs(strokesFromMatrix);
  const playerReceivesStrokes = strokesFromMatrix < 0; // Negative means player receives

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
                  'inline-flex items-center gap-1 px-2 py-1 rounded text-xs',
                  d.isPositive 
                    ? 'bg-green-500/20 text-green-600' 
                    : 'bg-destructive/20 text-destructive'
                )}
              >
                <span className="font-medium">H{d.holeNumber}</span>
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
            <PlayerAvatar 
              initials={getPlayerAbbr(player)} 
              background={player.color} 
              size="lg" 
              isLoggedInUser={player.id === basePlayerId || player.profileId === basePlayerId}
            />
            <span className="text-muted-foreground text-sm">vs</span>
            <PlayerAvatar 
              initials={getPlayerAbbr(rival)} 
              background={rival.color} 
              size="lg" 
              isLoggedInUser={rival.id === basePlayerId || rival.profileId === basePlayerId}
            />
          </div>
          <div className={cn(
            'text-2xl font-bold flex items-center gap-1',
            computedTotalBalance > 0 ? 'text-green-600' : computedTotalBalance < 0 ? 'text-destructive' : 'text-muted-foreground'
          )}>
            {computedTotalBalance > 0 && <TrendingUp className="h-5 w-5" />}
            {computedTotalBalance < 0 && <TrendingDown className="h-5 w-5" />}
            ${Math.abs(computedTotalBalance)}
          </div>
        </div>
        
        {/* Bilateral Handicap Display (read-only, from HandicapMatrix) */}
        <div className="mt-3 p-2 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium">Ventaja de Golpes</span>
            <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
              Definido en Matriz
            </span>
          </div>
          
          

          
          {strokesDifference > 0 ? (
            <div className="bg-primary/10 p-2 rounded-lg text-center mt-2">
              <p className="text-sm">
                <strong>{formatPlayerName(playerReceivesStrokes ? player.name : rival.name)}</strong> recibe{' '}
                <span className="text-base font-bold text-primary">{strokesDifference}</span> golpe{strokesDifference !== 1 ? 's' : ''}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Ambos jugadores juegan scratch (sin ventaja)
            </p>
          )}
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
                    'flex items-center justify-between px-3 py-1.5 bg-muted/30',
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
                    <div className="flex flex-col">
                      <span className={cn('font-semibold text-sm', isDisabled && 'line-through')}>
                        {group.label}
                      </span>
                      {/* Presiones histórico: mostrar resultado del Match (18 hoyos) inline */}
                      {isHistorical && group.key === 'hist_presiones' && !isDisabled && (() => {
                        const matchText = group.getSegmentData?.('')?.description;
                        if (!matchText) return null;
                        const isCarry = matchText === 'Carry';
                        return (
                          <span className={cn(
                            'text-xs font-medium',
                            isCarry
                              ? 'text-amber-600 dark:text-amber-400'
                              : matchText.startsWith('+')
                                ? 'text-green-600'
                                : matchText.startsWith('-')
                                  ? 'text-destructive'
                                  : 'text-muted-foreground'
                          )}>
                            Match {matchText}
                          </span>
                        );
                      })()}
                    </div>
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
                      total > 0 ? 'text-green-600' : total < 0 ? 'text-destructive' : 'text-muted-foreground'
                    )}>
                      {isDisabled ? '$0' : `${total >= 0 ? '+$' : '-$'}${Math.abs(total)}`}
                    </span>
                  </div>
                </div>
                
                {/* Segment rows */}
                {hasSegments && isExpanded && !isDisabled && (
                  <div className="divide-y divide-border/30">
                    {/* Skins: variant selector + segments */}
                    {group.key === 'skins' ? (
                      <div>
                        {/* Skins variant + zapato controls - compact layout */}
                        {!isHistorical && onBetConfigChange && (() => {
                          const globalModality = betConfig.skins.modality ?? 'acumulados';
                          const playerVariants = betConfig.skins.playerSkinVariants;
                          const pairOverrides = betConfig.skins.pairSkinVariantOverrides;
                          const pairKey = [player.id, rival.id].sort().join('_');
                          
                          const variantA = playerVariants?.[player.id] ?? globalModality;
                          const variantB = playerVariants?.[rival.id] ?? globalModality;
                          const hasExplicitOverride = !!pairOverrides?.[pairKey];
                          const hasConflict = variantA !== variantB && !hasExplicitOverride;
                          const activeVariant = pairOverrides?.[pairKey] ?? (variantA === variantB ? variantA : globalModality);
                          
                          const setVariant = (variant: string) => {
                            onBetConfigChange({
                              ...betConfig,
                              skins: {
                                ...betConfig.skins,
                                pairSkinVariantOverrides: {
                                  ...betConfig.skins.pairSkinVariantOverrides,
                                  [pairKey]: variant as 'acumulados' | 'sinAcumular',
                                },
                              },
                            });
                          };
                          
                          return (
                            <div className={cn(
                              "mx-4 mt-2 mb-1 rounded-lg px-3 py-2 border",
                              hasConflict 
                                ? "bg-amber-500/10 border-amber-500/30" 
                                : "bg-muted/30 border-border/50"
                            )}>
                              {hasConflict && (
                                <p className="text-[10px] text-muted-foreground mb-1">
                                  {formatPlayerName(player.name)}: <span className="font-medium">{variantA === 'acumulados' ? 'Acum' : 'Sin Acum'}</span> · {formatPlayerName(rival.name)}: <span className="font-medium">{variantB === 'acumulados' ? 'Acum' : 'Sin Acum'}</span>
                                </p>
                              )}
                              <div className="flex items-center gap-3">
                                {/* Variant toggles - left side */}
                                <div className="flex flex-col gap-0.5 flex-1">
                                  <button
                                    className={cn(
                                      'text-xs text-left px-2 py-1 rounded transition-colors',
                                      activeVariant === 'acumulados' 
                                        ? 'font-semibold text-primary bg-primary/10' 
                                        : 'text-muted-foreground hover:text-foreground'
                                    )}
                                    onClick={() => setVariant('acumulados')}
                                  >
                                    Acumulados
                                  </button>
                                  <button
                                    className={cn(
                                      'text-xs text-left px-2 py-1 rounded transition-colors',
                                      activeVariant === 'sinAcumular' 
                                        ? 'font-semibold text-primary bg-primary/10' 
                                        : 'text-muted-foreground hover:text-foreground'
                                    )}
                                    onClick={() => setVariant('sinAcumular')}
                                  >
                                    Sin acumular
                                  </button>
                                </div>
                                {/* Zapato toggle - right side, vertically centered */}
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs text-muted-foreground">Zapato</span>
                                  <Switch
                                    checked={betConfig.skins.zapatoEnabled !== false}
                                    onCheckedChange={(checked) => {
                                      onBetConfigChange({
                                        ...betConfig,
                                        skins: {
                                          ...betConfig.skins,
                                          zapatoEnabled: checked,
                                        },
                                      });
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                        {/* Skins segment rows */}
                        {group.segments.map((segment) => {
                          const data = group.getSegmentData(segment.key);
                          const segmentType: 'front' | 'back' = segment.key.includes('front') ? 'front' : 'back';
                          const skinsEvo = getSkinsEvolution(player, rival, confirmedScores, course, effectiveBetConfig, effectiveBetConfig.bilateralHandicaps, startingHole);
                          const skinsSegData = skinsEvo?.[segmentType];
                          const hasZapato = skinsSegData?.hasZapato ?? false;
                          
                          return (
                            <div key={segment.key} className="flex items-center justify-between px-4 py-1.5 pl-10 bg-background/50">
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="flex items-center gap-3 text-left">
                                    <span className="text-xs text-muted-foreground cursor-pointer hover:underline">{segment.label}</span>
                                    {/* Colored skins count instead of description text */}
                                    <span className="flex items-center gap-1 cursor-pointer">
                                      <span className="text-sm font-bold text-green-600">{data.playerNet}</span>
                                      <span className="text-[10px] text-muted-foreground">vs</span>
                                      <span className="text-sm font-bold text-destructive">{data.rivalNet}</span>
                                    </span>
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-3" side="top">
                                  {skinsSegData && (
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between gap-4">
                                        <span className="font-medium text-sm">{segment.label}</span>
                                      </div>
                                      <div className="overflow-x-auto">
                                        <div className="flex gap-0.5 min-w-max">
                                          {skinsSegData.holes.map((hole) => (
                                            <div key={hole.holeNumber} className="flex flex-col items-center">
                                              <span className="text-[8px] text-muted-foreground">{hole.holeNumber}</span>
                                              <div className={cn(
                                                'w-8 h-6 flex items-center justify-center text-[9px] font-bold rounded',
                                                hole.winner === 'A' ? 'bg-green-100 dark:bg-green-900/30 text-green-700' :
                                                hole.winner === 'B' ? 'bg-red-100 dark:bg-red-900/30 text-destructive' :
                                                hole.accumulated > 0 ? 'bg-muted text-muted-foreground' :
                                                'bg-muted/50 text-muted-foreground'
                                              )}>
                                                {hole.winner === 'A' ? `+${hole.skinsWon}` :
                                                 hole.winner === 'B' ? `-${hole.skinsWon}` :
                                                 hole.accumulated > 0 ? `(${hole.accumulated})` : '•'}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                      <div className="text-[10px] text-center pt-1 border-t border-border/50 flex items-center justify-center gap-2">
                                        <span>{player.initials}: <span className="font-bold text-green-600">{skinsSegData.totalSkinsA}</span></span>
                                        <span className="text-muted-foreground">vs</span>
                                        <span>{rival.initials}: <span className="font-bold text-destructive">{skinsSegData.totalSkinsB}</span></span>
                                      </div>
                                      <div className="flex flex-wrap gap-2 text-[8px] text-muted-foreground pt-1 border-t border-border/30">
                                        <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded bg-green-100"></span>Ganado</span>
                                        <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded bg-red-100"></span>Perdido</span>
                                        <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded bg-muted"></span>Acum.</span>
                                        <span>• = Empate</span>
                                      </div>
                                    </div>
                                  )}
                                </PopoverContent>
                              </Popover>
                              <div className="flex items-center gap-2">
                                {hasZapato && <span className="text-sm">🥾</span>}
                                <span className={cn('text-sm font-bold', data.amount > 0 ? 'text-green-600' : data.amount < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                                  {data.amount >= 0 ? '+$' : '-$'}{Math.abs(data.amount)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : group.key === 'units' || group.key === 'manchas' ? (
                      renderMarkerDetail(group.key === 'units' ? 'units' : 'manchas')
                    ) : group.key === 'oyeses' ? (
                      // Oyeses detail - show proximity order per player per hole
                      (() => {
                        // Use confirmedScores for display to match calculation
                        const oyesesData = getOyesesDisplayData(
                          player.id,
                          rival.id,
                          confirmedScores,
                          effectiveBetConfig,
                          course
                        );
                        const { playerAHoles, playerBHoles } = oyesesData;
                        
                        // Get zapato (100% bonus) data - also use confirmedScores
                        const pairResult = getOyesesPairResult(
                          player.id,
                          rival.id,
                          confirmedScores,
                          effectiveBetConfig,
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
                            {/* Zapato toggle for Oyeses - above detail */}
                            {!isHistorical && onBetConfigChange && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium">Zapato</span>
                                <Switch
                                  checked={betConfig.oyeses.zapatoEnabled !== false}
                                  onCheckedChange={(checked) => {
                                    onBetConfigChange({
                                      ...betConfig,
                                      oyeses: {
                                        ...betConfig.oyeses,
                                        zapatoEnabled: checked,
                                      },
                                    });
                                  }}
                                />
                              </div>
                            )}
                            {/* Header row with hole numbers */}
                            <div className="flex items-center gap-2 text-[10px]">
                              <div className="w-8 shrink-0"></div>
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
                              <PlayerAvatar 
                                initials={player.initials} 
                                background={player.color} 
                                size="sm" 
                                isLoggedInUser={player.id === basePlayerId || player.profileId === basePlayerId}
                              />
                              <div className="flex gap-1 overflow-x-auto">
                                {playerAHoles.map(h => (
                                  <div 
                                    key={h.holeNumber} 
                                    className={cn(
                                      'w-8 h-7 flex items-center justify-center rounded text-xs font-bold',
                                      h.isWin ? 'bg-green-500/20 text-green-600' :
                                      h.isLoss ? 'bg-destructive/20 text-destructive' :
                                      h.isAccumulated ? 'bg-muted text-muted-foreground' :
                                      'bg-muted/30 text-muted-foreground'
                                    )}
                                    title={h.isWin && h.accumulatedAmount ? `Ganó $${h.accumulatedAmount}` : undefined}
                                  >
                                    {h.playerOrder !== null ? `#${h.playerOrder}` : '–'}
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
                              <PlayerAvatar 
                                initials={rival.initials} 
                                background={rival.color} 
                                size="sm" 
                                isLoggedInUser={rival.id === basePlayerId || rival.profileId === basePlayerId}
                              />
                              <div className="flex gap-1 overflow-x-auto">
                                {playerBHoles.map(h => (
                                  <div 
                                    key={h.holeNumber} 
                                    className={cn(
                                      'w-8 h-7 flex items-center justify-center rounded text-xs font-bold',
                                      h.isWin ? 'bg-green-500/20 text-green-600' :
                                      h.isLoss ? 'bg-destructive/20 text-destructive' :
                                      h.isAccumulated ? 'bg-muted text-muted-foreground' :
                                      'bg-muted/30 text-muted-foreground'
                                    )}
                                    title={h.isWin && h.accumulatedAmount ? `Ganó $${h.accumulatedAmount}` : undefined}
                                  >
                                    {h.playerOrder !== null ? `#${h.playerOrder}` : '–'}
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
                          effectiveBetConfig,
                          course,
                          effectiveBetConfig.bilateralHandicaps,
                          allPlayers
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
                        
                        // Get override amounts from Dashboard (if any) for this pair
                        // This ensures the detail view shows the same values as calculations
                        const amountOverrides = (() => {
                          const overrides = effectiveBetConfig.betOverrides || [];
                          const findOverride = (betType: string): number | undefined => {
                            const match = overrides.find(o =>
                              o.betType === betType &&
                              o.enabled !== false &&
                              o.amountOverride !== undefined &&
                              ((o.playerAId === player.id && o.playerBId === rival.id) ||
                               (o.playerAId === rival.id && o.playerBId === player.id) ||
                               (player.profileId && (o.playerAId === player.profileId || o.playerBId === player.profileId) &&
                                (o.playerAId === rival.id || o.playerBId === rival.id)) ||
                               (rival.profileId && (o.playerAId === rival.profileId || o.playerBId === rival.profileId) &&
                                (o.playerAId === player.id || o.playerBId === player.id)))
                            );
                            return match?.amountOverride;
                          };
                          return {
                            frontValue: findOverride('Rayas Front'),
                            backValue: findOverride('Rayas Back'),
                            medalTotalValue: findOverride('Rayas Medal Total'),
                          };
                        })();
                        
                        // Use override values if available, otherwise fall back to config
                        const frontValue = amountOverrides.frontValue ?? betConfig.rayas?.frontValue ?? 0;
                        const backValue = amountOverrides.backValue ?? betConfig.rayas?.backValue ?? 0;
                        const medalValue = amountOverrides.medalTotalValue ?? betConfig.rayas?.medalTotalValue ?? 0;
                        
                        // Get source nets directly from sourceGroups (now includes Oyes from rayasResult)
                        const skinsNet = sourceGroups['skins'];
                        const unitsNet = sourceGroups['units'];
                        const oyesNet = sourceGroups['oyes'];
                        const medalNet = sourceGroups['medal'];
                        
                        // Total rayas per segment (includes Oyes because Rayas uses Oyes results too)
                        const medalTotalRayas = medalNet.total; // Medal Total raya lives in the "total" segment
                        const frontTotalRayas = skinsNet.front + unitsNet.front + oyesNet.front + medalNet.front;
                        const backTotalRayas = skinsNet.back + unitsNet.back + oyesNet.back + medalNet.back;
                        const totalRayasAll = frontTotalRayas + backTotalRayas + medalTotalRayas;
                        
                        // IMPORTANT:
                        // The Rayas audit table must be internally consistent:
                        // - The displayed rayas counts (front/back/total) come from rayasResult.details
                        // - The money amounts MUST use the OVERRIDE values (if any) for this pair
                        //
                        // When Dashboard overrides exist, we must use those values instead of
                        // the original valuePerRaya stored in details.
                        //
                        // Compute amounts using: rayas count * override value (or fallback to config)
                        const { frontTotalAmount, backTotalAmount, medalTotalAmount, grandTotal } = (() => {
                          // Use override values if present, otherwise config values
                          const effectiveFrontValue = amountOverrides.frontValue ?? betConfig.rayas?.frontValue ?? 0;
                          const effectiveBackValue = amountOverrides.backValue ?? betConfig.rayas?.backValue ?? 0;
                          const effectiveMedalValue = amountOverrides.medalTotalValue ?? betConfig.rayas?.medalTotalValue ?? 0;

                          // Calculate amounts by multiplying rayas count by the EFFECTIVE value
                          // NOT by d.valuePerRaya which may be stale from initial setup
                          const front = frontTotalRayas * effectiveFrontValue;
                          const back = backTotalRayas * effectiveBackValue;
                          const total = medalTotalRayas * effectiveMedalValue;

                          return {
                            frontTotalAmount: front,
                            backTotalAmount: back,
                            medalTotalAmount: total,
                            grandTotal: front + back + total,
                          };
                        })();
                        
                        // Check if we have all 18 holes confirmed for BOTH players
                        const confirmedHolesCountA = confirmedScores.get(player.id)?.length || 0;
                        const confirmedHolesCountB = confirmedScores.get(rival.id)?.length || 0;
                        const hasAll18 = confirmedHolesCountA >= 18 && confirmedHolesCountB >= 18;
                        
                        // Check for skin variant conflict
                        const skinConflict = getSkinVariantConflict(effectiveBetConfig, player.id, rival.id);
                        const playerVariantA = effectiveBetConfig.rayas?.playerSkinVariants?.[player.id] ?? effectiveBetConfig.rayas?.skinVariant ?? 'acumulados';
                        const playerVariantB = effectiveBetConfig.rayas?.playerSkinVariants?.[rival.id] ?? effectiveBetConfig.rayas?.skinVariant ?? 'acumulados';
                        
                        // Determine which variant is active for this pair
                        const activePairVariant = skinConflict.variant;
                        
                        return (
                          <div className="px-4 py-3 pl-6 bg-background/50 space-y-2">
                            {/* Always-editable Skins variant selector for this pair - same style as Skins */}
                            {!isHistorical && onBetConfigChange && (
                              <div className={cn(
                                "rounded-lg px-3 py-2 border",
                                skinConflict.hasConflict 
                                  ? "bg-amber-500/10 border-amber-500/30" 
                                  : "bg-muted/30 border-border/50"
                              )}>
                                {skinConflict.hasConflict && (
                                  <p className="text-[10px] text-muted-foreground mb-1">
                                    {formatPlayerName(player.name)}: <span className="font-medium">{playerVariantA === 'acumulados' ? 'Acum' : 'Sin Acum'}</span> · {formatPlayerName(rival.name)}: <span className="font-medium">{playerVariantB === 'acumulados' ? 'Acum' : 'Sin Acum'}</span>
                                  </p>
                                )}
                                <div className="flex items-center justify-center gap-3">
                                    <button
                                      className={cn(
                                        'text-xs px-2 py-1 rounded transition-colors',
                                        activePairVariant === 'acumulados' 
                                          ? 'font-semibold text-primary bg-primary/10' 
                                          : 'text-muted-foreground hover:text-foreground'
                                      )}
                                      onClick={() => {
                                        const pairKey = getPairKey(player.id, rival.id);
                                        onBetConfigChange({
                                          ...betConfig,
                                          rayas: {
                                            ...betConfig.rayas,
                                            pairSkinVariantOverrides: {
                                              ...betConfig.rayas?.pairSkinVariantOverrides,
                                              [pairKey]: 'acumulados',
                                            },
                                          },
                                        });
                                      }}
                                    >
                                      Acumulados
                                    </button>
                                    <button
                                      className={cn(
                                        'text-xs px-2 py-1 rounded transition-colors',
                                        activePairVariant === 'sinAcumulacion' 
                                          ? 'font-semibold text-primary bg-primary/10' 
                                          : 'text-muted-foreground hover:text-foreground'
                                      )}
                                      onClick={() => {
                                        const pairKey = getPairKey(player.id, rival.id);
                                        onBetConfigChange({
                                          ...betConfig,
                                          rayas: {
                                            ...betConfig.rayas,
                                            pairSkinVariantOverrides: {
                                              ...betConfig.rayas?.pairSkinVariantOverrides,
                                              [pairKey]: 'sinAcumulacion',
                                            },
                                          },
                                        });
                                      }}
                                    >
                                      Sin acumular
                                    </button>
                                </div>
                              </div>
                            )}
                            {/* Header row */}
                            <div className="grid grid-cols-5 gap-1 text-[10px] font-medium text-muted-foreground border-b border-border/30 pb-1">
                              <div>Fuente</div>
                              <div className="text-center">Skins</div>
                              <div className="text-center">Unidades</div>
                              <div className="text-center">Oyes</div>
                              <div className="text-center">Medal</div>
                            </div>
                            
                            {/* Front 9 row - wrapped in popover */}
                            <RayasSegmentPopover
                              segment="front"
                              player={player}
                              rival={rival}
                              confirmedScores={confirmedScores}
                              course={course}
                              betConfig={effectiveBetConfig}
                              bilateralHandicaps={effectiveBetConfig.bilateralHandicaps}
                              rayasDetails={rayasResult.details}
                              basePlayerId={basePlayerId}
                            >
                            <div className="grid grid-cols-5 gap-1 items-center text-sm py-1 cursor-pointer hover:bg-muted/20 rounded transition-colors">
                              <div className="font-medium text-muted-foreground text-xs flex items-center gap-0.5">Front 9</div>
                              <div className={cn('text-center font-bold', skinsNet.front > 0 ? 'text-green-600' : skinsNet.front < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                                {skinsNet.front !== 0 ? skinsNet.front : '-'}
                              </div>
                              <div className={cn('text-center font-bold', unitsNet.front > 0 ? 'text-green-600' : unitsNet.front < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                                {unitsNet.front !== 0 ? unitsNet.front : '-'}
                              </div>
                              <div className={cn('text-center font-bold', oyesNet.front > 0 ? 'text-green-600' : oyesNet.front < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                                {oyesNet.front !== 0 ? oyesNet.front : '-'}
                              </div>
                              <div className={cn('text-center font-bold', medalNet.front > 0 ? 'text-green-600' : medalNet.front < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                                {medalNet.front !== 0 ? medalNet.front : '-'}
                              </div>
                            </div>
                            </RayasSegmentPopover>
                            
                            {/* Front 9 total */}
                            <div className="flex items-center justify-between text-sm bg-muted/30 rounded px-2 py-1">
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Total Front:</span>
                                <span className={cn('font-bold', frontTotalRayas > 0 ? 'text-green-600' : frontTotalRayas < 0 ? 'text-destructive' : '')}>
                                  {frontTotalRayas}
                                </span>
                                <span className="text-muted-foreground">× ${frontValue} =</span>
                              </div>
                              <span className={cn('font-bold', frontTotalAmount > 0 ? 'text-green-600' : frontTotalAmount < 0 ? 'text-destructive' : '')}>
                                {frontTotalAmount >= 0 ? '+$' : '-$'}{Math.abs(frontTotalAmount)}
                              </span>
                            </div>

                            
                            {/* Back 9 row - wrapped in popover */}
                            <RayasSegmentPopover
                              segment="back"
                              player={player}
                              rival={rival}
                              confirmedScores={confirmedScores}
                              course={course}
                              betConfig={effectiveBetConfig}
                              bilateralHandicaps={effectiveBetConfig.bilateralHandicaps}
                              rayasDetails={rayasResult.details}
                              basePlayerId={basePlayerId}
                            >
                            <div className="grid grid-cols-5 gap-1 items-center text-sm py-1 border-t border-border/20 pt-2 cursor-pointer hover:bg-muted/20 rounded transition-colors">
                              <div className="font-medium text-muted-foreground text-xs flex items-center gap-0.5">Back 9</div>
                              <div className={cn('text-center font-bold', skinsNet.back > 0 ? 'text-green-600' : skinsNet.back < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                                {skinsNet.back !== 0 ? skinsNet.back : '-'}
                              </div>
                              <div className={cn('text-center font-bold', unitsNet.back > 0 ? 'text-green-600' : unitsNet.back < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                                {unitsNet.back !== 0 ? unitsNet.back : '-'}
                              </div>
                              <div className={cn('text-center font-bold', oyesNet.back > 0 ? 'text-green-600' : oyesNet.back < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                                {oyesNet.back !== 0 ? oyesNet.back : '-'}
                              </div>
                              <div className={cn('text-center font-bold', medalNet.back > 0 ? 'text-green-600' : medalNet.back < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                                {medalNet.back !== 0 ? medalNet.back : '-'}
                              </div>
                            </div>
                            </RayasSegmentPopover>
                            
                            {/* Back 9 total */}
                            <div className="flex items-center justify-between text-sm bg-muted/30 rounded px-2 py-1">
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Total Back:</span>
                                <span className={cn('font-bold', backTotalRayas > 0 ? 'text-green-600' : backTotalRayas < 0 ? 'text-destructive' : '')}>
                                  {backTotalRayas}
                                </span>
                                <span className="text-muted-foreground">× ${backValue} =</span>
                              </div>
                              <span className={cn('font-bold', backTotalAmount > 0 ? 'text-green-600' : backTotalAmount < 0 ? 'text-destructive' : '')}>
                                {backTotalAmount >= 0 ? '+$' : '-$'}{Math.abs(backTotalAmount)}
                              </span>
                            </div>

                            
                            {/* Medal Total row - show during round as partial, definitive when all 18 confirmed */}
                            {medalValue > 0 && (() => {
                              const playerNetTotal = getNetScoreForSegmentWithBilateral(player.id, rival.id, 'total');
                              const rivalNetTotal = getNetScoreForSegmentWithBilateral(rival.id, player.id, 'total');
                              const hasScores = playerNetTotal !== null && rivalNetTotal !== null && 
                                (confirmedScores.get(player.id)?.length ?? 0) > 0 && (confirmedScores.get(rival.id)?.length ?? 0) > 0;
                              if (!hasScores && !hasAll18) return null;
                              
                              return (
                                <div className={cn(
                                  "flex items-center justify-between text-sm rounded px-2 py-1.5 border",
                                  hasAll18 ? "bg-primary/10 border-primary/20" : "bg-amber-500/10 border-amber-500/20"
                                )}>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">Medal Total</span>
                                    {hasScores && (
                                      <span className="text-xs text-muted-foreground">
                                        ({playerNetTotal} vs {rivalNetTotal})
                                      </span>
                                    )}
                                    <span className={cn('font-bold text-base', medalTotalRayas > 0 ? 'text-green-600' : medalTotalRayas < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                                      {medalTotalRayas === 0 ? '=' : medalTotalRayas > 0 ? '1' : '-1'}
                                    </span>
                                  </div>
                                  <span className={cn('font-bold', medalTotalAmount > 0 ? 'text-green-600' : medalTotalAmount < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                                    {medalTotalAmount >= 0 ? '+$' : '-$'}{Math.abs(medalTotalAmount)}
                                  </span>
                                </div>
                              );
                            })()}
                            
                            {/* Grand Total */}
                            <div className="flex items-center justify-between text-base font-bold border-t border-border/50 pt-2 mt-2">
                              <span>TOTAL RAYAS</span>
                              <span className={cn(grandTotal > 0 ? 'text-green-600' : grandTotal < 0 ? 'text-destructive' : '')}>
                                {grandTotal >= 0 ? '+$' : '-$'}{Math.abs(grandTotal)}
                              </span>
                            </div>
                            
                          </div>
                        );
                      })()
                    ) : (
                      group.segments.map((segment) => {
                        const data = group.getSegmentData(segment.key);
                        
                        // For pressures, show "Even" ONLY when:
                        // - Amount is 0 AND
                        // - Only one bet was opened (initial) AND that bet is tied (+0)
                        // If there are multiple lines (e.g., +1 -1), show actual results even if net is $0
                        const isPressures = group.key === 'pressures';
                        const isSkins = group.key === 'skins';
                        const pressureDesc = data.description || '';
                        
                        // NOTE: pressureDisplay is computed after segmentType/pressureSegmentData are defined.
                        
                        const showSkinsShoe =
                          isSkins &&
                          typeof data.description === 'string' &&
                          data.description.includes('🥾');

                        // Determine segment type for evolution tooltips
                        const segmentType: 'front' | 'back' | 'total' = segment.key.includes('front') 
                          ? 'front' 
                          : segment.key.includes('total') 
                            ? 'total' 
                            : 'back';

                        // Get evolution data for tooltips — NEVER call live engines in historical mode
                        const pressureEvolution = isPressures && !isHistorical
                          ? getPressureEvolution(player, rival, confirmedScores, course, effectiveBetConfig, effectiveBetConfig.bilateralHandicaps, startingHole)
                          : null;
                        const skinsEvolution = isSkins && !isHistorical
                          ? getSkinsEvolution(player, rival, confirmedScores, course, effectiveBetConfig, effectiveBetConfig.bilateralHandicaps, startingHole)
                          : null;

                        const pressureSegmentData = pressureEvolution?.[segmentType];
                        const skinsSegmentData = skinsEvolution?.[segmentType];

                        // In HISTORICAL mode, NEVER recalculate — description from snapshot is the only source.
                        const pressureFallback = isPressures && !isHistorical ? (pressureSegmentData?.finalDisplay ?? '') : '';

                        // Add Carry label ONLY for Front 9 when main line finished tied (live mode only).
                        const descAlreadyHasCarry = pressureDesc.toLowerCase().includes('carry');
                        const carrySuffix = isPressures && !isHistorical && segmentType === 'front' && pressureSegmentData?.hasCarry && !descAlreadyHasCarry
                          ? ' (Carry)'
                          : '';

                        const pressureDisplayRaw = (pressureDesc || pressureFallback || '—').trim();
                        const pressureDisplay = pressureDisplayRaw === '—'
                          ? '—'
                          : `${pressureDisplayRaw}${carrySuffix}`;

                        // Zoológico segments only show the animal label (no "X vs X" comparison).
                        // En histórico: Presiones muestra su description. El resto no tiene segments (segments=[]).
                        const isZoologico = group.key === 'zoologico';
                        const isHistPresion  = group.key === 'hist_presiones';
                        // En histórico solo Presiones tiene segments visibles y muestra description
                        const showScoreComparison = !isZoologico && (!isHistorical || isHistPresion);
                        
                        const segmentContent = (
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-muted-foreground">{segment.label}</span>
                            {/* Score comparison - skip for Zoológico and non-applicable historical bets */}
                            {showScoreComparison && (
                              <div className="flex items-center gap-1.5 text-sm">
                                {isPressures ? (
                                  <span className={cn(
                                    'font-semibold cursor-pointer hover:underline',
                                    data.amount > 0 ? 'text-green-600' : data.amount < 0 ? 'text-destructive' : 'text-muted-foreground'
                                  )}>
                                    {pressureDisplay}
                                  </span>
                                ) : (
                                  <>
                                    <span className={cn(
                                      'font-semibold min-w-[28px] text-center cursor-pointer hover:underline',
                                      data.playerNet < data.rivalNet ? 'text-green-600' : 
                                      data.playerNet > data.rivalNet ? 'text-destructive' : ''
                                    )}>
                                      {isSkins ? `${data.playerNet}` : (data.playerNet !== undefined && data.playerNet !== null ? data.playerNet : '-')}
                                    </span>
                                    <span className="text-muted-foreground">vs</span>
                                    <span className={cn(
                                      'font-semibold min-w-[28px] text-center',
                                      data.rivalNet < data.playerNet ? 'text-green-600' : 
                                      data.rivalNet > data.playerNet ? 'text-destructive' : ''
                                    )}>
                                      {isSkins ? `${data.rivalNet}` : (data.rivalNet !== undefined && data.rivalNet !== null ? data.rivalNet : '-')}
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );


                        return (
                          <div key={segment.key} className="relative flex items-center justify-between px-4 py-2 pl-10 bg-background/50">
                            {/* Popover de hoyos solo en modo VIVO — en histórico se muestra descripción plana del snapshot */}
                            {((isPressures && segmentType !== 'total') || isSkins) && !isHistorical ? (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="flex items-center gap-3 text-left">
                                    {segmentContent}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-3" side="top">
                                  {isPressures && pressureSegmentData && (
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between gap-4">
                                        <span className="font-medium text-sm">Presiones {segment.label}</span>
                                        <span className="text-xs text-muted-foreground">
                                          {player.initials} vs {rival.initials}
                                        </span>
                                      </div>
                                      {/* Holes grid */}
                                      <div className="overflow-x-auto">
                                        <div className="flex gap-0.5 min-w-max">
                                          {pressureSegmentData.holes.map((hole) => (
                                            <div key={hole.holeNumber} className="flex flex-col items-center">
                                              <span className="text-[8px] text-muted-foreground">{hole.holeNumber}</span>
                                              <div className={cn(
                                                'w-8 h-6 flex items-center justify-center text-[9px] font-bold rounded',
                                                hole.bets.some(b => b > 0) ? 'bg-green-100 dark:bg-green-900/30 text-green-700' :
                                                hole.bets.some(b => b < 0) ? 'bg-red-100 dark:bg-red-900/30 text-destructive' :
                                                'bg-muted/50 text-muted-foreground'
                                              )}>
                                                {hole.display || 'E'}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                      {/* Final result */}
                                      <div className="text-[10px] text-center pt-1 border-t border-border/50">
                                        Final: <span className="font-bold">{pressureSegmentData.finalDisplay}</span>
                                        {pressureSegmentData.hasCarry && <span className="ml-1 text-amber-600">(Carry)</span>}
                                      </div>
                                    </div>
                                  )}
                                  {isSkins && skinsSegmentData && (
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between gap-4">
                                        <span className="font-medium text-sm">Skins {segment.label}</span>
                                        <span className="text-xs text-muted-foreground">
                                          {betConfig.skins.modality === 'sinAcumular' ? 'Sin acumular' : 'Acumulados'}
                                        </span>
                                      </div>
                                      {/* Holes grid */}
                                      <div className="overflow-x-auto">
                                        <div className="flex gap-0.5 min-w-max">
                                          {skinsSegmentData.holes.map((hole) => (
                                            <div key={hole.holeNumber} className="flex flex-col items-center">
                                              <span className="text-[8px] text-muted-foreground">{hole.holeNumber}</span>
                                              <div className={cn(
                                                'w-8 h-6 flex items-center justify-center text-[9px] font-bold rounded',
                                                hole.winner === 'A' ? 'bg-green-100 dark:bg-green-900/30 text-green-700' :
                                                hole.winner === 'B' ? 'bg-red-100 dark:bg-red-900/30 text-destructive' :
                                                hole.accumulated > 0 ? 'bg-muted text-muted-foreground' :
                                                'bg-muted/50 text-muted-foreground'
                                              )}>
                                                {hole.winner === 'A' ? `+${hole.skinsWon}` :
                                                 hole.winner === 'B' ? `-${hole.skinsWon}` :
                                                 hole.accumulated > 0 ? `(${hole.accumulated})` : '•'}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                      {/* Final result */}
                                      <div className="text-[10px] text-center pt-1 border-t border-border/50 flex items-center justify-center gap-2">
                                        <span>{player.initials}: <span className="font-bold text-green-600">{skinsSegmentData.totalSkinsA}</span></span>
                                        <span className="text-muted-foreground">vs</span>
                                        <span>{rival.initials}: <span className="font-bold text-destructive">{skinsSegmentData.totalSkinsB}</span></span>
                                        {skinsSegmentData.hasZapato && <span className="ml-1">🥾</span>}
                                      </div>
                                      {/* Legend */}
                                      <div className="flex flex-wrap gap-2 text-[8px] text-muted-foreground pt-1 border-t border-border/30">
                                        <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded bg-green-100"></span>Ganado</span>
                                        <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded bg-red-100"></span>Perdido</span>
                                        <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded bg-muted"></span>Acum.</span>
                                        <span>• = Empate</span>
                                      </div>
                                    </div>
                                  )}
                                </PopoverContent>
                              </Popover>
                            ) : (
                              segmentContent
                            )}
                            <span
                              className={cn(
                                'text-base font-bold min-w-[55px] text-right',
                                data.amount > 0
                                  ? 'text-green-600'
                                  : data.amount < 0
                                    ? 'text-destructive'
                                    : 'text-muted-foreground'
                              )}
                            >
                              {`${data.amount >= 0 ? '+$' : '-$'}${Math.abs(data.amount)}`}
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
                    total: byLabel('Rayas Medal Total') ?? (betConfig.rayas?.medalTotalValue || 50),
                  };
                case 'putts':
                  return {
                    front: byLabel('Putts Front 9') ?? (betConfig.putts?.frontAmount ?? 50),
                    back: byLabel('Putts Back 9') ?? (betConfig.putts?.backAmount ?? 50),
                    total: byLabel('Putts Total') ?? (betConfig.putts?.totalAmount ?? 100),
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
                  upsert('Rayas Medal Total', overrides.total);
                  break;
                case 'putts':
                  upsert('Putts Front 9', overrides.front);
                  upsert('Putts Back 9', overrides.back);
                  upsert('Putts Total', overrides.total);
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
      case 'putts':
        return {
          front: betConfig.putts?.frontAmount ?? 50,
          back: betConfig.putts?.backAmount ?? 50,
          total: betConfig.putts?.totalAmount ?? 100,
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
  // Correctly map handicaps based on stored player order
  const isPlayerA = currentHandicap?.playerAId === player.id;
  const [playerAHcp, setPlayerAHcp] = useState(
    currentHandicap 
      ? (isPlayerA ? currentHandicap.playerAHandicap : currentHandicap.playerBHandicap)
      : player.handicap
  );
  const [playerBHcp, setPlayerBHcp] = useState(
    currentHandicap 
      ? (isPlayerA ? currentHandicap.playerBHandicap : currentHandicap.playerAHandicap)
      : rival.handicap
  );
  
  const disambiguatedAbbrsHcp = useMemo(() => disambiguateInitials([player, rival]), [player, rival]);
  const getPlayerAbbr = (p: Player) => disambiguatedAbbrsHcp.get(p.id) || p.initials;
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
            {formatPlayerName(player.name)}
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
            {formatPlayerName(rival.name)}
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
            <strong>{formatPlayerName(playerReceives ? player.name : rival.name)}</strong> recibe{' '}
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