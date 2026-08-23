// Complete Bet Dashboard - reorganized with bet type rows and bet override capability
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fmtMoney, roundToNearest5, roundGroupToNearest5Map } from '@/lib/formatMoney';
import { useSlidingPersistence } from '@/hooks/useSlidingPersistence';
import { cn } from '@/lib/utils';
import { RoundHolesBadge } from '@/components/RoundHolesBadge';
import { Player, PlayerScore, BetConfig, GolfCourse, MarkerState, markerInfo, BetOverride, CarritosTeamBet, BilateralHandicap, PlayerGroup } from '@/types/golf';
import { SnapshotPlayerBalance, SnapshotLedgerEntry, SnapshotPairBreakdowns, SnapshotPairSegmentResults, snapshotLedgerToBetSummaries } from '@/lib/roundSnapshot';
import { calculateStrokesPerHole, calculateStrokesPerHoleWithHalf } from '@/lib/handicapUtils';
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
import { getRayasDetailForPair, RayasPairResult, isRayasActiveForPair, getSkinVariantConflict, getPairKey, RayaDetail, getRayasSegmentConflicts, RayasSegmentConflict, getOyesModalityForPair, getAuthoritativeRayasBalance } from '@/lib/rayasCalculations';
import { RayasSegmentPopover } from './RayasSegmentPopover';
import { calculateConejaBets } from '@/lib/conejaCalculations';
import { calculateBloquesForPair, type BloqueResult } from '@/lib/bets/bloques';
import { BloquesStrip } from './BloquesStrip';
import { detectScoreBasedMarkers, mergeMarkers } from '@/lib/scoreDetection';
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
  AlertTriangle,
  Edit2,
  Check,
  X,
  Plus,
  Minus,
  UserPlus,
  Swords,
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

