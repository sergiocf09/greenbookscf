import React, { useState, useEffect, useCallback, useRef, useMemo, useReducer, lazy, Suspense } from 'react';
import { Scorecard } from '@/components/scorecard/Scorecard';
import { CloneRoundData, FullCloneRoundData } from '@/components/RoundHistory';
import { AddPlayerFromScorecardDialog, type AddGuestPayload } from '@/components/scorecard/AddPlayerFromScorecardDialog';
import { LeaderboardsInlineView } from '@/components/leaderboards/LeaderboardsInlineView';
import { LeaderboardDetailInline } from '@/components/leaderboards/LeaderboardDetailInline';
import { TeamsCupDetailInline } from '@/components/leaderboards/TeamsCupDetailInline';
import { MultiDayLeaderboardDetail } from '@/components/leaderboards/MultiDayLeaderboardDetail';

import { RankingsInlineView } from '@/components/rankings/RankingsInlineView';
const StatsInlineView = lazy(() => import('@/pages/Stats').then(m => ({ default: m.StatsInlineView })));
const MoneyRankingDetail = lazy(() => import('@/pages/MoneyRankingDetail'));
import { ScoringFAB } from '@/components/scoring/ScoringFAB';
import { Player, PlayerScore, BetConfig, GolfCourse, HoleInfo, PlayerGroup } from '@/types/golf';
import { defaultMarkerState } from '@/types/golf';
import { defaultBetConfig } from '@/components/setup/BetSetup';
import { useGolfCourses } from '@/hooks/useGolfCourses';
import { useRoundManagement } from '@/hooks/useRoundManagement';
import { useRealtimeScores } from '@/hooks/useRealtimeScores';
import { useBetConfigPersistence } from '@/hooks/useBetConfigPersistence';
import { useRoundHandicaps } from '@/hooks/useRoundHandicaps';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Settings, Trophy, Loader2, Dices, RefreshCw } from 'lucide-react';
import CoinDollarIcon from '@/components/icons/CoinDollarIcon';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { useAuth } from '@/contexts/AuthContext';
import { useRound } from '@/contexts/RoundContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { devError, devLog, devWarn } from '@/lib/logger';
import { expandMarkerStateToRows } from '@/lib/markerPersistence';
import { initialsFromPlayerName, validatePlayerName } from '@/lib/playerInput';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppDialogs } from '@/components/layout/AppDialogs';
import { useCrossBets } from '@/hooks/useCrossBets';
import { CrossBetInvitationsSheet } from '@/components/crossbet/CrossBetInvitationsSheet';

import { SetupView } from '@/components/views/SetupView';
import { PlayViews } from '@/components/views/PlayViews';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { ProfileDialog } from '@/components/ProfileDialog';
import { UpgradeModal } from '@/components/UpgradeModal';
import { RoundShareImage, RoundShareImageProps } from '@/components/share/RoundShareImage';
import { Friend } from '@/hooks/useFriends';
import { GuestConversionScreen } from '@/components/guest/GuestRoundClosedListener';
import { useWolf } from '@/hooks/useWolf';
import { useSixes } from '@/hooks/useSixes';
import { useVegas } from '@/hooks/useVegas';
import { useNines } from '@/hooks/useNines';
import { useAttestation } from '@/hooks/useAttestation';
import { useRoundAuditLog } from '@/hooks/useRoundAuditLog';
import { useAutoClose } from '@/hooks/useAutoClose';
import { AttestationSheet } from '@/components/attestation/AttestationSheet';
import { RoundAuditSheet } from '@/components/audit/RoundAuditSheet';



type AppView = 'setup' | 'betsetup' | 'scoring' | 'scorecard' | 'bets' | 'handicaps' | 'leaderboards' | 'rankings' | 'stats';
const TAB_ORDER: AppView[] = ['setup', 'betsetup', 'handicaps', 'scorecard', 'bets'];

// --- Dialog state reducer ---
type DialogName =
  | 'profile' | 'history' | 'balances' | 'handicap' | 'handicapHistory'
  | 'scorecard' | 'share' | 'addPlayer' | 'leaderboard' | 'linkLeaderboard'
  | 'handicapMatrix' | 'closeAttempt' | 'closeConfirm' | 'pendingRound'
  | 'friends' | 'addFromFriends' | 'onboarding' | 'help' | 'profileMenuHelp'
  | 'roundShare' | 'attestation' | 'auditLog' | 'crossInvitations';

type DialogState = Record<DialogName, boolean>;

const DIALOGS_INITIAL: DialogState = {
  profile: false, history: false, balances: false, handicap: false,
  handicapHistory: false, scorecard: false, share: false, addPlayer: false,
  leaderboard: false, linkLeaderboard: false, handicapMatrix: false,
  closeAttempt: false, closeConfirm: false, pendingRound: false,
  friends: false, addFromFriends: false, onboarding: false, help: false,
  profileMenuHelp: false, roundShare: false, attestation: false, auditLog: false,
  crossInvitations: false,
};


function dialogsReducer(state: DialogState, action: { name: DialogName; open: boolean }): DialogState {
  if (state[action.name] === action.open) return state;
  return { ...state, [action.name]: action.open };
}

