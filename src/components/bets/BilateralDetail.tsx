import React, { useState, useMemo } from 'react';
import { Player, PlayerScore, BetConfig, GolfCourse, BilateralHandicap, MarkerState, markerInfo, BetOverride } from '@/types/golf';
import { SnapshotPairBreakdowns, SnapshotPairSegmentResults } from '@/lib/roundSnapshot';
import { BetSummary, getPressureEvolution, getSkinsEvolution, getMatchPlayEvolution, calculateAllBets, getBilateralBalance, groupSummariesByType, getPlayerBalance } from '@/lib/betCalculations';
import { fmtMoney } from '@/lib/formatMoney';
import { calculateStrokesPerHole, getSegmentHoleRanges } from '@/lib/handicapUtils';
import { resolveConfigForGroup } from '@/lib/groupBetOverrides';
import { getRayasDetailForPair, RayasPairResult, isRayasActiveForPair, getSkinVariantConflict, getPairKey, RayaDetail, getRayasSegmentConflicts, RayasSegmentConflict, getOyesModalityForPair, getAuthoritativeRayasBalance } from '@/lib/rayasCalculations';
import { getOyesesDisplayData, getOyesesPairResult } from '@/lib/oyesesCalculations';
import { getCrossGroupPairBalance, isCrossGroupPairInMap } from '@/lib/crossGroupBalance';
import { calculateConejaBets } from '@/lib/conejaCalculations';
import { calculateBloquesForPair, getBloquesPairKey, type BloqueResult } from '@/lib/bets/bloques';
import { BloquesStrip } from './BloquesStrip';
import { detectScoreBasedMarkers, mergeMarkers } from '@/lib/scoreDetection';
import { getMedalGeneralBilateralResult, getStablefordBilateralResult } from './GroupBetsCard';
import { RayasSegmentPopover } from './RayasSegmentPopover';
import { formatPlayerName, disambiguateInitials, disambiguateShortNames } from '@/lib/playerInput';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { BetAmountEditor, BilateralHandicapEditor } from './BetEditors';
import { CrossGroupHandicapWidget } from './CrossGroupHandicapWidget';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, AlertTriangle, XCircle, Settings2, Edit2, Check, X, Plus, Minus, DollarSign, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

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
  snapshotVsBalance?: number;
  snapshotPairBreakdowns?: SnapshotPairBreakdowns;
  snapshotPairSegmentResults?: SnapshotPairSegmentResults;
  isHistorical?: boolean;
  /** Called with the computed bilateral total so the parent can use it for avatars/table. */
  onComputedBalance?: (playerId: string, rivalId: string, balance: number) => void;
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
  onComputedBalance,
}) => {
  const [editingBetType, setEditingBetType] = useState<string | null>(null);
  const [oyesTab, setOyesTab] = useState<'acumulados' | 'sangron'>('acumulados');
  const [pressuresCarryConfirm, setPressuresCarryConfirm] = useState<
    | { overrides: any; formulaValue: number; newBack: number }
    | null
  >(null);
  
  const disambiguatedAbbrsLocal = useMemo(() => disambiguateInitials(allPlayers), [allPlayers]);
  const shortNamesLocal = useMemo(() => disambiguateShortNames(allPlayers), [allPlayers]);
  const getPlayerAbbr = (p: Player) => disambiguatedAbbrsLocal.get(p.id) || p.initials;
  const getShortName = (p: Player) => shortNamesLocal.get(p.id) || formatPlayerName(p.name).split(' ')[0];

  // When the round starts on hole 10, the "Front 9" segment is physically hoyos
  // 10-18 and "Back 9" is hoyos 1-9. Labels stay constant ("Front 9"/"Back 9"),
  // but we surface the actual physical range as a hover/tap tooltip so users can
  // confirm which holes contributed to the displayed totals.
  const getSegmentPhysicalRange = (label: string): string | null => {
    if (startingHole !== 10) return null;
    if (label === 'Front 9') return 'Hoyos 10–18';
    if (label === 'Back 9') return 'Hoyos 1–9';
    return null;
  };
  const renderSegmentLabel = (label: string, className?: string) => {
    const tip = getSegmentPhysicalRange(label);
    if (!tip) return <span className={className}>{label}</span>;
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn(className, 'underline decoration-dotted underline-offset-2')}>{label}</span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">{tip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

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
        case 'puttsGeneral':
          return 'Putts General';
        case 'girGeneral':
          return 'GIR General';
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
        case 'bloques':
          return 'Bloques';
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
        case 'puttsGeneral':
          return 'Putts General';
        case 'girGeneral':
          return 'GIR General';
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
        case 'bloques':
          return 'Bloques';
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

  // Bump last-block multiplier for Bloques (1 → 2 → 3 → 4 → 5 → 1).
  const bumpBloquesLastBlockMultiplier = () => {
    if (!onBetConfigChange) return;
    const pairKey = getBloquesPairKey(player.id, rival.id);
    const current = effectiveBetConfig.bloques?.lastBlockMultipliers?.[pairKey] ?? 1;
    const next = current >= 5 ? 1 : current + 1;
    const baseBloques = betConfig.bloques ?? effectiveBetConfig.bloques;
    onBetConfigChange({
      ...betConfig,
      bloques: {
        ...baseBloques,
        lastBlockMultipliers: {
          ...(baseBloques?.lastBlockMultipliers ?? {}),
          [pairKey]: next,
        },
      },
    });
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
    
    const ranges = getSegmentHoleRanges(startingHole, effectiveBetConfig.roundHoles ?? 18);
    const [start, end] = segment === 'front' ? ranges.front : segment === 'back' ? ranges.back : [1, 18];
    // Medal display mode: sum ALL confirmed holes for this player in the segment
    const filtered = playerScores.filter((s) => s.holeNumber >= start && s.holeNumber <= end);
    
    // If no override, use existing net scores
    if (!override) {
      return filtered.reduce((sum, s) => sum + (Number.isFinite(s.netScore) ? s.netScore : s.strokes), 0);
    }
    
    // Apply bilateral handicap override
    const isPlayerA = override.playerAId === playerId;
    const overrideHandicap = isPlayerA ? override.playerAHandicap : override.playerBHandicap;
    
    const strokesPerHole = calculateStrokesPerHole(overrideHandicap, course, startingHole);
    
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
    const details: { holeNumber: number; marker: string; emoji: string; isPositive: boolean; isGeneric?: boolean }[] = [];
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
        // Unidades genéricas — una entrada por ocurrencia
        const unidadGenCount = score.markers.unidadGenerica ?? 0;
        for (let ug = 0; ug < unidadGenCount; ug++) {
          details.push({ holeNumber: score.holeNumber, marker: 'Unidad', emoji: '⭐', isPositive: isBasePlayer, isGeneric: true });
        }
      } else {
        // Manchas - negative for the player who commits them
        const isManchaPositiveForBasePlayer = !isBasePlayer;
        
        if (score.markers.ladies) details.push({ holeNumber: score.holeNumber, marker: 'Pinkies', emoji: '👠', isPositive: isManchaPositiveForBasePlayer });
        if (score.markers.swingBlanco) details.push({ holeNumber: score.holeNumber, marker: 'Paloma', emoji: '💨', isPositive: isManchaPositiveForBasePlayer });
        if (score.markers.retruje) details.push({ holeNumber: score.holeNumber, marker: 'Retruje', emoji: '↩️', isPositive: isManchaPositiveForBasePlayer });
        if (score.markers.trampa) details.push({ holeNumber: score.holeNumber, marker: 'Trampa', emoji: '⚠️', isPositive: isManchaPositiveForBasePlayer });
        if (score.markers.dobleAgua) details.push({ holeNumber: score.holeNumber, marker: 'Doble Agua', emoji: '🌊', isPositive: isManchaPositiveForBasePlayer });
        if (score.markers.dobleOB) details.push({ holeNumber: score.holeNumber, marker: 'Doble OB', emoji: '🚫', isPositive: isManchaPositiveForBasePlayer });
        if (score.markers.par3GirMas3) details.push({ holeNumber: score.holeNumber, marker: 'Par3 +3', emoji: '3️⃣', isPositive: isManchaPositiveForBasePlayer });
        if (score.markers.moreliana) details.push({ holeNumber: score.holeNumber, marker: 'Moreliana', emoji: '🎭', isPositive: isManchaPositiveForBasePlayer });
        if (score.strokes >= 10 || score.markers.dobleDigito) details.push({ holeNumber: score.holeNumber, marker: 'Doble Dígito', emoji: '🔟', isPositive: isManchaPositiveForBasePlayer });
        if (score.putts >= 4 || score.markers.cuatriput) {
          details.push({ holeNumber: score.holeNumber, marker: 'Cuatriput', emoji: '😱', isPositive: isManchaPositiveForBasePlayer });
        }
        // Manchas genéricas
        const manchaGenCount = score.markers.manchaGenerica ?? 0;
        for (let mg = 0; mg < manchaGenCount; mg++) {
          details.push({ holeNumber: score.holeNumber, marker: 'Mancha', emoji: '⬛', isPositive: isManchaPositiveForBasePlayer, isGeneric: true });
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
        participantIds = resolvedBet?.participantIds;
        resolvedBetConfig = resolvedBet;
      } else {
        resolvedBetConfig = betConfig[betKey as keyof BetConfig] as any;
      }
      if (resolvedBetConfig?.enabled === false) return false;
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
      isInfoOnly?: boolean;
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
      const puttsFront = getAmt('Putts Front 9');
      const puttsBack  = getAmt('Putts Back 9');
      const puttsTotal18 = getAmt('Putts Total');
      const puttsSum   = puttsFront + puttsBack + puttsTotal18;
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
        { bt: 'Putts General',label: 'Putts General', configKey: 'puttsGeneral' },
        { bt: 'GIR General',  label: 'GIR General',   configKey: 'girGeneral' },
        { bt: 'Stableford',   label: 'Stableford',    configKey: 'stableford' },
        { bt: 'Side Bet',     label: 'Side Bet',      configKey: 'sideBets' },
        { bt: 'Nines',        label: 'Nines (5-3-1)', configKey: 'ninesBets' },
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
        'Putts Front 9','Putts Back 9',
        'Caros','Oyes','Unidades','Manchas','Culebras','Pingüinos',
        'Coneja','Medal General','Putts General','GIR General','Stableford','Side Bet',
        'Carritos Front','Carritos Back','Carritos Total','Presiones Parejas','Presiones Pareja',
        'Nines',
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
    // Resolve group-specific config so G2+ overrides (enabled, amounts, participantIds) are respected.
    const groupId = groupPlayers[0]?.groupId;
    const resolvedCfg = groupId ? resolveConfigForGroup(betConfig, groupId) : betConfig;

    // Medal
    if (bothParticipate(undefined, 'medal')) {
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
    if (bothParticipate(undefined, 'putts')) {
      const puttsFront = groupedSummaries['Putts Front 9']?.total || 0;
      const puttsBack = groupedSummaries['Putts Back 9']?.total || 0;
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
      
      if (total !== 0 || (resolvedCfg.putts?.frontAmount > 0 || resolvedCfg.putts?.backAmount > 0)) {
        groups.push({
          key: 'putts',
          label: 'Putts',
          configKey: 'putts',
          segments: [
            { label: 'Front 9', key: 'putts_front', overrideLabel: 'Putts Front 9' },
            { label: 'Back 9', key: 'putts_back', overrideLabel: 'Putts Back 9' },
            { label: 'Total 18', key: 'putts_total', overrideLabel: 'Putts Total' },
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
    if (bothParticipate(undefined, 'pressures')) {
      const pairKeyP = [player.id, rival.id].sort().join('_');
      const pairOverrideP = betConfig.pressurePairOverrides?.[pairKeyP];
      const pairOnlyMatchP = pairOverrideP?.onlyMatch !== undefined
        ? pairOverrideP.onlyMatch
        : resolvedCfg.pressures?.onlyMatch === true;
      const isContinuaMatch = !!(resolvedCfg.pressures?.continua && pairOnlyMatchP);
      const pressureSegments = isContinuaMatch
        ? [
            { label: 'Total 18', key: 'pressure_total', overrideLabel: 'Presiones Match 18' },
          ]
        : [
            { label: 'Front 9', key: 'pressure_front', overrideLabel: 'Presiones Front' },
            { label: 'Back 9', key: 'pressure_back', overrideLabel: 'Presiones Back' },
            { label: 'Total 18', key: 'pressure_total', overrideLabel: 'Presiones Match 18' },
          ];
      groups.push({
        key: 'pressures',
        label: 'Presiones',
        configKey: 'pressures',
        segments: pressureSegments,
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

    // Match Play — independiente de Presiones, fila propia con resultado X&Y / UP / AS
    if (resolvedCfg.matchPlay?.enabled && bothParticipate(undefined, 'matchPlay' as any)) {
      groups.push({
        key: 'matchPlay',
        label: 'Match Play',
        configKey: 'matchPlay',
        segments: [
          { label: 'Total 18', key: 'matchplay_total', overrideLabel: 'Match Play' },
        ],
        getTotal: () => groupedSummaries['Match Play']?.total || 0,
        getSegmentData: () => {
          const summary = groupedSummaries['Match Play'];
          const description = summary?.details?.[0]?.description || '—';
          return {
            playerNet: 0,
            rivalNet: 0,
            amount: summary?.total || 0,
            description,
          };
        },
      });
    }

    // Bloques — bilateral mini-medal por bloques
    const _bloquesOverrideEarly = getBetOverride('bloques');
    if (resolvedCfg.bloques?.enabled && bothParticipate(undefined, 'bloques' as any) && _bloquesOverrideEarly?.enabled !== false) {
      let bloquesAmount = 0;
      let bloquesDesc = '—';
      let bloquesDetail: BloqueResult[] = [];

      if (isHistorical) {
        bloquesAmount = groupedSummaries['Bloques']?.total || 0;
        bloquesDesc = groupedSummaries['Bloques']?.details?.[0]?.description || '—';
      } else {
        const bloquesOverride = getBetOverride('bloques');
        const effectiveAmt = bloquesOverride?.amountOverride ?? effectiveBetConfig.bloques.amountPerBlock;
        const effectiveCarry = bloquesOverride?.carryOverOnTie ?? effectiveBetConfig.bloques.carryOverOnTie;
        const bloquesPairKey = getBloquesPairKey(player.id, rival.id);
        const lastBlockMult = effectiveBetConfig.bloques?.lastBlockMultipliers?.[bloquesPairKey] ?? 1;
        bloquesDetail = calculateBloquesForPair(
          player, rival, confirmedScores, course, effectiveBetConfig,
          effectiveBetConfig.bilateralHandicaps,
          startingHole,
          effectiveBetConfig.bloques.holesPerBlock,
          effectiveAmt,
          effectiveCarry,
          lastBlockMult
        );

        const wonByPlayer: number[] = [];
        const tied: number[] = [];
        for (const blk of bloquesDetail) {
          if (!blk.resolved) continue;
          if (blk.winnerId === player.id) { bloquesAmount += blk.amountAtStake; wonByPlayer.push(blk.blockNumber); }
          else if (blk.winnerId === rival.id) { bloquesAmount -= blk.amountAtStake; }
          else { tied.push(blk.blockNumber); }
        }

        const parts: string[] = [];
        if (wonByPlayer.length > 0) parts.push(`B${wonByPlayer.join(',')}`);
        if (tied.length > 0) parts.push(`Empate B${tied.join(',')}`);
        bloquesDesc = parts.join(' · ') || '—';
      }

      if (bloquesAmount !== 0 || bloquesDetail.some(b => b.resolved)) {
        groups.push({
          key: 'bloques',
          label: 'Bloques',
          configKey: 'bloques',
          segments: [
            { label: 'Total 18', key: 'bloques_total', overrideLabel: 'Bloques' },
          ],
          getTotal: () => bloquesAmount,
          getSegmentData: () => ({
            playerNet: 0,
            rivalNet: 0,
            amount: bloquesAmount,
            description: bloquesDesc,
          }),
          bloquesDetail,
        } as any);
      }
    }

    // Skins
    if (bothParticipate(undefined, 'skins')) {
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
    if (bothParticipate(undefined, 'caros')) {
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
    
    // Oyeses standalone — only show this row when the standalone bet is active
    // for both players in the matrix. Rayas Oyes is shown inside the Rayas row.
    const showOyesRow = bothParticipate(undefined, 'oyeses');
    if (showOyesRow) {
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
            amount: oyesSummary?.total || 0,
          };
        },
      });
    }
    
    // Unidades
    if (bothParticipate(undefined, 'units')) {
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
    if (bothParticipate(undefined, 'manchas')) {
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
    if (bothParticipate(undefined, 'culebras')) {
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
    if (bothParticipate(undefined, 'pinguinos')) {
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
    if (bothParticipate(undefined, 'zoologico')) {
      const resolvedZoo = resolvedCfg.zoologico;
      const enabledAnimals = resolvedZoo?.enabledAnimals || ['camello', 'pez', 'gorila'];
      const valuePerOccurrence = resolvedZoo?.valuePerOccurrence || 10;
      
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
    if (effectiveBetConfig.rayas?.enabled && bothParticipate(effectiveBetConfig.rayas?.participantIds, 'rayas')) {
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
        allPlayers,
        startingHole
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
      // Use authoritative function for the total to guarantee avatar == header
      const rayasTotalFromDetails = getAuthoritativeRayasBalance(
        player, rival, confirmedScores, effectiveBetConfig, course,
        effectiveBetConfig.bilateralHandicaps, allPlayers, startingHole,
        rayasAmountOverrides
      );
      
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
        const conejaBets = calculateConejaBets(conejaPlayers, confirmedScores, course, effectiveBetConfig, confirmedHoles);
        
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
    if (bothParticipate(undefined, 'medalGeneral')) {
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
        const medalResult = getMedalGeneralBilateralResult(allPlayers, playerWithGroup, rivalWithGroup, confirmedScores, betConfig, course, startingHole);
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

    // Putts General (Group bet shown in bilateral view)
    if ((betConfig as any).puttsGeneral?.enabled && bothParticipate(undefined, 'puttsGeneral')) {
      const puttsTotal = groupedSummaries['Putts General']?.total || 0;
      const puttsDesc = groupedSummaries['Putts General']?.details?.[0]?.description || '';
      if (puttsTotal !== 0 || puttsDesc) {
        groups.push({
          key: 'puttsGeneral',
          label: 'Putts General',
          configKey: 'puttsGeneral',
          segments: [],
          getTotal: () => puttsTotal,
          getSegmentData: () => ({
            playerNet: 0,
            rivalNet: 0,
            amount: puttsTotal,
            description: puttsDesc,
          }),
        });
      }
    }

    // GIR General (Group bet shown in bilateral view)
    if ((betConfig as any).girGeneral?.enabled && bothParticipate(undefined, 'girGeneral')) {
      const girTotal = groupedSummaries['GIR General']?.total || 0;
      const girDesc = groupedSummaries['GIR General']?.details?.[0]?.description || '';
      if (girTotal !== 0 || girDesc) {
        groups.push({
          key: 'girGeneral',
          label: 'GIR General',
          configKey: 'girGeneral',
          segments: [],
          getTotal: () => girTotal,
          getSegmentData: () => ({
            playerNet: 0,
            rivalNet: 0,
            amount: girTotal,
            description: girDesc,
          }),
        });
      }
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
    if (bothParticipate(undefined, 'stableford')) {
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
    
    // Skins Grupal - Group bet shown in bilateral view (like Medal General) — single row, no expandable segments
    if (bothParticipate(undefined, 'skinsGrupal')) {
      const sgFrontTotal = groupedSummaries['Skins Grupal Front']?.total || 0;
      const sgBackTotal = groupedSummaries['Skins Grupal Back']?.total || 0;
      const sgTotal = sgFrontTotal + sgBackTotal;
      
      if (sgTotal !== 0) {
        groups.push({
          key: 'skinsGrupal',
          label: 'Skins Grupal',
          configKey: 'skinsGrupal',
          segments: [],
          getTotal: () => sgTotal,
          getSegmentData: () => {
            return {
              playerNet: 0,
              rivalNet: 0,
              amount: sgTotal,
              description: `Front: ${sgFrontTotal >= 0 ? '+' : ''}$${sgFrontTotal} · Back: ${sgBackTotal >= 0 ? '+' : ''}$${sgBackTotal}`,
            };
          },
        });
      }
    }
    
    // Nines (grupal bilateral — same pattern as Coneja)
    {
      const ninesTotal = groupedSummaries['Nines']?.total || 0;
      if (ninesTotal !== 0) {
        const ninesDetails = groupedSummaries['Nines']?.details || [];
        const ptsWon = ninesDetails.filter(d => d.amount > 0).reduce((s, d) => s + (d.units ?? 0), 0);
        const ptsLost = ninesDetails.filter(d => d.amount < 0).reduce((s, d) => s + (d.units ?? 0), 0);
        groups.push({
          key: 'nines',
          label: 'Nines (5-3-1)',
          configKey: 'ninesBets',
          segments: [],
          getTotal: () => ninesTotal,
          getSegmentData: () => ({
            playerNet: ptsWon,
            rivalNet: ptsLost,
            amount: ninesTotal,
            description: ninesDetails[0]?.description || '',
          }),
        });
      }
    }
    
    // NOTE: Team Pressures are NOT shown in bilateral view - they're pair bets
    
    return groups;
  }, [isHistorical, snapshotPairBreakdowns, snapshotPairSegmentResults, betConfig, effectiveBetConfig, groupedSummaries, confirmedScores, players, player.id, rival.id, allScores, course.holes, confirmedHoles, allPlayers, course]);
  
  // Compute the total balance for the bilateral detail header.
  // This MUST equal the sum of the visible (non-disabled) betTypeGroups rows.
  // Using betTypeGroups as the single source of truth guarantees header === sum(rows).
  // Both live and historical modes benefit because betTypeGroups already handles both.
  const computedTotalBalance = useMemo(() => {
    return betTypeGroups.reduce((sum, group) => {
      const override = getBetOverride(group.key);
      if (override?.enabled === false) return sum;
      return sum + group.getTotal();
    }, 0);
  }, [betTypeGroups]);

  // Report computedTotalBalance to parent synchronously (before paint)
  // so avatars and Tabla General always show the exact same value as the header.
  React.useLayoutEffect(() => {
    onComputedBalance?.(player.id, rival.id, computedTotalBalance);
  }, [computedTotalBalance, onComputedBalance, player.id, rival.id]);


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
    
    const configKey = type === 'units' ? 'units' : 'manchas';
    const standardValue = betConfig[configKey].valuePerPoint;
    const genericValue = type === 'units'
      ? (betConfig.units.valuePerGenericUnit ?? standardValue)
      : (betConfig.manchas.valuePerGenericMancha ?? standardValue);

    // Compute active units advantage for this pair (only relevant for 'units')
    const unitsOverride = type === 'units'
      ? betConfig.betOverrides?.find(
          o => o.betType === 'Unidades' &&
            ((o.playerAId === player.id && o.playerBId === rival.id) ||
             (o.playerAId === rival.id && o.playerBId === player.id))
        )
      : undefined;
    const isUnitsInverted = unitsOverride?.playerAId === rival.id;
    const activeAdvantage = unitsOverride?.unitsAdvantage
      ? (isUnitsInverted ? -(unitsOverride.unitsAdvantage) : unitsOverride.unitsAdvantage)
      : 0;
    
    return (
      <div className="px-4 py-2 pl-10 bg-background/50 space-y-2">
        {type === 'units' && activeAdvantage !== 0 && (
          <div className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/30">
            <span className="font-semibold text-amber-700">Ventaja:</span>
            <span className="text-foreground">
              {activeAdvantage > 0
                ? `Tú das ${activeAdvantage} unidad${activeAdvantage !== 1 ? 'es' : ''}`
                : `Rival da ${Math.abs(activeAdvantage)} unidad${Math.abs(activeAdvantage) !== 1 ? 'es' : ''}`}
            </span>
            <span className="ml-auto font-bold tabular-nums">
              × ${standardValue} = {activeAdvantage > 0 ? '-' : '+'}${fmtMoney(Math.abs(activeAdvantage * standardValue))}
            </span>
          </div>
        )}
        {allDetails.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {allDetails.map((d, i) => {
              const value = d.isGeneric ? genericValue : standardValue;
              return (
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
                  <span className="font-bold">{d.isPositive ? '+' : '-'}${value}</span>
                </span>
              );
            })}
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
            ${fmtMoney(Math.abs(computedTotalBalance))}
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
                    {onBetConfigChange && !group.isInfoOnly && (
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
                      {group.isInfoOnly && !isDisabled && (
                        <span className="text-[9px] text-muted-foreground">Solo conteo</span>
                      )}
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
                    {/* Edit amount button — hide for info-only groups */}
                    {onBetConfigChange && !isDisabled && !group.isInfoOnly && (
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
                    
                    {group.isInfoOnly ? (
                      <span className="text-sm text-muted-foreground">
                        {(() => {
                          const seg = group.getSegmentData('');
                          return `${seg.playerNet} - ${seg.rivalNet}`;
                        })()}
                      </span>
                    ) : (
                      <span className={cn(
                        'text-lg font-bold',
                        isDisabled ? 'text-muted-foreground' :
                        total > 0 ? 'text-green-600' : total < 0 ? 'text-destructive' : 'text-muted-foreground'
                      )}>
                        {isDisabled ? '$0' : `${total >= 0 ? '+$' : '-$'}${fmtMoney(Math.abs(total))}`}
                      </span>
                    )}
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
                                    {renderSegmentLabel(segment.label, 'text-xs text-muted-foreground cursor-pointer hover:underline')}
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
                                                'w-8 h-7 flex items-center justify-center text-[11px] font-bold rounded',
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
                                  {data.amount >= 0 ? '+$' : '-$'}{fmtMoney(Math.abs(data.amount))}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : group.key === 'units' || group.key === 'manchas' ? (
                      renderMarkerDetail(group.key === 'units' ? 'units' : 'manchas')
                    ) : group.key === 'bloques' ? (
                      (() => {
                        const bloquesData = (group as any).bloquesDetail as BloqueResult[] | undefined;
                        if (!bloquesData || bloquesData.length === 0) {
                          return <div className="px-4 py-3 text-xs text-muted-foreground">Sin datos</div>;
                        }
                        const bh = effectiveBetConfig.bilateralHandicaps?.find(h =>
                          (h.playerAId === player.id && h.playerBId === rival.id) ||
                          (h.playerAId === rival.id && h.playerBId === player.id)
                        );
                        let hcpA = 0; let hcpB = 0;
                        if (bh) {
                          const aFirst = bh.playerAId === player.id;
                          hcpA = aFirst ? bh.playerAHandicap : bh.playerBHandicap;
                          hcpB = aFirst ? bh.playerBHandicap : bh.playerAHandicap;
                        }
                        const getStrokes = (pid: string, hole: number): number | null => {
                          const arr = confirmedScores.get(pid) || [];
                          const s = arr.find(x => x.holeNumber === hole);
                          return s && s.strokes > 0 ? s.strokes : null;
                        };
                        const bloquesOv = getBetOverride('bloques');
                        const effAmt = bloquesOv?.amountOverride ?? effectiveBetConfig.bloques.amountPerBlock;
                        const effCarry = bloquesOv?.carryOverOnTie ?? effectiveBetConfig.bloques.carryOverOnTie;
                        return (
                          <div className="px-4 py-3 bg-background/50">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium">Modalidad</span>
                              <span className="text-[10px] text-muted-foreground">
                                {`${effCarry ? 'Carry   ' : ''}${effectiveBetConfig.bloques.holesPerBlock} Hoyos   $${effAmt} p/bloque`}
                              </span>
                            </div>
                            <BloquesStrip
                              playerA={player}
                              playerB={rival}
                              blocks={bloquesData}
                              course={course}
                              handicapA={hcpA}
                              handicapB={hcpB}
                              getStrokes={getStrokes}
                              basePlayerId={basePlayerId}
                              allPlayers={allPlayers}
                              carryOverOnTie={effCarry}
                            />
                            {onBetConfigChange && !isHistorical && (() => {
                              const lastBlock = bloquesData[bloquesData.length - 1];
                              if (!lastBlock) return null;
                              const mult = lastBlock.multiplier ?? 1;
                              const baseAmt = lastBlock.amountAtStake / Math.max(1, mult);
                              const nextMult = mult >= 5 ? 1 : mult + 1;
                              return (
                                <div className="mt-2">
                                  <button
                                    type="button"
                                    onClick={bumpBloquesLastBlockMultiplier}
                                    className={cn(
                                      'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-[11px] transition-colors border',
                                      mult > 1
                                        ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-950/60 border-amber-300 dark:border-amber-800'
                                        : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-transparent'
                                    )}
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <Zap className={cn('h-3 w-3', mult > 1 && 'text-amber-500')} />
                                      <span>Último bloque: {mult}x</span>
                                      <span className={cn('tabular-nums', mult > 1 && 'font-semibold')}>· ${baseAmt * mult}</span>
                                    </span>
                                    <span className="text-[10px] opacity-80">
                                      {mult >= 5 ? '→ 1x · Reset' : `→ ${nextMult}x · $${baseAmt * nextMult}`}
                                    </span>
                                  </button>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })()
                    ) : group.key === 'oyeses' ? (
                      // Oyeses detail - show proximity order per player per hole
                      (() => {
                        // ---- Detect which modalities have data for THIS pair ----
                        // Acumulado data sources:
                        //  - any Par 3 with oyesProximity for either player
                        //  - any 'Rayas Oyes' summary whose description does NOT include "(Sangrón)"
                        // Sangrón data sources:
                        //  - any Par 3 with oyesProximitySangron for either player
                        //  - any 'Rayas Oyes' summary whose description includes "(Sangrón)"
                        //  - the pair's effective Oyes modality is 'sangron'
                        const par3Numbers = course.holes.filter(h => h.par === 3).map(h => h.number);
                        const orderedPar3Numbers = startingHole === 10
                          ? [...par3Numbers].sort((a, b) => (a >= 10 ? a - 10 : a + 8) - (b >= 10 ? b - 10 : b + 8))
                          : par3Numbers;
                        const playerScoresArr = confirmedScores.get(player.id) || [];
                        const rivalScoresArr = confirmedScores.get(rival.id) || [];
                        const hasAcumuladoData = orderedPar3Numbers.some(hn => {
                          const sA = playerScoresArr.find(s => s.holeNumber === hn);
                          const sB = rivalScoresArr.find(s => s.holeNumber === hn);
                          return (sA?.oyesProximity ?? null) !== null || (sB?.oyesProximity ?? null) !== null;
                        });
                        const hasSangronData = orderedPar3Numbers.some(hn => {
                          const sA = playerScoresArr.find(s => s.holeNumber === hn);
                          const sB = rivalScoresArr.find(s => s.holeNumber === hn);
                          return (sA?.oyesProximitySangron ?? null) !== null || (sB?.oyesProximitySangron ?? null) !== null;
                        });
                        const rayasOyesSummaries = groupedSummaries['Rayas Oyes']?.details || [];
                        const hasRayasOyesSangron = rayasOyesSummaries.some(d => (d.description || '').includes('Sangrón'));
                        const hasRayasOyesAcumulado = rayasOyesSummaries.some(d => !(d.description || '').includes('Sangrón'));
                        const pairOyesModality = getOyesModalityForPair(effectiveBetConfig, player.id, rival.id);
                        const showAcumulado = hasAcumuladoData || hasRayasOyesAcumulado || pairOyesModality === 'acumulados';
                        const showSangron = hasSangronData || hasRayasOyesSangron || pairOyesModality === 'sangron';
                        const showTabs = showAcumulado && showSangron;
                        // Active modality for the table view
                        const activeModality: 'acumulados' | 'sangron' = showTabs
                          ? oyesTab
                          : (showSangron && !showAcumulado ? 'sangron' : 'acumulados');
                        // Use confirmedScores for display to match calculation
                        const oyesesData = getOyesesDisplayData(
                          player.id,
                          rival.id,
                          confirmedScores,
                          effectiveBetConfig,
                          course,
                          showTabs ? activeModality : undefined,
                          startingHole
                        );
                        const { playerAHoles, playerBHoles } = oyesesData;
                        
                        // Get zapato (100% bonus) data - also use confirmedScores
                        const pairResult = getOyesesPairResult(
                          player.id,
                          rival.id,
                          confirmedScores,
                          effectiveBetConfig,
                          course,
                          startingHole
                        );
                        
                        if (playerAHoles.length === 0 && !showTabs) {
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
                            {/* Modality tabs (only when both modalities have data for this pair) */}
                            {showTabs && (
                              <div className="flex gap-1 p-1 bg-muted rounded-lg">
                                <button
                                  type="button"
                                  onClick={() => setOyesTab('acumulados')}
                                  className={cn(
                                    "flex-1 py-1 px-2 text-[11px] font-medium rounded-md transition-all",
                                    activeModality === 'acumulados'
                                      ? "bg-background shadow text-foreground"
                                      : "text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  Acumulado
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setOyesTab('sangron')}
                                  className={cn(
                                    "flex-1 py-1 px-2 text-[11px] font-medium rounded-md transition-all",
                                    activeModality === 'sangron'
                                      ? "bg-background shadow text-foreground"
                                      : "text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  Sangrón
                                </button>
                              </div>
                            )}
                            {/* Mode hint when only one modality applies but it's Sangrón */}
                            {!showTabs && activeModality === 'sangron' && (
                              <div className="text-[10px] text-muted-foreground">Modalidad Sangrón</div>
                            )}
                            {/* Empty state for the active tab */}
                            {playerAHoles.length === 0 && (
                              <div className="text-xs text-muted-foreground py-2">
                                Sin datos de Oyeses {activeModality === 'sangron' ? 'Sangrón' : 'Acumulado'} registrados
                              </div>
                            )}
                            {!isHistorical && onBetConfigChange && (() => {
                              const zapatoPairKey = [player.id, rival.id].sort().join('_');
                              const pairOverride = betConfig.oyesPairZapatoOverrides?.[zapatoPairKey];
                              const globalZapato = betConfig.oyeses.zapatoEnabled !== false;
                              const checked = pairOverride !== undefined ? pairOverride : globalZapato;
                              return (
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-medium">Zapato</span>
                                  <Switch
                                    checked={checked}
                                    onCheckedChange={(next) => {
                                      const nextOverrides = { ...(betConfig.oyesPairZapatoOverrides ?? {}) };
                                      if (next === globalZapato) {
                                        delete nextOverrides[zapatoPairKey];
                                      } else {
                                        nextOverrides[zapatoPairKey] = next;
                                      }
                                      onBetConfigChange({
                                        ...betConfig,
                                        oyesPairZapatoOverrides: nextOverrides,
                                      });
                                    }}
                                  />
                                </div>
                              );
                            })()}
                            {/* Oyes modality pair override */}
                            {!isHistorical && onBetConfigChange && (() => {
                              const cfgA = betConfig.oyeses?.playerConfigs?.find(pc => pc.playerId === player.id);
                              const cfgB = betConfig.oyeses?.playerConfigs?.find(pc => pc.playerId === rival.id);
                              const modalityA = cfgA?.modality ?? 'acumulados';
                              const modalityB = cfgB?.modality ?? 'acumulados';
                              const pairKey = [player.id, rival.id].sort().join('_');
                              const pairOverride = betConfig.oyesPairModalityOverrides?.[pairKey];
                              const hasConflict = modalityA !== modalityB;
                              const currentModality = pairOverride ?? (hasConflict ? 'sangron' : modalityA);

                              if (!hasConflict && !pairOverride) return null;

                              return (
                                <div className={cn(
                                  "flex items-center justify-between rounded-lg px-3 py-2 border",
                                  hasConflict && !pairOverride ? "bg-amber-500/10 border-amber-500/30" : "bg-muted/30 border-border/50"
                                )}>
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px] font-medium">Modalidad Oyes (este par)</span>
                                    {hasConflict && !pairOverride && (
                                      <span className="text-[9px] text-amber-600">
                                        {getShortName(player)}: {modalityA === 'sangron' ? 'Sangrón' : 'Acum'} · {getShortName(rival)}: {modalityB === 'sangron' ? 'Sangrón' : 'Acum'}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex gap-1">
                                    {(['acumulados', 'sangron'] as const).map(mod => (
                                      <button key={mod} type="button"
                                        onClick={() => onBetConfigChange({
                                          ...betConfig,
                                          oyesPairModalityOverrides: {
                                            ...(betConfig.oyesPairModalityOverrides ?? {}),
                                            [pairKey]: mod
                                          }
                                        })}
                                        className={cn(
                                          'px-2 py-0.5 text-[9px] rounded transition-colors',
                                          currentModality === mod
                                            ? mod === 'sangron' ? 'bg-destructive text-destructive-foreground font-medium' : 'bg-golf-gold text-golf-dark font-medium'
                                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                        )}>
                                        {mod === 'acumulados' ? 'Acumulado' : 'Sangrón'}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
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
                                  ${fmtMoney(Math.abs(oyesTotal))}
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
                                  ${fmtMoney(Math.abs(oyesTotal))}
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
                          allPlayers,
                          startingHole
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
                            {/* Segment conflict resolution toggles */}
                            {!isHistorical && onBetConfigChange && effectiveBetConfig.rayas?.enabled && (() => {
                              const segConflicts = getRayasSegmentConflicts(effectiveBetConfig, player.id, rival.id);
                              if (segConflicts.length === 0) return null;
                              const pairKey = getPairKey(player.id, rival.id);
                              const hasUnresolved = segConflicts.some(s => s.playerAWants !== s.playerBWants && !s.resolved);
                              const allOff = segConflicts.every(s => !s.effectiveEnabled);
                              const SEGMENT_LABELS: Record<string, string> = {
                                skins: 'Skins', units: 'Unidades', oyes: 'Oyes', medal: 'Medal'
                              };
                              return (
                                <div className={cn(
                                  "rounded-lg px-3 py-2 border",
                                  hasUnresolved ? "bg-amber-500/10 border-amber-500/30" : "bg-muted/30 border-border/50"
                                )}>
                                  {hasUnresolved && (
                                    <div className="flex items-center gap-1.5 mb-2">
                                      <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                                      <p className="text-[10px] text-amber-600 dark:text-amber-400">
                                        Configuraciones distintas — define qué juegan
                                      </p>
                                    </div>
                                  )}
                                  <div className="grid grid-cols-4 gap-2">
                                    {segConflicts.map(seg => (
                                      <div key={seg.segmentKey} className="flex flex-col items-center gap-1">
                                        <span className="text-[10px] text-muted-foreground">{SEGMENT_LABELS[seg.segmentKey]}</span>
                                        <Switch
                                          className={cn(
                                            "scale-75",
                                            seg.playerAWants !== seg.playerBWants && !seg.resolved && "ring-1 ring-amber-400 rounded-full"
                                          )}
                                          checked={seg.effectiveEnabled}
                                          onCheckedChange={(newValue) => {
                                            const current = betConfig.rayas?.pairSegmentOverrides ?? {};
                                            const currentPair = current[pairKey] ?? {};
                                            onBetConfigChange({
                                              ...betConfig,
                                              rayas: {
                                                ...betConfig.rayas,
                                                pairSegmentOverrides: {
                                                  ...current,
                                                  [pairKey]: { ...currentPair, [seg.segmentKey]: newValue }
                                                }
                                              }
                                            });
                                          }}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                  {/* Oyes modality toggle within Rayas */}
                                  {segConflicts.find(s => s.segmentKey === 'oyes')?.effectiveEnabled && (
                                    <div className="flex items-center justify-between pt-2 border-t border-border/20 mt-1">
                                      <span className="text-[10px] text-muted-foreground">Oyes modalidad:</span>
                                      <div className="flex gap-1">
                                        {(['acumulados', 'sangron'] as const).map(mod => {
                                          const oyesPairKey = getPairKey(player.id, rival.id);
                                          const currentOyesModality = getOyesModalityForPair(effectiveBetConfig, player.id, rival.id);
                                          return (
                                            <button key={mod} type="button"
                                              onClick={() => onBetConfigChange({
                                                ...betConfig,
                                                rayas: {
                                                  ...betConfig.rayas,
                                                  pairOyesModalityOverrides: {
                                                    ...(betConfig.rayas?.pairOyesModalityOverrides ?? {}),
                                                    [oyesPairKey]: mod,
                                                  }
                                                }
                                              })}
                                              className={cn(
                                                'px-2 py-0.5 text-[9px] rounded transition-colors',
                                                currentOyesModality === mod
                                                  ? mod === 'sangron' ? 'bg-destructive text-destructive-foreground font-medium' : 'bg-golf-gold text-golf-dark font-medium'
                                                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                              )}>
                                              {mod === 'acumulados' ? 'Acumulado' : 'Sangrón'}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                  {allOff && (
                                    <div className="text-[10px] text-muted-foreground text-center mt-1 flex items-center justify-center gap-1">
                                      <X className="h-3 w-3" />
                                      <span>Rayas desactivadas para este par — valor $0</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
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
                              startingHole={startingHole}
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
                                {frontTotalAmount >= 0 ? '+$' : '-$'}{fmtMoney(Math.abs(frontTotalAmount))}
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
                              startingHole={startingHole}
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
                                {backTotalAmount >= 0 ? '+$' : '-$'}{fmtMoney(Math.abs(backTotalAmount))}
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
                                    {medalTotalAmount >= 0 ? '+$' : '-$'}{fmtMoney(Math.abs(medalTotalAmount))}
                                  </span>
                                </div>
                              );
                            })()}
                            
                            {/* Grand Total */}
                            <div className="flex items-center justify-between text-base font-bold border-t border-border/50 pt-2 mt-2">
                              <span>TOTAL RAYAS</span>
                              <span className={cn(grandTotal > 0 ? 'text-green-600' : grandTotal < 0 ? 'text-destructive' : '')}>
                                {grandTotal >= 0 ? '+$' : '-$'}{fmtMoney(Math.abs(grandTotal))}
                              </span>
                            </div>
                            
                          </div>
                        );
                      })()
                    ) : (
                      <div>
                        {/* Solo Match per-pair toggle for Pressures */}
                        {group.key === 'pressures' && !isHistorical && onBetConfigChange && (() => {
                          const pairKey = [player.id, rival.id].sort().join('_');
                          const pairOverride = betConfig.pressurePairOverrides?.[pairKey];
                          const globalOnlyMatch = betConfig.pressures.onlyMatch === true;
                          const currentOnlyMatch = pairOverride?.onlyMatch !== undefined
                            ? pairOverride.onlyMatch
                            : globalOnlyMatch;
                          const isOverridden = pairOverride?.onlyMatch !== undefined && pairOverride.onlyMatch !== globalOnlyMatch;
                          return (
                            <div className="flex items-center justify-between px-3 py-1.5 bg-muted/20 border-t border-border/20">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-muted-foreground">
                                  {currentOnlyMatch
                                    ? (betConfig.pressures?.continua ? 'Sin Presiones · Match Play 18' : 'Sin Presiones')
                                    : 'Sin Presiones'}
                                </span>
                                {isOverridden && (
                                  <span className="text-[9px] text-amber-500 bg-amber-500/10 rounded px-1">✱ este par</span>
                                )}
                              </div>
                              <Switch
                                className="scale-75"
                                checked={currentOnlyMatch}
                                onCheckedChange={(val) => {
                                  onBetConfigChange({
                                    ...betConfig,
                                    pressurePairOverrides: {
                                      ...(betConfig.pressurePairOverrides ?? {}),
                                      [pairKey]: {
                                        ...(betConfig.pressurePairOverrides?.[pairKey] ?? {}),
                                        onlyMatch: val,
                                      },
                                    },
                                  });
                                }}
                              />
                            </div>
                          );
                        })()}
                      {group.segments.map((segment) => {
                        const data = group.getSegmentData(segment.key);
                        
                        // For pressures, show "Even" ONLY when:
                        // - Amount is 0 AND
                        // - Only one bet was opened (initial) AND that bet is tied (+0)
                        // If there are multiple lines (e.g., +1 -1), show actual results even if net is $0
                        const isPressures = group.key === 'pressures';
                        const isMatchPlay = group.key === 'matchPlay';
                        const isSkins = group.key === 'skins';
                        const isPutts = group.key === 'putts';
                        const isBloques = group.key === 'bloques';
                        const isSkinsGrupal = group.key === 'skinsGrupal';
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
                        const matchPlayEvolution = isMatchPlay && !isHistorical
                          ? getMatchPlayEvolution(player, rival, confirmedScores, course, effectiveBetConfig, effectiveBetConfig.bilateralHandicaps, startingHole)
                          : null;

                        const pressureSegmentData = pressureEvolution?.[segmentType];
                        const skinsSegmentData = skinsEvolution?.[segmentType];
                        const matchPlaySegmentData = matchPlayEvolution?.total;

                        // Check if continua mode is active for this pair
                        const pairKeyEv = [player.id, rival.id].sort().join('_');
                        const pairOverrideEv = effectiveBetConfig.pressurePairOverrides?.[pairKeyEv];
                        const pairOnlyMatch = pairOverrideEv?.onlyMatch !== undefined
                          ? pairOverrideEv.onlyMatch
                          : effectiveBetConfig.pressures.onlyMatch === true;
                        const isContinua = pairOnlyMatch && effectiveBetConfig.pressures.continua === true;

                        // In HISTORICAL mode, NEVER recalculate — description from snapshot is the only source.
                        const pressureFallback = isPressures && !isHistorical ? (pressureSegmentData?.finalDisplay ?? '') : '';
                        const matchPlayFallback = isMatchPlay && !isHistorical ? (matchPlaySegmentData?.finalDisplay ?? '') : '';

                        // Add Carry label ONLY for Front 9 when main line finished tied (live mode only).
                        const descAlreadyHasCarry = pressureDesc.toLowerCase().includes('carry');
                        const carrySuffix = isPressures && !isHistorical && segmentType === 'front' && pressureSegmentData?.hasCarry && !descAlreadyHasCarry
                          ? ' (Carry)'
                          : '';

                        const pressureDisplayRaw = (pressureDesc || pressureFallback || '—').trim();
                        const pressureDisplay = pressureDisplayRaw === '—'
                          ? '—'
                          : `${pressureDisplayRaw}${carrySuffix}`;

                        const matchPlayDisplay = ((pressureDesc || matchPlayFallback || '—').trim()) || '—';


                        // Zoológico segments only show the animal label (no "X vs X" comparison).
                        // En histórico: Presiones muestra su description. El resto no tiene segments (segments=[]).
                        const isZoologico = group.key === 'zoologico';
                        const isHistPresion  = group.key === 'hist_presiones';
                        // En histórico solo Presiones tiene segments visibles y muestra description
                        const showScoreComparison = !isZoologico && !isSkinsGrupal && (!isHistorical || isHistPresion);
                        
                        const segmentContent = (
                          <div className="flex items-center gap-3">
                            {renderSegmentLabel(segment.label, 'text-sm text-muted-foreground')}
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
                                ) : isMatchPlay ? (
                                  <span className={cn(
                                    'font-semibold cursor-pointer hover:underline',
                                    data.amount > 0 ? 'text-green-600' : data.amount < 0 ? 'text-destructive' : 'text-muted-foreground'
                                  )}>
                                    {matchPlayDisplay}
                                  </span>
                                ) : isBloques ? (
                                  <span className={cn(
                                    'font-semibold cursor-pointer hover:underline',
                                    data.amount > 0 ? 'text-green-600' : data.amount < 0 ? 'text-destructive' : 'text-muted-foreground'
                                  )}>
                                    {data.description || '—'}
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
                            {((isPressures && (segmentType !== 'total' || isContinua)) || isSkins || isMatchPlay || isPutts || isBloques) && !isSkinsGrupal && !isHistorical ? (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="flex items-center gap-3 text-left">
                                    {segmentContent}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[95vw] max-w-md p-3" side="top">
                                  {isMatchPlay && matchPlayEvolution && (
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between gap-4">
                                        <span className="font-medium text-sm">Match Play 18</span>
                                        <span className="text-xs text-muted-foreground">
                                          {getShortName(player)} vs {getShortName(rival)}
                                        </span>
                                      </div>
                                      <div className="space-y-1">
                                        <div className="grid grid-cols-9 gap-1">
                                          {matchPlayEvolution.front.holes.map((hole) => (
                                            <div key={hole.holeNumber} className="flex flex-col items-center">
                                              <span className="text-[8px] text-muted-foreground">{hole.holeNumber}</span>
                                              <div className={cn(
                                                'w-full h-8 flex items-center justify-center text-[10px] font-bold rounded',
                                                hole.inactive ? 'bg-muted/30 text-muted-foreground/40' :
                                                hole.bets[0] > 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-700' :
                                                hole.bets[0] < 0 ? 'bg-red-100 dark:bg-red-900/30 text-destructive' :
                                                'bg-muted/50 text-muted-foreground'
                                              )}>
                                                {hole.display || 'AS'}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                        <div className="grid grid-cols-9 gap-1">
                                          {matchPlayEvolution.back.holes.map((hole) => (
                                            <div key={hole.holeNumber} className="flex flex-col items-center">
                                              <span className="text-[8px] text-muted-foreground">{hole.holeNumber}</span>
                                              <div className={cn(
                                                'w-full h-8 flex items-center justify-center text-[10px] font-bold rounded',
                                                hole.inactive ? 'bg-muted/30 text-muted-foreground/40' :
                                                hole.bets[0] > 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-700' :
                                                hole.bets[0] < 0 ? 'bg-red-100 dark:bg-red-900/30 text-destructive' :
                                                'bg-muted/50 text-muted-foreground'
                                              )}>
                                                {hole.display || 'AS'}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                      <div className="text-[10px] text-center pt-1 border-t border-border/50">
                                        Final: <span className="font-bold">{matchPlayEvolution.total.finalDisplay}</span>
                                      </div>
                                    </div>
                                  )}
                                  {isPressures && pressureSegmentData && (
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between gap-4">
                                        <span className="font-medium text-sm">
                                          {isContinua && segmentType === 'total' ? 'Match Play 18' : `Presiones ${segment.label}`}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                          {getShortName(player)} vs {getShortName(rival)}
                                        </span>
                                      </div>
                                      {/* Holes grid — for continua total, show 2 rows of 9 */}
                                      {isContinua && segmentType === 'total' && pressureEvolution ? (
                                        <div className="space-y-1">
                                          {/* Front 9 row */}
                                          <div className="grid grid-cols-9 gap-1">
                                            {pressureEvolution.front.holes.map((hole) => (
                                              <div key={hole.holeNumber} className="flex flex-col items-center">
                                                <span className="text-[8px] text-muted-foreground">{hole.holeNumber}</span>
                                                <div className={cn(
                                                  'w-full h-8 flex items-center justify-center text-[10px] font-bold rounded',
                                                  hole.inactive ? 'bg-muted/30 text-muted-foreground/40' :
                                                  hole.bets[0] > 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-700' :
                                                  hole.bets[0] < 0 ? 'bg-red-100 dark:bg-red-900/30 text-destructive' :
                                                  'bg-muted/50 text-muted-foreground'
                                                )}>
                                                  {hole.display || 'E'}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                          {/* Back 9 row */}
                                          <div className="grid grid-cols-9 gap-1">
                                            {pressureEvolution.back.holes.map((hole) => (
                                              <div key={hole.holeNumber} className="flex flex-col items-center">
                                                <span className="text-[8px] text-muted-foreground">{hole.holeNumber}</span>
                                                <div className={cn(
                                                  'w-full h-8 flex items-center justify-center text-[10px] font-bold rounded',
                                                  hole.inactive ? 'bg-muted/30 text-muted-foreground/40' :
                                                  hole.bets[0] > 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-700' :
                                                  hole.bets[0] < 0 ? 'bg-red-100 dark:bg-red-900/30 text-destructive' :
                                                  'bg-muted/50 text-muted-foreground'
                                                )}>
                                                  {hole.display || 'E'}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="overflow-x-auto">
                                          <div className="flex gap-0.5 min-w-max">
                                            {pressureSegmentData.holes.map((hole) => (
                                              <div key={hole.holeNumber} className="flex flex-col items-center">
                                                <span className="text-[8px] text-muted-foreground">{hole.holeNumber}</span>
                                                <div className={cn(
                                                  'w-8 h-7 flex items-center justify-center text-[11px] font-bold rounded',
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
                                      )}
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
                                                'w-8 h-7 flex items-center justify-center text-[11px] font-bold rounded',
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
                                        <span>{getShortName(player)}: <span className="font-bold text-green-600">{skinsSegmentData.totalSkinsA}</span></span>
                                        <span className="text-muted-foreground">vs</span>
                                        <span>{getShortName(rival)}: <span className="font-bold text-destructive">{skinsSegmentData.totalSkinsB}</span></span>
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
                                  {isPutts && (() => {
                                    // Build hole-by-hole putts comparison
                                    const [startH, endH] = segmentType === 'front' ? [1, 9] : segmentType === 'back' ? [10, 18] : [1, 18];
                                    const playerScores = allScores.get(player.id) || [];
                                    const rivalScores = allScores.get(rival.id) || [];
                                    const holes: Array<{ h: number; pP: number; pR: number }> = [];
                                    for (let h = startH; h <= endH; h++) {
                                      const pS = playerScores.find(s => s.confirmed && s.holeNumber === h && typeof s.putts === 'number');
                                      const rS = rivalScores.find(s => s.confirmed && s.holeNumber === h && typeof s.putts === 'number');
                                      if (pS && rS) holes.push({ h, pP: pS.putts || 0, pR: rS.putts || 0 });
                                    }
                                    if (holes.length === 0) return <span className="text-xs text-muted-foreground">Sin datos</span>;
                                    const totalP = holes.reduce((s, x) => s + x.pP, 0);
                                    const totalR = holes.reduce((s, x) => s + x.pR, 0);
                                    return (
                                      <div className="space-y-2">
                                        <div className="font-medium text-sm">Putts {segment.label}</div>
                                        <div className="overflow-x-auto">
                                          <div className="min-w-max">
                                            {/* Hole numbers row (with left spacer for name column) */}
                                            <div className="flex gap-0.5 items-center">
                                              <div className="w-16 shrink-0" />
                                              {holes.map(x => (
                                                <div key={x.h} className="w-7 text-center text-[8px] text-muted-foreground">{x.h}</div>
                                              ))}
                                              <div className="w-9 text-center text-[8px] text-muted-foreground font-semibold">Tot</div>
                                            </div>
                                            {/* Player row: name left + putts per hole + total */}
                                            <div className="flex gap-0.5 items-center mt-0.5">
                                              <div className="w-16 shrink-0 text-[10px] font-medium truncate pr-1">{getShortName(player)}</div>
                                              {holes.map(x => (
                                                <div key={x.h} className={cn(
                                                  'w-7 h-6 flex items-center justify-center text-[10px] font-bold rounded',
                                                  x.pP < x.pR ? 'bg-green-100 dark:bg-green-900/30 text-green-700' :
                                                  x.pP > x.pR ? 'bg-red-100 dark:bg-red-900/30 text-destructive' :
                                                  'bg-muted/50 text-muted-foreground'
                                                )}>
                                                  {x.pP}
                                                </div>
                                              ))}
                                              <div className={cn(
                                                'w-9 h-6 flex items-center justify-center text-[10px] font-bold rounded',
                                                totalP < totalR ? 'bg-green-100 dark:bg-green-900/30 text-green-700' :
                                                totalP > totalR ? 'bg-red-100 dark:bg-red-900/30 text-destructive' :
                                                'bg-muted/50 text-muted-foreground'
                                              )}>
                                                {totalP}
                                              </div>
                                            </div>
                                            {/* Rival row: name left + putts per hole + total */}
                                            <div className="flex gap-0.5 items-center mt-0.5">
                                              <div className="w-16 shrink-0 text-[10px] font-medium truncate pr-1">{getShortName(rival)}</div>
                                              {holes.map(x => (
                                                <div key={x.h} className={cn(
                                                  'w-7 h-6 flex items-center justify-center text-[10px] font-bold rounded',
                                                  x.pR < x.pP ? 'bg-green-100 dark:bg-green-900/30 text-green-700' :
                                                  x.pR > x.pP ? 'bg-red-100 dark:bg-red-900/30 text-destructive' :
                                                  'bg-muted/50 text-muted-foreground'
                                                )}>
                                                  {x.pR}
                                                </div>
                                              ))}
                                              <div className={cn(
                                                'w-9 h-6 flex items-center justify-center text-[10px] font-bold rounded',
                                                totalR < totalP ? 'bg-green-100 dark:bg-green-900/30 text-green-700' :
                                                totalR > totalP ? 'bg-red-100 dark:bg-red-900/30 text-destructive' :
                                                'bg-muted/50 text-muted-foreground'
                                              )}>
                                                {totalR}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                  {isBloques && (() => {
                                    const bloquesData = (group as any).bloquesDetail as BloqueResult[] | undefined;
                                    if (!bloquesData || bloquesData.length === 0) {
                                      return <span className="text-xs text-muted-foreground">Sin datos</span>;
                                    }
                                    // Resolve bilateral handicap (per pair) for net dot indicator
                                    const bh = effectiveBetConfig.bilateralHandicaps?.find(h =>
                                      (h.playerAId === player.id && h.playerBId === rival.id) ||
                                      (h.playerAId === rival.id && h.playerBId === player.id)
                                    );
                                    let hcpA = 0; let hcpB = 0;
                                    if (bh) {
                                      const aFirst = bh.playerAId === player.id;
                                      hcpA = aFirst ? bh.playerAHandicap : bh.playerBHandicap;
                                      hcpB = aFirst ? bh.playerBHandicap : bh.playerAHandicap;
                                    }
                                    const getStrokes = (pid: string, hole: number): number | null => {
                                      const arr = confirmedScores.get(pid) || [];
                                      const s = arr.find(x => x.holeNumber === hole);
                                      return s && s.strokes > 0 ? s.strokes : null;
                                    };
                                    const bloquesOv2 = getBetOverride('bloques');
                                    const effAmt2 = bloquesOv2?.amountOverride ?? effectiveBetConfig.bloques.amountPerBlock;
                                    const effCarry2 = bloquesOv2?.carryOverOnTie ?? effectiveBetConfig.bloques.carryOverOnTie;
                                    return (
                                      <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                          <span className="font-medium text-sm">Modalidad</span>
                                          <span className="text-[10px] text-muted-foreground">
                                            {`${effCarry2 ? 'Carry   ' : ''}${effectiveBetConfig.bloques.holesPerBlock} Hoyos   $${effAmt2} p/bloque`}
                                          </span>
                                        </div>
                                        <BloquesStrip
                                          playerA={player}
                                          playerB={rival}
                                          blocks={bloquesData}
                                          course={course}
                                          handicapA={hcpA}
                                          handicapB={hcpB}
                                          getStrokes={getStrokes}
                                          basePlayerId={basePlayerId}
                                          allPlayers={allPlayers}
                                          carryOverOnTie={effCarry2}
                                        />
                                        {onBetConfigChange && !isHistorical && (() => {
                                          const lastBlock = bloquesData[bloquesData.length - 1];
                                          if (!lastBlock) return null;
                                          const mult = lastBlock.multiplier ?? 1;
                                          const baseAmt = lastBlock.amountAtStake / Math.max(1, mult);
                                          const nextMult = mult >= 5 ? 1 : mult + 1;
                                          return (
                                            <button
                                              type="button"
                                              onClick={bumpBloquesLastBlockMultiplier}
                                              className={cn(
                                                'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-[11px] transition-colors border',
                                                mult > 1
                                                  ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-950/60 border-amber-300 dark:border-amber-800'
                                                  : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-transparent'
                                              )}
                                            >
                                              <span className="flex items-center gap-1.5">
                                                <Zap className={cn('h-3 w-3', mult > 1 && 'text-amber-500')} />
                                                <span>Último bloque: {mult}x</span>
                                                <span className={cn('tabular-nums', mult > 1 && 'font-semibold')}>· ${baseAmt * mult}</span>
                                              </span>
                                              <span className="text-[10px] opacity-80">
                                                {mult >= 5 ? '→ 1x · Reset' : `→ ${nextMult}x · $${baseAmt * nextMult}`}
                                              </span>
                                            </button>
                                          );
                                        })()}
                                      </div>
                                    );
                                  })()}
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
                              {`${data.amount >= 0 ? '+$' : '-$'}${fmtMoney(Math.abs(data.amount))}`}
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
                      })}
                      </div>
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
                    total: byLabel('Putts Total') ?? (betConfig.putts?.totalAmount ?? 0),
                  };
                case 'matchPlay':
                  return {
                    total: byLabel('Match Play') ?? ((betConfig as any).matchPlay?.amount ?? 50),
                  };
                case 'units': {
                  const unitOverride = betConfig.betOverrides?.find(
                    o => o.betType === 'Unidades' &&
                      ((o.playerAId === player.id && o.playerBId === rival.id) ||
                       (o.playerAId === rival.id && o.playerBId === player.id))
                  );
                  const isInverted = unitOverride?.playerAId === rival.id;
                  return {
                    total: unitOverride?.amountOverride ?? betConfig.units.valuePerPoint,
                    unitsAdvantage: isInverted
                      ? -(unitOverride?.unitsAdvantage ?? 0)
                      : (unitOverride?.unitsAdvantage ?? 0),
                  };
                }
                case 'bloques': {
                  const bloquesOverride = betConfig.betOverrides?.find(
                    o => (o.betType === 'Bloques' || o.betType === 'bloques') &&
                      ((o.playerAId === player.id && o.playerBId === rival.id) ||
                       (o.playerAId === rival.id && o.playerBId === player.id))
                  );
                  return {
                    total: bloquesOverride?.amountOverride ?? betConfig.bloques?.amountPerBlock ?? 100,
                    carryOverOnTie: bloquesOverride?.carryOverOnTie ?? betConfig.bloques?.carryOverOnTie,
                  };
                }
                case 'oyeses':
                  return {
                    total: byLabel('Oyes') ?? betConfig.oyeses.amount,
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
                case 'units': {
                  upsert('Unidades', overrides.total);
                  // Also persist unitsAdvantage on the same override row
                  if (overrides.unitsAdvantage !== undefined) {
                    const existingUnitIdx = nextOverrides.findIndex(
                      o => o.betType === 'Unidades' &&
                        ((o.playerAId === player.id && o.playerBId === rival.id) ||
                         (o.playerAId === rival.id && o.playerBId === player.id))
                    );
                    if (existingUnitIdx >= 0) {
                      // If stored with reversed pair order, negate before saving
                      const isInverted = nextOverrides[existingUnitIdx].playerAId === rival.id;
                      nextOverrides[existingUnitIdx] = {
                        ...nextOverrides[existingUnitIdx],
                        unitsAdvantage: isInverted ? -overrides.unitsAdvantage : overrides.unitsAdvantage,
                      };
                    } else if (overrides.unitsAdvantage !== 0) {
                      nextOverrides.push({
                        playerAId: player.id,
                        playerBId: rival.id,
                        betType: 'Unidades',
                        enabled: true,
                        unitsAdvantage: overrides.unitsAdvantage,
                      });
                    }
                  }
                  break;
                }
                case 'manchas':
                  upsert('Manchas', overrides.total);
                  break;
                case 'culebras':
                  upsert('Culebras', overrides.total);
                  break;
                case 'pinguinos':
                  upsert('Pinguinos', overrides.total);
                  break;
                case 'matchPlay':
                  upsert('Match Play', overrides.total);
                  break;
                case 'bloques': {
                  upsert('Bloques', overrides.total);
                  if (overrides.carryOverOnTie !== undefined) {
                    const idx = nextOverrides.findIndex(
                      o => (o.betType === 'Bloques' || o.betType === 'bloques') &&
                        ((o.playerAId === player.id && o.playerBId === rival.id) ||
                         (o.playerAId === rival.id && o.playerBId === player.id))
                    );
                    if (idx >= 0) {
                      nextOverrides[idx] = { ...nextOverrides[idx], carryOverOnTie: overrides.carryOverOnTie };
                    } else {
                      nextOverrides.push({
                        playerAId: player.id,
                        playerBId: rival.id,
                        betType: 'Bloques',
                        enabled: true,
                        carryOverOnTie: overrides.carryOverOnTie,
                      });
                    }
                  }
                  break;
                }
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

export { BilateralDetail };
export type { BilateralDetailProps };