import { BilateralDetail } from './BilateralDetail';
import { CarritosResultsCard, TeamHoleGrid } from './CarritosResultsCard';
import { CrossGroupHandicapWidget } from './CrossGroupHandicapWidget';
import { BetAmountEditor, BilateralHandicapEditor } from './BetEditors';
import { WolfResultsCard } from './WolfResultsCard';
import { SixesResultsCard } from './SixesResultsCard';
import { VegasResultsCard } from './VegasResultsCard';
import { NinesResultsCard } from './NinesResultsCard';
import { TeamBetHandicapInfo } from './TeamBetHandicapInfo';
import { useWolf } from '@/hooks/useWolf';
import { useSixes } from '@/hooks/useSixes';
import { useVegas } from '@/hooks/useVegas';
import { useNines } from '@/hooks/useNines';
import { isSixesSettlementActive, isVegasSettlementActive, isWolfSettlementActive } from '@/lib/teamBetPersistence';
import { calculateNinesBets } from '@/lib/bets/nines';
import { calculateWolfBets } from '@/lib/bets/wolf';
import { calculateSixesBets } from '@/lib/bets/sixes';
import { calculateVegasBets } from '@/lib/bets/vegas';
import { collectStandardManchaHits, collectGenericManchaHits } from '@/lib/bets/manchas';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
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
  wolfHook?: ReturnType<typeof useWolf>;
  sixesHook?: ReturnType<typeof useSixes>;
  vegasHook?: ReturnType<typeof useVegas>;
  ninesHook?: ReturnType<typeof useNines>;
  crossBets?: import('@/hooks/useCrossBets').CrossBet[];
  onUpdateCrossBetConfig?: (args: { crossBetId: string; betConfig: Record<string, any> }) => Promise<void>;
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
  wolfHook,
  sixesHook,
  vegasHook,
  ninesHook,
  crossBets = [],
  onUpdateCrossBetConfig,
}) => {
  const [selectedRival, setSelectedRival] = useState<string | null>(null);
  const [expandedTypes, setExpandedTypes] = useState<string[]>([]);
  const [expandedLeaderboard, setExpandedLeaderboard] = useState<string | null>(null);
  const [balanceBasePlayerId, setBalanceBasePlayerId] = useState<string | null>(null);
  const [showCrossGroupPicker, setShowCrossGroupPicker] = useState(false);
  const [foursomeOpenId, setFoursomeOpenId] = useState<string | null>(null);
  // Auto-detect user's group for default selection
  const userGroupIndex = useMemo(() => {
    if (!basePlayerId || (playerGroups ?? []).length === 0) return 0;
    if (players.some(p => p.id === basePlayerId || p.profileId === basePlayerId)) return 0;
    for (let i = 0; i < (playerGroups ?? []).length; i++) {
      if ((playerGroups ?? [])[i].players.some(p => p.id === basePlayerId || p.profileId === basePlayerId)) return i + 1;
    }
    return 0;
  }, [basePlayerId, players, playerGroups]);

  const [displayGroupIndex, setDisplayGroupIndex] = useState(0); // For group selector in detail view
  
  const hasSetInitialGroupRef = useRef(false);
  // Reset when basePlayerId changes so each player sees their own group
  useEffect(() => {
    hasSetInitialGroupRef.current = false;
  }, [basePlayerId]);
  useEffect(() => {
    if (!hasSetInitialGroupRef.current && (playerGroups ?? []).length > 0) {
      setDisplayGroupIndex(userGroupIndex);
      hasSetInitialGroupRef.current = true;
    }
  }, [userGroupIndex, playerGroups]);
  
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
        // Filter betOverrides to only those relevant to this cross-group pair
        const pairOverrides = (effectiveBetConfig.betOverrides || []).filter(o => {
          const ids = [playerA.id, playerB.id];
          return ids.includes(o.playerAId) && ids.includes(o.playerBId);
        });

        const crossGroupConfig: BetConfig = {
          ...effectiveBetConfig,
          // CRITICAL: Only use THIS pair's bilateral handicap — exclude all intra-group
          // handicaps so the engine doesn't accidentally find another handicap record
          // for one of these players and compute wrong net scores.
          bilateralHandicaps: [crossGroupBilateral],
          // CRITICAL: Only include overrides for THIS pair — intra-group overrides from
          // other pairs must NOT be applied. The close engine does the same filtering.
          betOverrides: pairOverrides,
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
          // CRITICAL: Disable Medal General in cross-group synthetic context.
          // Medal General is a POOL bet calculated across ALL players in the main engine
          // (liveBetSummaries). If we also calculate it here, it gets double-counted
          // because both sets merge into betSummaries.
          medalGeneral: { ...effectiveBetConfig.medalGeneral, enabled: false },
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
  // Nines summaries (grupal bilateral — same pattern as Coneja)
  const ninesBetSummaries = useMemo(() => {
    if (isHistorical || !ninesHook?.ninesConfig) return [];
    const cfg = ninesHook.ninesConfig;
    if (!cfg.playerIds || cfg.playerIds.length < 3) return [];
    return calculateNinesBets(allPlayersForCalculations, confirmedScores, cfg, course);
  }, [isHistorical, ninesHook?.ninesConfig, allPlayersForCalculations, confirmedScores, course]);

  const wolfSettlementActive = isWolfSettlementActive(effectiveBetConfig);
  const sixesSettlementActive = isSixesSettlementActive(effectiveBetConfig);
  const vegasSettlementActive = isVegasSettlementActive(effectiveBetConfig);

  // Wolf summaries (team bet — Balance General pattern)
  const wolfBetSummaries = useMemo(() => {
    if (isHistorical || !wolfHook?.wolfConfig || !wolfHook.holeStates) return [];
    if (!wolfSettlementActive) return [];
    const wolfPlayers = (wolfHook.wolfConfig.participantIds?.length ?? 0) > 0
      ? allPlayersForCalculations.filter(p => wolfHook.wolfConfig!.participantIds!.includes(p.id))
      : allPlayersForCalculations;
    return calculateWolfBets(wolfPlayers, wolfHook.wolfConfig, wolfHook.holeStates, confirmedScores, course);
  }, [isHistorical, wolfHook?.wolfConfig, wolfHook?.holeStates, allPlayersForCalculations, wolfSettlementActive, confirmedScores, course]);

  // Sixes summaries
  const sixesBetSummaries = useMemo(() => {
    if (isHistorical || !sixesHook?.sixesConfig) return [];
    if (!sixesSettlementActive) return [];
    const th = effectiveBetConfig.sixesBets?.[0]?.teamHandicaps;
    return calculateSixesBets(allPlayersForCalculations, confirmedScores, sixesHook.sixesConfig, course, th);
  }, [isHistorical, sixesHook?.sixesConfig, allPlayersForCalculations, confirmedScores, course, effectiveBetConfig.sixesBets, sixesSettlementActive]);

  // Vegas summaries
  const vegasBetSummaries = useMemo(() => {
    if (isHistorical || !vegasHook?.vegasConfig) return [];
    if (!vegasSettlementActive) return [];
    const th = effectiveBetConfig.vegasBets?.[0]?.teamHandicaps;
    return calculateVegasBets(allPlayersForCalculations, confirmedScores, vegasHook.vegasConfig, course, th, startingHole);
  }, [isHistorical, vegasHook?.vegasConfig, allPlayersForCalculations, confirmedScores, course, effectiveBetConfig.vegasBets, vegasSettlementActive, startingHole]);

  const betSummaries = useMemo(
    () => isHistorical
      ? snapshotLedgerToBetSummaries(snapshotLedger!)
      : [
          ...liveBetSummaries.filter(s => !carritosEngineTypes.includes(s.betType)),
          ...crossGroupBetSummaries,
          ...ninesBetSummaries,
        ],
    [isHistorical, snapshotLedger, liveBetSummaries, crossGroupBetSummaries, ninesBetSummaries]
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
      frontAmount: number;
      backAmount: number;
      totalAmount: number;
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
        handicapConfig?: { mode?: string; slidingHalfPointMode?: 'halfPoint' | 'roundDown' };
      }
    ) => {
      const { useTeamHandicaps, teamHandicaps, id, handicapConfig } = opts ?? {};

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
        const direct = teamHandicaps?.[playerId];
        if (typeof direct === 'number' && Number.isFinite(direct)) return direct;

        const byProfileId = players.find((p) => p.id === playerId)?.profileId;
        if (byProfileId) {
          const h = teamHandicaps?.[byProfileId];
          if (typeof h === 'number' && Number.isFinite(h)) return h;
        }

        if (useTeamHandicaps) {
          const teamHcp = teamHandicaps?.[playerId];
          if (typeof teamHcp === 'number' && Number.isFinite(teamHcp)) return teamHcp;
        }

        return players.find((p) => p.id === playerId)?.handicap ?? 0;
      };

      // Detect half-point hole for visual display
      const isHalfPointMode = handicapConfig?.slidingHalfPointMode === 'halfPoint';
      let halfStrokeHole: number | null = null;
      let halfPlayerId: string | null = null;
      if (isHalfPointMode) {
        const allPids = [...new Set([...resolvedTeamA, ...resolvedTeamB])];
        for (const pid of allPids) {
          const hcp = getPlayerHandicapForCarritos(pid);
          if (hcp % 1 !== 0) {
            const result = calculateStrokesPerHoleWithHalf(hcp, true, course);
            halfStrokeHole = result.halfStrokeHole;
            halfPlayerId = pid;
            break;
          }
        }
      }

      const strokesReceivedByPlayer = new Map<string, number[]>();
      const allPlayers = [...new Set([...resolvedTeamA, ...resolvedTeamB])];
      allPlayers.forEach((pid) => {
        strokesReceivedByPlayer.set(pid, calculateStrokesPerHole(Math.floor(getPlayerHandicapForCarritos(pid)), course));
      });

      const getCarritosNet = (playerId: string, holeNum: number): number | null => {
        const score = confirmedScores.get(playerId)?.find((s) => s.holeNumber === holeNum);
        if (!score) return null;
        const strokesReceived = strokesReceivedByPlayer.get(playerId)?.[holeNum - 1] ?? 0;
        return (typeof score.strokes === 'number' ? score.strokes : 0) - strokesReceived;
      };

      const getCarritosHoleScore = (
        playerId: string,
        holeNum: number,
        showHalfPoint = false
      ): { gross: number; hcp: number; net: number } | null => {
        const score = confirmedScores.get(playerId)?.find((s) => s.holeNumber === holeNum);
        if (!score || typeof score.strokes !== 'number' || !Number.isFinite(score.strokes)) return null;
        const hcp = strokesReceivedByPlayer.get(playerId)?.[holeNum - 1] ?? 0;
        // Show half-point dot indicator ONLY when a tie was broken (score stays unchanged)
        const displayHcp = (showHalfPoint && playerId === halfPlayerId && holeNum === halfStrokeHole && hcp === 0) ? 0.5 : hcp;
        return { gross: score.strokes, hcp: displayHcp, net: score.strokes - hcp };
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
        const a1r = getCarritosHoleScore(resolvedTeamA[0], holeNum);
        const a2r = getCarritosHoleScore(resolvedTeamA[1], holeNum);
        const b1r = getCarritosHoleScore(resolvedTeamB[0], holeNum);
        const b2r = getCarritosHoleScore(resolvedTeamB[1], holeNum);

        // Skip if not all four have a score for this hole
        if (!a1r || !a2r || !b1r || !b2r) return null;

        const netA1 = a1r.net;
        const netA2 = a2r.net;
        const netB1 = b1r.net;
        const netB2 = b2r.net;

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

        // Only show .5 visual when a tie exists on the half-point hole AND the half-point player's score participates in the tie
        const hasTie = lowBallWinner === 'tie' || highBallWinner === 'tie' || combinedWinner === 'tie';
        const isHalfHole = holeNum === halfStrokeHole && halfPlayerId !== null;
        
        // Determine the half-point player's net score and which team they belong to
        let showHalf = false;
        if (hasTie && isHalfHole) {
          const receivingTeam: 'A' | 'B' = resolvedTeamA.includes(halfPlayerId!) ? 'A' : 'B';
          const halfPlayerNet = receivingTeam === 'A'
            ? (halfPlayerId === resolvedTeamA[0] ? netA1 : netA2)
            : (halfPlayerId === resolvedTeamB[0] ? netB1 : netB2);
          
          const lowTied = Math.min(netA1, netA2); // equals Math.min(netB1, netB2) when tied
          const highTied = Math.max(netA1, netA2);
          const combinedTied = netA1 + netA2;
          
          // Only break a tie if the half-point player's score IS the one creating the tie
          if (lowBallWinner === 'tie' && halfPlayerNet === lowTied) {
            lowBallWinner = receivingTeam; pointsA += receivingTeam === 'A' ? 1 : 0; pointsB += receivingTeam === 'B' ? 1 : 0;
            showHalf = true;
          }
          if (highBallWinner === 'tie' && halfPlayerNet === highTied && halfPlayerNet !== lowTied) {
            highBallWinner = receivingTeam; pointsA += receivingTeam === 'A' ? 1 : 0; pointsB += receivingTeam === 'B' ? 1 : 0;
            showHalf = true;
          }
          if (combinedWinner === 'tie') {
            // For combined, the half-point always applies since it affects the team total
            combinedWinner = receivingTeam; pointsA += receivingTeam === 'A' ? 1 : 0; pointsB += receivingTeam === 'B' ? 1 : 0;
            showHalf = true;
          }
        }

        const a1 = showHalf ? getCarritosHoleScore(resolvedTeamA[0], holeNum, true) ?? a1r : a1r;
        const a2 = showHalf ? getCarritosHoleScore(resolvedTeamA[1], holeNum, true) ?? a2r : a2r;
        const b1 = showHalf ? getCarritosHoleScore(resolvedTeamB[0], holeNum, true) ?? b1r : b1r;
        const b2 = showHalf ? getCarritosHoleScore(resolvedTeamB[1], holeNum, true) ?? b2r : b2r;

        return {
          pointsA,
          pointsB,
          detail: {
            holeNumber: holeNum,
            grossA1: a1.gross,
            hcpA1: a1.hcp,
            netA1: a1.net,
            grossA2: a2.gross,
            hcpA2: a2.hcp,
            netA2: a2.net,
            grossB1: b1.gross,
            hcpB1: b1.hcp,
            netB1: b1.net,
            grossB2: b2.gross,
            hcpB2: b2.hcp,
            netB2: b2.net,
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
      
      // 9-hole rounds: only Front 9 counts; Back 9 and Total 18 are not played.
      const isNineHoleRound = (betConfig.roundHoles ?? 18) === 9;
      const effBackAmount = isNineHoleRound ? 0 : backAmount;
      const effTotalAmount = isNineHoleRound ? 0 : totalAmount;
      const effPointsABack = isNineHoleRound ? 0 : pointsABack;
      const effPointsBBack = isNineHoleRound ? 0 : pointsBBack;
      const effPointsATotal = isNineHoleRound ? pointsAFront : pointsATotal;
      const effPointsBTotal = isNineHoleRound ? pointsBFront : pointsBTotal;

      // Money calculation based on who has more points per segment
      let moneyA = 0;
      
      // Front 9: who has more points wins
      if (pointsAFront > pointsBFront) moneyA += frontAmount;
      else if (pointsBFront > pointsAFront) moneyA -= frontAmount;
      
      // Back 9: who has more points wins (skipped on 9-hole rounds)
      if (!isNineHoleRound) {
        if (pointsABack > pointsBBack) moneyA += backAmount;
        else if (pointsBBack > pointsABack) moneyA -= backAmount;

        // Total 18: who has more accumulated points wins (skipped on 9-hole rounds)
        if (pointsATotal > pointsBTotal) moneyA += totalAmount;
        else if (pointsBTotal > pointsATotal) moneyA -= totalAmount;
      }
      
      return {
        teamA: resolvedTeamA,
        teamB: resolvedTeamB,
        scoringType,
        netByHoleFront: frontPoints.netByHole,
        netByHoleBack: isNineHoleRound ? backPoints.netByHole.map(() => null) : backPoints.netByHole,
        holeDetailsFront: frontPoints.details,
        holeDetailsBack: isNineHoleRound ? backPoints.details.map(() => null) : backPoints.details,
        pointsAFront,
        pointsBFront,
        pointsABack: effPointsABack,
        pointsBBack: effPointsBBack,
        pointsATotal: effPointsATotal,
        pointsBTotal: effPointsBTotal,
        pointsAAccumulated: effPointsATotal,
        pointsBAccumulated: effPointsBTotal,
        moneyA,
        moneyB: -moneyA,
        amount: frontAmount + effBackAmount + effTotalAmount,
        frontAmount,
        backAmount: effBackAmount,
        totalAmount: effTotalAmount,
        id,
      };
    };

    // Guard: skip all carritos calculations if carritos is disabled in the matrix
    if (!betConfig.carritos.enabled) return results;

    // Primary carritos - show only if no carritosTeams exist (legacy pattern)
    // When carritosTeams array has entries, all carritos are managed there
    const hasCarritosTeams = (betConfig.carritosTeams?.length ?? 0) > 0;
    if (!hasCarritosTeams && betConfig.carritos.teamA[0] && betConfig.carritos.teamA[1] && betConfig.carritos.teamB[0] && betConfig.carritos.teamB[1]) {
      const { teamA, teamB, frontAmount, backAmount, totalAmount, scoringType, teamHandicaps, useTeamHandicaps, handicapConfig } = betConfig.carritos;
      results.push(
        calculateCarritosResult(teamA, teamB, frontAmount, backAmount, totalAmount, scoringType, {
          id: undefined,
          useTeamHandicaps,
          teamHandicaps,
          handicapConfig,
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
            handicapConfig: team.handicapConfig,
          })
        );
      }
    });

    return results;
  }, [betConfig.carritos, betConfig.carritosTeams, betConfig.roundHoles, confirmedScores, players, course]);

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
    if (betConfig.carritos.enabled) allCarritosResults.forEach((result, idx) => {
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

    onBetSummariesChange?.([
      ...betSummaries,
      ...carritosSummaries,
      ...wolfBetSummaries,
      ...sixesBetSummaries,
      ...vegasBetSummaries,
      // NOTE: ninesBetSummaries is already included inside betSummaries (line ~436)
    ]);
  }, [betSummaries, allCarritosResults, wolfBetSummaries, sixesBetSummaries, vegasBetSummaries, betConfig.disabledTeamBetIds, betConfig.carritos, betConfig.carritosTeams, isHistorical, onBetSummariesChange]);
  
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
      if (betType.startsWith('Skins Grupal')) return { label: 'Skins Grupal', aliases: ['skinsGrupal'] };
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
      if (betType.startsWith('Zoológico')) return { label: 'Zoológico', aliases: ['zoologico'] };
      return { label: betType, aliases: [] };
    };

    // HISTORICAL MODE: The snapshot ledger is the single source of truth.
    // Overrides are already baked into the ledger at close time — do NOT re-apply them.
    // Simply sum all ledger-derived betSummaries for this pair.
    if (isHistorical) {
      // IMPORTANT: Exclude Carritos and Presiones Parejas from bilateral avatar/header.
      // Those are shown in their own team cards. The BilateralDetail header (computedTotalBalance)
      // also excludes them (they don't appear in betTypeGroups), so this keeps avatars consistent.
      const historicalTeamBetTypes = new Set([
        'Carritos Front', 'Carritos Back', 'Carritos Total',
        'Presiones Parejas', 'Presiones Pareja',
        'Wolf', 'Sixes', 'Vegas',
      ]);
      return betSummaries
        .filter(s =>
          s.playerId === playerId &&
          s.vsPlayer === rivalId &&
          !historicalTeamBetTypes.has(s.betType)
        )
        .reduce((sum, s) => sum + s.amount, 0);
    }

    // Map engine betType labels to the betConfig key for participation checking
    const betTypeToConfigKey = (betType: string): string | null => {
      if (betType.startsWith('Medal') && betType !== 'Medal General') return 'medal';
      if (betType.startsWith('Presiones') && betType !== 'Presiones Parejas') return 'pressures';
      if (betType.startsWith('Skins Grupal')) return 'skinsGrupal';
      if (betType.startsWith('Skins')) return 'skins';
      if (betType === 'Caros') return 'caros';
      if (betType === 'Oyes') return 'oyeses';
      if (betType === 'Unidades') return 'units';
      if (betType === 'Manchas') return 'manchas';
      if (betType === 'Culebras') return 'culebras';
      if (betType.includes('Pingüino')) return 'pinguinos';
      if (betType === 'Coneja') return 'coneja';
      if (betType === 'Putts' || betType.startsWith('Putts')) return 'putts';
      if (betType.startsWith('Zoológico')) return 'zoologico';
      if (betType === 'Side Bet') return 'sideBets';
      return null;
    };

    // Resolve group-specific config for this pair so participantIds are correct for G2+
    const pairGroupId = playerObj?.groupId || rivalObj?.groupId;
    const resolvedPairConfig = resolveConfigForGroup(effectiveBetConfig, pairGroupId);

    const nonRayasNonMedalGeneralBalance = betSummaries
      .filter(s => 
        s.playerId === playerId && 
        s.vsPlayer === rivalId && 
        !s.betType.startsWith('Rayas') &&
        s.betType !== 'Medal General' &&
        s.betType !== 'Stableford' &&
        !s.betType.startsWith('Skins Grupal') &&
        s.betType !== 'Presiones Parejas' &&
        s.betType !== 'Coneja' &&
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
        const betCfg = resolvedPairConfig[configKey as keyof BetConfig] as any;
        if (!betCfg?.participantIds) return true; // undefined = all participate
        if (betCfg.participantIds.length === 0) return false; // [] = nobody
        return bothParticipateGlobal(betCfg.participantIds, playerId, rivalId, betCfg);
      })
      .reduce((sum, s) => sum + s.amount, 0);
    
    // Calculate correct Rayas total using getAuthoritativeRayasBalance (SINGLE SOURCE OF TRUTH)
    // This is the same function used by the header, eliminating any divergence.
    let rayasTotal = 0;
    const isRayasDisabledByOverride = isBetDisabledForPair('Rayas', ['rayas']);
    const isRayasActiveForThisPair = isRayasActiveForPair(resolvedPairConfig, playerId, rivalId);
    
    if (resolvedPairConfig.rayas?.enabled && playerObj && rivalObj && !isRayasDisabledByOverride && isRayasActiveForThisPair && bothParticipateGlobal(resolvedPairConfig.rayas?.participantIds, playerId, rivalId, resolvedPairConfig.rayas)) {
      // Resolve dashboard override amounts for this pair (same logic as header)
      const overrides = effectiveBetConfig.betOverrides || [];
      const playerProfileId = playerObj?.profileId;
      const rivalProfileId = rivalObj?.profileId;
      const findOverride = (betType: string): number | undefined => {
        const match = overrides.find(o =>
          o.betType === betType &&
          o.enabled !== false &&
          o.amountOverride !== undefined &&
          ((o.playerAId === playerId && o.playerBId === rivalId) ||
           (o.playerAId === rivalId && o.playerBId === playerId) ||
           (playerProfileId && (o.playerAId === playerProfileId || o.playerBId === playerProfileId) &&
            (o.playerAId === rivalId || o.playerBId === rivalId)) ||
           (rivalProfileId && (o.playerAId === rivalProfileId || o.playerBId === rivalProfileId) &&
            (o.playerAId === playerId || o.playerBId === playerId)) ||
           (playerProfileId && rivalProfileId && (
             (o.playerAId === playerProfileId && o.playerBId === rivalProfileId) ||
             (o.playerAId === rivalProfileId && o.playerBId === playerProfileId)
           )))
        );
        return match?.amountOverride;
      };
      
      rayasTotal = getAuthoritativeRayasBalance(
        playerObj,
        rivalObj,
        confirmedScores,
        effectiveBetConfig,
        course,
        effectiveBetConfig.bilateralHandicaps,
        allPlayersForCalculations,
        startingHole,
        {
          frontValue: findOverride('Rayas Front') ?? betConfig.rayas?.frontValue ?? 0,
          backValue: findOverride('Rayas Back') ?? betConfig.rayas?.backValue ?? 0,
          medalTotalValue: findOverride('Rayas Medal Total') ?? betConfig.rayas?.medalTotalValue ?? 0,
        }
      );
    }
    
    // Calculate Medal General using the same logic as the detail view
    // This ensures consistency between the Balance vs header and the detail breakdown
    let medalGeneralTotal = 0;
    const isMedalGeneralDisabled = isBetDisabledForPair('Medal General', ['medalGeneral']);
    
    if (resolvedPairConfig.medalGeneral?.enabled && playerObj && rivalObj && !isMedalGeneralDisabled && bothParticipateGlobal(resolvedPairConfig.medalGeneral?.participantIds, playerId, rivalId)) {
      const playerWithGroup = allPlayersForCalculations.find(p => p.id === playerId) || playerObj;
      const rivalWithGroup = allPlayersForCalculations.find(p => p.id === rivalId) || rivalObj;
      const medalResult = getMedalGeneralBilateralResult(
        allPlayersForCalculations,
        playerWithGroup,
        rivalWithGroup,
        confirmedScores,
        betConfig,
        course,
        startingHole
      );
      if (medalResult) {
        medalGeneralTotal = medalResult.amount;
      }
    }
    
    // Calculate Stableford using the same pool logic as Medal General (scope-aware)
    let stablefordTotal = 0;
    const isStablefordDisabled = isBetDisabledForPair('Stableford', ['stableford']);
    
    if (resolvedPairConfig.stableford?.enabled && playerObj && rivalObj && !isStablefordDisabled && bothParticipateGlobal(resolvedPairConfig.stableford?.participantIds, playerId, rivalId)) {
      const playerWithGroup = allPlayersForCalculations.find(p => p.id === playerId) || playerObj;
      const rivalWithGroup = allPlayersForCalculations.find(p => p.id === rivalId) || rivalObj;
      const stablefordResult = getStablefordBilateralResult(
        allPlayersForCalculations,
        playerWithGroup,
        rivalWithGroup,
        confirmedScores,
        betConfig,
        course
      );
      if (stablefordResult) {
        stablefordTotal = stablefordResult.amount;
      }
    }
    
    // Calculate Skins Grupal from betSummaries (group bet, already pair-level)
    let skinsGrupalTotal = 0;
    const isSkinsGrupalDisabled = isBetDisabledForPair('Skins Grupal', ['skinsGrupal']);
    if (resolvedPairConfig.skinsGrupal?.enabled && !isSkinsGrupalDisabled) {
      skinsGrupalTotal = betSummaries
        .filter(s => s.playerId === playerId && s.vsPlayer === rivalId && s.betType.startsWith('Skins Grupal'))
        .reduce((sum, s) => sum + s.amount, 0);
    }
    
    // Calculate Coneja separately using the same recalculation as the detail view
    // This avoids divergence between engine betSummaries and detail's calculateConejaBets
    let conejaTotal = 0;
    const isConejaDisabled = isBetDisabledForPair('Coneja', ['coneja']);
      if (resolvedPairConfig.coneja?.enabled && playerObj && rivalObj && !isConejaDisabled && bothParticipateGlobal(resolvedPairConfig.coneja?.participantIds, playerId, rivalId)) {
        const displayGroupPlayers = getPlayersForGroup(displayGroupIndex, players, playerGroups);
        const conejaParticipantIds = resolvedPairConfig.coneja?.participantIds;
        const conejaPlayers = conejaParticipantIds === undefined
          ? displayGroupPlayers
          : conejaParticipantIds.length === 0
            ? []
            : (() => {
                const groupPlayersInList = displayGroupPlayers.filter(p => conejaParticipantIds.includes(p.id));
                if (groupPlayersInList.length === 0) return displayGroupPlayers;
                return groupPlayersInList;
              })();
        if (conejaPlayers.length >= 2 && conejaPlayers.some(p => p.id === playerId) && conejaPlayers.some(p => p.id === rivalId)) {
          const conejaBets = calculateConejaBets(conejaPlayers, confirmedScores, course, effectiveBetConfig, confirmedHoles);
        const playerWins = conejaBets
          .filter(b => b.winnerId === playerId && b.loserId === rivalId)
          .reduce((sum, b) => sum + b.amount, 0);
        const rivalWins = conejaBets
          .filter(b => b.winnerId === rivalId && b.loserId === playerId)
          .reduce((sum, b) => sum + b.amount, 0);
        conejaTotal = playerWins - rivalWins;
      }
    }
    
    return nonRayasNonMedalGeneralBalance + rayasTotal + medalGeneralTotal + stablefordTotal + skinsGrupalTotal + conejaTotal;
  };
  
  // getCorrectedPlayerBalance is defined after getBilateralBalanceFromMap below

  // Historical mode: break down the pair balance by category from the snapshot ledger.
  // Individual = all non-team bets; Carritos = carritos bets; Presiones = team pressures.
  // Overrides are already baked into the ledger — no re-filtering needed.
  const getHistoricalPairBreakdown = (playerAId: string, playerBId: string): { individual: number; carritos: number; presiones: number; wolf: number; sixes: number; vegas: number } | null => {
    if (!isHistorical) return null;
    const pairSummaries = betSummaries.filter(s => s.playerId === playerAId && s.vsPlayer === playerBId);
    const isCarritosBet     = (bt: string) => bt === 'Carritos Front' || bt === 'Carritos Back' || bt === 'Carritos Total';
    const isPresionesPareja = (bt: string) => bt === 'Presiones Parejas' || bt === 'Presiones Pareja';
    const isTeamSprint3     = (bt: string) => bt === 'Wolf' || bt === 'Sixes' || bt === 'Vegas';
    const carritos  = pairSummaries.filter(s => isCarritosBet(s.betType)).reduce((a, e) => a + e.amount, 0);
    const presiones = pairSummaries.filter(s => isPresionesPareja(s.betType)).reduce((a, e) => a + e.amount, 0);
    const wolf      = pairSummaries.filter(s => s.betType === 'Wolf').reduce((a, e) => a + e.amount, 0);
    const sixes     = pairSummaries.filter(s => s.betType === 'Sixes').reduce((a, e) => a + e.amount, 0);
    const vegas     = pairSummaries.filter(s => s.betType === 'Vegas').reduce((a, e) => a + e.amount, 0);
    const individual = pairSummaries.filter(s => !isCarritosBet(s.betType) && !isPresionesPareja(s.betType) && !isTeamSprint3(s.betType)).reduce((a, e) => a + e.amount, 0);
    return { individual, carritos, presiones, wolf, sixes, vegas };
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

  // ═══════════════════════════════════════════════════════════════════
  // SINGLE SOURCE OF TRUTH: BilateralDetail's betTypeGroups-based
  // computedTotalBalance is the authoritative bilateral balance.
  // All BilateralDetail components (visible or hidden via display:none)
  // report their computed total back via onComputedBalance.
  // Avatars and Tabla General read from this map, guaranteeing they
  // always show the exact same value as the bilateral header.
  // ═══════════════════════════════════════════════════════════════════
  const bilateralBalanceMapRef = useRef<Map<string, number>>(new Map());
  const [balanceMapVersion, setBalanceMapVersion] = useState(0);

  // Callback from BilateralDetail — stores the authoritative bilateral balance
  const handleComputedBalance = useCallback((playerId: string, rivalId: string, balance: number) => {
    const key = `${playerId}→${rivalId}`;
    const reverseKey = `${rivalId}→${playerId}`;
    const prev = bilateralBalanceMapRef.current.get(key);
    if (prev !== balance) {
      bilateralBalanceMapRef.current.set(key, balance);
      bilateralBalanceMapRef.current.set(reverseKey, -balance);
      setBalanceMapVersion(v => v + 1);
    }
  }, []);

  // Prefer the map (authoritative from BilateralDetail) over getCorrectedBilateralBalance (fallback)
  const getBilateralBalanceFromMap = useCallback((playerId: string, rivalId: string): number => {
    const key = `${playerId}→${rivalId}`;
    const mapVal = bilateralBalanceMapRef.current.get(key);
    if (mapVal !== undefined) return mapVal;
    // Fallback for pairs not rendered by BilateralDetail (e.g. non-basePlayer pairs in Tabla General)
    return getCorrectedBilateralBalance(playerId, rivalId);
  }, [getCorrectedBilateralBalance, balanceMapVersion]);

  // Use useLayoutEffect to clear the map BEFORE children's useLayoutEffect fires.
  // This prevents a race where useEffect (post-paint) clears values that children
  // already populated via useLayoutEffect (pre-paint).
  React.useLayoutEffect(() => {
    setSelectedRival(null);
    // Clear the balance map so new BilateralDetails populate it fresh
    bilateralBalanceMapRef.current.clear();
    setBalanceMapVersion(v => v + 1);
  }, [balanceBasePlayerId]);
  
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
  const getTeamPressuresBalanceForPlayer = (playerId: string, betId?: string): number => {
    if (isHistorical) {
      // In historical mode, read from betSummaries (derived from snapshot ledger)
      return betSummaries
        .filter(s =>
          s.playerId === playerId &&
          (s.betType === 'Presiones Parejas' || s.betType === 'Presiones Pareja') &&
          (!betId || s.betId === betId)
        )
        .reduce((sum, s) => sum + s.amount, 0);
    }
    return betSummaries
      .filter(s =>
        s.playerId === playerId &&
        s.betType === 'Presiones Parejas' &&
        (!betId || s.betId === betId) &&
        !isTeamBetDisabled(s.betId || '')
      )
      .reduce((sum, s) => sum + s.amount, 0);
  };

  // Historical mode: sum Carritos + Presiones Parejas from the ledger for a player (all rivals combined).
  // Used in Tabla General to show the real total including team bets alongside the individual subtotal.
  const getHistoricalTeamBetsBalanceForPlayer = (playerId: string): number => {
    if (!isHistorical) return 0;
    const teamBetTypes = new Set([
      'Carritos Front', 'Carritos Back', 'Carritos Total',
      'Presiones Parejas', 'Presiones Pareja',
      'Wolf', 'Sixes', 'Vegas',
    ]);
    return betSummaries
      .filter(s => s.playerId === playerId && teamBetTypes.has(s.betType))
      .reduce((sum, s) => sum + s.amount, 0);
  };



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
  
  // ── Wolf balance ──────────────────────────────────────────────────────
  const getWolfBalanceForPlayer = (playerId: string): number =>
    wolfBetSummaries.filter(s => s.playerId === playerId).reduce((sum, s) => sum + s.amount, 0);
  const getWolfBalanceVsPlayer = (playerAId: string, playerBId: string): number =>
    wolfBetSummaries.filter(s => s.playerId === playerAId && s.vsPlayer === playerBId).reduce((sum, s) => sum + s.amount, 0);

  // ── Sixes balance ─────────────────────────────────────────────────────
  const getSixesBalanceForPlayer = (playerId: string): number =>
    sixesBetSummaries.filter(s => s.playerId === playerId).reduce((sum, s) => sum + s.amount, 0);
  const getSixesBalanceVsPlayer = (playerAId: string, playerBId: string): number =>
    sixesBetSummaries.filter(s => s.playerId === playerAId && s.vsPlayer === playerBId).reduce((sum, s) => sum + s.amount, 0);

  // ── Vegas balance ─────────────────────────────────────────────────────
  const getVegasBalanceForPlayer = (playerId: string): number =>
    vegasBetSummaries.filter(s => s.playerId === playerId).reduce((sum, s) => sum + s.amount, 0);
  const getVegasBalanceVsPlayer = (playerAId: string, playerBId: string): number =>
    vegasBetSummaries.filter(s => s.playerId === playerAId && s.vsPlayer === playerBId).reduce((sum, s) => sum + s.amount, 0);

  // HISTORICAL: Use snapshotBalances (immutable source of truth). LIVE: Use calculated values.
  const getSortedPlayersForDisplay = (playersToSort: Player[]) => {
    return [...playersToSort].sort((a, b) => {
      const snapA = isHistorical ? getSnapshotTotalBalance(a.id) : null;
      const snapB = isHistorical ? getSnapshotTotalBalance(b.id) : null;
      const balanceA = snapA !== null ? snapA : (() => {
        const rivalIds = playersToSort.filter(p => p.id !== a.id).map(p => p.id);
        return rivalIds.reduce((sum, rId) => sum + getBilateralBalanceFromMap(a.id, rId), 0) + getCarritosBalanceForPlayer(a.id) + getTeamPressuresBalanceForPlayer(a.id) + getWolfBalanceForPlayer(a.id) + getSixesBalanceForPlayer(a.id) + getVegasBalanceForPlayer(a.id);
      })();
      const balanceB = snapB !== null ? snapB : (() => {
        const rivalIds = playersToSort.filter(p => p.id !== b.id).map(p => p.id);
        return rivalIds.reduce((sum, rId) => sum + getBilateralBalanceFromMap(b.id, rId), 0) + getCarritosBalanceForPlayer(b.id) + getTeamPressuresBalanceForPlayer(b.id) + getWolfBalanceForPlayer(b.id) + getSixesBalanceForPlayer(b.id) + getVegasBalanceForPlayer(b.id);
      })();
      return balanceB - balanceA;
    });
  };

  // For verification calculation, still use all players from current group
  const sortedPlayers = useMemo(() => {
    return getSortedPlayersForDisplay(players);
  }, [players, betSummaries, allCarritosResults, balanceMapVersion]);


  
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
      // Prefer logged-in user if they're in this group
      const loggedInPlayer = groupPlayers.find(p => p.id === basePlayerId || p.profileId === basePlayerId);
      setBalanceBasePlayerId(loggedInPlayer?.id ?? groupPlayers[0].id);
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
  
  const rivals = useMemo(() => {
    const allRivals = [...sameGroupRivals, ...selectedCrossGroupPlayers];
    
    // In historical cross-group mode (no playerGroups, snapshot data), filter rivals
    // to only those with actual bet entries against the base player
    if (isHistorical && snapshotBalances && playerGroups.length === 0) {
      const baseBal = snapshotBalances.find(b => b.playerId === basePlayer?.id);
      if (baseBal) {
        const actualRivalIds = new Set(baseBal.vsBalances.map(v => v.rivalId));
        return allRivals.filter(r => actualRivalIds.has(r.id));
      }
    }
    
    return allRivals;
  }, [sameGroupRivals, selectedCrossGroupPlayers, isHistorical, snapshotBalances, playerGroups.length, basePlayer?.id]);

  // Get corrected total player balance (sum of corrected bilateral balances vs all rivals)
  const getCorrectedPlayerBalance = (playerId: string, rivalIds: string[]): number => {
    return rivalIds.reduce((sum, rivalId) => {
      return sum + getBilateralBalanceFromMap(playerId, rivalId);
    }, 0);
  };

  const getRivalBalance = (rivalId: string): number => {
    return getBilateralBalanceFromMap(basePlayer?.id || '', rivalId);
  };

  // If only 1 player in this context (e.g., historical Group 2 with solo player), show message
  if (isHistorical && players.length < 2) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No hay apuestas en este grupo (solo 1 jugador).
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-x-hidden max-w-full min-w-0">
      
      {/* Tabla General */}
      <Card>
        <CardHeader className="py-3 space-y-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              Balance General
              <RoundHolesBadge holes={betConfig.roundHoles as 9 | 18 | undefined} />
            </span>
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
                      // Prefer logged-in user if they're in this group
                      const loggedInPlayer = groupPlayers.find(p => p.id === basePlayerId || p.profileId === basePlayerId);
                      setBalanceBasePlayerId(loggedInPlayer?.id ?? groupPlayers[0].id);
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
            {(() => {
              const sortedDisplayPlayers = getSortedPlayersForDisplay(tablaGeneralPlayers);
              // Precompute raw display balances per player for Σ-preserving rounding.
              const rawDisplayMap = new Map<string, number>();
              sortedDisplayPlayers.forEach((player) => {
                const snapshotTotal = isHistorical ? getSnapshotTotalBalance(player.id) : null;
                let totalBalance: number;
                if (snapshotTotal !== null) {
                  totalBalance = snapshotTotal;
                } else {
                  const groupRivalIds = tablaGeneralPlayers.filter(p => p.id !== player.id).map(p => p.id);
                  const individualBalance = groupRivalIds.reduce((sum, rivalId) => sum + getBilateralBalanceFromMap(player.id, rivalId), 0);
                  totalBalance = individualBalance
                    + getCarritosBalanceForPlayer(player.id)
                    + getTeamPressuresBalanceForPlayer(player.id)
                    + getWolfBalanceForPlayer(player.id)
                    + getSixesBalanceForPlayer(player.id)
                    + getVegasBalanceForPlayer(player.id);
                }
                const playerCrossGroupRivals = getCrossGroupRivalsForBase(player.id);
                const crossGroupOthers = tablaGeneralMode === 'all'
                  ? otherGroupPlayers.filter(p => playerCrossGroupRivals.includes(p.id))
                  : [];
                const crossGroupBalance = crossGroupOthers.reduce((sum, rival) => {
                  return sum + (isHistorical ? (getSnapshotBilateralBalance(player.id, rival.id) ?? getBilateralBalanceFromMap(player.id, rival.id)) : getBilateralBalanceFromMap(player.id, rival.id));
                }, 0);
                const raw = tablaGeneralMode === 'all' ? totalBalance + crossGroupBalance : totalBalance;
                rawDisplayMap.set(player.id, raw);
              });
              const roundedDisplayMap = roundGroupToNearest5Map(rawDisplayMap);

              return sortedDisplayPlayers.map((player, idx) => {
              // HISTORICAL: Use snapshotBalances as the immutable source of truth (avoids ledger duplicate issues).
              // LIVE: Use corrected calculation.
              const snapshotTotal = isHistorical ? getSnapshotTotalBalance(player.id) : null;
              let totalBalance: number;
              if (snapshotTotal !== null) {
                totalBalance = snapshotTotal;
              } else {
                const groupRivalIds = tablaGeneralPlayers.filter(p => p.id !== player.id).map(p => p.id);
                const individualBalance = groupRivalIds.reduce((sum, rivalId) => sum + getBilateralBalanceFromMap(player.id, rivalId), 0);
                const carritosBalance = getCarritosBalanceForPlayer(player.id);
                const teamPressuresBalance = getTeamPressuresBalanceForPlayer(player.id);
                const wolfBalance = getWolfBalanceForPlayer(player.id);
                const sixesBalance = getSixesBalanceForPlayer(player.id);
                const vegasBalance = getVegasBalanceForPlayer(player.id);
                totalBalance = individualBalance + carritosBalance + teamPressuresBalance + wolfBalance + sixesBalance + vegasBalance;
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
                return sum + (isHistorical ? (getSnapshotBilateralBalance(player.id, rival.id) ?? getBilateralBalanceFromMap(player.id, rival.id)) : getBilateralBalanceFromMap(player.id, rival.id));
              }, 0);
              const rawDisplayBalance = tablaGeneralMode === 'all' ? totalBalance + crossGroupBalance : totalBalance;
              const displayBalance = roundedDisplayMap.get(player.id) ?? rawDisplayBalance;
              
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
                        <div className="flex items-center gap-1">
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
                        displayBalance > 0 ? 'text-green-600' : displayBalance < 0 ? 'text-destructive' : 'text-muted-foreground'
                      )}>
                        {displayBalance >= 0 ? '+$' : '-$'}{fmtMoney(Math.abs(displayBalance))}
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      {player.isFounder ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-golf-gold shrink-0">
                          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor"/>
                        </svg>
                      ) : (
                        <span className="w-[13px] shrink-0" />
                      )}
                    </div>
                  </div>
                  
                  {/* Expanded view: balance vs each other player + carritos per rival */}
                  {isExpanded && (
                    <div className="ml-5 mt-1 space-y-1 pb-2">
                      {otherPlayers
                        .map(other => {
                        // Historical: the TOTAL must come from snapshotBalances.vsBalances.netAmount
                        // (the immutable value calculated at close time).
                        // The breakdown (Ind/Car/Pres) is informational from the ledger.
                        // Live: use recalculated values.
                        const historicalBreakdown = getHistoricalPairBreakdown(player.id, other.id);
                        const vsIndividualBalance = isHistorical
                          ? (historicalBreakdown?.individual ?? 0)
                          : getBilateralBalanceFromMap(player.id, other.id);
                        const vsCarritosBalance = isHistorical
                          ? (historicalBreakdown?.carritos ?? 0)
                          : getCarritosBalanceVsPlayer(player.id, other.id);
                        const vsTeamPressuresBalance = isHistorical
                          ? (historicalBreakdown?.presiones ?? 0)
                          : getTeamPressuresBalanceVsPlayer(player.id, other.id);
                        const vsWolfBalance  = isHistorical ? (historicalBreakdown?.wolf  ?? 0) : getWolfBalanceVsPlayer(player.id, other.id);
                        const vsSixesBalance = isHistorical ? (historicalBreakdown?.sixes ?? 0) : getSixesBalanceVsPlayer(player.id, other.id);
                        const vsVegasBalance = isHistorical ? (historicalBreakdown?.vegas ?? 0) : getVegasBalanceVsPlayer(player.id, other.id);
                        const vsTotalBalance = vsIndividualBalance + vsCarritosBalance + vsTeamPressuresBalance + vsWolfBalance + vsSixesBalance + vsVegasBalance;
                        
                        // Check if this is a cross-group rival
                        const isCrossGroupRival = crossGroupOthers.some(p => p.id === other.id);
                        
                        // Other player's group
                        const otherGroupIdx = players.some(p => p.id === other.id) ? 0 : 
                          playerGroups.findIndex(g => g.players.some(p => p.id === other.id)) + 1;
                        
                        return { other, vsIndividualBalance, vsCarritosBalance, vsTeamPressuresBalance, vsWolfBalance, vsSixesBalance, vsVegasBalance, vsTotalBalance, isCrossGroupRival, otherGroupIdx };
                      })
                      // In historical mode, hide rivals with zero balance (no actual bets)
                      .filter(({ vsTotalBalance }) => !isHistorical || vsTotalBalance !== 0)
                      .map(({ other, vsIndividualBalance, vsCarritosBalance, vsTeamPressuresBalance, vsWolfBalance, vsSixesBalance, vsVegasBalance, vsTotalBalance, isCrossGroupRival, otherGroupIdx }) => (
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
                              {(vsCarritosBalance !== 0 || vsTeamPressuresBalance !== 0 || vsWolfBalance !== 0 || vsSixesBalance !== 0 || vsVegasBalance !== 0) && (
                                <span className="text-xs text-muted-foreground flex flex-wrap gap-x-1">
                                  <span>Ind: <span className={cn(vsIndividualBalance > 0 ? 'text-green-600' : vsIndividualBalance < 0 ? 'text-destructive' : '')}>{vsIndividualBalance >= 0 ? '+' : ''}{vsIndividualBalance}</span></span>
                                  {vsCarritosBalance !== 0 && (
                                    <span>| Car: <span className={cn(vsCarritosBalance > 0 ? 'text-green-600' : vsCarritosBalance < 0 ? 'text-destructive' : '')}>{vsCarritosBalance >= 0 ? '+' : ''}{vsCarritosBalance}</span></span>
                                  )}
                                  {vsTeamPressuresBalance !== 0 && (
                                    <span>| Pres: <span className={cn(vsTeamPressuresBalance > 0 ? 'text-green-600' : vsTeamPressuresBalance < 0 ? 'text-destructive' : '')}>{vsTeamPressuresBalance >= 0 ? '+' : ''}{vsTeamPressuresBalance}</span></span>
                                  )}
                                  {vsWolfBalance !== 0 && (
                                    <span>| 🐺: <span className={cn(vsWolfBalance > 0 ? 'text-green-600' : 'text-destructive')}>{vsWolfBalance >= 0 ? '+' : ''}${fmtMoney(Math.abs(vsWolfBalance))}</span></span>
                                  )}
                                  {vsSixesBalance !== 0 && (
                                    <span>| 6s: <span className={cn(vsSixesBalance > 0 ? 'text-green-600' : 'text-destructive')}>{vsSixesBalance >= 0 ? '+' : ''}${fmtMoney(Math.abs(vsSixesBalance))}</span></span>
                                  )}
                                  {vsVegasBalance !== 0 && (
                                    <span>| LV: <span className={cn(vsVegasBalance > 0 ? 'text-green-600' : 'text-destructive')}>{vsVegasBalance >= 0 ? '+' : ''}${fmtMoney(Math.abs(vsVegasBalance))}</span></span>
                                  )}
                                </span>
                              )}
                            </div>
                            <span className={cn(
                              'font-bold',
                              vsTotalBalance > 0 ? 'text-green-600' : vsTotalBalance < 0 ? 'text-destructive' : 'text-muted-foreground'
                            )}>
                              {(() => { const r = roundToNearest5(vsTotalBalance); return `${r >= 0 ? '+$' : '-$'}${fmtMoney(Math.abs(r))}`; })()}
                            </span>
                          </div>
                      ))}
                    </div>
                  )}
                </div>
              );
              });
            })()}
          </div>
          
          {/* Verification — usa los totales redondeados (mismo algoritmo que las filas) para mantener Σ = $0 exacto. */}
          <div className="bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground border-t mt-3">
            Σ = ${(() => {
              const raws = new Map<string, number>();
              tablaGeneralPlayers.forEach((p) => {
                const snap = isHistorical ? getSnapshotTotalBalance(p.id) : null;
                if (snap !== null) { raws.set(p.id, snap); return; }
                const rivalIds = tablaGeneralPlayers.filter(x => x.id !== p.id).map(x => x.id);
                const ind = rivalIds.reduce((s, rId) => s + getBilateralBalanceFromMap(p.id, rId), 0);
                raws.set(p.id, ind + getCarritosBalanceForPlayer(p.id) + getTeamPressuresBalanceForPlayer(p.id) + getWolfBalanceForPlayer(p.id) + getSixesBalanceForPlayer(p.id) + getVegasBalanceForPlayer(p.id));
              });
              const rounded = roundGroupToNearest5Map(raws);
              return Array.from(rounded.values()).reduce((s, v) => s + v, 0);
            })()}
            <span className="ml-1">(debe ser $0)</span>
          </div>
          {tablaGeneralPlayers.some(p => p.isFounder) && (
            <div className="flex items-center justify-center gap-1.5 py-1 text-xs text-golf-gold">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor"/>
              </svg>
              <span className="font-medium">Miembro Fundador</span>
            </div>
          )}
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
                  const rawBalance = getRivalBalance(rival.id);
                  const balance = roundToNearest5(rawBalance);
                  const isSelected = selectedRival === rival.id;
                  const pairHandicap = getBilateralHandicap(basePlayer?.id || '', rival.id);
                  const hasOverride = !!pairHandicap;
                  const isCrossGroup = getCrossGroupRivalsForBase(basePlayer?.id).includes(rival.id);
                  return (
                    <div key={rival.id} className="relative">
                      <button
                        onClick={() => {
                          const next = isSelected ? null : rival.id;
                          setSelectedRival(next);
                        }}
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
                          ${fmtMoney(Math.abs(balance))}
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
                        <span className="text-[10px] text-muted-foreground">+ Grupo</span>
                      </button>
                    </DialogTrigger>
                    <DialogContent className="max-w-sm">
                      <DialogHeader>
                        <DialogTitle className="text-base">Agregar Jugadores de Otros Grupos</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3 max-h-60 overflow-y-auto">
                        {Array.from({ length: 1 + playerGroups.length }, (_, i) => i)
                          .filter((i) => i !== displayGroupIndex)
                          .map((i) => {
                            const label = i === 0
                              ? 'Grupo 1'
                              : (playerGroups[i - 1]?.name || `Grupo ${i + 1}`);
                            const groupPlayers = getPlayersForGroup(i, players, playerGroups);
                            if (groupPlayers.length === 0) return null;
                            return (
                              <div key={`grp-${i}`} className="space-y-2">
                                <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {label}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {groupPlayers.map(player => {
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
                            );
                          })}
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

      {/* ═══════════════════════════════════════════════════════════════════
          SINGLE SOURCE OF TRUTH: Render ALL rivals' BilateralDetails.
          Each computes its own total via betTypeGroups and reports it back
          via onComputedBalance. Only the selected rival is VISIBLE; the
          rest are hidden but still compute so the balance map is populated
          for avatars and Tabla General.
          ═══════════════════════════════════════════════════════════════════ */}
      {basePlayer && rivals.map(rival => {
        const isVisible = selectedRival === rival.id;
        const isCrossGroupSelected = selectedCrossGroupPlayers.some(p => p.id === rival.id);
        return (
          <div key={rival.id} style={isVisible ? undefined : { display: 'none' }}>
            {isVisible && isCrossGroupSelected && (
              <CrossGroupHandicapWidget
                basePlayer={basePlayer}
                rival={rival}
                getStrokesForLocalPair={getStrokesForLocalPair}
                setStrokesForLocalPair={setStrokesForLocalPair}
                isHistorical={isHistorical}
              />
            )}
            <BilateralDetail
              players={players}
              groupPlayers={balanceVsPlayers}
              allPlayers={allPlayersForCalculations}
              player={basePlayer}
              rival={rival}
              groupedSummaries={getGroupedSummaries(rival.id)}
              totalBalance={getRivalBalance(rival.id)}
              expandedTypes={expandedTypes}
              onToggleExpand={toggleExpanded}
              bilateralHandicap={getBilateralHandicap(basePlayer.id, rival.id)}
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
              snapshotVsBalance={snapshotBalances ? getRivalBalance(rival.id) : undefined}
              snapshotPairBreakdowns={snapshotPairBreakdowns}
              snapshotPairSegmentResults={snapshotPairSegmentResults}
              isHistorical={isHistorical}
              onComputedBalance={handleComputedBalance}
            />
          </div>
        );
      })}

      {/* All Carritos Results — only render if carritos is enabled */}
      {effectiveBetConfig.carritos.enabled && (() => {
        const hasCarritosTeams = (effectiveBetConfig.carritosTeams?.length ?? 0) > 0;
        const hasLegacyCarritos = effectiveBetConfig.carritos.teamA[0] && effectiveBetConfig.carritos.teamA[1] && effectiveBetConfig.carritos.teamB[0] && effectiveBetConfig.carritos.teamB[1];
        const hasAnyConfigured = allCarritosResults.length > 0;
        // Show incomplete warning if enabled but no results (no players configured)
        if (!hasAnyConfigured && !hasLegacyCarritos && (!hasCarritosTeams || effectiveBetConfig.carritosTeams!.every(t => !t.teamA[0] || !t.teamA[1] || !t.teamB[0] || !t.teamB[1]))) {
          return (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">🏎️ Carritos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-700 space-y-1">
                     <p className="font-medium">Agregar jugadores faltantes</p>
                     <p>Revisa la configuración en la sección de Apuestas.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        }
        return allCarritosResults.map((result, idx) => {
          const carritosId = result.id || `carritos-primary-${idx}`;
          const disabled = isTeamBetDisabled(carritosId);
          const hasAnyData = result.netByHoleFront.some(v => v !== null) || result.netByHoleBack.some(v => v !== null);
          if (isHistorical && !hasAnyData) return null;
          const displayPlayerIds = new Set(displayPlayers.map(p => p.id));
          const allTeamMembers = [...result.teamA, ...result.teamB];
          const hasGroupMember = allTeamMembers.some(id => displayPlayerIds.has(id));
          if (hasMultipleGroups && !hasGroupMember) return null;
          const carritosTeamCfg = result.id
            ? effectiveBetConfig.carritosTeams?.find(t => t.id === result.id)
            : undefined;
          return (
            <CarritosResultsCard 
              key={carritosId}
              results={result} 
              players={players}
              basePlayerId={basePlayer?.id}
              title={`Carritos ${idx + 1}`}
              roundHoles={(betConfig.roundHoles ?? 18) as 9 | 18}
              isDisabled={disabled}
              teamHandicaps={carritosTeamCfg?.teamHandicaps ?? effectiveBetConfig.carritos.teamHandicaps}
              handicapConfig={carritosTeamCfg?.handicapConfig ?? effectiveBetConfig.carritos.handicapConfig}
              onToggleDisabled={onBetConfigChange ? () => toggleTeamBetDisabled(carritosId) : undefined}
            />
          );

        });
      })()}

      {/* Team Pressures Results - only render if teamPressures is enabled */}
      {effectiveBetConfig.teamPressures?.enabled && (() => {
        const enabledBets = effectiveBetConfig.teamPressures?.bets?.filter(b => b.enabled) ?? [];
        const hasAnyConfigured = enabledBets.some(b => b.teamA[0] && b.teamA[1] && b.teamB[0] && b.teamB[1]);
        if (enabledBets.length === 0 || !hasAnyConfigured) {
          return (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Foursomes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-700 space-y-1">
                     <p className="font-medium">Agregar jugadores faltantes</p>
                     <p>Revisa la configuración en la sección de Apuestas.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        }
        return null;
      })()}
      {effectiveBetConfig.teamPressures?.enabled && betConfig.teamPressures?.bets?.filter(b => b.enabled).map((bet, idx) => {
        // Resolve config IDs (may be profileId) to actual player.id
        // IMPORTANT: Search allPlayersForCalculations (all groups) not just `players` (current group)
        const resolvePId = (pid: string): string => {
          if (allPlayersForCalculations.find(p => p.id === pid)) return pid;
          const match = allPlayersForCalculations.find(p => p.profileId === pid);
          return match?.id ?? pid;
        };
        const resolvedTeamA: [string, string] = [resolvePId(bet.teamA[0]), resolvePId(bet.teamA[1])];
        const resolvedTeamB: [string, string] = [resolvePId(bet.teamB[0]), resolvePId(bet.teamB[1])];
        // Skip if none of the team members belong to the currently displayed group
        if (hasMultipleGroups) {
          const dpIds = new Set(displayPlayers.map(p => p.id));
          const allMembers = [...resolvedTeamA, ...resolvedTeamB];
          if (!allMembers.some(id => dpIds.has(id))) return null;
        }

        const displayPlayerIds = new Set(displayPlayers.map(p => p.id));
        const basePlayerInBet = basePlayer?.id && [...resolvedTeamA, ...resolvedTeamB].includes(basePlayer.id);
        const perspectivePlayerId = basePlayerInBet
          ? basePlayer!.id
          : [...resolvedTeamA, ...resolvedTeamB].find(id => displayPlayerIds.has(id)) ?? resolvedTeamA[0];

        // Use only this Foursome bet from the same perspective as the card detail.
        const baseTeamBalance = getTeamPressuresBalanceForPlayer(perspectivePlayerId, bet.id);
        
        const getPlayer = (id: string) => allPlayersForCalculations.find(p => p.id === id);
        const teamAPlayers = [getPlayer(resolvedTeamA[0]), getPlayer(resolvedTeamA[1])].filter(Boolean) as Player[];
        const teamBPlayers = [getPlayer(resolvedTeamB[0]), getPlayer(resolvedTeamB[1])].filter(Boolean) as Player[];
        
        const isBaseInTeamA = resolvedTeamA.includes(perspectivePlayerId);
        
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
            strokesMap.set(pid, calculateStrokesPerHole(Math.floor(getHandicap(pid)), course));
          });

          // Detect half-point for Foursomes display
          const isHalfPtMode = bet.handicapConfig?.slidingHalfPointMode === 'halfPoint';
          let fpHalfHole: number | null = null;
          let fpHalfPlayer: string | null = null;
          if (isHalfPtMode) {
            for (const pid of [...teamA, ...teamB]) {
              const hcp = getHandicap(pid);
              if (hcp % 1 !== 0) {
                const res = calculateStrokesPerHoleWithHalf(hcp, true, course);
                fpHalfHole = res.halfStrokeHole;
                fpHalfPlayer = pid;
                break;
              }
            }
          }
          
          const getPlayerScore = (playerId: string, holeNum: number, showHalf = false): { gross: number; hcp: number; net: number } | null => {
            const score = confirmedScores.get(playerId)?.find(s => s.holeNumber === holeNum);
            if (!score || typeof score.strokes !== 'number') return null;
            const hcp = strokesMap.get(playerId)?.[holeNum - 1] || 0;
            const displayHcp = (showHalf && playerId === fpHalfPlayer && holeNum === fpHalfHole && hcp === 0) ? 0.5 : hcp;
            return { gross: score.strokes, hcp: displayHcp, net: score.strokes - hcp };
          };
          
          const getHoleDetail = (holeNum: number) => {
            const a1r = getPlayerScore(teamA[0], holeNum);
            const a2r = getPlayerScore(teamA[1], holeNum);
            const b1r = getPlayerScore(teamB[0], holeNum);
            const b2r = getPlayerScore(teamB[1], holeNum);
            
            if (!a1r || !a2r || !b1r || !b2r) return null;
            
            let teamAPoints = 0;
            let teamBPoints = 0;
            
            const lowA = Math.min(a1r.net, a2r.net);
            const lowB = Math.min(b1r.net, b2r.net);
            const highA = Math.max(a1r.net, a2r.net);
            const highB = Math.max(b1r.net, b2r.net);
            
            let lowBallWinner: 'A' | 'B' | 'tie' | undefined;
            let highBallWinner: 'A' | 'B' | 'tie' | undefined;
            let combinedWinner: 'A' | 'B' | 'tie' | undefined;
            
            if (scoringType === 'lowBall' || scoringType === 'combined' || scoringType === 'matchOnly') {
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

            // Only show .5 visual when a tie exists on the half-point hole AND the half-point player's score participates in the tie
            const hasTie = lowBallWinner === 'tie' || highBallWinner === 'tie' || combinedWinner === 'tie';
            const isHalfHole = holeNum === fpHalfHole && fpHalfPlayer !== null;
            
            let showHalf = false;
            if (hasTie && isHalfHole) {
              const receivingTeam: 'A' | 'B' = teamA.includes(fpHalfPlayer!) ? 'A' : 'B';
              const halfPlayerNet = receivingTeam === 'A'
                ? (fpHalfPlayer === teamA[0] ? a1r!.net : a2r!.net)
                : (fpHalfPlayer === teamB[0] ? b1r!.net : b2r!.net);
              
              const lowTiedVal = lowA; // equals lowB when tied
              const highTiedVal = highA;
              
              if (lowBallWinner === 'tie' && halfPlayerNet === lowTiedVal) {
                lowBallWinner = receivingTeam; teamAPoints += receivingTeam === 'A' ? 1 : 0; teamBPoints += receivingTeam === 'B' ? 1 : 0;
                showHalf = true;
              }
              if (highBallWinner === 'tie' && halfPlayerNet === highTiedVal && halfPlayerNet !== lowTiedVal) {
                highBallWinner = receivingTeam; teamAPoints += receivingTeam === 'A' ? 1 : 0; teamBPoints += receivingTeam === 'B' ? 1 : 0;
                showHalf = true;
              }
              if (combinedWinner === 'tie') {
                combinedWinner = receivingTeam; teamAPoints += receivingTeam === 'A' ? 1 : 0; teamBPoints += receivingTeam === 'B' ? 1 : 0;
                showHalf = true;
              }
            }

            const a1 = showHalf ? getPlayerScore(teamA[0], holeNum, true) ?? a1r : a1r;
            const a2 = showHalf ? getPlayerScore(teamA[1], holeNum, true) ?? a2r : a2r;
            const b1 = showHalf ? getPlayerScore(teamB[0], holeNum, true) ?? b1r : b1r;
            const b2 = showHalf ? getPlayerScore(teamB[1], holeNum, true) ?? b2r : b2r;
            
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
          const openingThreshold = scoringType === 'matchOnly' ? Infinity : (scoringType === 'lowBall' || scoringType === 'highBall') ? 2 : 3;
          
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
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  Foursome {idx + 1}
                  <TeamBetHandicapInfo
                    players={[...displayTeamAPlayers, ...displayTeamBPlayers]}
                    teamA={displayTeamAPlayers}
                    teamB={displayTeamBPlayers}
                    effectiveHandicaps={bet.teamHandicaps}
                    handicapConfig={bet.handicapConfig}
                    title={`Foursome ${idx + 1} — Hándicaps`}
                    modalityLine={[
                      bet.scoringType === 'lowBall' ? 'Low Ball'
                        : bet.scoringType === 'highBall' ? 'High Ball'
                        : bet.scoringType === 'combined' ? 'Bola Baja + Bola Alta'
                        : 'Match Play',
                      bet.continua && bet.scoringType === 'matchOnly' ? 'Match 18 continuo' : `Presión al ${bet.openingThreshold}`,
                    ].join(' · ')}
                  />
                </div>
                <div className="flex items-center gap-2">

                  {pressureDisabled ? (
                    <div className="text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">Cancelada</div>
                  ) : (
                    <span className={cn('text-base font-bold tabular-nums', baseTeamBalance > 0 ? 'text-green-600' : baseTeamBalance < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                      {baseTeamBalance >= 0 ? '+$' : '-$'}{fmtMoney(Math.abs(baseTeamBalance))}
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
              <Collapsible open={foursomeOpenId === bet.id} onOpenChange={(open) => setFoursomeOpenId(open ? bet.id : null)}>
                <div className="space-y-1">
                  {/* Names row */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate">
                      {displayTeamAPlayers.map(p => disambiguatedNames.get(p.id) || formatPlayerName(p.name).split(' ')[0]).join(' / ')}
                    </span>
                    <span className="text-muted-foreground text-xs mx-2">vs</span>
                    <span className="font-medium truncate text-right">
                      {displayTeamBPlayers.map(p => disambiguatedNames.get(p.id) || formatPlayerName(p.name).split(' ')[0]).join(' / ')}
                    </span>
                  </div>
                  {/* Results row */}
                  <div className="flex items-center gap-2">
                    {bet.continua && bet.scoringType === 'matchOnly' ? (() => {
                      // Match-play 18-hole cumulative status
                      const allDetails = [...displayFrontDetails, ...displayBackDetails];
                      let cumBal = 0;
                      let matchOver = false;
                      let matchResult = '';
                      let scoredCount = 0;
                      for (let i = 0; i < allDetails.length; i++) {
                        const d = allDetails[i];
                        if (!d) break; // Stop at first unscored hole
                        cumBal += d.net;
                        scoredCount++;
                        const remaining = allDetails.length - scoredCount;
                        if (Math.abs(cumBal) > remaining && remaining > 0) {
                          matchOver = true;
                          matchResult = `${Math.abs(cumBal)} & ${remaining}`;
                          break;
                        }
                      }
                      if (!matchOver && scoredCount === allDetails.length) {
                        matchResult = cumBal === 0 ? 'E' : `${Math.abs(cumBal)} Up`;
                      }
                      const statusLabel = matchOver ? matchResult :
                        cumBal === 0 ? 'E' :
                        cumBal > 0 ? `${cumBal} Up` : `${Math.abs(cumBal)} Dn`;
                      const statusColor = cumBal > 0 ? 'text-green-600' : cumBal < 0 ? 'text-destructive' : 'text-muted-foreground';
                      return (
                        <div className="flex-1 text-center">
                          <span className={cn('text-sm font-bold', statusColor)}>
                            {matchOver ? `🏁 ${matchResult}` : statusLabel}
                          </span>
                          {matchOver && (
                            <span className={cn('ml-2 text-xs', cumBal > 0 ? 'text-green-600' : 'text-destructive')}>
                              {cumBal > 0 ? 'Ganaste' : 'Perdiste'}
                            </span>
                          )}
                        </div>
                      );
                    })() : (
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
                    )}
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                        <ChevronDown className="h-4 w-4" />
                        <span className="sr-only">Ver detalle</span>
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                  {/* Sub-modality breakdown (Unidades / Oyeses) with detail popovers */}
                  {(bet.unitsConfig?.enabled || bet.oyesesConfig?.enabled || bet.manchasConfig?.enabled) && (() => {
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
                            const holePar = course.holes.find(h => h.number === s.holeNumber)?.par ?? 4;
                            const autoDetected = detectScoreBasedMarkers(s.strokes, s.putts, holePar);
                            const merged = mergeMarkers(autoDetected, s.markers);
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
                      const unitsAdv = bet.unitsConfig?.unitsAdvantage ?? 0;
                      const unitsAdvTeam = bet.unitsConfig?.unitsAdvantageTeam ?? 'none';
                      const netAdvantage = unitsAdvTeam === 'a' ? -unitsAdv
                                         : unitsAdvTeam === 'b' ?  unitsAdv
                                         : 0;
                      const diff = hitsA.length - hitsB.length;
                      const adjustedDiff = diff + netAdvantage;
                      const money = adjustedDiff * (bet.unitsConfig.valuePerUnit || 0);
                      return { hitsA, hitsB, totalA: hitsA.length, totalB: hitsB.length, diff, adjustedDiff, money, unitsAdv, unitsAdvTeam, netAdvantage };
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

                    // ── Build Manchas detail ──
                    const manchasDetail = (() => {
                      if (!bet.manchasConfig?.enabled) return null;
                      const valueStd = bet.manchasConfig.valuePerMancha || 0;
                      const includeGeneric = !!bet.manchasConfig.includeGenericMancha;
                      const valueGen = bet.manchasConfig.valuePerGenericMancha ?? valueStd;
                      const collect = (teamIds: string[]) => {
                        const std = teamIds.flatMap(pid => collectStandardManchaHits(pid, confirmedScores));
                        const gen = includeGeneric ? teamIds.flatMap(pid => collectGenericManchaHits(pid, confirmedScores)) : [];
                        return { std, gen };
                      };
                      const a = collect(resolvedTeamA);
                      const b = collect(resolvedTeamB);
                      const diffStd = b.std.length - a.std.length;
                      const diffGen = b.gen.length - a.gen.length;
                      const money = diffStd * valueStd + (includeGeneric ? diffGen * valueGen : 0);
                      const hitsA = [...a.std, ...a.gen].sort((x, y) => x.holeNumber - y.holeNumber);
                      const hitsB = [...b.std, ...b.gen].sort((x, y) => x.holeNumber - y.holeNumber);
                      return {
                        hitsA, hitsB,
                        totalA: hitsA.length, totalB: hitsB.length,
                        diffStd, diffGen, includeGeneric, valueStd, valueGen, money,
                      };
                    })();

                    const getPlayerInitial = (pid: string) => {
                      const p = allPlayersForCalculations.find(pl => pl.id === pid);
                      return p ? (disambiguatedAbbrs.get(p.id) || p.initials) : '?';
                    };
                    const getMarkerLabel = (marker: string) => {
                      const info = markerInfo[marker as keyof typeof markerInfo];
                      return info ? info.label : marker;
                    };

                    // Compute perspective-aware money values (positive = base team wins)
                    const unitsMoneyBase = unitsDetail ? (isBaseInTeamA ? unitsDetail.money : -unitsDetail.money) : 0;
                    const oyesesMoneyBase = oyesesDetail ? (isBaseInTeamA ? oyesesDetail.money : -oyesesDetail.money) : 0;
                    const manchasMoneyBase = manchasDetail ? (isBaseInTeamA ? manchasDetail.money : -manchasDetail.money) : 0;

                    // ── Presiones money (same formula as the engine, base perspective) ──
                    const isNineHoleRound = (effectiveBetConfig.roundHoles ?? 18) === 9;
                    const pressureMoneyBase = (() => {
                      if (bet.continua && bet.scoringType === 'matchOnly') {
                        const allDetails = [...displayFrontDetails, ...displayBackDetails];
                        const cum = allDetails.reduce((s, d) => s + (d ? d.net : 0), 0);
                        return (cum > 0 ? 1 : cum < 0 ? -1 : 0) * bet.totalAmount;
                      }
                      const frontMainTied = displayFrontBets[0] === 0;
                      const netBets = (bets: number[]) => bets.filter(b => b > 0).length - bets.filter(b => b < 0).length;
                      const frontMoney = netBets(displayFrontBets) * bet.frontAmount;
                      const effectiveBackAmount = frontMainTied ? (2 * bet.frontAmount + bet.totalAmount) : bet.backAmount;
                      const backMoney = isNineHoleRound ? 0 : netBets(displayBackBets) * effectiveBackAmount;
                      const matchMoney = isNineHoleRound || frontMainTied
                        ? 0
                        : (total18 > 0 ? 1 : total18 < 0 ? -1 : 0) * bet.totalAmount;
                      return frontMoney + backMoney + matchMoney;
                    })();
                    const grandTotalBase = pressureMoneyBase + unitsMoneyBase + oyesesMoneyBase + manchasMoneyBase;
                    const signed = (v: number) => `${v >= 0 ? '+' : '-'}$${fmtMoney(Math.abs(v))}`;
                    const moneyColor = (v: number) => v > 0 ? 'text-green-600' : v < 0 ? 'text-destructive' : 'text-muted-foreground';

                    return (
                      <div className="space-y-0.5 w-full">
                      <div className="flex justify-between gap-y-0.5 text-[11px] text-muted-foreground w-full">
                        <span className={cn(moneyColor(pressureMoneyBase))}>
                          Presiones: {signed(pressureMoneyBase)}
                        </span>
                        {unitsDetail && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <span className={cn(
                                'underline decoration-dotted cursor-pointer',
                                unitsMoneyBase > 0 ? 'text-green-600' : unitsMoneyBase < 0 ? 'text-destructive' : 'text-muted-foreground'
                              )}>
                                Unidades: {unitsMoneyBase >= 0 ? '+' : '-'}${fmtMoney(Math.abs(unitsMoneyBase))}
                              </span>
                            </PopoverTrigger>
                            <PopoverContent side="top" className="w-80 p-3">
                              <div className="text-xs space-y-2">
                                <p className="font-semibold text-sm">Unidades — Detalle</p>
                                <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3">
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
                                  <div className="w-px bg-border" />
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
                                <div className="border-t border-border pt-1 space-y-0.5">
                                  <p className="flex justify-between"><span>Diferencial unidades</span><span className="tabular-nums font-semibold">{unitsDetail.diff >= 0 ? `+${unitsDetail.diff}` : unitsDetail.diff}</span></p>
                                  {unitsDetail.unitsAdv > 0 && unitsDetail.unitsAdvTeam !== 'none' && (
                                    <p className="flex justify-between text-[10px]">
                                      <span className="text-muted-foreground">
                                        Ventaja: Equipo {unitsDetail.unitsAdvTeam === 'a' ? 'A' : 'B'} da {unitsDetail.unitsAdv}
                                      </span>
                                      <span className={cn('tabular-nums font-medium', unitsDetail.netAdvantage > 0 ? 'text-green-600' : 'text-destructive')}>
                                        {unitsDetail.netAdvantage > 0 ? `+${unitsDetail.netAdvantage}` : unitsDetail.netAdvantage}
                                      </span>
                                    </p>
                                  )}
                                  {unitsDetail.netAdvantage !== 0 && (
                                    <p className="flex justify-between"><span>Diferencial ajustado</span><span className="tabular-nums font-semibold">{unitsDetail.adjustedDiff >= 0 ? `+${unitsDetail.adjustedDiff}` : unitsDetail.adjustedDiff}</span></p>
                                  )}
                                  <p className="flex justify-between"><span>Valor unidad</span><span className="tabular-nums">${bet.unitsConfig?.valuePerUnit}</span></p>
                                  <p className="flex justify-between font-semibold">
                                    <span>Resultado</span>
                                    <span className={cn('tabular-nums', unitsMoneyBase > 0 ? 'text-green-600' : unitsMoneyBase < 0 ? 'text-destructive' : '')}>
                                      {unitsMoneyBase >= 0 ? '+' : '-'}${fmtMoney(Math.abs(unitsMoneyBase))}
                                    </span>
                                  </p>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                        {oyesesDetail && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <span className={cn(
                                'underline decoration-dotted cursor-pointer',
                                oyesesMoneyBase > 0 ? 'text-green-600' : oyesesMoneyBase < 0 ? 'text-destructive' : 'text-muted-foreground'
                              )}>
                                Oyeses: {oyesesMoneyBase >= 0 ? '+' : '-'}${fmtMoney(Math.abs(oyesesMoneyBase))}
                              </span>
                            </PopoverTrigger>
                            <PopoverContent side="top" className="w-80 p-3">
                              <div className="text-xs space-y-2">
                                <p className="font-semibold text-sm">Oyeses — Detalle</p>
                                <p className="text-[10px] text-muted-foreground">{oyesesDetail.modality === 'sangron' ? 'Sangrón' : 'Acumulado'}</p>
                                <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3">
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
                                  <div className="w-px bg-border" />
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
                                <div className="border-t border-border pt-1 space-y-0.5">
                                  <p className="flex justify-between"><span>Diferencial</span><span className="tabular-nums font-semibold">{oyesesDetail.diff >= 0 ? `+${oyesesDetail.diff}` : oyesesDetail.diff}</span></p>
                                  <p className="flex justify-between"><span>Valor oyes</span><span className="tabular-nums">${oyesesDetail.valuePerOyes}</span></p>
                                  <p className="flex justify-between font-semibold">
                                    <span>Resultado</span>
                                    <span className={cn('tabular-nums', oyesesMoneyBase > 0 ? 'text-green-600' : oyesesMoneyBase < 0 ? 'text-destructive' : '')}>
                                      {oyesesMoneyBase >= 0 ? '+' : '-'}${fmtMoney(Math.abs(oyesesMoneyBase))}
                                    </span>
                                  </p>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                        {manchasDetail && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <span className={cn(
                                'underline decoration-dotted cursor-pointer',
                                manchasMoneyBase > 0 ? 'text-green-600' : manchasMoneyBase < 0 ? 'text-destructive' : 'text-muted-foreground'
                              )}>
                                ⬛ Manchas: {manchasMoneyBase >= 0 ? '+' : '-'}${fmtMoney(Math.abs(manchasMoneyBase))}
                              </span>
                            </PopoverTrigger>
                            <PopoverContent side="top" className="w-80 p-3">
                              <div className="text-xs space-y-2">
                                <p className="font-semibold text-sm">Manchas — Detalle</p>
                                <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3">
                                  <div>
                                    <p className="font-medium text-destructive mb-1">Tu equipo ({manchasDetail.totalA})</p>
                                    {manchasDetail.hitsA.length === 0 && <p className="text-muted-foreground italic text-[10px]">—</p>}
                                    {manchasDetail.hitsA.map((h, hi) => (
                                      <p key={hi} className="text-[10px] flex items-center gap-1">
                                        <span className="tabular-nums">H{h.holeNumber}</span>
                                        <span>{getPlayerInitial(h.playerId)}</span>
                                        <span className="text-muted-foreground ml-auto">{getMarkerLabel(h.reason)}</span>
                                      </p>
                                    ))}
                                  </div>
                                  <div className="w-px bg-border" />
                                  <div>
                                    <p className="font-medium text-destructive mb-1">Rival ({manchasDetail.totalB})</p>
                                    {manchasDetail.hitsB.length === 0 && <p className="text-muted-foreground italic text-[10px]">—</p>}
                                    {manchasDetail.hitsB.map((h, hi) => (
                                      <p key={hi} className="text-[10px] flex items-center gap-1">
                                        <span className="tabular-nums">H{h.holeNumber}</span>
                                        <span>{getPlayerInitial(h.playerId)}</span>
                                        <span className="text-muted-foreground ml-auto">{getMarkerLabel(h.reason)}</span>
                                      </p>
                                    ))}
                                  </div>
                                </div>
                                <div className="border-t border-border pt-1 space-y-0.5">
                                  <p className="flex justify-between"><span>Diferencial manchas</span><span className="tabular-nums font-semibold">{manchasDetail.diffStd >= 0 ? `+${manchasDetail.diffStd}` : manchasDetail.diffStd}</span></p>
                                  <p className="flex justify-between"><span>Valor mancha</span><span className="tabular-nums">${manchasDetail.valueStd}</span></p>
                                  {manchasDetail.includeGeneric && (
                                    <>
                                      <p className="flex justify-between"><span>Diferencial genéricas</span><span className="tabular-nums font-semibold">{manchasDetail.diffGen >= 0 ? `+${manchasDetail.diffGen}` : manchasDetail.diffGen}</span></p>
                                      <p className="flex justify-between"><span>Valor genérica</span><span className="tabular-nums">${manchasDetail.valueGen}</span></p>
                                    </>
                                  )}
                                  <p className="flex justify-between font-semibold">
                                    <span>Resultado</span>
                                    <span className={cn('tabular-nums', manchasMoneyBase > 0 ? 'text-green-600' : manchasMoneyBase < 0 ? 'text-destructive' : '')}>
                                      {manchasMoneyBase >= 0 ? '+' : '-'}${fmtMoney(Math.abs(manchasMoneyBase))}
                                    </span>
                                  </p>
                                  <p className="text-[10px] text-muted-foreground pt-1">El equipo con más manchas paga la diferencia.</p>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                      <div className="flex justify-between text-[11px] w-full border-t border-border/40 pt-0.5">
                        <span className="text-muted-foreground">Total foursome</span>
                        <span className={cn('font-semibold tabular-nums', moneyColor(grandTotalBase))}>
                          {signed(grandTotalBase)}
                        </span>
                      </div>
                      </div>
                    );
                  })()}
                  <p className="text-[10px] text-muted-foreground">
                    {bet.scoringType === 'lowBall' ? 'Bola Baja' :
                     bet.scoringType === 'highBall' ? 'Bola Alta' :
                     bet.scoringType === 'matchOnly' ? 'Match Play' : 'Bola Baja + Bola Alta'}
                  </p>
                </div>

                <CollapsibleContent className="mt-3 space-y-3">
                  
                  {/* Hole by hole grid with tooltips */}
                  <div className="bg-muted/30 rounded-lg p-2 space-y-2">
                    <div className="text-[10px] text-muted-foreground text-center">
                      Toca en un hoyo para ver el desglose
                    </div>
                    
                    {bet.continua && bet.scoringType === 'matchOnly' ? (() => {
                      // Match Play 18-hole cumulative view
                      const allDetails = [...displayFrontDetails, ...displayBackDetails];
                      let cumBal = 0;
                      let matchConcludedAt = -1;
                      const cumBalances: number[] = [];
                      
                      let lastScoredIdx = -1;
                      for (let i = 0; i < allDetails.length; i++) {
                        const d = allDetails[i];
                        if (!d) {
                          cumBalances.push(cumBal);
                          continue;
                        }
                        if (matchConcludedAt < 0) cumBal += d.net;
                        lastScoredIdx = i;
                        cumBalances.push(cumBal);
                        if (matchConcludedAt < 0) {
                          const remaining = allDetails.length - (i + 1);
                          if (Math.abs(cumBal) > remaining && remaining > 0) {
                            matchConcludedAt = i;
                          }
                        }
                      }
                      
                      const renderMatchPill = (detail: typeof allDetails[0], idx: number) => {
                        const holeNum = idx + 1;
                        const bal = cumBalances[idx];
                        const isAfterMatch = matchConcludedAt >= 0 && idx > matchConcludedAt;
                        const matchLabel = isAfterMatch ? '–' : bal === 0 ? 'E' : bal > 0 ? `${bal}Up` : `${Math.abs(bal)}Dn`;
                        
                        const pill = (
                          <div
                            className={cn(
                              'h-8 rounded border bg-background/60 flex flex-col items-center justify-center cursor-pointer',
                              isAfterMatch ? 'border-border/30 text-muted-foreground/40 opacity-50' :
                              detail === null ? 'border-border text-muted-foreground' :
                              bal > 0 ? 'border-green-600/40 text-green-600' :
                              bal < 0 ? 'border-destructive/40 text-destructive' :
                              'border-border text-muted-foreground'
                            )}
                          >
                            <span className={cn('text-[9px] opacity-80')}>{holeNum}</span>
                            <span className="text-[9px] font-semibold tabular-nums leading-tight">
                              {detail === null ? '–' : matchLabel}
                            </span>
                          </div>
                        );
                        
                        if (!detail || isAfterMatch) return <div key={holeNum}>{pill}</div>;
                        
                        const isFront = idx < 9;
                        const subIdx = isFront ? idx : idx - 9;
                        const rawDetail = isFront ? displayFrontDetails[subIdx] : displayBackDetails[subIdx];
                        if (!rawDetail) return <div key={holeNum}>{pill}</div>;
                        
                        return (
                          <Popover key={holeNum}>
                            <PopoverTrigger asChild>{pill}</PopoverTrigger>
                            <PopoverContent side="top" className="w-[95vw] max-w-sm p-3">
                              <div className="text-xs space-y-1">
                                <p className="font-medium">Hoyo {holeNum} • {rawDetail.net > 0 ? 'Tu equipo' : rawDetail.net < 0 ? 'Rival' : 'Empate'}</p>
                                <TeamHoleGrid
                                  teamAPlayers={displayTeamAPlayers}
                                  teamBPlayers={displayTeamBPlayers}
                                  shortNames={disambiguatedNames}
                                  detail={{ netA1: rawDetail.a1.net, hcpA1: rawDetail.a1.hcp, netA2: rawDetail.a2.net, hcpA2: rawDetail.a2.hcp, netB1: rawDetail.b1.net, hcpB1: rawDetail.b1.hcp, netB2: rawDetail.b2.net, hcpB2: rawDetail.b2.hcp }}
                                />
                                <p className="text-[10px] text-muted-foreground border-t border-border/50 pt-1">
                                  Estado: {matchLabel}
                                </p>
                              </div>
                            </PopoverContent>
                          </Popover>
                        );
                      };
                      
                      return (
                        <>
                          <div className="space-y-1">
                            <span className="text-xs font-medium">1–9</span>
                            <div className="grid grid-cols-9 gap-1">
                              {allDetails.slice(0, 9).map((d, i) => renderMatchPill(d, i))}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-xs font-medium">10–18</span>
                            <div className="grid grid-cols-9 gap-1">
                              {allDetails.slice(9, 18).map((d, i) => renderMatchPill(d, i + 9))}
                            </div>
                          </div>
                        </>
                      );
                    })() : (
                      <>
                    {/* Front 9 */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">Front 9</span>
                        <div className="flex items-center gap-2">
                          <span className={cn('text-xs tabular-nums', frontTotal > 0 ? 'text-green-600' : frontTotal < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                            {frontBetsDisplay}
                          </span>
                          {(() => {
                            const frontNetBets = displayFrontBets.filter(b => b > 0).length
                              - displayFrontBets.filter(b => b < 0).length;
                            const frontMoney = frontNetBets * bet.frontAmount;
                            if (frontMoney === 0) return null;
                            return (
                              <span className={cn('text-xs font-bold tabular-nums',
                                frontMoney > 0 ? 'text-green-600' : 'text-destructive')}>
                                {frontMoney >= 0 ? '+$' : '-$'}{fmtMoney(Math.abs(frontMoney))}
                              </span>
                            );
                          })()}
                        </div>
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
                                <PopoverContent side="top" className="w-[95vw] max-w-sm p-3">
                                  <div className="text-xs space-y-1">
                                    <p className="font-medium">Hoyo {holeNum} • {detail.net > 0 ? `+${detail.net}` : `${detail.net}`} pts</p>
                                    <TeamHoleGrid
                                      teamAPlayers={displayTeamAPlayers}
                                      teamBPlayers={displayTeamBPlayers}
                                      shortNames={disambiguatedNames}
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
                        <div className="flex items-center gap-2">
                          <span className={cn('text-xs tabular-nums', backTotal > 0 ? 'text-green-600' : backTotal < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                            {backBetsDisplay}
                          </span>
                          {(() => {
                            const frontMainTied = displayFrontBets[0] === 0;
                            const backNetBets = displayBackBets.filter(b => b > 0).length
                              - displayBackBets.filter(b => b < 0).length;
                            // ── CARRY LOGIC: si Front main terminó empatado,
                            // el Back vale Front×2 + Total18 (el Match18 se absorbe aquí)
                            const effectiveBackAmount = frontMainTied
                              ? (2 * bet.frontAmount + bet.totalAmount)
                              : bet.backAmount;
                            const backMoney = backNetBets * effectiveBackAmount;
                            if (backMoney === 0 && !frontMainTied) return null;
                            return (
                              <div className="flex items-center gap-1">
                                {frontMainTied && (
                                  <span className="text-[10px] text-amber-600 font-medium">
                                    Carry ×{fmtMoney(effectiveBackAmount)}
                                  </span>
                                )}
                                {backMoney !== 0 && (
                                  <span className={cn('text-xs font-bold tabular-nums',
                                    backMoney > 0 ? 'text-green-600' : 'text-destructive')}>
                                    {backMoney >= 0 ? '+$' : '-$'}{fmtMoney(Math.abs(backMoney))}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
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
                                <PopoverContent side="top" className="w-[95vw] max-w-sm p-3">
                                  <div className="text-xs space-y-1">
                                    <p className="font-medium">Hoyo {holeNum} • {detail.net > 0 ? `+${detail.net}` : `${detail.net}`} pts</p>
                                    <TeamHoleGrid
                                      teamAPlayers={displayTeamAPlayers}
                                      teamBPlayers={displayTeamBPlayers}
                                      shortNames={disambiguatedNames}
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
                          {(() => {
                            const frontMainTied = displayFrontBets[0] === 0;
                            // Cuando hay carry, el Match18 queda absorbido en el Back.
                            // No hay pago adicional de Total 18.
                            const matchMoney = frontMainTied
                              ? 0
                              : (total18 > 0 ? 1 : total18 < 0 ? -1 : 0) * bet.totalAmount;
                            const label = frontMainTied
                              ? 'Carry'
                              : matchMoney !== 0
                                ? `${matchMoney >= 0 ? '+$' : '-$'}${fmtMoney(Math.abs(matchMoney))}`
                                : '$0';
                            const color = frontMainTied
                              ? 'text-amber-600'
                              : matchMoney > 0 ? 'text-green-600'
                              : matchMoney < 0 ? 'text-destructive'
                              : 'text-muted-foreground';
                            return (
                              <span className={cn('text-xs font-bold tabular-nums', color)}>
                                {label}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                      </>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        );
      })}

      {/* Indicators (Oyeses/Unidades/Manchas) — after Parejas, before Grupales */}
      <GroupBetsCard
        players={allPlayersForCalculations}
        scores={scores}
        betConfig={hasMultipleGroups
          ? resolveConfigForGroup(effectiveBetConfig, displayPlayers[0]?.groupId)
          : effectiveBetConfig}
        course={course}
        basePlayerId={basePlayer?.id || basePlayer?.profileId}
        confirmedHoles={confirmedHoles}
        onBetConfigChange={onBetConfigChange}
        renderSection="indicators"
        startingHole={startingHole}
      />

      {/* Grupales (Culebras/Pingüinos/Coneja/etc.)
          IMPORTANT: Use the same `scores` map as the rest of the dashboard (not `confirmedScores`)
          so the tie-breaker UI can trigger consistently even when confirmation state is inconsistent.
      */}
      <GroupBetsCard
        players={allPlayersForCalculations}
        scores={scores}
        betConfig={hasMultipleGroups
          ? resolveConfigForGroup(effectiveBetConfig, displayPlayers[0]?.groupId)
          : effectiveBetConfig}
        course={course}
        basePlayerId={basePlayer?.id || basePlayer?.profileId}
        confirmedHoles={confirmedHoles}
        onBetConfigChange={onBetConfigChange}
        renderSection="grupales"
        startingHole={startingHole}
      />


      {/* Sprint 3 — Wolf */}
      {(wolfHook?.isActive && wolfHook.wolfConfig || (isHistorical && effectiveBetConfig.wolfSetup?.enabled)) &&
        effectiveBetConfig.wolfSetup?.enabled === true && (() => {
        const wConfig = wolfHook?.wolfConfig ?? {
          roundId: '',
          amountPerHole: effectiveBetConfig.wolfSetup?.amountPerHole ?? 100,
          scoringMode: (effectiveBetConfig.wolfSetup?.scoringMode ?? 'lowBall') as import('@/types/golf').WolfConfig['scoringMode'],
          useHandicap: effectiveBetConfig.wolfSetup?.useHandicap ?? true,
          timing: (effectiveBetConfig.wolfSetup?.timing ?? 'B') as import('@/types/golf').WolfConfig['timing'],
          carryover: effectiveBetConfig.wolfSetup?.carryover ?? true,
          playerOrder: effectiveBetConfig.wolfSetup?.playerOrder ?? [],
          participantIds: effectiveBetConfig.wolfSetup?.playerOrder ?? [],
          playerHandicaps: effectiveBetConfig.wolfSetup?.playerHandicaps ?? [],
        };
        const wStates = wolfHook?.holeStates ?? [];
        const wPlayers = wConfig.participantIds.length > 0
          ? allPlayersForCalculations.filter(p => wConfig.participantIds.includes(p.id))
          : allPlayersForCalculations;
        return (
          <WolfResultsCard
            players={wPlayers}
            wolfConfig={wConfig}
            holeStates={wStates}
            scores={scores}
            course={course}
            basePlayerId={basePlayer?.id || basePlayer?.profileId || ''}
            isDisabled={isTeamBetDisabled('wolf-primary')}
            onToggleDisabled={!isHistorical && onBetConfigChange ? () => toggleTeamBetDisabled('wolf-primary') : undefined}
          />
        );
      })()}

      {/* Sprint 3 — Sixes */}
      {(sixesHook?.isActive && sixesHook.sixesConfig || isHistorical) &&
        (effectiveBetConfig.sixesEnabled ?? ((effectiveBetConfig.sixesBets ?? []).length > 0)) && (() => {
        const hookCfg = sixesHook?.sixesConfig;
        const betInst = effectiveBetConfig.sixesBets?.[0];
        if (!betInst && !hookCfg) return null;
        const baseCfg: import('@/types/golf').SixesConfig = hookCfg ?? {
          roundId: '',
          scoringMode: (betInst?.scoringMode ?? 'lowBall') as import('@/types/golf').SixesConfig['scoringMode'],
          cobro: (betInst?.cobro ?? 'per_hole') as import('@/types/golf').SixesConfig['cobro'],
          amount: betInst?.amount ?? 100,
          useHandicap: betInst?.useHandicap ?? true,
          usePerSetAmounts: betInst?.usePerSetAmounts ?? false,
          set1Amount: betInst?.set1Amount,
          set2Amount: betInst?.set2Amount,
          set3Amount: betInst?.set3Amount,
          sets: betInst?.sets ?? [],
        };
        const hookHasEmptySets = hookCfg && (!hookCfg.sets || hookCfg.sets.length < 3 || hookCfg.sets.some(s => [...s.team1, ...s.team2].some(id => !id)));
        const mergedSixesConfig = (hookHasEmptySets || !hookCfg) && betInst?.sets?.length >= 3
          ? { ...baseCfg, sets: betInst.sets, scoringMode: betInst.scoringMode as any, cobro: betInst.cobro as any, amount: betInst.amount, useHandicap: betInst.useHandicap, teamHandicaps: betInst.teamHandicaps, handicapConfig: betInst.handicapConfig }
          : { ...baseCfg, teamHandicaps: betInst?.teamHandicaps, handicapConfig: betInst?.handicapConfig };
        if (!mergedSixesConfig.sets?.length) return null;
        return (
          <SixesResultsCard
            players={allPlayersForCalculations}
            sixesConfig={mergedSixesConfig}
            scores={scores}
            course={course}
            basePlayerId={basePlayer?.id || basePlayer?.profileId || ''}
            isDisabled={isTeamBetDisabled('sixes-primary')}
            onToggleDisabled={!isHistorical && onBetConfigChange ? () => toggleTeamBetDisabled('sixes-primary') : undefined}
          />
        );
      })()}

      {/* Sprint 3 — Vegas */}
      {(vegasHook?.isActive && vegasHook.vegasConfig || isHistorical) &&
        (effectiveBetConfig.vegasEnabled ?? ((effectiveBetConfig.vegasBets ?? []).length > 0)) && (() => {
        const hookCfg = vegasHook?.vegasConfig;
        const betInst = effectiveBetConfig.vegasBets?.[0];
        if (!betInst && !hookCfg) return null;
        if (!betInst?.playerAId && !hookCfg?.playerAId) return null;
        const baseCfg: import('@/types/golf').VegasConfig = hookCfg ?? {
          roundId: '',
          valuePerPoint: betInst?.valuePerPoint ?? 10,
          useHandicap: betInst?.useHandicap ?? false,
          birdieMultiplier: betInst?.birdieMultiplier ?? false,
          variant: (betInst?.variant ?? 'fixed') as import('@/types/golf').VegasConfig['variant'],
          playerAId: betInst?.playerAId ?? '',
          playerBId: betInst?.playerBId ?? '',
          playerCId: betInst?.playerCId ?? '',
          playerDId: betInst?.playerDId ?? '',
          useSegmentAmounts: betInst?.useSegmentAmounts ?? false,
          frontAmount: betInst?.frontAmount,
          backAmount: betInst?.backAmount,
          set1Amount: betInst?.set1Amount,
          set2Amount: betInst?.set2Amount,
          set3Amount: betInst?.set3Amount,
        };
        const mergedVegasConfig = {
          ...baseCfg,
          teamHandicaps: betInst?.teamHandicaps,
          handicapConfig: betInst?.handicapConfig,
          ...(betInst ? {
            variant: betInst.variant as any,
            valuePerPoint: betInst.valuePerPoint,
            useHandicap: betInst.useHandicap,
            birdieMultiplier: betInst.birdieMultiplier,
            ...(!baseCfg.playerAId && betInst.playerAId ? {
              playerAId: betInst.playerAId,
              playerBId: betInst.playerBId,
              playerCId: betInst.playerCId,
              playerDId: betInst.playerDId,
            } : {}),
          } : {}),
        };
        return (
          <VegasResultsCard
            players={allPlayersForCalculations}
            vegasConfig={mergedVegasConfig}
            scores={scores}
            course={course}
            basePlayerId={basePlayer?.id || basePlayer?.profileId || ''}
            isDisabled={isTeamBetDisabled('vegas-primary')}
            onToggleDisabled={!isHistorical && onBetConfigChange ? () => toggleTeamBetDisabled('vegas-primary') : undefined}
            startingHole={startingHole}
          />
        );
      })()}

      {/* Sprint 3 — Nines */}
      {(effectiveBetConfig.ninesBets ?? []).some((b: any) => b.playerIds?.length >= 3) &&
        (ninesHook?.ninesConfig || isHistorical) && (() => {
        const betInst = (effectiveBetConfig.ninesBets ?? []).find((b: any) => b.playerIds?.length >= 3) as any;
        if (!betInst) return null;
        const ninesCfg: import('@/types/golf').NinesConfig = ninesHook?.ninesConfig ?? {
          roundId: '',
          valuePerPoint: betInst.valuePerPoint ?? 10,
          playerIds: betInst.playerIds,
        };
        return (
          <NinesResultsCard
            players={allPlayersForCalculations}
            ninesConfig={ninesCfg}
            scores={scores}
            course={course}
            basePlayerId={basePlayer?.id || basePlayer?.profileId || ''}
          />
        );
      })()}

      {crossBets.length > 0 && (() => {
        const resolved = resolveConfigForGroup(betConfig, playerGroups[displayGroupIndex - 1]?.id);
        const getAmt = (cfg: any): number | undefined =>
          cfg?.totalAmount ?? cfg?.amount ?? cfg?.frontAmount ?? cfg?.value ?? undefined;
        const INDIVIDUAL_BETS: { key: string; label: string; amount?: number; enabled: boolean }[] = [
          { key: 'medal',     label: 'Medal',      amount: getAmt(resolved.medal),     enabled: !!resolved.medal?.enabled },
          { key: 'matchPlay', label: 'Match Play', amount: getAmt(resolved.matchPlay), enabled: !!resolved.matchPlay?.enabled },
          { key: 'putts',     label: 'Putts',      amount: getAmt(resolved.putts),     enabled: !!resolved.putts?.enabled },
          { key: 'manchas',   label: 'Manchas',    amount: getAmt(resolved.manchas),   enabled: !!resolved.manchas?.enabled },
          { key: 'bloques',   label: 'Bloques',    amount: getAmt(resolved.bloques),   enabled: !!resolved.bloques?.enabled },
          { key: 'units',     label: 'Unidades',   amount: getAmt(resolved.units),     enabled: !!resolved.units?.enabled },
          { key: 'skins',     label: 'Skins',      amount: getAmt(resolved.skins),     enabled: !!resolved.skins?.enabled },
        ];
        const enabledBets = INDIVIDUAL_BETS.filter(b => b.enabled);
        return (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Swords className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Apuestas de Cruce</span>
            </div>
            {crossBets.map(cb => {
              const isInitiator = cb.initiatorProfileId === basePlayerId;
              const partner = isInitiator
                ? { name: cb.targetName, initials: cb.targetInitials, color: cb.targetColor }
                : { name: cb.initiatorName, initials: cb.initiatorInitials, color: cb.initiatorColor };
              const isIncluded = (key: string) => {
                const flag = (cb.betConfig as any)?.[key]?.included;
                return flag === undefined ? true : !!flag;
              };
              const toggleIncluded = async (key: string, next: boolean) => {
                if (!onUpdateCrossBetConfig) return;
                const newConfig = {
                  ...(cb.betConfig || {}),
                  [key]: { ...((cb.betConfig as any)?.[key] || {}), included: next },
                };
                try { await onUpdateCrossBetConfig({ crossBetId: cb.crossBetId, betConfig: newConfig }); }
                catch (e) { console.error('toggleIncluded', e); }
              };
              return (
                <div key={cb.crossBetId} className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <PlayerAvatar initials={partner.initials} background={partner.color} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{partner.name}</p>
                      <p className="text-[10px] text-muted-foreground">{isInitiator ? 'Tú invitaste' : 'Te invitó'}</p>
                    </div>
                  </div>

                  {enabledBets.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">
                        Aún no hay apuestas individuales configuradas en la ronda.
                        Ve a <strong>Apuestas → Individuales</strong> para activarlas y luego aparecerán aquí para incluirlas en este cruce.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Apuestas a incluir en este cruce
                      </p>
                      {enabledBets.map(b => {
                        const included = isIncluded(b.key);
                        return (
                          <label
                            key={b.key}
                            className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-background/60 cursor-pointer"
                          >
                            <span className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                className="accent-primary h-4 w-4"
                                checked={included}
                                disabled={!onUpdateCrossBetConfig}
                                onChange={(e) => { void toggleIncluded(b.key, e.target.checked); }}
                              />
                              <span className={cn('font-medium', !included && 'text-muted-foreground line-through')}>
                                {b.label}
                              </span>
                            </span>
                            {b.amount !== undefined && b.amount > 0 && (
                              <span className="text-[11px] text-muted-foreground">${fmtMoney(b.amount)}</span>
                            )}
                          </label>
                        );
                      })}
                      <p className="text-[10px] text-muted-foreground pt-1">
                        Los montos se heredan de tu configuración de Apuestas Individuales. Los strokes de este cruce usan el sliding bilateral entre ambos perfiles y pueden ajustarse desde la vista bilateral del rival.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
};

// Shared aligned player grid for tooltips/popovers in Carritos and Foursomes
// Layout: Left side [Name Score Dot] | Right side [Dot Score Name]
// Scores are vertically aligned across all rows via grid columns

export default BetDashboard;