const Index = () => {
  const navigate = useNavigate();
  const { user, profile, signOut, updateProfile } = useAuth();
  const {
    players, setPlayers,
    selectedCourseId, setSelectedCourseId,
    betConfig, setBetConfig,
    currentHole, setCurrentHole,
    scores, setScores,
    confirmedHoles, setConfirmedHoles,
    currentBetSummaries, setCurrentBetSummaries,
    teeColor, setTeeColor,
    startingHole, setStartingHole,
    playerGroups, setPlayerGroups,
    quickScorePlayer, setQuickScorePlayer,
  } = useRound();
  const { theme, setTheme } = useTheme();

  const [dialogs, dispatchDialog] = useReducer(dialogsReducer, DIALOGS_INITIAL);
  const openDialog = (name: DialogName) => dispatchDialog({ name, open: true });
  const closeDialog = (name: DialogName) => dispatchDialog({ name, open: false });
  const setDialog = (name: DialogName, open: boolean) => dispatchDialog({ name, open });

  const [view, setView] = useState<AppView>('setup');

  // Keep an always-fresh reference to scores to avoid stale closures when persisting confirmations.
  const scoresRef = useRef<Map<string, PlayerScore[]>>(new Map());
  // Guard against race conditions when persisting new players concurrently
  const persistingPlayerIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    scoresRef.current = scores;
  }, [scores]);
  const [preselectedLeaderboardId, setPreselectedLeaderboardId] = useState<string | null>(null);
  const [leaderboardDetailId, setLeaderboardDetailId] = useState<string | null>(null);
  const [leaderboardDetailType, setLeaderboardDetailType] = useState<'standard' | 'teams_cup' | 'multi_day'>('standard');
  const [isRoundLinkedToLeaderboard, setIsRoundLinkedToLeaderboard] = useState(false);
  const [linkedLeaderboards, setLinkedLeaderboards] = useState<Array<{ id: string; name: string; code: string; competition_type: string }>>([]);
  const [rankingDetailId, setRankingDetailId] = useState<string | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [roundShareData, setRoundShareData] = useState<Omit<RoundShareImageProps, 'open' | 'onClose'> | null>(null);
  const [addFriendsTargetGroupId, setAddFriendsTargetGroupId] = useState<string | null>(null);
  const [pendingRoundSummaries, setPendingRoundSummaries] = useState<
    Map<string, { courseName: string; holesPlayed: number; totalStrokes: number }>
  >(new Map());
  const [historicalScorecardData, setHistoricalScorecardData] = useState<{
    roundId: string;
    courseId: string;
    players: any[];
    teeColor: string;
    date: string;
  } | null>(null);

  // Upgrade modal state
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<'create_round' | 'history' | 'share' | 'leaderboard'>('create_round');


  // PERF: no cargues el catálogo de campos hasta que el usuario decida qué hacer con las rondas pendientes.
  const [enableCourseCatalog, setEnableCourseCatalog] = useState(false);
  const { getCourseById } = useGolfCourses({ enabled: enableCourseCatalog });
  const course = selectedCourseId ? getCourseById(selectedCourseId) : null;

  // Swipe navigation between tabs
  const swipeHandlers = useSwipeNavigation(TAB_ORDER, view as AppView, (v) => {
    setView(v);
    if (v !== 'leaderboards') setLeaderboardDetailId(null);
    if (v !== 'rankings') setRankingDetailId(null);
  });

  // Audit log: ref-based wrapper so hooks declared before useRoundAuditLog can still log events.
  const logEventRef = useRef<((eventType: string, payload: Record<string, any>, targetPlayerId?: string | null) => Promise<void>) | null>(null);
  const logEvent = useCallback(async (eventType: string, payload: Record<string, any>, targetPlayerId?: string | null) => {
    if (logEventRef.current) await logEventRef.current(eventType, payload, targetPlayerId);
  }, []);

  // Round management hook with restoration

  const {
    roundState,
    setRoundState,
    isLoading,
    isClosing,
    isRestoring,
    isRoundStarted,
    pendingRound,
    pendingRounds,
    roundPlayerIds,
    setRoundPlayerIds,
    createRound,
    startRound: startRoundInDb,
    closeScorecard,
    addPlayerToRound,
    setRoundDate,
    copyShareLink,
    getShareableLink,
    lastCloseReport,
    resetRoundForReclose,
  } = useRoundManagement({
    players,
    playerGroups,
    setPlayers,
    scores,
    setScores,
    setConfirmedHoles,
    betConfig,
    setBetConfig,
    course,
    setSelectedCourseId,
    setTeeColor,
    setStartingHole,
    getCourseById,
    setPlayerGroups,
    logEvent,
  });

  // Auto-close abandoned rounds (runs once at login)
  useAutoClose((roundId) => {
    if (roundState?.id === roundId) {
      setRoundState(null);
    }
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const { roundId, isComplete } = (e as CustomEvent).detail;
      if (isComplete && roundState?.id === roundId && roundState?.status === 'in_progress') {
        if (!isClosing) {
          closeScorecard([], undefined);
        }
      }
    };
    window.addEventListener('greenbook:auto-close-round', handler);
    return () => window.removeEventListener('greenbook:auto-close-round', handler);
  }, [roundState, isClosing, closeScorecard]);




  // Sprint 3 bet hooks
  const wolf  = useWolf(roundState?.id ?? null, players);
  const sixes = useSixes(roundState?.id ?? null, players);
  const vegas = useVegas(roundState?.id ?? null);
  const nines = useNines(roundState?.id ?? null, players);

  // Scores Attestation (per-player model)
  const { pendingRounds: pendingAttestations, pendingPlayersCount, isAttesting, attestPlayer } = useAttestation(profile?.id ?? null);

  // Round audit log (only fetches when current user is round admin)
  const isCurrentUserRoundAdmin =
    roundState.organizerProfileId === profile?.id ||
    players.some(p => p.profileId === profile?.id && p.isAdmin);

  const {
    entries: auditEntries,
    isLoading: isAuditLoading,
    refetch: refetchAudit,
    logEvent: realLogEvent,
  } = useRoundAuditLog(roundState.id, isCurrentUserRoundAdmin);

  const {
    pendingInvitations: crossInvitations,
    pendingCount: crossInvitationsCount,
    isAccepting: isAcceptingCross,
    isDeclining: isDecliningCross,
    acceptInvitation: acceptCrossInvitation,
    declineInvitation: declineCrossInvitation,
    crossBets,
    refetchCrossBets,
    sendInvitation,
    isSending,
    sendError,
    updateCrossBetConfig,
  } = useCrossBets(roundState.id);

  const [crossBetTarget, setCrossBetTarget] = useState<{
    profileId: string; name: string; initials: string; color: string;
    courseName: string; holesPlayed: number;
  } | null>(null);

  useEffect(() => {
    logEventRef.current = realLogEvent;
  }, [realLogEvent]);


  // Sprint 3: sync betConfig setup → dedicated hooks
  useEffect(() => {
    if (!roundState?.id) return;
    if (betConfig.wolfSetup?.enabled) {
      // Guard: no guardar config vacía si players aún no cargaron
      if (players.length < 4) return;
      // Participantes activos en la matriz para Loba
      const wolfExcluded = betConfig.parejasExcluded?.wolf ?? [];
      const wolfParticipantIds = players
        .map(p => p.id)
        .filter(id => !wolfExcluded.includes(id));

      // playerOrder: usar el ya guardado en wolfSetup si aplica a los mismos jugadores
      const savedOrder: string[] = betConfig.wolfSetup.playerOrder ?? [];
      const orderIsValid =
        savedOrder.length === wolfParticipantIds.length &&
        wolfParticipantIds.every(id => savedOrder.includes(id));

      const playerOrder = orderIsValid
        ? savedOrder
        : [...wolfParticipantIds].sort(() => Math.random() - 0.5);

      wolf.saveConfig({
        amountPerHole:  betConfig.wolfSetup.amountPerHole ?? 100,
        scoringMode:    betConfig.wolfSetup.scoringMode ?? 'lowBall',
        useHandicap:    betConfig.wolfSetup.useHandicap ?? true,
        timing:         betConfig.wolfSetup.timing ?? 'B',
        carryover:      betConfig.wolfSetup.carryover ?? true,
        playerOrder,
        participantIds: wolfParticipantIds,
        playerHandicaps: betConfig.wolfSetup.playerHandicaps ?? [],
      });
    }
    const firstSixes = betConfig.sixesBets?.[0];
    if (firstSixes && !sixes.isActive) {
      sixes.saveConfig({
        scoringMode:      firstSixes.scoringMode ?? 'lowBall',
        cobro:            firstSixes.cobro ?? 'per_hole',
        amount:           firstSixes.amount ?? 100,
        useHandicap:      firstSixes.useHandicap ?? true,
        usePerSetAmounts: firstSixes.usePerSetAmounts ?? false,
        set1Amount:       firstSixes.set1Amount,
        set2Amount:       firstSixes.set2Amount,
        set3Amount:       firstSixes.set3Amount,
      });
      if ((firstSixes.sets?.length ?? 0) > 0) {
        sixes.saveSets(firstSixes.sets);
      }
    }
    const firstVegas = betConfig.vegasBets?.[0];
    if (firstVegas) {
      vegas.saveConfig({
        valuePerPoint:     firstVegas.valuePerPoint ?? 10,
        useHandicap:       firstVegas.useHandicap ?? false,
        birdieMultiplier:  firstVegas.birdieMultiplier ?? false,
        variant:           firstVegas.variant ?? 'fixed',
        playerAId:         firstVegas.playerAId ?? '',
        playerBId:         firstVegas.playerBId ?? '',
        playerCId:         firstVegas.playerCId ?? '',
        playerDId:         firstVegas.playerDId ?? '',
        useSegmentAmounts: firstVegas.useSegmentAmounts ?? false,
        frontAmount:       firstVegas.frontAmount,
        backAmount:        firstVegas.backAmount,
        set1Amount:        firstVegas.set1Amount,
        set2Amount:        firstVegas.set2Amount,
        set3Amount:        firstVegas.set3Amount,
      });
    }
    const firstNines = betConfig.ninesBets?.[0];
    if (firstNines && firstNines.playerIds.length >= 3) {
      nines.saveConfig({
        valuePerPoint: firstNines.valuePerPoint ?? 10,
        playerIds:     firstNines.playerIds.slice(0, 3),
        playerHandicaps: firstNines.playerHandicaps,
      });
    }
  }, [
    roundState?.id,
    players.length,
    betConfig.wolfSetup?.enabled,
    betConfig.wolfSetup?.amountPerHole,
    betConfig.wolfSetup?.scoringMode,
    betConfig.wolfSetup?.timing,
    betConfig.wolfSetup?.carryover,
    JSON.stringify(betConfig.wolfSetup?.playerOrder),
    JSON.stringify(betConfig.wolfSetup?.playerHandicaps),
    JSON.stringify(betConfig.parejasExcluded?.wolf),
    betConfig.sixesBets?.length,
    JSON.stringify(betConfig.vegasBets?.[0]),
    JSON.stringify(betConfig.ninesBets?.[0]),
  ]);

  // Reset all round state to prepare for a new round (called after successful close)
  const resetToNewRound = useCallback(() => {
    // Mark this round as closed so auto-restore won't resurrect it
    if (roundState.id) {
      localStorage.setItem(`round_closed_${roundState.id}`, '1');
    }
    setRoundState({
      id: null,
      status: 'setup',
      date: new Date(),
      courseId: null,
      teeColor: 'white',
      startingHole: 1,
      groupId: null,
      organizerProfileId: null,
    });
    setPlayers([]);
    setScores(new Map());
    setConfirmedHoles(new Set());
    setSelectedCourseId(null);
    setBetConfig(defaultBetConfig);
    setPlayerGroups([]);
    setRoundPlayerIds(new Map());
    setCurrentBetSummaries([]);
    setView('setup');
    setCurrentHole(1);
    setRoundShareData(null);
    setLinkedLeaderboards([]);
    setLeaderboardDetailId(null);
    setIsRoundLinkedToLeaderboard(false);
  }, [roundState.id, setRoundState, setPlayers, setScores, setConfirmedHoles, setSelectedCourseId, setBetConfig, setPlayerGroups, setRoundPlayerIds]);

  // Onboarding check – first time user
  useEffect(() => {
    if (!profile) return;
    if (!localStorage.getItem('gbcf_onboarding_done')) {
      openDialog('onboarding');
    }
  }, [profile]);

  // Retomar join de leaderboard pendiente si venía de un link compartido
  useEffect(() => {
    const pendingCode = sessionStorage.getItem('pendingLeaderboardCode');
    if (pendingCode) {
      sessionStorage.removeItem('pendingLeaderboardCode');
      navigate(`/leaderboards/join/${pendingCode}`, { replace: true });
    }
  }, [navigate]);

  // Upgrade modal via custom event
  useEffect(() => {
    const upgradeHandler = (e: Event) => {
      const reason = (e as CustomEvent).detail?.reason ?? 'create_round';
      setUpgradeReason(reason);
      setShowUpgrade(true);
    };
    window.addEventListener('greenbook:show-upgrade', upgradeHandler);

    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      toast.success('¡Bienvenido a GreenBook Pro! Tu suscripción está activa.');
      window.history.replaceState({}, '', '/');
    }
    if (params.get('payment') === 'cancelled') {
      toast.info('Pago cancelado. Puedes suscribirte cuando quieras.');
      window.history.replaceState({}, '', '/');
    }

    return () => window.removeEventListener('greenbook:show-upgrade', upgradeHandler);
  }, []);

  // Habilita la carga del catálogo de campos sólo después de resolver el flujo de rondas pendientes.
  useEffect(() => {
    if (!profile) return;

    const hasRoundContext = Boolean(roundState.id) || Boolean(selectedCourseId) || isRoundStarted;
    if (isRestoring && !hasRoundContext) return;

    const shouldBlockForPending = dialogs.pendingRound && pendingRounds.length > 0 && !isRoundStarted;
    setEnableCourseCatalog(hasRoundContext || !shouldBlockForPending);
  }, [profile, isRestoring, dialogs.pendingRound, pendingRounds.length, isRoundStarted, roundState.id, selectedCourseId]);

  // Persist course/tee/starting-hole changes to DB when a round already exists
  useEffect(() => {
    if (!roundState.id || isRestoring) return;
    if (!selectedCourseId) return;

    const updates: { course_id?: string; tee_color?: string; starting_hole?: number } = {};
    if (selectedCourseId !== roundState.courseId) updates.course_id = selectedCourseId;
    if (teeColor !== roundState.teeColor) updates.tee_color = teeColor;
    if (startingHole !== roundState.startingHole) updates.starting_hole = startingHole;

    if (Object.keys(updates).length === 0) return;

    supabase
      .from('rounds')
      .update(updates)
      .eq('id', roundState.id)
      .then(({ error }) => {
        if (error) {
          devError('Error persisting course/tee/starting-hole change:', error);
        } else {
          setRoundState(prev => ({
            ...prev,
            ...(updates.course_id ? { courseId: selectedCourseId } : {}),
            ...(updates.tee_color ? { teeColor } : {}),
            ...(updates.starting_hole ? { startingHole } : {}),
          }));
        }
      });
  }, [roundState.id, isRestoring, selectedCourseId, teeColor, startingHole]);

  // Persist bet config (overrides, handicaps bilaterales, carritos cancelados, etc.) to backend
  const { loadBetConfig, saveBetConfig, isLoaded: isBetConfigLoaded } = useBetConfigPersistence({
    roundId: roundState.id,
    betConfig,
    setBetConfig,
    logEvent,
  });


  // Combine players from all groups for handicap resolution across groups
  const allPlayersForBets = useMemo(() => {
    const mainGroupId = roundState?.groupId;
    const mainWithGroup = players.map(p => ({
      ...p,
      groupId: p.groupId || mainGroupId || undefined,
    }));
    const mainPlayerIds = new Set(players.map(p => p.id));
    const additionalPlayers = playerGroups
      .flatMap(g => g.players.map(p => ({ ...p, groupId: g.id })))
      .filter(p => !mainPlayerIds.has(p.id));
    return [...mainWithGroup, ...additionalPlayers];
  }, [players, playerGroups, roundState?.groupId]);

  // Bilateral handicaps hook - NEW dedicated table for handicap persistence
  const {
    isLoading: isLoadingHandicaps,
    isLoaded: isHandicapsLoaded,
    getStrokesForLocalPair,
    getLocalPairStrokeState,
    setStrokesForLocalPair,
    initializeHandicapsForNewPlayer,
    getBilateralHandicapsForEngine,
  } = useRoundHandicaps({
    roundId: roundState.id,
    players: allPlayersForBets,
    roundPlayerIds,
    logEvent,
    // Persist the matrix defaults automatically while the round is open, so all
    // bets (bilateral, coneja, etc.) read confirmed handicaps even if the
    // organizer never edits the matrix.
    autoSeed: roundState.status !== 'completed',
  });


  // Ensure betConfig is loaded at least once for this round so debounced saves are enabled.
  useEffect(() => {
    if (!roundState.id) return;
    void loadBetConfig();
  }, [roundState.id, loadBetConfig]);

  // Check if current round is linked to the selected leaderboard
  useEffect(() => {
    if (!leaderboardDetailId || !roundState.id) {
      setIsRoundLinkedToLeaderboard(false);
      return;
    }
    const checkLink = async () => {
      const { data } = await supabase
        .from('leaderboard_rounds')
        .select('id')
        .eq('leaderboard_id', leaderboardDetailId)
        .eq('round_id', roundState.id)
        .maybeSingle();
      setIsRoundLinkedToLeaderboard(!!data);
    };
    checkLink();
  }, [leaderboardDetailId, roundState.id]);

  // Always resolve the correct competition_type from DB when a leaderboard detail
  // is opened. This protects against stale/missing type values from any entry
  // point (banner, list, deep-link, restored session) and guarantees that
  // teams_cup leaderboards render TeamsCupDetailInline instead of the
  // standard view.
  useEffect(() => {
    if (!leaderboardDetailId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('leaderboard_events')
        .select('competition_type')
        .eq('id', leaderboardDetailId)
        .maybeSingle();
      if (cancelled || !data) return;
      const ct = (data as any).competition_type;
      const resolved: 'standard' | 'teams_cup' | 'multi_day' =
        ct === 'teams_cup' ? 'teams_cup' : ct === 'multi_day' ? 'multi_day' : 'standard';
      setLeaderboardDetailType(prev => (prev === resolved ? prev : resolved));
    })();
    return () => { cancelled = true; };
  }, [leaderboardDetailId]);

  // Detect ALL leaderboards the current round is linked to (for quick-access banner)
  useEffect(() => {
    if (!roundState.id) {
      setLinkedLeaderboards([]);
      return;
    }
    const fetchLinked = async () => {
      const { data: links } = await supabase
        .from('leaderboard_rounds')
        .select('leaderboard_id')
        .eq('round_id', roundState.id);
      if (!links || links.length === 0) {
        setLinkedLeaderboards([]);
        return;
      }
      const ids = links.map(l => l.leaderboard_id);
      const { data: evs } = await supabase
        .from('leaderboard_events')
        .select('id, name, code, competition_type')
        .in('id', ids);
      if (evs && evs.length > 0) {
        setLinkedLeaderboards(
          evs.map((ev: any) => ({
            id: ev.id,
            name: ev.name,
            code: ev.code,
            competition_type: ev.competition_type || 'standard',
          }))
        );
      } else {
        setLinkedLeaderboards([]);
      }
    };
    fetchLinked();
  }, [roundState.id, isRoundLinkedToLeaderboard]);

  // Carritos sanitization removed — incomplete teams are handled at calculation/render time.

  // Auto-restore is now handled directly by useRoundManagement (no page reload needed).
  // The old window.location.reload() pattern was fragile and caused intermittent failures.

  // Persist players when round is created (players added before round creation)
  const persistedPlayersForRoundRef = useRef<string | null>(null);
  useEffect(() => {
    if (!roundState.id || !roundState.groupId) return;
    if (isRestoring) return;
    if (persistedPlayersForRoundRef.current === roundState.id) return;
    
    const persistUnmappedPlayers = async () => {
      // Mark as persisted IMMEDIATELY (synchronously) to prevent re-entrant
      // executions when addPlayerToRound triggers setPlayers → re-render → re-effect.
      persistedPlayersForRoundRef.current = roundState.id;

      for (const player of players) {
        // Skip if already mapped (already persisted)
        if (roundPlayerIds.has(player.id)) continue;
        if (player.profileId && roundPlayerIds.has(player.profileId)) continue;

        // Use the concurrency guard to avoid double-persisting the same player
        if (persistingPlayerIdsRef.current.has(player.id)) continue;
        persistingPlayerIdsRef.current.add(player.id);

        try {
          // Persist this player (addPlayerToRound handles both registered and guest players)
          await addPlayerToRound(player, roundState.groupId!);
        } finally {
          persistingPlayerIdsRef.current.delete(player.id);
        }
      }
    };
    
    void persistUnmappedPlayers();
  }, [roundState.id, roundState.groupId, players, roundPlayerIds, addPlayerToRound, isRestoring]);

  useEffect(() => {
    let cancelled = false;

    const loadPendingRoundsSummaries = async () => {
      if (!pendingRounds?.length || !profile) {
        setPendingRoundSummaries(new Map());
        return;
      }

      try {
        const roundIds = pendingRounds.map((r) => r.roundId);

        const { data: myRps, error: rpErr } = await supabase
          .from('round_players')
          .select('id, round_id')
          .eq('profile_id', profile.id)
          .in('round_id', roundIds);

        if (cancelled) return;
        if (rpErr) throw rpErr;

        const myRpByRoundId = new Map<string, string>();
        (myRps || []).forEach((rp: any) => {
          if (rp?.round_id && rp?.id) myRpByRoundId.set(rp.round_id, rp.id);
        });

        const rpIds = Array.from(myRpByRoundId.values());
        const { data: myScores, error: scoresErr } = rpIds.length
          ? await supabase
              .from('hole_scores')
              .select('round_player_id, hole_number, strokes')
              .in('round_player_id', rpIds)
          : { data: [], error: null };

        if (cancelled) return;
        if (scoresErr) throw scoresErr;

        const scoresByRpId = new Map<string, Array<{ hole_number: number; strokes: number | null }>>();
        (myScores || []).forEach((s: any) => {
          const list = scoresByRpId.get(s.round_player_id) ?? [];
          list.push({ hole_number: s.hole_number, strokes: s.strokes });
          scoresByRpId.set(s.round_player_id, list);
        });

        const next = new Map<string, { courseName: string; holesPlayed: number; totalStrokes: number }>();
        for (const r of pendingRounds) {
          const courseName = r.courseName ?? 'Campo';
          const myRpId = myRpByRoundId.get(r.roundId);
          const list = myRpId ? scoresByRpId.get(myRpId) ?? [] : [];
          const holesPlayed = list.filter((s) => typeof s.strokes === 'number' && Number.isFinite(s.strokes)).length;
          const totalStrokes = list.reduce(
            (sum, s) => sum + (typeof s.strokes === 'number' && Number.isFinite(s.strokes) ? s.strokes : 0),
            0
          );
          next.set(r.roundId, { courseName, holesPlayed, totalStrokes });
        }

        setPendingRoundSummaries(next);
      } catch (e) {
        devError('Error loading pending round summary:', e);
        if (!cancelled) setPendingRoundSummaries(new Map());
      }
    };

    void loadPendingRoundsSummaries();
    return () => {
      cancelled = true;
    };
  }, [pendingRounds, profile]);

  // Real-time score synchronization
  useRealtimeScores({
    roundId: roundState.id,
    players,
    course,
    roundPlayerIds,
    setScores,
    setConfirmedHoles,
  });

  // Track if we've done initial navigation after restore
  const [hasInitialNavigated, setHasInitialNavigated] = useState(false);

  // Auto-navigate after restore ONLY once.
  // We prefer taking the user to the Dashboard (bets) once the round is fully hydrated
  // (players + course + scores). This avoids landing on empty screens after login.
  useEffect(() => {
    if (hasInitialNavigated) return;
    if (isRestoring) return;

    const isHydrated = Boolean(roundState.id) && Boolean(course) && players.length > 0;

    if (isHydrated) {
      setView('bets');
      setHasInitialNavigated(true);
      return;
    }

    // If there isn't enough data yet (e.g., course still loading), don't force a view.
    // We'll re-run until hydrated, then lock navigation.
  }, [hasInitialNavigated, isRestoring, roundState.id, course, players.length]);

  // Function to start a new round (reset everything)
  const startNewRound = useCallback(() => {
    // Reset all state
    setPlayers([]);
    setScores(new Map());
    setConfirmedHoles(new Set());
    setSelectedCourseId(null);
    setBetConfig(defaultBetConfig);
    setCurrentHole(1);
    setPlayerGroups([]);
    setHasInitialNavigated(true); // Prevent auto-navigate
    setView('setup');
    
    // Force page reload to reset hook state
    window.location.reload();
  }, []);

  // Clone round: pre-populate setup with historical data
  const handleCloneRound = useCallback((data: CloneRoundData) => {
    // Close history dialog
    closeDialog('history');
    
    // Pre-populate course
    setSelectedCourseId(data.courseId);
    setTeeColor(data.teeColor as 'blue' | 'white' | 'yellow' | 'red');
    setStartingHole(data.startingHole);
    
    // Merge bet config with defaults
    setBetConfig(prev => ({
      ...defaultBetConfig,
      ...data.betConfig,
      medal: { ...defaultBetConfig.medal, ...data.betConfig?.medal },
      pressures: { ...defaultBetConfig.pressures, ...data.betConfig?.pressures },
      skins: { ...defaultBetConfig.skins, ...data.betConfig?.skins },
      caros: { ...defaultBetConfig.caros, ...data.betConfig?.caros },
      units: { ...defaultBetConfig.units, ...data.betConfig?.units },
      manchas: { ...defaultBetConfig.manchas, ...data.betConfig?.manchas },
      culebras: { ...defaultBetConfig.culebras, ...data.betConfig?.culebras },
      // Reset player-specific overrides since this is a new round
      betOverrides: [],
      bilateralHandicaps: [],
      sideBets: { ...defaultBetConfig.sideBets, bets: [] },
    }));
    
    // Pre-populate players from cloned round
    const clonedPlayers: Player[] = data.players.map((p, idx) => ({
      id: p.profileId || `cloned-guest-${idx}-${Date.now()}`,
      name: p.name,
      initials: p.initials,
      color: p.color,
      handicap: p.handicap,
      profileId: p.profileId || undefined,
    }));
    
    setPlayers(clonedPlayers);
    
    // Reset scores and confirmed holes for new round
    setScores(new Map());
    setConfirmedHoles(new Set());
    setPlayerGroups([]);
    
    // Navigate to setup view for adjustments
    setHasInitialNavigated(true);
    setView('setup');
    
    toast.success(`Datos cargados de la ronda anterior. Ajusta fecha, jugadores y configuración, luego inicia la ronda.`);
  }, []);

  // Clone full round: copy everything including scores and create a new in_progress round
  const handleCloneFullRound = useCallback(async (data: FullCloneRoundData) => {
    // Close history dialog
    closeDialog('history');
    
    try {
      toast.info('Creando ronda con scores precargados...');
      
      // Create a new round via RPC
      const { data: roundResult, error: createError } = await supabase.rpc('create_round', {
        p_course_id: data.courseId,
        p_tee_color: data.teeColor,
        p_date: format(new Date(), 'yyyy-MM-dd'),
        p_bet_config: data.betConfig,
        p_starting_hole: data.startingHole,
      });

      if (createError) throw createError;
      const newRoundData = roundResult?.[0];
      if (!newRoundData?.round_id) throw new Error('No se pudo crear la ronda');

      const newRoundId = newRoundData.round_id;
      const newGroupId = newRoundData.group_id;

      // Map old player IDs (from snapshot) to new round_player_ids
      const playerIdMap = new Map<string, string>();
      // Also track guest ID remapping for betConfig (old snapshot id → new round_player_id)
      const guestIdRemap = new Map<string, string>();
      let failedPlayers = 0;
      
      // Add all players (skip the organizer who's already added)
      for (let i = 0; i < data.players.length; i++) {
        const p = data.players[i];
        const originalId = (p as any).originalId;
        
        // Check if this is the current user (organizer)
        if (p.profileId === profile?.id) {
          // Map original ID to the round_player_id created by create_round
          playerIdMap.set(originalId, newRoundData.round_player_id);
          // Also map profile_id → new round_player_id so betOverrides using profile IDs get remapped
          if (p.profileId) {
            playerIdMap.set(p.profileId, newRoundData.round_player_id);
          }
          
          // Update handicap for the organizer
          await supabase
            .from('round_players')
            .update({ handicap_for_round: p.handicap, tee_color: p.teeColor || null })
            .eq('id', newRoundData.round_player_id);
          continue;
        }
        
        // Insert other players
        const isGuest = !p.profileId;
        const { data: insertedPlayer, error: insertErr } = await supabase
          .from('round_players')
          .insert({
            round_id: newRoundId,
            group_id: newGroupId,
            profile_id: isGuest ? null : p.profileId,
            handicap_for_round: p.handicap,
            guest_name: isGuest ? p.name : null,
            guest_initials: isGuest ? p.initials : null,
            guest_color: isGuest ? p.color : null,
            tee_color: p.teeColor || null,
            is_organizer: false,
          })
          .select('id')
          .single();

        if (insertErr) {
          devError(`Error adding player ${p.name}:`, insertErr);
          failedPlayers++;
          continue;
        }
        
        if (insertedPlayer?.id && originalId) {
          playerIdMap.set(originalId, insertedPlayer.id);
          // Also map profile_id → new round_player_id for betOverrides using profile IDs
          if (p.profileId) {
            playerIdMap.set(p.profileId, insertedPlayer.id);
          }
          if (isGuest) {
            guestIdRemap.set(originalId, insertedPlayer.id);
          }
        }
      }

      if (failedPlayers > 0) {
        devWarn(`${failedPlayers} jugador(es) no se pudieron agregar`);
      }

      // Insert scores for each player
      let failedScores = 0;
      for (const [originalPlayerId, playerScores] of Object.entries(data.scores)) {
        const newPlayerId = playerIdMap.get(originalPlayerId);
        if (!newPlayerId) {
          devError(`No mapping found for player ${originalPlayerId}`);
          failedScores++;
          continue;
        }

        // Batch insert all scores for this player
        const scoreInserts = (playerScores as any[]).map((score: any) => ({
          round_player_id: newPlayerId,
          hole_number: score.holeNumber,
          strokes: score.strokes,
          putts: score.putts,
          oyes_proximity: score.oyesProximity,
          oyes_proximity_sangron: score.oyesProximitySangron,
          confirmed: true,
        }));

        const { data: insertedScores, error: scoreErr } = await supabase
          .from('hole_scores')
          .insert(scoreInserts)
          .select('id, hole_number');

        if (scoreErr) {
          devError(`Error inserting scores for player ${originalPlayerId}:`, scoreErr);
          failedScores++;
          continue;
        }

        // Insert markers if any (batch by hole)
        if (insertedScores?.length) {
          const scoreIdByHole = new Map<number, string>();
          insertedScores.forEach((s: any) => scoreIdByHole.set(s.hole_number, s.id));

          const markerInserts: { hole_score_id: string; marker_type: any; is_auto_detected: boolean; marker_count: number }[] = [];
          for (const score of playerScores as any[]) {
            if (!score.markers) continue;
            const holeScoreId = scoreIdByHole.get(score.holeNumber);
            if (!holeScoreId) continue;
            
            const expandedMarkers = expandMarkerStateToRows(score.markers);
            markerInserts.push(
              ...expandedMarkers.map((marker) => ({
                hole_score_id: holeScoreId,
                marker_type: marker.marker_type as any,
                is_auto_detected: marker.is_auto_detected,
                marker_count: marker.marker_count ?? 1,
              }))
            );
          }

          if (markerInserts.length > 0) {
            await supabase.from('hole_markers').insert(markerInserts);
          }
        }
      }

      // Insert bilateral handicaps with new player IDs
      for (const bh of data.bilateralHandicaps) {
        const newPlayerAId = playerIdMap.get(bh.playerAId);
        const newPlayerBId = playerIdMap.get(bh.playerBId);
        
        if (newPlayerAId && newPlayerBId) {
          await supabase.from('round_handicaps').insert({
            round_id: newRoundId,
            player_a_id: newPlayerAId,
            player_b_id: newPlayerBId,
            strokes_given_by_a: bh.strokesGivenByA,
          });
        }
      }

      // Remap ALL player IDs in betConfig using a single-pass replacement to avoid
      // double-substitution bugs (e.g. if a new ID happens to contain an old ID as substring).
      // Strategy: replace all oldIds with a stable placeholder first, then swap placeholders for newIds.
      let remappedBetConfig = data.betConfig;
      if (playerIdMap.size > 0) {
        let configJson = JSON.stringify(data.betConfig);
        
        // Build stable placeholder map: oldId → __REMAP_<index>__
        const placeholders = new Map<string, string>();
        let idx = 0;
        for (const [oldId] of playerIdMap) {
          placeholders.set(oldId, `__REMAP_${idx++}__`);
        }
        
        // Step 1: Replace all old IDs with placeholders (no risk of collision)
        for (const [oldId, placeholder] of placeholders) {
          configJson = configJson.split(oldId).join(placeholder);
        }
        
        // Step 2: Replace placeholders with new IDs
        for (const [oldId, placeholder] of placeholders) {
          const newId = playerIdMap.get(oldId)!;
          configJson = configJson.split(placeholder).join(newId);
        }
        
        remappedBetConfig = JSON.parse(configJson);
      }

      // CRITICAL: Clean up betOverrides that reference stale player IDs from prior clones.
      // Only keep overrides where BOTH playerAId and playerBId exist in the new round.
      const newPlayerIds = new Set(playerIdMap.values());
      if (remappedBetConfig.betOverrides && Array.isArray(remappedBetConfig.betOverrides)) {
        remappedBetConfig = {
          ...remappedBetConfig,
          betOverrides: remappedBetConfig.betOverrides.filter((ov: any) =>
            newPlayerIds.has(ov.playerAId) && newPlayerIds.has(ov.playerBId)
          ),
        };
      }

      // Update round to in_progress with remapped betConfig
      await supabase
        .from('rounds')
        .update({ status: 'in_progress', bet_config: remappedBetConfig })
        .eq('id', newRoundId);

      // Navigate to the new round by triggering restore
      sessionStorage.setItem('restore_round_id', newRoundId);
      
      if (failedScores > 0) {
        toast.warning(`Ronda duplicada con ${failedScores} score(s) incompletos. Redirigiendo...`);
      } else {
        toast.success('Ronda duplicada exitosamente. Redirigiendo...');
      }
      
      // Force reload to trigger restore mechanism
      setTimeout(() => {
        window.location.reload();
      }, 300);
      
    } catch (err: any) {
      devError('Error cloning full round:', err);
      toast.error('Error al duplicar la ronda: ' + (err.message || 'Error desconocido'));
    }
  }, [profile?.id]);

  const handleAddGroup = useCallback(async () => {
    if (!roundState.id) {
      toast.error('Primero crea/selecciona una ronda');
      return;
    }

    try {
      // Get next group number
      const { data: lastGroup, error: lastErr } = await supabase
        .from('round_groups')
        .select('group_number')
        .eq('round_id', roundState.id)
        .order('group_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastErr) throw lastErr;

      const nextGroupNumber = (lastGroup?.group_number ?? 1) + 1;

      const { data: inserted, error: insErr } = await supabase
        .from('round_groups')
        .insert({ round_id: roundState.id, group_number: nextGroupNumber })
        .select('id, group_number');

      if (insErr) throw insErr;
      const row = inserted?.[0];
      if (!row?.id) throw new Error('No se pudo crear el grupo');

      const newGroup: PlayerGroup = {
        id: row.id,
        name: `Grupo ${row.group_number}`,
        players: [],
      };

      setPlayerGroups((prev) => [...prev, newGroup]);
      toast.success(`${newGroup.name} creado`);
    } catch (e: any) {
      devError('Error creating round group:', e);
      toast.error('No se pudo crear el grupo');
    }
  }, [roundState.id, setPlayerGroups]);

  const handleGroupPlayersChange = useCallback(
    async (groupId: string, newPlayers: Player[]) => {
      // Update local state immediately for snappy UI
      setPlayerGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, players: newPlayers } : g)));

      const currentGroup = playerGroups.find((g) => g.id === groupId);
      const existingPlayers = currentGroup?.players ?? [];
      const existingIds = new Set<string>(existingPlayers.map((p) => p.id));

      // Persist handicap/teeColor changes for EXISTING players (same logic as handlePlayersChange for Grupo 1)
      if (roundState.id) {
        for (const newPlayer of newPlayers) {
          const currentPlayer = existingPlayers.find((p) => p.id === newPlayer.id);
          if (currentPlayer) {
            const roundPlayerId = roundPlayerIds.get(newPlayer.id);
            if (roundPlayerId) {
              const updates: { handicap_for_round?: number; tee_color?: string } = {};

              if (currentPlayer.handicap !== newPlayer.handicap) {
                updates.handicap_for_round = newPlayer.handicap;
              }
              const teeChanged = currentPlayer.teeColor !== newPlayer.teeColor && !!newPlayer.teeColor;
              if (teeChanged) {
                updates.tee_color = newPlayer.teeColor;
              }

              if (Object.keys(updates).length > 0) {
                devLog(`[Handicap Persist G2+] Player ${newPlayer.name} (rpId: ${roundPlayerId}):`, updates);
                const { data: updated, error } = await supabase
                  .from('round_players')
                  .update(updates)
                  .eq('id', roundPlayerId)
                  .select('id, tee_color, handicap_for_round')
                  .maybeSingle();
                if (error) {
                  devError(`Error persisting group player changes for ${newPlayer.name}:`, error);
                  toast.error(`No se pudo guardar el cambio de ${newPlayer.name}`);
                } else if (!updated) {
                  devError(`[Handicap Persist G2+] No row updated for ${newPlayer.name} (posible RLS)`);
                  toast.error(`No tienes permiso para actualizar a ${newPlayer.name}`);
                } else {
                  devLog(`[Handicap Persist G2+] ✓ Saved for ${newPlayer.name}`, updated);
                  if (teeChanged) {
                    toast.success(`Tee de ${newPlayer.name} actualizado. Recalcula HCP si aplica.`);
                  }
                }
                if (currentPlayer.handicap !== newPlayer.handicap) {
                  logEvent('handicap_changed', {
                    prev_handicap: currentPlayer.handicap,
                    new_handicap: newPlayer.handicap,
                  }, newPlayer.profileId ?? null);
                }
              }

            } else {
              if (currentPlayer.handicap !== newPlayer.handicap || currentPlayer.teeColor !== newPlayer.teeColor) {
                devWarn(`[Handicap Persist G2+] No roundPlayerId mapping for ${newPlayer.name} (id: ${newPlayer.id}). Change will NOT persist.`);
                toast.error(`No se pudo guardar el cambio de ${newPlayer.name} (mapeo pendiente)`);
              }
            }
          }
        }
      }

      // Persist any *new* players so they survive refresh
      const added = newPlayers.filter((p) => !existingIds.has(p.id));
      for (const p of added) {
        await addPlayerToRound(p, groupId);
      }
    },
    [addPlayerToRound, playerGroups, setPlayerGroups, roundState.id, roundPlayerIds]
  );

  const handleRestorePendingRound = useCallback((roundId: string) => {
    // Use a one-shot flag so the hook restores exactly this round on next mount.
    sessionStorage.setItem('restore_round_id', roundId);
    window.location.reload();
  }, []);

  const handleDiscardPendingRoundAndStartNew = useCallback(() => {
    // Skip the restore prompt once, then continue clean.
    sessionStorage.setItem('skip_restore_once', '1');
    startNewRound();
  }, [startNewRound]);

  // Organizer flow: restore the round and jump to the close section in BetDashboard.
  const handleRestoreAndJumpToClose = useCallback((roundId: string) => {
    sessionStorage.setItem('restore_round_id', roundId);
    sessionStorage.setItem('jump_to_close_after_restore', '1');
    sessionStorage.setItem('initial_view_after_restore', 'bets');
    window.location.reload();
  }, []);

  // Participant flow: locally hide a pending round so it stops cluttering the UI.
  const hiddenPendingKey = profile?.id ? `gb_hidden_pending_rounds_${profile.id}` : null;
  const [hiddenPendingIds, setHiddenPendingIds] = useState<string[]>(() => {
    try {
      const k = profile?.id ? `gb_hidden_pending_rounds_${profile.id}` : null;
      if (!k) return [];
      return JSON.parse(localStorage.getItem(k) ?? '[]');
    } catch { return []; }
  });
  useEffect(() => {
    if (!hiddenPendingKey) return;
    try {
      setHiddenPendingIds(JSON.parse(localStorage.getItem(hiddenPendingKey) ?? '[]'));
    } catch { /* noop */ }
  }, [hiddenPendingKey]);

  const handleHidePendingRoundLocally = useCallback((roundId: string) => {
    if (!hiddenPendingKey) return;
    try {
      const cur: string[] = JSON.parse(localStorage.getItem(hiddenPendingKey) ?? '[]');
      if (!cur.includes(roundId)) cur.push(roundId);
      localStorage.setItem(hiddenPendingKey, JSON.stringify(cur));
      setHiddenPendingIds(cur);
      toast.success('Tarjeta ocultada de tu vista', {
        description: 'Solo el organizador puede cerrarla oficialmente.',
      });
    } catch (e) {
      devError('hide pending round failed', e);
    }
  }, [hiddenPendingKey]);

  const visiblePendingRounds = useMemo(
    () => pendingRounds.filter(r => !hiddenPendingIds.includes(r.roundId)),
    [pendingRounds, hiddenPendingIds]
  );

  // Initialize base player from profile (only if not restoring and no players)
  useEffect(() => {
    if (!isRestoring && profile && players.length === 0) {
      const basePlayer: Player = {
        id: profile.id,
        name: profile.display_name,
        initials: profile.initials,
        color: profile.avatar_color,
        // Start all new rounds at 0 handicap for now.
        // We'll populate this once the USGA handicap calculation is enabled and validated.
        handicap: 0,
        profileId: profile.id,
      };
      setPlayers([basePlayer]);
    }
  }, [profile, players.length, isRestoring]);

  // allPlayersForBets is defined earlier (before useRoundHandicaps) for cross-group handicap resolution

  // Can create and start round with just 1 player (for solo score tracking)
  const canCreateRound = players.length >= 1 && course !== null;
  const canStartScoring = players.length >= 1 && course !== null;

  // Initialize scores for a single player
  const initializePlayerScores = useCallback((player: Player): PlayerScore[] => {
    if (!course) return [];
    const strokesPerHole = calculateStrokesPerHole(player.handicap, course);
    return Array.from({ length: 18 }, (_, i) => {
      const holePar = course.holes[i]?.par || 4;
      return {
        playerId: player.id,
        holeNumber: i + 1,
        strokes: holePar,
        putts: 2,
        markers: { ...defaultMarkerState },
        strokesReceived: strokesPerHole[i],
        netScore: holePar - strokesPerHole[i],
        confirmed: false,
      };
    });
  }, [course]);

  // Initialize scores locally (for when continuing or starting)
  const initializeScores = useCallback(() => {
    if (!course) return;
    const initialScores = new Map<string, PlayerScore[]>();
    players.forEach(player => {
      initialScores.set(player.id, initializePlayerScores(player));
    });
    setScores(initialScores);
  }, [course, players, initializePlayerScores]);

  // Actualizar scores cuando cambia el campo
  useEffect(() => {
    if (!course || players.length === 0) return;

    setScores(prev => {
      const next = new Map(prev);

      players.forEach(player => {
        const existingScores = prev.get(player.id);

        if (!existingScores || existingScores.length === 0) {
          next.set(player.id, initializePlayerScores(player));
          return;
        }

        const strokesPerHole = calculateStrokesPerHole(player.handicap, course);

        const updated = existingScores.map(s => {
          const holeInfo = course.holes.find(h => h.number === s.holeNumber);
          const holePar = holeInfo?.par || 4;
          const strokesReceived = strokesPerHole[s.holeNumber - 1] || 0;

          if (s.confirmed) {
            return {
              ...s,
              strokesReceived,
              netScore: s.strokes - strokesReceived,
            };
          }

          return {
            ...s,
            strokes: holePar,
            strokesReceived,
            netScore: holePar - strokesReceived,
          };
        });

        next.set(player.id, updated);
      });

      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.id]);

  // Handle global tee color change - propagate ONLY to players without an explicit tee.
  // Players that already have a tee defined (individual selection) MUST be preserved,
  // even if their tee happens to match the previous global default. Otherwise re-opening
  // the round would lose per-player tee selections after any global tee change.
  const handleTeeColorChange = useCallback((newTeeColor: 'blue' | 'white' | 'yellow' | 'red') => {
    setTeeColor(newTeeColor);

    // Only inherit when teeColor is unset
    const updatedPlayers = players.map(p => ({
      ...p,
      teeColor: p.teeColor ? p.teeColor : newTeeColor,
    }));

    setPlayers(updatedPlayers);

    // Persist tee changes to database if round exists
    if (roundState.id) {
      for (const player of updatedPlayers) {
        const originalPlayer = players.find(p => p.id === player.id);
        if (originalPlayer && originalPlayer.teeColor !== player.teeColor) {
          const rpId = roundPlayerIds.get(player.id);
          if (rpId) {
            supabase
              .from('round_players')
              .update({ tee_color: player.teeColor })
              .eq('id', rpId)
              .then(({ error }) => {
                if (error) {
                  devError('Error persisting tee color change:', error);
                }
              });
          }
        }
      }
    }

    // Also update player groups (preserve individual selections)
    if (playerGroups.length > 0) {
      setPlayerGroups(prevGroups => prevGroups.map(group => ({
        ...group,
        players: group.players.map(p => ({
          ...p,
          teeColor: p.teeColor ? p.teeColor : newTeeColor,
        })),
      })));
    }
  }, [players, setPlayers, roundState.id, roundPlayerIds, playerGroups, setPlayerGroups]);

  // Handle player removal - delete from database for persistence
  const handleRemovePlayer = useCallback(async (playerId: string) => {
    // Check if this player is the organizer - organizers cannot be removed
    const playerToRemove = players.find(p => p.id === playerId);
    if (playerToRemove && roundState.organizerProfileId && playerToRemove.profileId === roundState.organizerProfileId) {
      toast.error('El organizador de la ronda no puede ser eliminado');
      return;
    }
    
    const rpId = roundPlayerIds.get(playerId);
    
    // If we have a round and round_player entry, delete from DB
    if (roundState.id && rpId) {
      try {
        const { error } = await supabase
          .from('round_players')
          .delete()
          .eq('id', rpId);
        
        if (error) {
          devError('Error removing player from database:', error);
          toast.error('Error al eliminar jugador (solo el organizador puede hacerlo)');
          return;
        }
        
        // Also remove any related handicaps
        await supabase
          .from('round_handicaps')
          .delete()
          .or(`player_a_id.eq.${rpId},player_b_id.eq.${rpId}`);
        
        // Remove from roundPlayerIds mapping
        setRoundPlayerIds(prev => {
          const next = new Map(prev);
          next.delete(playerId);
          return next;
        });
        
        toast.success('Jugador eliminado');
      } catch (err) {
        devError('Error in handleRemovePlayer:', err);
        toast.error('Error al eliminar jugador');
        return;
      }
    }
    
    // Update local state
    setPlayers(prev => prev.filter(p => p.id !== playerId));
    
    // Also clean up scores
    setScores(prev => {
      const next = new Map(prev);
      next.delete(playerId);
      return next;
    });
  }, [roundState.id, roundState.organizerProfileId, roundPlayerIds, setRoundPlayerIds, setPlayers, setScores, players]);

  // Handle players change - initialize scores for new players when round is active
  const handlePlayersChange = useCallback(async (newPlayers: Player[]) => {
    // Find new players (in newPlayers but not in current players)
    const currentPlayerIds = new Set(players.map(p => p.id));
    const addedPlayers = newPlayers.filter(p => !currentPlayerIds.has(p.id));
    
    // Find removed players
    const newPlayerIds = new Set(newPlayers.map(p => p.id));
    const removedPlayers = players.filter(p => !newPlayerIds.has(p.id));

    // Handle removals first (persist to DB)
    for (const player of removedPlayers) {
      await handleRemovePlayer(player.id);
    }

    // Detect handicap and tee color changes and persist to database
    if (roundState.id) {
      for (const newPlayer of newPlayers) {
        const currentPlayer = players.find(p => p.id === newPlayer.id);
        if (currentPlayer) {
          const roundPlayerId = roundPlayerIds.get(newPlayer.id);
          if (roundPlayerId) {
            const updates: { handicap_for_round?: number; tee_color?: string } = {};

            if (currentPlayer.handicap !== newPlayer.handicap) {
              updates.handicap_for_round = newPlayer.handicap;
            }
            const teeChanged = currentPlayer.teeColor !== newPlayer.teeColor && !!newPlayer.teeColor;
            if (teeChanged) {
              updates.tee_color = newPlayer.teeColor;
            }

            if (Object.keys(updates).length > 0) {
              devLog(`[Handicap Persist] Player ${newPlayer.name} (rpId: ${roundPlayerId}):`, updates);
              const { data: updated, error } = await supabase
                .from('round_players')
                .update(updates)
                .eq('id', roundPlayerId)
                .select('id, tee_color, handicap_for_round')
                .maybeSingle();
              if (error) {
                devError(`Error persisting player changes for ${newPlayer.name}:`, error);
                toast.error(`No se pudo guardar el cambio de ${newPlayer.name}`);
              } else if (!updated) {
                devError(`[Handicap Persist] No row updated for ${newPlayer.name} (posible RLS)`);
                toast.error(`No tienes permiso para actualizar a ${newPlayer.name}`);
              } else {
                devLog(`[Handicap Persist] ✓ Saved for ${newPlayer.name}`, updated);
                if (teeChanged) {
                  toast.success(`Tee de ${newPlayer.name} actualizado. Recalcula HCP si aplica.`);
                }
              }
              if (currentPlayer.handicap !== newPlayer.handicap) {
                logEvent('handicap_changed', {
                  prev_handicap: currentPlayer.handicap,
                  new_handicap: newPlayer.handicap,
                }, newPlayer.profileId ?? null);
              }
            }

          } else {
            if (currentPlayer.handicap !== newPlayer.handicap || currentPlayer.teeColor !== newPlayer.teeColor) {
              devWarn(`[Handicap Persist] No roundPlayerId mapping for ${newPlayer.name} (id: ${newPlayer.id}). Change will NOT persist until mapping exists.`);
              toast.error(`No se pudo guardar el cambio de ${newPlayer.name} (mapeo pendiente)`);
            }
          }
        }
      }
    }

    // Update players 
    setPlayers(newPlayers);

    // If we have a round ID and added players, persist them to database
    // This works both for setup mode AND in_progress mode
    if (roundState.id && roundState.groupId && addedPlayers.length > 0) {
      // Persist new players to round_players table
      for (const player of addedPlayers) {
        // Skip if already persisted or currently being persisted (prevents race condition with concurrent renders)
        if (!roundPlayerIds.has(player.id) && !persistingPlayerIdsRef.current.has(player.id)) {
          persistingPlayerIdsRef.current.add(player.id);
          try {
            await addPlayerToRound(player);
          } finally {
            persistingPlayerIdsRef.current.delete(player.id);
          }
        }
      }
    }

    // If round is in progress, also initialize scores for new players
    if (isRoundStarted && course && addedPlayers.length > 0) {
      setScores(prev => {
        const newScores = new Map(prev);
        for (const player of addedPlayers) {
          // Only add if not already has scores
          if (!newScores.has(player.id)) {
            newScores.set(player.id, initializePlayerScores(player));
          }
        }
        return newScores;
      });
    }
  }, [players, isRoundStarted, course, initializePlayerScores, setPlayers, addPlayerToRound, handleRemovePlayer, roundState.id, roundState.groupId, roundPlayerIds]);

  // Add players from friends selection
  const handleAddPlayersFromFriends = useCallback(async (selectedPlayers: Array<{
    profileId: string;
    name: string;
    initials: string;
    color: string;
    handicap: number;
  }>) => {
    // Case 1: Round not created yet - just add locally
    if (!roundState.id) {
      const newPlayers: Player[] = selectedPlayers.map(p => ({
        id: p.profileId,
        name: p.name,
        initials: p.initials,
        color: p.color,
        handicap: p.handicap,
        profileId: p.profileId,
        teeColor: teeColor,
      }));

      const existingIds = new Set(players.map(p => p.profileId || p.id));
      const playersToAdd = newPlayers.filter(p => !existingIds.has(p.id) && !existingIds.has(p.profileId));

      if (playersToAdd.length === 0) {
        toast.info('Todos los jugadores seleccionados ya están en la ronda');
        return;
      }

      setPlayers(prev => [...prev, ...playersToAdd]);
      return;
    }

    // Case 2: Round exists but no group - shouldn't happen, but handle gracefully
    if (!roundState.groupId) {
      devError('Round exists but no groupId - cannot add players');
      toast.error('Error de estado: no hay grupo disponible');
      return;
    }

    // Case 3: Round exists - persist players to database
    for (const playerData of selectedPlayers) {
      // Skip if already in round
      const existingIds = new Set(players.map(p => p.profileId || p.id));
      if (existingIds.has(playerData.profileId)) {
        continue;
      }

      try {
        // 1) Create round_player entry
        const { data: rpRow, error: rpErr } = await supabase
          .from('round_players')
          .insert({
            round_id: roundState.id,
            group_id: roundState.groupId,
            profile_id: playerData.profileId,
            handicap_for_round: playerData.handicap ?? 0,
            is_organizer: false,
            tee_color: teeColor,
          })
          .select('id')
          .single();

        if (rpErr || !rpRow?.id) {
          devError('Error adding friend to round:', rpErr);
          toast.error(`Error al agregar ${playerData.name}`);
          continue;
        }

        const newPlayerId = rpRow.id as string;

        // 2) Create local player object
        const newPlayer: Player = {
          id: newPlayerId,
          name: playerData.name,
          initials: playerData.initials,
          color: playerData.color,
          handicap: playerData.handicap ?? 0,
          profileId: playerData.profileId,
          teeColor: teeColor,
        };

        // 3) Add to players list
        setPlayers(prev => [...prev, newPlayer]);

        // 4) Update roundPlayerIds mapping
        setRoundPlayerIds(prev => {
          const next = new Map(prev);
          next.set(newPlayerId, newPlayerId);
          // Also map profileId -> round_player_id for lookups
          next.set(playerData.profileId, newPlayerId);
          return next;
        });

        // 5) Initialize hole scores only if course is available
        if (course) {
          const strokesPerHole = calculateStrokesPerHole(playerData.handicap ?? 0, course);
          const newPlayerScores: PlayerScore[] = Array.from({ length: 18 }, (_, i) => {
            const holeNumber = i + 1;
            const holePar = course.holes[i]?.par || 4;
            return {
              playerId: newPlayerId,
              holeNumber,
              strokes: holePar, // Default to par
              putts: 2,
              markers: { ...defaultMarkerState },
              strokesReceived: strokesPerHole[i] ?? 0,
              netScore: holePar - (strokesPerHole[i] ?? 0),
              confirmed: false, // Not confirmed yet - user needs to enter actual scores
            };
          });

          setScores(prev => {
            const next = new Map(prev);
            next.set(newPlayerId, newPlayerScores);
            return next;
          });

          // Persist hole_scores to database (unconfirmed, with default par values)
          const scoreRecords = newPlayerScores.map(s => ({
            round_player_id: newPlayerId,
            hole_number: s.holeNumber,
            strokes: s.strokes,
            putts: s.putts,
            strokes_received: s.strokesReceived,
            net_score: s.netScore,
            oyes_proximity: null,
            oyes_proximity_sangron: null,
            confirmed: false,
          }));

          const { error: scoresErr } = await supabase
            .from('hole_scores')
            .upsert(scoreRecords, { onConflict: 'round_player_id,hole_number', ignoreDuplicates: false });

          if (scoresErr) {
            devError('Error persisting hole_scores for friend:', scoresErr);
          }
        }

        // 6) Initialize bilateral handicaps against all existing players
        const existingPlayerRpIds: string[] = [];
        const existingPlayerHandicaps = new Map<string, number>();

        for (const existingPlayer of players) {
          const rpId = roundPlayerIds.get(existingPlayer.id);
          if (rpId && rpId !== newPlayerId) {
            existingPlayerRpIds.push(rpId);
            existingPlayerHandicaps.set(rpId, existingPlayer.handicap);
          }
        }

        for (const group of playerGroups) {
          for (const existingPlayer of group.players) {
            const rpId = roundPlayerIds.get(existingPlayer.id);
            if (rpId && rpId !== newPlayerId && !existingPlayerRpIds.includes(rpId)) {
              existingPlayerRpIds.push(rpId);
              existingPlayerHandicaps.set(rpId, existingPlayer.handicap);
            }
          }
        }

        if (existingPlayerRpIds.length > 0) {
          await initializeHandicapsForNewPlayer(
            newPlayerId,
            newPlayer.handicap,
            existingPlayerRpIds,
            existingPlayerHandicaps
          );
        }

        toast.success(`${playerData.name} agregado a la ronda`);
      } catch (err) {
        devError('Exception adding friend mid-round:', err);
        toast.error(`Error al agregar ${playerData.name}`);
      }
    }
  }, [players, teeColor, roundState.id, roundState.groupId, course, roundPlayerIds, playerGroups, initializeHandicapsForNewPlayer, setRoundPlayerIds]);

  // Add players from friends to a SPECIFIC additional group
  const handleAddPlayersFromFriendsToGroup = useCallback(async (
    targetGroupId: string,
    selectedPlayers: Array<{
      profileId: string;
      name: string;
      initials: string;
      color: string;
      handicap: number;
    }>
  ) => {
    if (!roundState.id) return;

    // Collect all existing IDs across main + all groups
    const allExistingIds = new Set([
      ...players.map(p => p.profileId || p.id),
      ...playerGroups.flatMap(g => g.players.map(p => p.profileId || p.id)),
    ]);

    for (const playerData of selectedPlayers) {
      if (allExistingIds.has(playerData.profileId)) continue;

      try {
        const { data: rpRow, error: rpErr } = await supabase
          .from('round_players')
          .insert({
            round_id: roundState.id,
            group_id: targetGroupId,
            profile_id: playerData.profileId,
            handicap_for_round: playerData.handicap ?? 0,
            is_organizer: false,
            tee_color: teeColor,
          })
          .select('id')
          .single();

        if (rpErr || !rpRow?.id) {
          devError('Error adding friend to group:', rpErr);
          toast.error(`Error al agregar ${playerData.name}`);
          continue;
        }

        const newPlayerId = rpRow.id as string;

        const newPlayer: Player = {
          id: newPlayerId,
          name: playerData.name,
          initials: playerData.initials,
          color: playerData.color,
          handicap: playerData.handicap ?? 0,
          profileId: playerData.profileId,
          teeColor: teeColor,
        };

        // Add to the specific group
        setPlayerGroups(prev => prev.map(g =>
          g.id === targetGroupId ? { ...g, players: [...g.players, newPlayer] } : g
        ));

        // Update roundPlayerIds
        setRoundPlayerIds(prev => {
          const next = new Map(prev);
          next.set(newPlayerId, newPlayerId);
          next.set(playerData.profileId, newPlayerId);
          return next;
        });

        // Initialize hole scores if course available
        if (course) {
          const strokesPerHole = calculateStrokesPerHole(playerData.handicap ?? 0, course);
          const newPlayerScores: PlayerScore[] = Array.from({ length: 18 }, (_, i) => {
            const holePar = course.holes[i]?.par || 4;
            return {
              playerId: newPlayerId,
              holeNumber: i + 1,
              strokes: holePar,
              putts: 2,
              markers: { ...defaultMarkerState },
              strokesReceived: strokesPerHole[i] ?? 0,
              netScore: holePar - (strokesPerHole[i] ?? 0),
              confirmed: false,
            };
          });

          setScores(prev => {
            const next = new Map(prev);
            next.set(newPlayerId, newPlayerScores);
            return next;
          });

          const scoreRecords = newPlayerScores.map(s => ({
            round_player_id: newPlayerId,
            hole_number: s.holeNumber,
            strokes: s.strokes,
            putts: s.putts,
            strokes_received: s.strokesReceived,
            net_score: s.netScore,
            oyes_proximity: null,
            oyes_proximity_sangron: null,
            confirmed: false,
          }));

          await supabase
            .from('hole_scores')
            .upsert(scoreRecords, { onConflict: 'round_player_id,hole_number', ignoreDuplicates: false });
        }

        // Initialize bilateral handicaps against all existing players
        const existingPlayerRpIds: string[] = [];
        const existingPlayerHandicaps = new Map<string, number>();

        for (const existingPlayer of players) {
          const rpId = roundPlayerIds.get(existingPlayer.id);
          if (rpId && rpId !== newPlayerId) {
            existingPlayerRpIds.push(rpId);
            existingPlayerHandicaps.set(rpId, existingPlayer.handicap);
          }
        }
        for (const group of playerGroups) {
          for (const existingPlayer of group.players) {
            const rpId = roundPlayerIds.get(existingPlayer.id);
            if (rpId && rpId !== newPlayerId && !existingPlayerRpIds.includes(rpId)) {
              existingPlayerRpIds.push(rpId);
              existingPlayerHandicaps.set(rpId, existingPlayer.handicap);
            }
          }
        }

        if (existingPlayerRpIds.length > 0) {
          await initializeHandicapsForNewPlayer(
            newPlayerId,
            newPlayer.handicap,
            existingPlayerRpIds,
            existingPlayerHandicaps
          );
        }

        toast.success(`${playerData.name} agregado al grupo`);
      } catch (err) {
        devError('Exception adding friend to group:', err);
        toast.error(`Error al agregar ${playerData.name}`);
      }
    }
  }, [roundState.id, players, playerGroups, teeColor, course, roundPlayerIds, initializeHandicapsForNewPlayer, setRoundPlayerIds]);

  // Handle adding a friend to the active round (from Friends dialog)
  const handleAddFriendToRound = useCallback((friend: Friend) => {
    handleAddPlayersFromFriends([{
      profileId: friend.profileId,
      name: friend.displayName,
      initials: friend.initials,
      color: friend.avatarColor,
      handicap: friend.currentHandicap,
    }]);
  }, [handleAddPlayersFromFriends]);

  // Create round in database (can do with 1 player to get share link)
  const handleCreateRound = async () => {
    if (!course || !selectedCourseId) return;
    
    if (!roundState.id) {
      const result = await createRound(selectedCourseId, teeColor, roundState.date, startingHole);
      if (result) {
        // The useEffect will automatically persist any unmapped players
        openDialog('share');
      }
    }
  };

  // Start scoring (can do with 1 player for solo tracking)
  const handleStartRound = async () => {
    if (!course || !selectedCourseId) return;

    // Multi-group: each non-organizer group must have at least one co-administrator
    if (playerGroups && playerGroups.length > 0) {
      const groupsMissingAdmin = playerGroups.filter(g => {
        if (!g.players || g.players.length === 0) return false; // empty group; skip
        return !g.players.some(p => p.profileId && p.isAdmin);
      });
      if (groupsMissingAdmin.length > 0) {
        toast.error('Designa al menos un co-administrador en cada grupo adicional', {
          description: `Falta en: ${groupsMissingAdmin.map(g => g.name).join(', ')}. Solo el organizador o un co-admin del grupo podrán capturar scores.`,
        });
        return;
      }
    }

    let activeRoundId = roundState.id;

    // Create round in database first if not exists
    if (!activeRoundId) {
      const roundId = await createRound(selectedCourseId, teeColor, roundState.date, startingHole);
      if (!roundId) return;
      activeRoundId = roundId;
      // Wait for useEffect to persist unmapped players
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Initialize scores and start — pass explicit roundId to avoid stale state
    initializeScores();
    const success = await startRoundInDb(activeRoundId);
    if (success) {
      setView('scoring');
    }
  };

  const handleContinueRound = () => {
    // Just navigate to scoring without reinitializing
    setView('scoring');
  };

  const handleAddGuestFromScorecard = useCallback(
    async (payload: AddGuestPayload) => {
      if (!roundState.id || !roundState.groupId || !course) throw new Error('Ronda no lista');

      // Defense-in-depth: validate/sanitize guest identity before persisting.
      const safeName = validatePlayerName(payload.name);
      const safeInitials = initialsFromPlayerName(safeName);

      // 1) Create guest in backend (with handicap from payload)
      const { data: rpRow, error: rpErr } = await supabase
        .from('round_players')
        .insert({
          round_id: roundState.id,
          group_id: roundState.groupId,
          profile_id: null,
          handicap_for_round: payload.handicap ?? 0,
          is_organizer: false,
          guest_name: safeName,
          guest_initials: safeInitials,
          guest_color: payload.color,
        })
        .select('id')
        .single();

      if (rpErr || !rpRow?.id) {
        throw rpErr || new Error('No se pudo crear el jugador');
      }

      const newPlayerId = rpRow.id as string;

      // 2) Update local state (player list + mapping)
      const newPlayer: Player = {
        id: newPlayerId,
        name: safeName,
        initials: safeInitials,
        color: payload.color,
        handicap: payload.handicap ?? 0,
      };

      setPlayers((prev) => [...prev, newPlayer]);
      // Ensure mapping exists for persistence/realtime (guests: playerId === round_player_id)
      setRoundPlayerIds((prev) => {
        const next = new Map(prev);
        next.set(newPlayerId, newPlayerId);
        return next;
      });

      // 3) Build local scores for the new player (using their handicap)
      const strokesPerHole = calculateStrokesPerHole(payload.handicap ?? 0, course);
      const newPlayerScores: PlayerScore[] = Array.from({ length: 18 }, (_, i) => {
        const holeNumber = i + 1;
        const holePar = course.holes[i]?.par || 4;
        const strokes = holePar; // Default to par, user can edit via Quick Score
        const strokesReceived = strokesPerHole[i] ?? 0;
        return {
          playerId: newPlayerId,
          holeNumber,
          strokes,
          putts: 2,
          markers: { ...defaultMarkerState },
          strokesReceived,
          netScore: strokes - strokesReceived,
          confirmed: false, // Not confirmed until user captures
        };
      });

      setScores((prev) => {
        const next = new Map(prev);
        next.set(newPlayerId, newPlayerScores);
        return next;
      });

      // 4) Persist hole_scores (not confirmed, awaiting Quick Score entry)
      const scoreRecords = newPlayerScores.map((s) => ({
        round_player_id: newPlayerId,
        hole_number: s.holeNumber,
        strokes: s.strokes,
        putts: s.putts,
        strokes_received: s.strokesReceived,
        net_score: s.netScore,
        oyes_proximity: null,
        oyes_proximity_sangron: null,
        confirmed: false,
      }));

      const { error: scoresErr } = await supabase
        .from('hole_scores')
        .upsert(scoreRecords, { onConflict: 'round_player_id,hole_number', ignoreDuplicates: false });

      if (scoresErr) throw scoresErr;

      // 5) Mark holes confirmed (scorecard confirmation is global in current UX)
      setConfirmedHoles((prev) => {
        const next = new Set(prev);
        for (let h = 1; h <= 18; h++) next.add(h);
        return next;
      });

      // 6) Initialize bilateral handicaps against all existing players
      // Build list of existing round_player IDs and their handicaps
      const existingPlayerRpIds: string[] = [];
      const existingPlayerHandicaps = new Map<string, number>();
      
      for (const existingPlayer of players) {
        const rpId = roundPlayerIds.get(existingPlayer.id);
        if (rpId && rpId !== newPlayerId) {
          existingPlayerRpIds.push(rpId);
          existingPlayerHandicaps.set(rpId, existingPlayer.handicap);
        }
      }
      
      // Also include players from additional groups
      for (const group of playerGroups) {
        for (const existingPlayer of group.players) {
          const rpId = roundPlayerIds.get(existingPlayer.id);
          if (rpId && rpId !== newPlayerId && !existingPlayerRpIds.includes(rpId)) {
            existingPlayerRpIds.push(rpId);
            existingPlayerHandicaps.set(rpId, existingPlayer.handicap);
          }
        }
      }

      if (existingPlayerRpIds.length > 0) {
        await initializeHandicapsForNewPlayer(
          newPlayerId,
          newPlayer.handicap,
          existingPlayerRpIds,
          existingPlayerHandicaps
        );
      }
    },
    [roundState.id, roundState.groupId, course, setRoundPlayerIds, players, playerGroups, roundPlayerIds, initializeHandicapsForNewPlayer]
  );

  // ---------------------------------------------------------------------------
  // Serialized save queue per player+hole to prevent concurrent delete+insert
  // race conditions that lose generic marker counts.
  // ---------------------------------------------------------------------------
  const saveQueueRef = useRef<Map<string, { pending: Partial<PlayerScore> | null; saving: boolean }>>(new Map());

  const flushSave = useCallback(async (key: string, rpId: string, holeNumber: number) => {
    const entry = saveQueueRef.current.get(key);
    if (!entry) return;

    // Nothing pending or already saving — bail out
    if (!entry.pending || entry.saving) return;

    // Grab the latest pending payload and clear it
    const score = entry.pending;
    entry.pending = null;
    entry.saving = true;

    try {
      const { data: upserted, error } = await supabase
        .from('hole_scores')
        .upsert({
          round_player_id: rpId,
          hole_number: holeNumber,
          strokes: score.strokes,
          putts: score.putts,
          net_score: score.netScore,
          strokes_received: score.strokesReceived,
          oyes_proximity: score.oyesProximity ?? null,
          oyes_proximity_sangron: (score as any).oyesProximitySangron ?? null,
          confirmed: score.confirmed ?? false,
        }, {
          onConflict: 'round_player_id,hole_number',
          ignoreDuplicates: false,
        })
        .select('id');

      if (error) {
        console.error('Error saving score:', error);
        entry.saving = false;
        return;
      }

      // Persist manual markers
      if (score.markers) {
        // upsert .select() can return [] on update in some Supabase versions.
        // Fall back to an explicit select to guarantee we have the ID.
        let holeScoreId: string | null =
          Array.isArray(upserted) && upserted.length > 0
            ? upserted[0]?.id ?? null
            : null;

        if (!holeScoreId) {
          const { data: existing } = await supabase
            .from('hole_scores')
            .select('id')
            .eq('round_player_id', rpId)
            .eq('hole_number', holeNumber)
            .maybeSingle();
          holeScoreId = existing?.id ?? null;
        }

        if (holeScoreId) {
          const markerRows = expandMarkerStateToRows(score.markers);

          const { error: delErr } = await supabase
            .from('hole_markers')
            .delete()
            .eq('hole_score_id', holeScoreId)
            .eq('is_auto_detected', false);

          if (delErr) {
            console.error('Error clearing hole markers:', delErr);
            entry.saving = false;
            return;
          }

          if (markerRows.length) {
            const { error: insErr } = await supabase
              .from('hole_markers')
              .insert(
                markerRows.map((marker) => ({
                  hole_score_id: holeScoreId as string,
                  marker_type: marker.marker_type as any,
                  is_auto_detected: marker.is_auto_detected,
                  marker_count: marker.marker_count ?? 1,
                }))
              );

            if (insErr) {
              console.error('Error inserting hole markers:', insErr);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error in saveScoreToDb:', err);
    } finally {
      entry.saving = false;
    }

    // If another update arrived while we were saving, flush again
    if (entry.pending) {
      flushSave(key, rpId, holeNumber);
    }
  }, []);

  // Save score to database when updated (serialized per player+hole)
  const saveScoreToDb = useCallback((playerId: string, holeNumber: number, score: Partial<PlayerScore>) => {
    const rpId = roundPlayerIds.get(playerId);
    if (!rpId || !roundState.id) return;

    const key = `${playerId}:${holeNumber}`;
    let entry = saveQueueRef.current.get(key);
    if (!entry) {
      entry = { pending: null, saving: false };
      saveQueueRef.current.set(key, entry);
    }

    // Always overwrite pending with the LATEST full score state
    entry.pending = score;

    // Kick off a flush if not already saving
    if (!entry.saving) {
      flushSave(key, rpId, holeNumber);
    }
  }, [roundPlayerIds, roundState.id, flushSave]);

  const updateScore = useCallback(
    (playerId: string, holeNumber: number, updates: Partial<PlayerScore>) => {
      setScores((prev) => {
        const newScores = new Map(prev);
        const playerScores = [...(newScores.get(playerId) || [])];

        // Ensure we have a score row to edit (groups 2/3 often have empty arrays until first interaction)
        let idx = playerScores.findIndex((s) => s.holeNumber === holeNumber);
        if (idx < 0) {
          const allGroupPlayers = [...players];
          playerGroups.forEach((g) => allGroupPlayers.push(...g.players));
          const player = allGroupPlayers.find((p) => p.id === playerId);
          const holePar = course?.holes[holeNumber - 1]?.par || 4;
          const strokesPerHole = player && course ? calculateStrokesPerHole(player.handicap, course) : [];
          const strokesReceived = strokesPerHole[holeNumber - 1] ?? 0;

          const baseScore: PlayerScore = {
            playerId,
            holeNumber,
            strokes: holePar,
            putts: 2,
            markers: { ...defaultMarkerState },
            strokesReceived,
            netScore: holePar - strokesReceived,
            confirmed: false,
            oyesProximity: null,
             oyesProximitySangron: null,
          };

          playerScores.push(baseScore);
          playerScores.sort((a, b) => a.holeNumber - b.holeNumber);
          idx = playerScores.findIndex((s) => s.holeNumber === holeNumber);
        }

        if (idx >= 0) {
          const wasConfirmed = !!playerScores[idx].confirmed;
          const prevStrokes = playerScores[idx].strokes;
          const prevPutts = playerScores[idx].putts;

          // Only unconfirm when the actual score changes.
          // Markers (unidades/manchas) should NOT force re-confirmation.
          const isScoringMutation =
            updates.strokes !== undefined ||
            updates.putts !== undefined ||
            updates.oyesProximity !== undefined ||
            updates.oyesProximitySangron !== undefined;

          // Confirmation is per-player; do not rely on global confirmedHoles here.
          const shouldUnconfirm = isScoringMutation && wasConfirmed;

          playerScores[idx] = {
            ...playerScores[idx],
            ...updates,
            ...(shouldUnconfirm ? { confirmed: false } : {}),
          };

          // Keep netScore consistent
          if (updates.strokes !== undefined) {
            playerScores[idx].netScore = updates.strokes - playerScores[idx].strokesReceived;
          }

          // Save to database
          if (roundState.id) {
            saveScoreToDb(playerId, holeNumber, playerScores[idx]);
          }

          // Audit log: only log modifications of already-confirmed scores here.
          // First captures are logged in confirmHole.
          if (wasConfirmed && isScoringMutation) {
            const allGroupPlayers = [...players];
            playerGroups.forEach((g) => allGroupPlayers.push(...g.players));
            const player = allGroupPlayers.find((p) => p.id === playerId);
            const newStrokes = updates.strokes ?? prevStrokes;
            const newPutts = updates.putts ?? prevPutts;
            if (prevStrokes !== newStrokes || prevPutts !== newPutts) {
              logEvent('score_modified', {
                hole_number: holeNumber,
                prev_strokes: prevStrokes,
                new_strokes: newStrokes,
                prev_putts: prevPutts,
                new_putts: newPutts,
              }, player?.profileId ?? null);
            }
          }

          // No global confirmedHoles mutation here; UI/logic derives from per-player flags.
        }


        newScores.set(playerId, playerScores);
        return newScores;
      });
    },
    [players, playerGroups, course, roundState.id, saveScoreToDb]
  );

  const confirmHole = useCallback((holeNumber: number, playerIds?: string[]) => {
    // If playerIds provided, only confirm for those players (group-specific)
    // Otherwise, fallback to all players in main group (legacy behavior)
    const targetPlayerIds = playerIds ?? players.map(p => p.id);

    // Get all players from all groups to find player info
    const allGroupPlayers = [...players];
    playerGroups.forEach(g => allGroupPlayers.push(...g.players));

    // Mark the specified players' scores for this hole as confirmed
    // Create the score if it doesn't exist
    setScores(prev => {
      const newScores = new Map(prev);
      targetPlayerIds.forEach(playerId => {
        const playerScores = [...(newScores.get(playerId) || [])];
        const idx = playerScores.findIndex(s => s.holeNumber === holeNumber);

        if (idx >= 0) {
          playerScores[idx] = { ...playerScores[idx], confirmed: true };
        } else {
          const player = allGroupPlayers.find(p => p.id === playerId);
          const holePar = course?.holes[holeNumber - 1]?.par || 4;
          const strokesPerHole = player && course ? calculateStrokesPerHole(player.handicap, course) : [];
          const strokesReceived = strokesPerHole[holeNumber - 1] ?? 0;
          const newScore: PlayerScore = {
            playerId,
            holeNumber,
            strokes: holePar,
            putts: 2,
            markers: { ...defaultMarkerState },
            strokesReceived,
            netScore: holePar - strokesReceived,
            confirmed: true,
            oyesProximity: null,
          };
          playerScores.push(newScore);
          playerScores.sort((a, b) => a.holeNumber - b.holeNumber);
        }
        newScores.set(playerId, playerScores);
      });
      return newScores;
    });

    // Persist confirmation explicitly - use a small delay to ensure local state is updated
    if (roundState.id && course) {
      setTimeout(() => {
        void Promise.all(
          targetPlayerIds.map(async (playerId) => {
            const holeScore = scoresRef.current.get(playerId)?.find((s) => s.holeNumber === holeNumber);
            if (!holeScore) return;
            // Capture previous persisted state BEFORE overwriting it.
            const prevScore = scoresRef.current.get(playerId)?.find((s) => s.holeNumber === holeNumber);
            const wasConfirmedBefore = !!prevScore?.confirmed;
            const prevStrokes = prevScore?.strokes;
            const prevPutts = prevScore?.putts;
            await saveScoreToDb(playerId, holeNumber, { ...holeScore, confirmed: true });
            const player = allGroupPlayers.find(p => p.id === playerId);
            const isModification = wasConfirmedBefore && prevStrokes !== undefined && prevStrokes !== holeScore.strokes;
            if (isModification) {
              logEvent('score_modified', {
                hole_number: holeNumber,
                prev_strokes: prevStrokes,
                new_strokes: holeScore.strokes,
                prev_putts: prevPutts,
                new_putts: holeScore.putts,
              }, player?.profileId ?? null);
            } else {
              logEvent('score_captured', {
                hole_number: holeNumber,
                strokes: holeScore.strokes,
                putts: holeScore.putts,
              }, player?.profileId ?? null);
            }
          })
        );
        logEvent('hole_confirmed', { hole_number: holeNumber });
      }, 50);
    }
  }, [players, playerGroups, course, saveScoreToDb, roundState.id, logEvent]);




  const isHoleConfirmed = useCallback(
    (holeNumber: number): boolean => {
      // Derive from per-player flags to avoid UI getting stuck when `confirmedHoles` is out of sync.
      if (!players.length) return false;
      return players.every((p) => {
        const hs = scores.get(p.id)?.find((s) => s.holeNumber === holeNumber);
        return Boolean(hs?.confirmed);
      });
    },
    [players, scores]
  );

  const currentHoleInfo: HoleInfo | null = course?.holes[currentHole - 1] || null;
  const holePar = currentHoleInfo?.par || 4;
  const holeStrokeIndex = currentHoleInfo?.handicapIndex || 1;
  const holeYards = teeColor === 'blue' ? currentHoleInfo?.yardsBlue :
                    teeColor === 'white' ? currentHoleInfo?.yardsWhite :
                    teeColor === 'yellow' ? currentHoleInfo?.yardsYellow :
                    currentHoleInfo?.yardsRed;

  // Calculate stroke advantage indicators for base player vs rivals
  const getStrokeIndicators = (rivalId: string, holeNumber: number): { receiving: boolean; giving: boolean } => {
    if (!profile) return { receiving: false, giving: false };
    
    const basePlayer = players.find(p => p.profileId === profile.id);
    const rival = players.find(p => p.id === rivalId);
    
    if (!basePlayer || !rival || !course) return { receiving: false, giving: false };
    
    const baseStrokes = calculateStrokesPerHole(basePlayer.handicap, course);
    const rivalStrokes = calculateStrokesPerHole(rival.handicap, course);
    
    const baseReceives = baseStrokes[holeNumber - 1];
    const rivalReceives = rivalStrokes[holeNumber - 1];
    
    return {
      receiving: baseReceives > rivalReceives, // Base player gets advantage
      giving: baseReceives < rivalReceives,     // Base player gives advantage
    };
  };

  // Show loading while restoring
  if (isRestoring) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AlertDialog open={dialogs.pendingRound && visiblePendingRounds.length > 0 && !isRestoring} onOpenChange={(v: boolean) => setDialog('pendingRound', v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tarjeta pendiente</AlertDialogTitle>
            <AlertDialogDescription>
              Encontramos rondas sin “Cerrar Tarjeta”. Elige cómo continuar.

              <div className="mt-3 space-y-2">
                {visiblePendingRounds.map((r) => {
                  const s = pendingRoundSummaries.get(r.roundId);
                  return (
                    <div key={r.roundId} className="border border-border rounded-lg p-3 bg-card">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground">
                            {s?.courseName ?? 'Campo'}
                            {r.isOrganizer ? (
                              <span className="ml-2 text-[10px] uppercase tracking-wide bg-primary/15 text-primary px-1.5 py-0.5 rounded">Organizador</span>
                            ) : (
                              <span className="ml-2 text-[10px] uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded">Participante</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {r.status === 'in_progress' ? 'En progreso' : 'En configuración'} •{' '}
                            {format(r.date, "d 'de' MMMM, yyyy", { locale: es })}
                            {s ? (
                              <> • {s.holesPlayed} hoyos • {s.totalStrokes} golpes</>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 shrink-0">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              closeDialog('pendingRound');
                              handleRestorePendingRound(r.roundId);
                            }}
                          >
                            Restaurar
                          </Button>
                          {r.isOrganizer ? (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                closeDialog('pendingRound');
                                handleRestoreAndJumpToClose(r.roundId);
                              }}
                            >
                              Cerrar tarjeta
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                handleHidePendingRoundLocally(r.roundId);
                              }}
                            >
                              Ocultar de mi vista
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  closeDialog('pendingRound');
                  handleDiscardPendingRoundAndStartNew();
                }}
              >
                Iniciar nueva
              </Button>
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <AppHeader
        view={view}
        course={course}
        currentHole={currentHole}
        currentHoleInfo={currentHoleInfo}
        holePar={holePar}
        holeStrokeIndex={holeStrokeIndex}
        holeYards={holeYards}
        roundHoles={betConfig.roundHoles}
        user={user}
        profile={profile}
        theme={theme}
        profileMenuOpen={profileMenuOpen}
        pendingRounds={visiblePendingRounds}
        isRoundStarted={isRoundStarted}
        roundState={roundState}
        linkedLeaderboards={linkedLeaderboards}
        attestationCount={pendingPlayersCount}
        onOpenAttestation={() => openDialog('attestation')}
        isRoundAdmin={isCurrentUserRoundAdmin}
        onOpenAuditLog={() => openDialog('auditLog')}
        crossInvitationsCount={crossInvitationsCount}
        onOpenCrossInvitations={() => openDialog('crossInvitations')}
        onCrossInvite={(profileId, name, initials, color, courseName, holesPlayed) =>
          setCrossBetTarget({ profileId, name, initials, color, courseName, holesPlayed })
        }

        onSetView={setView}
        onSetTheme={setTheme}
        onSetProfileMenuOpen={setProfileMenuOpen}
        onOpenDialog={(name) => openDialog(name as DialogName)}
        onNavigate={navigate}
        onSignOut={signOut}
        onSetLeaderboardDetailId={setLeaderboardDetailId}
        onSetLeaderboardDetailType={setLeaderboardDetailType}
        onSetRankingDetailId={setRankingDetailId}
      />
      <ProfileDialog open={dialogs.profile} onOpenChange={(v: boolean) => setDialog('profile', v)} />

      {/* Guest registration banner */}
      {user?.is_anonymous && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700 px-4 py-2 flex items-center justify-between gap-2">
          <span className="text-xs text-amber-800 dark:text-amber-200">
            Estás viendo la ronda como invitado
          </span>
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:border-amber-600 dark:hover:bg-amber-900/40"
            onClick={() => navigate('/auth', { state: { returnTo: '/' } })}
          >
            Registrarme
          </Button>
        </div>
      )}

      {/* Navigation Tabs - show when round is in progress OR not in setup view */}
      {(isRoundStarted || view !== 'setup') && (
        <div className="bg-card border-b border-border">
          <div className="max-w-md mx-auto">
            <Tabs value={view === 'scoring' ? 'scoring' : view} onValueChange={(v) => { setView(v as AppView); if (v !== 'leaderboards') setLeaderboardDetailId(null); if (v !== 'rankings') setRankingDetailId(null); }}>
              <TabsList className="w-full grid grid-cols-5 h-14">
                <TabsTrigger value="setup" className="text-xs flex flex-col items-center gap-0.5 py-1"><Settings className="h-4 w-4" /><span className="text-[10px] leading-tight">Setup</span></TabsTrigger>
                <TabsTrigger value="handicaps" className="text-xs flex flex-col items-center gap-0.5 py-1"><RefreshCw className="h-4 w-4" /><span className="text-[10px] leading-tight">Hándicaps</span></TabsTrigger>
                <TabsTrigger value="betsetup" className="text-xs flex flex-col items-center gap-0.5 py-1"><Dices className="h-4 w-4" /><span className="text-[10px] leading-tight">Apuestas</span></TabsTrigger>
                <TabsTrigger value="scorecard" className="text-xs flex flex-col items-center gap-0.5 py-1"><Trophy className="h-4 w-4" /><span className="text-[10px] leading-tight">Scorecard</span></TabsTrigger>
                <TabsTrigger value="bets" className="text-xs flex flex-col items-center gap-0.5 py-1"><CoinDollarIcon className="h-4 w-4" /><span className="text-[10px] leading-tight">Resultados</span></TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      )}

      {/* Leaderboard Quick-Access Banner — distributes evenly when round is linked to multiple */}
      {linkedLeaderboards.length > 0 && isRoundStarted && roundState.status !== 'completed' && view !== 'leaderboards' && (
        <div className="w-full bg-amber-500/10 border-b border-amber-500/30">
          <div className="max-w-md mx-auto flex items-stretch divide-x divide-amber-500/30">
            {linkedLeaderboards.map((lb) => {
              // Abbreviate name when sharing the row with siblings: keep first letter
              // of each word, fall back to full name when there's only one leaderboard.
              const isMulti = linkedLeaderboards.length > 1;
              const displayName = isMulti && lb.name.length > 14
                ? lb.name
                    .split(/\s+/)
                    .filter(Boolean)
                    .map(w => w[0]?.toUpperCase() ?? '')
                    .join('')
                    .slice(0, 6)
                : lb.name;
              return (
                <button
                  key={lb.id}
                  onClick={() => {
                    setLeaderboardDetailId(lb.id);
                    setLeaderboardDetailType(
                      lb.competition_type === 'teams_cup' ? 'teams_cup'
                        : lb.competition_type === 'multi_day' ? 'multi_day'
                        : 'standard'
                    );
                    setView('leaderboards');
                  }}
                  className="flex-1 min-w-0 hover:bg-amber-500/20 transition-colors"
                  title={lb.name}
                >
                  <div className="flex items-center justify-center gap-1.5 py-1.5 px-2">
                    <Trophy className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 truncate">
                      {displayName}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-md mx-auto p-4 space-y-4" {...swipeHandlers}>
        {view === 'setup' && (
          <SetupView
            players={players}
            playerGroups={playerGroups}
            course={course}
            selectedCourseId={selectedCourseId}
            teeColor={teeColor}
            startingHole={startingHole}
            roundHoles={betConfig.roundHoles}
            roundState={roundState}
            profile={profile}
            isRoundStarted={isRoundStarted}
            isLoading={isLoading}
            canCreateRound={canCreateRound}
            canStartScoring={canStartScoring}
            enableCourseCatalog={enableCourseCatalog}
            roundPlayerIds={roundPlayerIds}
            onCourseChange={setSelectedCourseId}
            onTeeColorChange={handleTeeColorChange}
            onStartingHoleChange={setStartingHole}
            onRoundHolesChange={(h) => setBetConfig(prev => {
              const next: typeof prev = { ...prev, roundHoles: h };
              if (h === 9 && prev.bloques?.holesPerBlock === 6) {
                next.bloques = { ...prev.bloques, holesPerBlock: 3 };
              }
              return next;
            })}
            onPlayersChange={handlePlayersChange}
            onAddGroup={handleAddGroup}
            onGroupPlayersChange={handleGroupPlayersChange}
            onAddFromFriendsClick={(groupId) => {
              setAddFriendsTargetGroupId(groupId);
              openDialog('addFromFriends');
            }}
            onOpenDialog={openDialog}
            onSetView={setView}
            onCreateRound={handleCreateRound}
            onStartRound={handleStartRound}
            onContinueRound={handleContinueRound}
            setRoundDate={setRoundDate}
            setScores={setScores}
            setRoundPlayerIds={setRoundPlayerIds}
            setPlayerGroups={setPlayerGroups}
          />
        )}

        {(['betsetup','handicaps','scoring','scorecard','bets'] as const).includes(view as 'betsetup'|'handicaps'|'scoring'|'scorecard'|'bets') && (
          <PlayViews
            view={view}
            players={players}
            playerGroups={playerGroups}
            course={course}
            scores={scores}
            confirmedHoles={confirmedHoles}
            betConfig={betConfig}
            currentHole={currentHole}
            roundState={roundState}
            profile={profile}
            startingHole={startingHole}
            roundPlayerIds={roundPlayerIds}
            isRoundStarted={isRoundStarted}
            isLoadingHandicaps={isLoadingHandicaps}
            isLoading={isLoading}
            isClosing={isClosing}
            holePar={holePar}
            wolfHook={wolf}
            sixesHook={sixes}
            vegasHook={vegas}
            ninesHook={nines}
            dialogs={dialogs}
            setDialog={setDialog}
            getStrokesForLocalPair={getStrokesForLocalPair}
            getLocalPairStrokeState={getLocalPairStrokeState}
            setStrokesForLocalPair={setStrokesForLocalPair}
            getBilateralHandicapsForEngine={getBilateralHandicapsForEngine}
            getStrokeIndicators={getStrokeIndicators}
            setCurrentHole={setCurrentHole}
            isHoleConfirmed={isHoleConfirmed}
            confirmHole={confirmHole}
            updateScore={updateScore}
            setBetConfig={setBetConfig}
            setCurrentBetSummaries={setCurrentBetSummaries}
            setQuickScorePlayer={setQuickScorePlayer}
            onOpenDialog={openDialog}
            onSetView={setView}
            onResetRoundForReclose={resetRoundForReclose}
            onStartNewRound={startNewRound}
            crossBets={crossBets}
            onUpdateCrossBetConfig={updateCrossBetConfig}
          />
        )}

        {roundState.id && (
          <AddPlayerFromScorecardDialog
            open={dialogs.addPlayer}
            onOpenChange={(v: boolean) => setDialog('addPlayer', v)}
            roundId={roundState.id}
            onAddGuest={handleAddGuestFromScorecard}
            onAddFromFriends={handleAddPlayersFromFriends}
            existingPlayerIds={players.map(p => p.profileId || p.id)}
            currentPlayerCount={players.length + playerGroups.reduce((sum, g) => sum + g.players.length, 0)}
            maxPlayersRecommended={6}
          />
        )}

        {/* Leaderboards View */}
        {view === 'leaderboards' && (
          leaderboardDetailId ? (
            leaderboardDetailType === 'teams_cup' ? (
              <TeamsCupDetailInline
                leaderboardId={leaderboardDetailId}
                onBack={() => setLeaderboardDetailId(null)}
              />
            ) : leaderboardDetailType === 'multi_day' ? (
              <MultiDayLeaderboardDetail
                leaderboardId={leaderboardDetailId}
                onBack={() => setLeaderboardDetailId(null)}
                hasActiveRound={isRoundStarted && roundState.status !== 'completed'}
                isRoundLinked={isRoundLinkedToLeaderboard}
                onLinkRound={() => {
                  setPreselectedLeaderboardId(leaderboardDetailId);
                  openDialog('linkLeaderboard');
                }}
                onUnlinkRound={async () => {
                  if (!roundState.id || !leaderboardDetailId) return;
                  try {
                    const roundId = roundState.id;
                    const leaderboardId = leaderboardDetailId;
                    const { error: linkError } = await supabase
                      .from('leaderboard_rounds')
                      .delete()
                      .eq('leaderboard_id', leaderboardId)
                      .eq('round_id', roundId);
                    if (linkError) throw linkError;
                    const { error: scoresError } = await supabase
                      .from('leaderboard_scores')
                      .delete()
                      .eq('leaderboard_id', leaderboardId)
                      .eq('round_id', roundId);
                    if (scoresError) throw scoresError;
                    setIsRoundLinkedToLeaderboard(false);
                    toast.success('Ronda desvinculada del leaderboard');
                  } catch (err: any) {
                    toast.error('Error al desvincular: ' + err.message);
                  }
                }}
              />

            ) : (
              <LeaderboardDetailInline

                leaderboardId={leaderboardDetailId}
                onBack={() => setLeaderboardDetailId(null)}
                hasActiveRound={isRoundStarted && roundState.status !== 'completed'}
                isRoundLinked={isRoundLinkedToLeaderboard}
                onLinkRound={() => {
                  setPreselectedLeaderboardId(leaderboardDetailId);
                  openDialog('linkLeaderboard');
                }}
                onUnlinkRound={async () => {
                  if (!roundState.id || !leaderboardDetailId) return;
                  try {
                    const roundId = roundState.id;
                    const leaderboardId = leaderboardDetailId;

                    // 1) Unlink the round
                    const { error: linkError } = await supabase
                      .from('leaderboard_rounds')
                      .delete()
                      .eq('leaderboard_id', leaderboardId)
                      .eq('round_id', roundId);
                    if (linkError) throw linkError;

                    // 2) Remove any computed/persisted leaderboard scores for that round
                    const { error: scoresError } = await supabase
                      .from('leaderboard_scores')
                      .delete()
                      .eq('leaderboard_id', leaderboardId)
                      .eq('round_id', roundId);
                    if (scoresError) throw scoresError;

                    // 3) Remove participants that belong ONLY to the unlinked round
                    const { data: removedRps, error: removedErr } = await supabase
                      .from('round_players')
                      .select('profile_id, guest_name')
                      .eq('round_id', roundId);
                    if (removedErr) throw removedErr;

                    const removedProfileIds = Array.from(
                      new Set((removedRps || []).map((r) => r.profile_id).filter(Boolean) as string[])
                    );
                    const removedGuestNames = Array.from(
                      new Set((removedRps || []).map((r) => r.guest_name).filter(Boolean) as string[])
                    );

                    const { data: remainingLinks, error: remainingErr } = await supabase
                      .from('leaderboard_rounds')
                      .select('round_id')
                      .eq('leaderboard_id', leaderboardId);
                    if (remainingErr) throw remainingErr;

                    const remainingRoundIds = (remainingLinks || []).map((l) => l.round_id).filter(Boolean) as string[];
                    const stillProfileIds = new Set<string>();
                    const stillGuestNames = new Set<string>();

                    if (remainingRoundIds.length > 0) {
                      const { data: stillRps, error: stillErr } = await supabase
                        .from('round_players')
                        .select('profile_id, guest_name')
                        .in('round_id', remainingRoundIds);
                      if (stillErr) throw stillErr;

                      for (const r of (stillRps || [])) {
                        if (r.profile_id) stillProfileIds.add(r.profile_id);
                        if (r.guest_name) stillGuestNames.add(r.guest_name);
                      }
                    }

                    // Remove participants sourced from this round ONLY if they're not present in any other linked round
                    const { data: sourcedParts, error: sourcedErr } = await supabase
                      .from('leaderboard_participants')
                      .select('id, profile_id, guest_name')
                      .eq('leaderboard_id', leaderboardId)
                      .eq('source_round_id', roundId);
                    if (sourcedErr) throw sourcedErr;

                    const sourcedIdsToDelete = (sourcedParts || [])
                      .filter((p) => {
                        if (p.profile_id) return !stillProfileIds.has(p.profile_id);
                        if (p.guest_name) return !stillGuestNames.has(p.guest_name);
                        return true;
                      })
                      .map((p) => p.id);

                    if (sourcedIdsToDelete.length > 0) {
                      const { error } = await supabase
                        .from('leaderboard_participants')
                        .delete()
                        .in('id', sourcedIdsToDelete);
                      if (error) throw error;
                    }

                    const profileIdsToDelete = removedProfileIds.filter((id) => !stillProfileIds.has(id));
                    if (profileIdsToDelete.length > 0) {
                      const { error } = await supabase
                        .from('leaderboard_participants')
                        .delete()
                        .eq('leaderboard_id', leaderboardId)
                        .in('profile_id', profileIdsToDelete);
                      if (error) throw error;
                    }

                    const guestNamesToDelete = removedGuestNames.filter((n) => !stillGuestNames.has(n));
                    if (guestNamesToDelete.length > 0) {
                      const { error } = await supabase
                        .from('leaderboard_participants')
                        .delete()
                        .eq('leaderboard_id', leaderboardId)
                        .in('guest_name', guestNamesToDelete);
                      if (error) throw error;
                    }

                    setIsRoundLinkedToLeaderboard(false);
                    toast.success('Ronda desvinculada del leaderboard');
                  } catch (err: any) {
                    toast.error('Error al desvincular: ' + err.message);
                  }
                }}
              />
            )
          ) : (
            <LeaderboardsInlineView
              onNavigateToDetail={(id, type) => {
                setLeaderboardDetailId(id);
                setLeaderboardDetailType(
                  type === 'teams_cup' ? 'teams_cup'
                    : type === 'multi_day' ? 'multi_day'
                    : 'standard'
                );
              }}
            />

          )
        )}

        {/* Rankings View */}
        {view === 'rankings' && (
          rankingDetailId ? (
            <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
              <MoneyRankingDetail
                inlineId={rankingDetailId}
                onBack={() => setRankingDetailId(null)}
              />
            </Suspense>
          ) : (
            <RankingsInlineView
              onNavigateToDetail={(id) => setRankingDetailId(id)}
            />
          )
        )}

        {/* Stats View */}
        {view === 'stats' && (
          <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
            <StatsInlineView />
          </Suspense>
        )}
      </main>

      {/* Floating Action Button for Score Capture */}
      {isRoundStarted && roundState.status !== 'completed' && (
        <ScoringFAB
          currentHole={currentHole}
          onClick={() => setView('scoring')}
          isOnScoringView={view === 'scoring'}
          isOnBetsView={view === 'bets'}
          isOnBetSetupView={view === 'betsetup'}
        />
      )}

      {/* History Dialog */}
      <AppDialogs
        dialogs={dialogs}
        setDialog={setDialog}
        openDialog={openDialog}
        closeDialog={closeDialog}
        profile={profile}
        user={user}
        roundState={roundState}
        course={course}
        players={players}
        playerGroups={playerGroups}
        scores={scores}
        roundPlayerIds={roundPlayerIds}
        betConfig={betConfig}
        startingHole={startingHole}
        currentBetSummaries={currentBetSummaries}
        view={view}
        historicalScorecardData={historicalScorecardData}
        lastCloseReport={lastCloseReport}
        isClosing={isClosing}
        leaderboardDetailId={leaderboardDetailId}
        isRoundLinkedToLeaderboard={isRoundLinkedToLeaderboard}
        preselectedLeaderboardId={preselectedLeaderboardId}
        quickScorePlayer={quickScorePlayer}
        addFriendsTargetGroupId={addFriendsTargetGroupId}
        setProfileMenuOpen={setProfileMenuOpen}
        getCourseById={getCourseById}
        getStrokesForLocalPair={getStrokesForLocalPair}
        closeScorecard={closeScorecard}
        resetToNewRound={resetToNewRound}
        handleCloneRound={handleCloneRound}
        handleCloneFullRound={handleCloneFullRound}
        handleAddPlayersFromFriends={handleAddPlayersFromFriends}
        handleAddPlayersFromFriendsToGroup={handleAddPlayersFromFriendsToGroup}
        handleAddFriendToRound={handleAddFriendToRound}
        setHistoricalScorecardData={setHistoricalScorecardData}
        setIsRoundLinkedToLeaderboard={setIsRoundLinkedToLeaderboard}
        setPreselectedLeaderboardId={setPreselectedLeaderboardId}
        setQuickScorePlayer={setQuickScorePlayer}
        setAddFriendsTargetGroupId={setAddFriendsTargetGroupId}
        setScores={setScores}
        setRoundShareData={setRoundShareData}
        onOpenRoundShare={() => openDialog('roundShare')}
      />
      {roundShareData && (
        <RoundShareImage
          {...roundShareData}
          open={dialogs.roundShare}
          onClose={() => {
            closeDialog('roundShare');
            // After viewing/dismissing the share image, reset to a clean setup
            resetToNewRound();
          }}
        />
      )}
      {(!user || user.is_anonymous) && <GuestConversionScreen />}
      <AttestationSheet
        open={dialogs.attestation}
        onClose={() => closeDialog('attestation')}
        rounds={pendingAttestations}
        isAttesting={isAttesting}
        onAttest={attestPlayer}
      />
      <RoundAuditSheet
        open={dialogs.auditLog}
        onClose={() => closeDialog('auditLog')}
        entries={auditEntries}
        isLoading={isAuditLoading}
        onRefresh={refetchAudit}
      />

      <CrossBetInvitationsSheet
        open={dialogs.crossInvitations}
        onClose={() => closeDialog('crossInvitations')}
        invitations={crossInvitations}
        isAccepting={isAcceptingCross}
        isDeclining={isDecliningCross}
        onAccept={async (id) => { await acceptCrossInvitation(id); refetchCrossBets(); }}
        onDecline={declineCrossInvitation}
      />

      {crossBetTarget && (
        <AlertDialog open={!!crossBetTarget} onOpenChange={(v) => { if (!v) setCrossBetTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Cruzar tarjeta con {crossBetTarget.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Se enviará una invitación de cruce. Cuando la acepte, podrás elegir qué apuestas individuales incluir en este cruce desde la sección <strong>Apuestas de Cruce</strong> del dashboard.
                {sendError && (
                  <span className="block mt-2 text-destructive text-xs">
                    {(sendError as any)?.message?.includes('subscription_required')
                      ? 'Ambos jugadores necesitan suscripción Pro para cruzar tarjeta.'
                      : 'Error al enviar la invitación. Intenta de nuevo.'}
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isSending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={isSending}
                onClick={async (e) => {
                  e.preventDefault();
                  try {
                    await sendInvitation({ targetProfileId: crossBetTarget.profileId, betConfigProposal: {} });
                    setCrossBetTarget(null);
                  } catch {
                    // sendError shown above
                  }
                }}
              >
                {isSending ? 'Enviando…' : 'Enviar invitación'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        reason={upgradeReason}
      />
    </div>
  );
};

export default Index;
