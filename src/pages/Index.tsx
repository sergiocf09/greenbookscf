import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PlayerScoreInput } from '@/components/scoring/PlayerScoreInput';
import { ScoringView } from '@/components/scoring/ScoringView';
import { PlayerSetup } from '@/components/setup/PlayerSetup';
import { CourseSelect } from '@/components/setup/CourseSelect';
import { BetSetup, defaultBetConfig } from '@/components/setup/BetSetup';
import { HandicapMatrix } from '@/components/setup/HandicapMatrix';
import { Scorecard } from '@/components/scorecard/Scorecard';
import { BetDashboard } from '@/components/bets/BetDashboard';
import { RoundHistory, CloneRoundData, FullCloneRoundData } from '@/components/RoundHistory';
import { HandicapCalculator } from '@/components/HandicapCalculator';
import { HistoricalRoundView } from '@/components/HistoricalRoundView';
import { HistoricalBalances } from '@/components/HistoricalBalances';
import { HandicapHistoryView } from '@/components/profile/HandicapHistoryView';
import { ShareRoundDialog } from '@/components/ShareRoundDialog';
import { AddPlayerFromScorecardDialog, type AddGuestPayload } from '@/components/scorecard/AddPlayerFromScorecardDialog';
import { LeaderboardDialog } from '@/components/LeaderboardDialog';
import { LinkRoundToLeaderboardDialog } from '@/components/leaderboards/LinkRoundToLeaderboardDialog';
import { LeaderboardsInlineView } from '@/components/leaderboards/LeaderboardsInlineView';
import { LeaderboardDetailInline } from '@/components/leaderboards/LeaderboardDetailInline';
import { QuickScoreEntry } from '@/components/scoring/QuickScoreEntry';
import { ScoringFAB } from '@/components/scoring/ScoringFAB';
import { Player, PlayerScore, BetConfig, GolfCourse, HoleInfo, PlayerGroup } from '@/types/golf';
import { defaultMarkerState } from '@/types/golf';
import { useGolfCourses } from '@/hooks/useGolfCourses';
import { useRoundManagement } from '@/hooks/useRoundManagement';
import { useRealtimeScores } from '@/hooks/useRealtimeScores';
import { useBetConfigPersistence } from '@/hooks/useBetConfigPersistence';
import { useRoundHandicaps } from '@/hooks/useRoundHandicaps';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Settings, LayoutGrid, Trophy, Users, LogOut, User, Check, CheckCircle2, Calendar as CalendarIcon, Share2, Lock, Play, Loader2, History, Calculator, Hash, Sliders, DollarSign, UserPlus, Receipt, Dices, RefreshCw, TrendingDown } from 'lucide-react';
import CoinDollarIcon from '@/components/icons/CoinDollarIcon';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { devError, devWarn } from '@/lib/logger';
import { isAutoDetectedMarker } from '@/lib/scoreDetection';
import { markerKeyToDb } from '@/lib/markerTypeMapping';
import { initialsFromPlayerName, validatePlayerName } from '@/lib/playerInput';
import GreenBookLogo from '@/components/GreenBookLogo';
import { ProfileDialog } from '@/components/ProfileDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { CloseAttemptDialog } from '@/components/close/CloseAttemptDialog';
import { CloseRoundConfirmDialog } from '@/components/close/CloseRoundConfirmDialog';
import { FriendsDialog } from '@/components/friends/FriendsDialog';
import { AddFromFriendsDialog } from '@/components/friends/AddFromFriendsDialog';
import { Friend } from '@/hooks/useFriends';

type AppView = 'setup' | 'betsetup' | 'scoring' | 'scorecard' | 'bets' | 'handicaps' | 'leaderboards';

const Index = () => {
  const navigate = useNavigate();
  const { profile, signOut, updateProfile } = useAuth();

  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [view, setView] = useState<AppView>('setup');
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [betConfig, setBetConfig] = useState<BetConfig>(defaultBetConfig);
  const [currentHole, setCurrentHole] = useState(1);
  const [scores, setScores] = useState<Map<string, PlayerScore[]>>(new Map());
  const [confirmedHoles, setConfirmedHoles] = useState<Set<number>>(new Set());
  const [currentBetSummaries, setCurrentBetSummaries] = useState<any[]>([]);

  // Keep an always-fresh reference to scores to avoid stale closures when persisting confirmations.
  const scoresRef = useRef<Map<string, PlayerScore[]>>(new Map());
  useEffect(() => {
    scoresRef.current = scores;
  }, [scores]);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [showBalancesDialog, setShowBalancesDialog] = useState(false);
  const [showHandicapDialog, setShowHandicapDialog] = useState(false);
  const [showHandicapHistoryDialog, setShowHandicapHistoryDialog] = useState(false);
  const [showScorecardDialog, setShowScorecardDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showAddPlayerDialog, setShowAddPlayerDialog] = useState(false);
  const [showLeaderboardDialog, setShowLeaderboardDialog] = useState(false);
  const [showLinkLeaderboardDialog, setShowLinkLeaderboardDialog] = useState(false);
  const [preselectedLeaderboardId, setPreselectedLeaderboardId] = useState<string | null>(null);
  const [leaderboardDetailId, setLeaderboardDetailId] = useState<string | null>(null);
  const [showHandicapMatrixDialog, setShowHandicapMatrixDialog] = useState(false);
  const [showCloseAttemptDialog, setShowCloseAttemptDialog] = useState(false);
  const [showCloseConfirmDialog, setShowCloseConfirmDialog] = useState(false);
  const [showPendingRoundDialog, setShowPendingRoundDialog] = useState(false);
  const [showFriendsDialog, setShowFriendsDialog] = useState(false);
  const [showAddFromFriendsDialog, setShowAddFromFriendsDialog] = useState(false);
  // showBetSetupDialog removed – betsetup is now a real tab view
  const [addFriendsTargetGroupId, setAddFriendsTargetGroupId] = useState<string | null>(null);
  const [quickScorePlayer, setQuickScorePlayer] = useState<Player | null>(null);
  const [playerGroups, setPlayerGroups] = useState<PlayerGroup[]>([]);
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
  
  const [teeColor, setTeeColor] = useState<'blue' | 'white' | 'yellow' | 'red'>('white');
  const [startingHole, setStartingHole] = useState<1 | 10>(1);

  // PERF: no cargues el catálogo de campos hasta que el usuario decida qué hacer con las rondas pendientes.
  const [enableCourseCatalog, setEnableCourseCatalog] = useState(false);
  const { getCourseById } = useGolfCourses({ enabled: enableCourseCatalog });
  const course = selectedCourseId ? getCourseById(selectedCourseId) : null;

  // Round management hook with restoration
  const {
    roundState,
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
  });

  // Habilita la carga del catálogo de campos sólo después de resolver el flujo de rondas pendientes.
  useEffect(() => {
    if (!profile) return;
    if (isRestoring) return;

    const shouldBlockForPending = showPendingRoundDialog && pendingRounds.length > 0 && !isRoundStarted;
    setEnableCourseCatalog(!shouldBlockForPending);
  }, [profile, isRestoring, showPendingRoundDialog, pendingRounds.length, isRoundStarted]);

  // Persist bet config (overrides, handicaps bilaterales, carritos cancelados, etc.) to backend
  const { loadBetConfig, saveBetConfig, isLoaded: isBetConfigLoaded } = useBetConfigPersistence({
    roundId: roundState.id,
    betConfig,
    setBetConfig,
  });

  // Bilateral handicaps hook - NEW dedicated table for handicap persistence
  const {
    isLoading: isLoadingHandicaps,
    isLoaded: isHandicapsLoaded,
    getStrokesForLocalPair,
    setStrokesForLocalPair,
    initializeHandicapsForNewPlayer,
    getBilateralHandicapsForEngine,
  } = useRoundHandicaps({
    roundId: roundState.id,
    players,
    roundPlayerIds,
  });

  // Ensure betConfig is loaded at least once for this round so debounced saves are enabled.
  useEffect(() => {
    if (!roundState.id) return;
    void loadBetConfig();
  }, [roundState.id, loadBetConfig]);

  // Auto-cleanup after restore: if Carritos is enabled but teams are incomplete, disable and persist.
  const hasSanitizedCarritosForRoundRef = useRef<string | null>(null);
  const wasRestoringRef = useRef(false);

  useEffect(() => {
    if (isRestoring) wasRestoringRef.current = true;
  }, [isRestoring]);

  useEffect(() => {
    if (!roundState.id) return;
    if (isRestoring) return;
    if (!isBetConfigLoaded) return;
    if (players.length === 0) return;
    if (hasSanitizedCarritosForRoundRef.current === roundState.id) return;
    // IMPORTANT: Only sanitize right after a restoration finishes.
    // Otherwise we would disable freshly-enabled Carritos during normal setup (teams start empty).
    if (!wasRestoringRef.current) return;

    const validPlayerIds = new Set([
      ...players.map((p) => p.id),
      ...playerGroups.flatMap((g) => g.players.map((p) => p.id)),
    ]);
    const isTeamComplete = (team: [string, string]) =>
      Boolean(team?.[0]) && Boolean(team?.[1]) && validPlayerIds.has(team[0]) && validPlayerIds.has(team[1]);

    let changed = false;
    const next: BetConfig = {
      ...betConfig,
      carritos: { ...betConfig.carritos },
      carritosTeams: (betConfig.carritosTeams ?? []).map((t) => ({ ...t })),
    };

    // Single legacy Carritos config
    if (next.carritos?.enabled) {
      const okA = isTeamComplete(next.carritos.teamA);
      const okB = isTeamComplete(next.carritos.teamB);
      if (!okA || !okB) {
        // Disable AND clear selection so the UI doesn't show prefilled/invalid players.
        next.carritos = {
          ...next.carritos,
          enabled: false,
          teamA: ['', ''],
          teamB: ['', ''],
          teamHandicaps: {},
        };
        changed = true;
      }
    }

    // Multi-team Carritos
    if (next.carritosTeams?.length) {
      next.carritosTeams = next.carritosTeams.map((t) => {
        if (!t.enabled) return t;
        const okA = isTeamComplete(t.teamA);
        const okB = isTeamComplete(t.teamB);
        if (!okA || !okB) {
          changed = true;
          return {
            ...t,
            enabled: false,
            teamA: ['', ''],
            teamB: ['', ''],
            teamHandicaps: {},
          };
        }
        return t;
      });
    }

    if (!changed) return;

    hasSanitizedCarritosForRoundRef.current = roundState.id;
    wasRestoringRef.current = false;

    // Persist immediately so a later restore doesn't resurrect the ghost bet.
    setBetConfig(next);
    void saveBetConfig(next);
  }, [roundState.id, isRestoring, isBetConfigLoaded, players, playerGroups, betConfig, saveBetConfig, setBetConfig]);

  // Auto-restore the most recent pending round without showing the dialog
  useEffect(() => {
    // Skip if already processing a restore (prevent infinite loops)
    const restoreInProgress = sessionStorage.getItem('restore_round_id');
    if (restoreInProgress) return;
    
    // Skip if no pending rounds or already restoring/closing
    if (!pendingRounds?.length) return;
    if (isRestoring) return;
    if (isLoading || isClosing) return;
    if (roundState.id && pendingRounds.some((r) => r.roundId === roundState.id)) return;
    if (isRoundStarted) return;
    
    // Don't auto-restore if user is actively configuring a new round
    if (players.length > 0 || selectedCourseId) return;

    // Check if user explicitly skipped restore
    const skipOnce = sessionStorage.getItem('skip_restore_once');
    if (skipOnce) {
      sessionStorage.removeItem('skip_restore_once');
      return;
    }

    // Auto-restore the most recent pending round (first in the list, sorted by date desc)
    const mostRecentRound = pendingRounds[0];
    if (mostRecentRound) {
      sessionStorage.setItem('restore_round_id', mostRecentRound.roundId);
      window.location.reload();
    }
  }, [pendingRounds, isRestoring, isLoading, isClosing, roundState.id, isRoundStarted, players.length, selectedCourseId]);

  // Persist players when round is created (players added before round creation)
  const persistedPlayersForRoundRef = useRef<string | null>(null);
  useEffect(() => {
    if (!roundState.id || !roundState.groupId) return;
    if (isRestoring) return;
    if (persistedPlayersForRoundRef.current === roundState.id) return;
    
    const persistUnmappedPlayers = async () => {
      for (const player of players) {
        // Skip if already mapped (already persisted)
        if (roundPlayerIds.has(player.id)) continue;
        if (player.profileId && roundPlayerIds.has(player.profileId)) continue;
        
        // Persist this player (addPlayerToRound handles both registered and guest players)
        await addPlayerToRound(player, roundState.groupId!);
      }
      persistedPlayersForRoundRef.current = roundState.id;
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

    const hasHydratedScores = scores.size > 0 && Array.from(scores.values()).some((arr) => (arr?.length ?? 0) > 0);
    const isHydrated = Boolean(roundState.id) && Boolean(course) && players.length > 0 && hasHydratedScores;

    if (isHydrated) {
      setView('bets');
      setHasInitialNavigated(true);
      return;
    }

    // If there isn't enough data yet (e.g., course still loading), don't force a view.
    // We'll re-run until hydrated, then lock navigation.
  }, [hasInitialNavigated, isRestoring, roundState.id, course, players.length, scores]);

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
    setShowHistoryDialog(false);
    
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
    setShowHistoryDialog(false);
    
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

          const markerInserts: { hole_score_id: string; marker_type: any; is_auto_detected: boolean }[] = [];
          for (const score of playerScores as any[]) {
            if (!score.markers) continue;
            const holeScoreId = scoreIdByHole.get(score.holeNumber);
            if (!holeScoreId) continue;
            
            for (const [markerKey, isActive] of Object.entries(score.markers)) {
              if (!isActive) continue;
              const dbMarkerType = markerKeyToDb[markerKey as keyof typeof markerKeyToDb];
              if (!dbMarkerType) continue;
              markerInserts.push({
                hole_score_id: holeScoreId,
                marker_type: dbMarkerType as any,
                is_auto_detected: false,
              });
            }
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
              if (currentPlayer.teeColor !== newPlayer.teeColor && newPlayer.teeColor) {
                updates.tee_color = newPlayer.teeColor;
              }

              if (Object.keys(updates).length > 0) {
                supabase
                  .from('round_players')
                  .update(updates)
                  .eq('id', roundPlayerId)
                  .then(({ error }) => {
                    if (error) devError('Error persisting group player changes:', error);
                  });
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

  const handleClosePendingRoundPermanently = useCallback(async (roundId: string) => {

    try {
      // Mark round as completed. This is a minimal "close" without rebuilding local state.
      const { error: roundErr } = await supabase
        .from('rounds')
        .update({ status: 'completed' })
        .eq('id', roundId);

      if (roundErr) throw roundErr;

      // Best-effort: set existing hole scores as confirmed (so they count as "final")
      const { data: rpIds, error: rpErr } = await supabase
        .from('round_players')
        .select('id')
        .eq('round_id', roundId);

      if (!rpErr && rpIds?.length) {
        await supabase
          .from('hole_scores')
          .update({ confirmed: true })
          .in('round_player_id', rpIds.map((r) => r.id));
      }

      toast.success('Tarjeta cerrada');

      // Continue clean
      sessionStorage.setItem('skip_restore_once', '1');
      window.location.reload();
    } catch (e: any) {
      devError('Error closing pending round:', e);
      toast.error('No se pudo cerrar la tarjeta (requiere ser organizador)');
    }
  }, []);

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

  // Combine players from all groups with groupId for bet scope detection
  const allPlayersForBets = useMemo(() => {
    const mainGroupId = roundState?.groupId;
    const mainWithGroup = players.map(p => ({
      ...p,
      groupId: p.groupId || mainGroupId || undefined,
    }));
    // Add players from additional groups
    const mainPlayerIds = new Set(players.map(p => p.id));
    const additionalPlayers = playerGroups
      .flatMap(g => g.players.map(p => ({ ...p, groupId: g.id })))
      .filter(p => !mainPlayerIds.has(p.id));
    return [...mainWithGroup, ...additionalPlayers];
  }, [players, playerGroups, roundState?.groupId]);

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

  // Handle global tee color change - propagate to all players without explicit tee
  const handleTeeColorChange = useCallback((newTeeColor: 'blue' | 'white' | 'yellow' | 'red') => {
    setTeeColor(newTeeColor);
    
    // Update all players that don't have an explicit tee set (or have the old default)
    // When round is active, also persist to database
    const updatedPlayers = players.map(p => ({
      ...p,
      teeColor: p.teeColor === teeColor || !p.teeColor ? newTeeColor : p.teeColor,
    }));
    
    setPlayers(updatedPlayers);
    
    // Persist tee changes to database if round exists
    if (roundState.id) {
      for (const player of updatedPlayers) {
        const originalPlayer = players.find(p => p.id === player.id);
        // Only update if tee actually changed
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
    
    // Also update player groups
    if (playerGroups.length > 0) {
      setPlayerGroups(prevGroups => prevGroups.map(group => ({
        ...group,
        players: group.players.map(p => ({
          ...p,
          teeColor: p.teeColor === teeColor || !p.teeColor ? newTeeColor : p.teeColor,
        })),
      })));
    }
  }, [teeColor, players, setPlayers, roundState.id, roundPlayerIds, playerGroups, setPlayerGroups]);

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
            
            // Check handicap change
            if (currentPlayer.handicap !== newPlayer.handicap) {
              updates.handicap_for_round = newPlayer.handicap;
            }
            
            // Check tee color change
            if (currentPlayer.teeColor !== newPlayer.teeColor && newPlayer.teeColor) {
              updates.tee_color = newPlayer.teeColor;
            }
            
            // Only persist if there are changes
            if (Object.keys(updates).length > 0) {
              supabase
                .from('round_players')
                .update(updates)
                .eq('id', roundPlayerId)
                .then(({ error }) => {
                  if (error) {
                    devError('Error persisting player changes:', error);
                  }
                });
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
        // Skip if already persisted
        if (!roundPlayerIds.has(player.id)) {
          await addPlayerToRound(player);
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
        setShowShareDialog(true);
      }
    }
  };

  // Start scoring (can do with 1 player for solo tracking)
  const handleStartRound = async () => {
    if (!course || !selectedCourseId) return;
    
    // Create round in database first if not exists
    if (!roundState.id) {
      const roundId = await createRound(selectedCourseId, teeColor, roundState.date, startingHole);
      if (!roundId) return;
      // Wait for useEffect to persist unmapped players
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Initialize scores and start
    initializeScores();
    const success = await startRoundInDb();
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

  // Save score to database when updated
  const saveScoreToDb = useCallback(async (playerId: string, holeNumber: number, score: Partial<PlayerScore>) => {
    const rpId = roundPlayerIds.get(playerId);
    if (!rpId || !roundState.id) return;

    try {
      // Persist score row and retrieve its id (needed to persist markers)
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
        return;
      }

       // Persist manual markers (unidades + manchas). We intentionally do NOT persist
       // auto-detected markers (birdie/eagle/culebra/etc.) since they can be derived.
      if (score.markers) {
        const holeScoreId = Array.isArray(upserted) ? upserted[0]?.id : (upserted as any)?.id;
        if (holeScoreId) {
           const activeKeys = (Object.keys(score.markers) as (keyof typeof score.markers)[])
             .filter((k) => !!(score.markers as any)[k])
             .filter((k) => !isAutoDetectedMarker(k as any));

          // Replace manual markers for this hole_score_id
          const { error: delErr } = await supabase
            .from('hole_markers')
            .delete()
            .eq('hole_score_id', holeScoreId)
            .eq('is_auto_detected', false);

          if (delErr) {
            console.error('Error clearing hole markers:', delErr);
            return;
          }

          if (activeKeys.length) {
            const { error: insErr } = await supabase
              .from('hole_markers')
              .insert(
                activeKeys.map((markerKey) => ({
                  hole_score_id: holeScoreId,
                  marker_type: markerKeyToDb[markerKey as any] as any,
                  is_auto_detected: false,
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
    }
  }, [roundPlayerIds, roundState.id]);

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
          // Score exists - just mark as confirmed
          playerScores[idx] = { ...playerScores[idx], confirmed: true };
        } else {
          // Score doesn't exist - create it with default values
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
    
    // Note: we don't add to global confirmedHoles since confirmation is now per-group
    // The UI derives this from per-player scores

    // Persist confirmation explicitly - use a small delay to ensure local state is updated
    if (roundState.id && course) {
      setTimeout(() => {
        void Promise.all(
          targetPlayerIds.map(async (playerId) => {
            const holeScore = scoresRef.current.get(playerId)?.find((s) => s.holeNumber === holeNumber);
            if (!holeScore) return;
            await saveScoreToDb(playerId, holeNumber, { ...holeScore, confirmed: true });
          })
        );
      }, 50);
    }
  }, [players, playerGroups, course, saveScoreToDb, roundState.id]);

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
      <AlertDialog open={showPendingRoundDialog && pendingRounds.length > 0 && !isRestoring} onOpenChange={setShowPendingRoundDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tarjeta pendiente</AlertDialogTitle>
            <AlertDialogDescription>
              Encontramos rondas sin “Cerrar Tarjeta”. Elige cuál quieres restaurar o cerrar.

              <div className="mt-3 space-y-2">
                {pendingRounds.map((r) => {
                  const s = pendingRoundSummaries.get(r.roundId);
                  return (
                    <div key={r.roundId} className="border border-border rounded-lg p-3 bg-card">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground">
                            {s?.courseName ?? 'Campo'}
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
                              setShowPendingRoundDialog(false);
                              handleRestorePendingRound(r.roundId);
                            }}
                          >
                            Restaurar
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              setShowPendingRoundDialog(false);
                              void handleClosePendingRoundPermanently(r.roundId);
                            }}
                          >
                            Cerrar
                          </Button>
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
                  setShowPendingRoundDialog(false);
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
      <header className="bg-primary text-primary-foreground py-3 px-4 shadow-lg">
        <div className="max-w-md mx-auto flex items-center">
          {/* Left: Logo */}
          <div className="flex items-center flex-shrink-0">
            <GreenBookLogo height={36} />
          </div>
          
          {/* Center: Hole Info - takes remaining space */}
          <div className="flex-1 text-center">
            {view !== 'setup' && course && currentHoleInfo && (
              <>
                <p className="text-xl font-bold text-accent">Hoyo {currentHole}</p>
                <p className="text-sm font-bold text-primary-foreground/90">
                  Par {holePar} • SI {holeStrokeIndex}
                  {holeYards && <span> • {holeYards} yds</span>}
                </p>
              </>
            )}
          </div>
          
          {/* Right: Friends (only in setup) + Profile Menu */}
          <div className="flex items-center flex-shrink-0 gap-1">
            {/* Friends Button - only show in setup view */}
            {view === 'setup' && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-full text-primary-foreground hover:bg-primary-foreground/10"
                onClick={() => setShowFriendsDialog(true)}
              >
                <Users className="h-5 w-5" />
              </Button>
            )}
            
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  {profile?.initials ? (
                    <div className="relative">
                      {/* Match header look & feel: green ring + subtle gold accent */}
                      <div className="absolute -inset-0.5 rounded-full bg-gradient-to-br from-primary to-accent opacity-80" />
                      <div className="relative rounded-full bg-background p-0.5">
                        <PlayerAvatar
                          initials={profile.initials}
                          background={profile.avatar_color || "#3B82F6"}
                          size="md"
                          className="shadow-sm"
                        />
                      </div>
                    </div>
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="px-2 py-1.5">
                  <p className="font-medium text-sm">{profile?.display_name}</p>
                  <p className="text-xs text-muted-foreground">HCP: {profile?.current_handicap}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowProfileDialog(true)}>
                  <Settings className="h-4 w-4 mr-2" />
                  Perfil
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/join')}>
                  <Hash className="h-4 w-4 mr-2" />
                  Unirse con Código
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setView('leaderboards')}>
                  <Trophy className="h-4 w-4 mr-2" />
                  Leaderboards
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowHistoryDialog(true)}>
                  <History className="h-4 w-4 mr-2" />
                  Historial de Rondas
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    // Best-effort repair: if the latest completed round has a snapshot but is missing
                    // persisted balances/ledger (e.g. a past partial close), rebuild from snapshot.
                    try {
                      const { data: latestCompleted, error } = await supabase
                        .from('rounds')
                        .select('id')
                        .eq('status', 'completed')
                        .order('updated_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                      if (!error && latestCompleted?.id) {
                        await supabase.rpc('rebuild_round_financials_from_snapshot', {
                          p_round_id: latestCompleted.id,
                        });
                      }
                    } catch (e) {
                      // Silent: if repair fails, we still open the dialog and let it load normally.
                      devError('Balances repair attempt failed:', e);
                    }

                    setShowBalancesDialog(true);
                  }}
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  Balances Históricos
                </DropdownMenuItem>
                {pendingRounds && pendingRounds.length > 0 && (
                  <DropdownMenuItem onClick={() => setShowPendingRoundDialog(true)}>
                    <Play className="h-4 w-4 mr-2 text-destructive" />
                    <span>Rondas Pendientes</span>
                    <span className="ml-1 text-destructive font-semibold">({pendingRounds.length})</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setShowHandicapDialog(true)}>
                  <Calculator className="h-4 w-4 mr-2" />
                  Calcular Handicap
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowHandicapHistoryDialog(true)}>
                  <TrendingDown className="h-4 w-4 mr-2" />
                  Historial de Handicap
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()} className="text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Cerrar Sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <ProfileDialog open={showProfileDialog} onOpenChange={setShowProfileDialog} />
        </div>
      </header>

      {/* Navigation Tabs - show when round is in progress OR not in setup view */}
      {(isRoundStarted || view !== 'setup') && (
        <div className="bg-card border-b border-border">
          <div className="max-w-md mx-auto">
            <Tabs value={view === 'scoring' ? 'scoring' : view} onValueChange={(v) => { setView(v as AppView); if (v !== 'leaderboards') setLeaderboardDetailId(null); }}>
              <TabsList className="w-full grid grid-cols-5 h-12">
                <TabsTrigger value="setup" className="text-xs"><Settings className="h-4 w-4" /></TabsTrigger>
                <TabsTrigger value="betsetup" className="text-xs"><Dices className="h-5 w-5" /></TabsTrigger>
                <TabsTrigger value="handicaps" className="text-xs"><RefreshCw className="h-4 w-4" /></TabsTrigger>
                <TabsTrigger value="scorecard" className="text-xs"><Trophy className="h-4 w-4" /></TabsTrigger>
                <TabsTrigger value="bets" className="text-xs"><CoinDollarIcon className="h-5 w-5" /></TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-md mx-auto p-4 space-y-4">
        {view === 'setup' && (
          <>
            {/* Date Picker */}
            <div className="flex items-center justify-between bg-card border border-border rounded-lg p-3">
              <span className="text-sm font-medium">Fecha de la Ronda</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !roundState.date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(roundState.date, "d 'de' MMMM, yyyy", { locale: es })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={roundState.date}
                    onSelect={(date) => date && setRoundDate(date)}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <CourseSelect 
              selectedCourseId={selectedCourseId} 
              onChange={setSelectedCourseId}
              teeColor={teeColor}
              onTeeColorChange={handleTeeColorChange}
              startingHole={startingHole}
              onStartingHoleChange={setStartingHole}
              enabled={enableCourseCatalog}
            />
            <PlayerSetup 
              players={players} 
              onChange={handlePlayersChange} 
              maxPlayers={6}
              showAddGroupButton={true}
              onAddGroupClick={handleAddGroup}
              courseId={selectedCourseId}
              defaultTeeColor={teeColor}
              onAddFromFriendsClick={() => {
                setAddFriendsTargetGroupId(null); // null = main group
                setShowAddFromFriendsDialog(true);
              }}
              organizerProfileId={roundState.organizerProfileId}
            />
            
            {/* Additional Groups */}
            {playerGroups.map((group, idx) => (
              <div key={group.id} className="space-y-2">
                <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                  <span className="text-sm font-medium">{group.name}</span>
                  {/* Only organizer can delete groups */}
                  {profile?.id === roundState.organizerProfileId && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                        >
                          Eliminar
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar {group.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Se eliminarán todos los jugadores y scores de este grupo. Esta acción no se puede deshacer.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={async () => {
                              if (roundState.id) {
                                try {
                                  const { error: rpErr } = await supabase
                                    .from('round_players')
                                    .delete()
                                    .eq('group_id', group.id);
                                  if (rpErr) throw rpErr;
                                  const { error: rgErr } = await supabase
                                    .from('round_groups')
                                    .delete()
                                    .eq('id', group.id);
                                  if (rgErr) throw rgErr;
                                } catch (err: any) {
                                  devError('Error deleting group from DB:', err);
                                  toast.error('Error al eliminar grupo');
                                  return;
                                }
                              }
                              const groupPlayerIds = new Set(group.players.map(p => p.id));
                              setScores(prev => {
                                const next = new Map(prev);
                                groupPlayerIds.forEach(id => next.delete(id));
                                return next;
                              });
                              setRoundPlayerIds(prev => {
                                const next = new Map(prev);
                                groupPlayerIds.forEach(id => {
                                  next.delete(id);
                                  const player = group.players.find(p => p.id === id);
                                  if (player?.profileId) next.delete(player.profileId);
                                });
                                return next;
                              });
                              setPlayerGroups(prev => prev.filter(g => g.id !== group.id));
                              toast.success(`${group.name} eliminado`);
                            }}
                          >
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
                <PlayerSetup
                  players={group.players}
                  onChange={(newPlayers) => {
                    void handleGroupPlayersChange(group.id, newPlayers);
                  }}
                  maxPlayers={6}
                  courseId={selectedCourseId}
                  defaultTeeColor={teeColor}
                  onAddFromFriendsClick={() => {
                    setAddFriendsTargetGroupId(group.id);
                    setShowAddFromFriendsDialog(true);
                  }}
                  organizerProfileId={roundState.organizerProfileId}
                />
              </div>
            ))}
            
            {/* Share Options Button - show after round is created */}
            {roundState.id && (
              <Button 
                variant="outline" 
                onClick={() => setShowShareDialog(true)}
                className="w-full"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Invitar Jugadores (Link, QR, Código)
              </Button>
            )}

            {/* Handicap Definition Button - show when 2+ players */}
            {players.length >= 2 && roundState.id && (
              <Button 
                variant="outline" 
                onClick={() => setView('handicaps')}
                className="w-full"
              >
                <Sliders className="h-4 w-4 mr-2" />
                Definir Hándicaps entre Jugadores
              </Button>
            )}

            {/* Bet setup moved to header icon/dialog */}
            
            {/* Action Buttons */}
            <div className="space-y-2">
              {/* Create Round button - shows when no round exists yet */}
              {!roundState.id && (
                <Button 
                  onClick={handleCreateRound} 
                  disabled={!canCreateRound || isLoading} 
                  className="w-full"
                  variant="outline"
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Crear Ronda y Obtener Link, QR & Código
                </Button>
              )}

              {/* Start Scoring button */}
              {!isRoundStarted ? (
                <Button 
                  onClick={handleStartRound} 
                  disabled={!canStartScoring || isLoading} 
                  className="w-full"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Iniciar Ronda
                </Button>
              ) : (
                <>
                  <Button 
                    onClick={handleContinueRound}
                    className="w-full"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Continuar Ronda
                  </Button>
                  <Button 
                    variant="outline"
                    disabled
                    className="w-full opacity-50"
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    Ronda Iniciada
                  </Button>
                </>
              )}
            </div>
          </>
        )}

        {view === 'betsetup' && (
          <BetSetup
            config={betConfig}
            onChange={setBetConfig}
            players={players}
            hasMultipleGroups={playerGroups.length > 0}
            userGroupId={roundState.groupId || undefined}
            isOrganizer={profile?.id === roundState.organizerProfileId}
          />
        )}

        {view === 'handicaps' && (
          <HandicapMatrix
            players={players}
            playerGroups={playerGroups}
            basePlayerId={profile?.id || ''}
            roundPlayerIds={roundPlayerIds}
            getStrokesForLocalPair={getStrokesForLocalPair}
            setStrokesForLocalPair={setStrokesForLocalPair}
            isLoading={isLoadingHandicaps}
          />
        )}

        {view === 'scoring' && course && (
          <ScoringView
            players={players}
            playerGroups={playerGroups}
            course={course}
            currentHole={currentHole}
            setCurrentHole={setCurrentHole}
            scores={scores}
            confirmedHoles={confirmedHoles}
            isHoleConfirmed={isHoleConfirmed}
            confirmHole={confirmHole}
            updateScore={updateScore}
            betConfig={betConfig}
            holePar={holePar}
            profile={profile}
            onAddSideBet={(bet) => {
              setBetConfig(prev => ({
                ...prev,
                sideBets: {
                  ...prev.sideBets,
                  enabled: true,
                  bets: [...(prev.sideBets?.bets || []), bet],
                },
              }));
            }}
            onUpdateSideBet={(bet) => {
              setBetConfig(prev => ({
                ...prev,
                sideBets: {
                  ...prev.sideBets,
                  bets: (prev.sideBets?.bets || []).map(b => b.id === bet.id ? bet : b),
                },
              }));
            }}
            onDeleteSideBet={(betId) => {
              setBetConfig(prev => ({
                ...prev,
                sideBets: {
                  ...prev.sideBets,
                  bets: (prev.sideBets?.bets || []).filter(b => b.id !== betId),
                },
              }));
            }}
            onAddZooEvent={(event) => {
              setBetConfig(prev => ({
                ...prev,
                zoologico: {
                  ...prev.zoologico,
                  events: [...(prev.zoologico?.events || []), event],
                },
              }));
            }}
            onUpdateZooEvent={(event) => {
              setBetConfig(prev => ({
                ...prev,
                zoologico: {
                  ...prev.zoologico,
                  events: (prev.zoologico?.events || []).map(e => e.id === event.id ? event : e),
                },
              }));
            }}
            onDeleteZooEvent={(eventId) => {
              setBetConfig(prev => ({
                ...prev,
                zoologico: {
                  ...prev.zoologico,
                  events: (prev.zoologico?.events || []).filter(e => e.id !== eventId),
                },
              }));
            }}
            
          />
        )}


        {view === 'scorecard' && course && (
          <>
            <Scorecard 
              players={players} 
              course={course} 
              scores={scores} 
              currentHole={currentHole} 
              onHoleClick={h => { setCurrentHole(h); setView('scoring'); }}
              basePlayerId={profile?.id}
              getStrokeIndicators={getStrokeIndicators}
              confirmedHoles={confirmedHoles}
              onAddPlayerClick={() => setShowAddPlayerDialog(true)}
              startingHole={startingHole}
              onLeaderboardClick={() => setShowLeaderboardDialog(true)}
              playerGroups={playerGroups}
              onQuickScoreClick={(player) => setQuickScorePlayer(player)}
            />
            
            <LeaderboardDialog
              open={showLeaderboardDialog}
              onOpenChange={setShowLeaderboardDialog}
              players={players}
              playerGroups={playerGroups}
              scores={scores}
              course={course}
              confirmedHoles={confirmedHoles}
              betConfig={betConfig}
              basePlayerId={profile?.id}
            />
          </>
        )}

{roundState.id && (
          <AddPlayerFromScorecardDialog
            open={showAddPlayerDialog}
            onOpenChange={setShowAddPlayerDialog}
            roundId={roundState.id}
            onAddGuest={handleAddGuestFromScorecard}
            onAddFromFriends={handleAddPlayersFromFriends}
            existingPlayerIds={players.map(p => p.profileId || p.id)}
            currentPlayerCount={players.length + playerGroups.reduce((sum, g) => sum + g.players.length, 0)}
            maxPlayersRecommended={6}
          />
        )}

        {view === 'bets' && course && (
          <>
            <BetDashboard
              players={players}
              scores={scores}
              betConfig={betConfig}
              course={course}
              basePlayerId={profile?.id}
              confirmedHoles={confirmedHoles}
              onBetConfigChange={setBetConfig}
              onBetSummariesChange={setCurrentBetSummaries}
              startingHole={startingHole}
              playerGroups={playerGroups}
              getStrokesForLocalPair={getStrokesForLocalPair}
              setStrokesForLocalPair={setStrokesForLocalPair}
              getBilateralHandicapsForEngine={getBilateralHandicapsForEngine}
            />
            
            {/* Close Scorecard Button - only visible to organizer */}
            {isRoundStarted && roundState.status !== 'completed' && (
              <>
                {profile?.id === roundState.organizerProfileId ? (
                  <Button 
                    variant="destructive"
                    onClick={() => setShowCloseConfirmDialog(true)}
                    disabled={isLoading || isClosing}
                    className="w-full mt-4"
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    Cerrar Tarjeta y Guardar
                  </Button>
                ) : (
                  <div className="text-center text-muted-foreground text-sm py-4 bg-muted rounded-lg mt-4">
                    Solo el organizador puede cerrar la tarjeta
                  </div>
                )}
              </>
            )}
            
            {roundState.status === 'completed' && (
              <div className="space-y-4">
                <div className="text-center text-muted-foreground text-sm py-4 bg-muted rounded-lg">
                  <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-green-600" />
                  Tarjeta cerrada y guardada
                </div>
                {profile?.id === roundState.organizerProfileId && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="w-full">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Re-abrir para re-cerrar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Re-abrir ronda?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esto eliminará el snapshot, ledger y historial de sliding actuales. Podrás cerrar la ronda nuevamente con los datos corregidos.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => resetRoundForReclose()}>
                          Confirmar re-apertura
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                <Button 
                  onClick={startNewRound}
                  className="w-full"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Iniciar Nueva Ronda
                </Button>
              </div>
            )}
          </>
        )}

        {/* Leaderboards View */}
        {view === 'leaderboards' && (
          leaderboardDetailId ? (
            <LeaderboardDetailInline
              leaderboardId={leaderboardDetailId}
              onBack={() => setLeaderboardDetailId(null)}
              hasActiveRound={isRoundStarted && roundState.status !== 'completed'}
              onLinkRound={() => {
                setPreselectedLeaderboardId(leaderboardDetailId);
                setShowLinkLeaderboardDialog(true);
              }}
            />
          ) : (
            <LeaderboardsInlineView
              onNavigateToDetail={(id) => setLeaderboardDetailId(id)}
            />
          )
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
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-md px-3 sm:px-6">
          <DialogHeader>
            <DialogTitle>Historial de Rondas</DialogTitle>
          </DialogHeader>
          <RoundHistory 
            onClose={() => setShowHistoryDialog(false)} 
            onViewRound={(data) => {
              setHistoricalScorecardData(data);
              setShowHistoryDialog(false);
              setShowScorecardDialog(true);
            }}
            onCloneRound={handleCloneRound}
            onCloneFullRound={handleCloneFullRound}
          />
        </DialogContent>
      </Dialog>

      <CloseAttemptDialog
        open={showCloseAttemptDialog}
        onOpenChange={setShowCloseAttemptDialog}
        report={lastCloseReport}
        onRetry={
          isClosing
            ? undefined
            : async () => {
                setShowCloseAttemptDialog(false);
                const success = await closeScorecard(currentBetSummaries, getStrokesForLocalPair);
                if (!success) setShowCloseAttemptDialog(true);
              }
        }
      />

      <CloseRoundConfirmDialog
        open={showCloseConfirmDialog}
        onOpenChange={setShowCloseConfirmDialog}
        isLoading={isClosing}
        onConfirm={async () => {
          setShowCloseConfirmDialog(false);
          const success = await closeScorecard(currentBetSummaries, getStrokesForLocalPair);
          if (!success) setShowCloseAttemptDialog(true);
        }}
      />

      {/* Handicap Calculator Dialog */}
      <Dialog open={showHandicapDialog} onOpenChange={setShowHandicapDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Calculadora de Handicap</DialogTitle>
          </DialogHeader>
          <HandicapCalculator onClose={() => setShowHandicapDialog(false)} />
        </DialogContent>
      </Dialog>

      {/* Handicap History Dialog */}
      <Dialog open={showHandicapHistoryDialog} onOpenChange={setShowHandicapHistoryDialog}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historial de Handicap</DialogTitle>
          </DialogHeader>
          <HandicapHistoryView profileId={profile?.id ?? null} />
        </DialogContent>
      </Dialog>


      <Dialog open={showScorecardDialog} onOpenChange={setShowScorecardDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] p-0 overflow-hidden">
          <div className="overflow-y-auto overflow-x-hidden max-h-[90vh] p-6">
          <DialogHeader>
            <DialogTitle>Ronda Histórica</DialogTitle>
          </DialogHeader>
          {historicalScorecardData && getCourseById(historicalScorecardData.courseId) && (
            <HistoricalRoundView
              roundId={historicalScorecardData.roundId}
              courseId={historicalScorecardData.courseId}
              course={getCourseById(historicalScorecardData.courseId)!}
              players={historicalScorecardData.players}
              teeColor={historicalScorecardData.teeColor}
              date={historicalScorecardData.date}
            />
          )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Round Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Invitar Jugadores</DialogTitle>
          </DialogHeader>
          {roundState.id && (
            <ShareRoundDialog 
              roundId={roundState.id} 
              onClose={() => setShowShareDialog(false)} 
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Historical Balances Dialog */}
      <Dialog open={showBalancesDialog} onOpenChange={setShowBalancesDialog}>
        <DialogContent className="max-w-md px-2 sm:px-6">
          <DialogHeader>
            <DialogTitle>Balances Históricos</DialogTitle>
          </DialogHeader>
          <HistoricalBalances 
            onClose={() => setShowBalancesDialog(false)}
            onViewRound={async (roundId: string) => {
              try {
                // Load round players and scores to navigate to historical view
                const { data: roundData } = await supabase
                  .from('rounds')
                  .select('course_id, tee_color, date')
                  .eq('id', roundId)
                  .single();

                if (!roundData) return;

                const { data: roundPlayers } = await supabase
                  .from('round_players')
                  .select(`
                    id, profile_id, handicap_for_round,
                    guest_name, guest_initials, guest_color,
                    profiles(display_name, initials, avatar_color)
                  `)
                  .eq('round_id', roundId);

                const playerScores = await Promise.all(
                  (roundPlayers || []).map(async (rp: any) => {
                    const profileData = rp.profiles as any;
                    const isGuest = !rp.profile_id;
                    const { data: scores } = await supabase
                      .from('hole_scores')
                      .select('hole_number, strokes, putts, oyes_proximity')
                      .eq('round_player_id', rp.id)
                      .order('hole_number');

                    return {
                      playerId: isGuest ? rp.id : rp.profile_id,
                      playerName: isGuest ? (rp.guest_name || 'Invitado') : (profileData?.display_name || 'Jugador'),
                      initials: isGuest ? (rp.guest_initials || 'IN') : (profileData?.initials || 'XX'),
                      color: isGuest ? (rp.guest_color || '#3B82F6') : (profileData?.avatar_color || '#3B82F6'),
                      handicap: Number(rp.handicap_for_round) || 0,
                      scores: (scores || []).map((s: any) => ({
                        holeNumber: s.hole_number,
                        strokes: s.strokes || 0,
                        putts: s.putts || 0,
                        oyesProximity: s.oyes_proximity,
                      })),
                      totalStrokes: scores?.reduce((sum: number, s: any) => sum + (s.strokes || 0), 0) || 0,
                    };
                  })
                );

                setHistoricalScorecardData({
                  roundId,
                  courseId: roundData.course_id,
                  players: playerScores,
                  teeColor: roundData.tee_color,
                  date: roundData.date,
                });
                setShowBalancesDialog(false);
                setShowScorecardDialog(true);
              } catch (err) {
                console.error('Error loading round:', err);
              }
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Friends Dialog */}
      <FriendsDialog
        open={showFriendsDialog}
        onOpenChange={setShowFriendsDialog}
        onAddToRound={handleAddFriendToRound}
        hasActiveRound={Boolean(roundState.id)}
      />

      {/* Add From Friends Dialog (for setup/scorecard) */}
      <AddFromFriendsDialog
        open={showAddFromFriendsDialog}
        onOpenChange={(open) => {
          setShowAddFromFriendsDialog(open);
          if (!open) setAddFriendsTargetGroupId(null);
        }}
        onAddPlayers={(selectedPlayers) => {
          if (addFriendsTargetGroupId) {
            void handleAddPlayersFromFriendsToGroup(addFriendsTargetGroupId, selectedPlayers);
          } else {
            void handleAddPlayersFromFriends(selectedPlayers);
          }
        }}
        existingPlayerIds={[
          ...players.map(p => p.profileId || p.id),
          ...playerGroups.flatMap(g => g.players.map(p => p.profileId || p.id)),
        ]}
        multiSelect={true}
      />

      {/* Bet Setup removed from here – now rendered inline as a tab view in main content */}

      {/* Link Round to Leaderboard Dialog */}
      <LinkRoundToLeaderboardDialog
        open={showLinkLeaderboardDialog}
        onOpenChange={(open) => {
          setShowLinkLeaderboardDialog(open);
          if (!open) setPreselectedLeaderboardId(null);
        }}
        roundId={roundState.id}
        players={players}
        playerGroups={playerGroups}
        profileId={profile?.id}
        preselectedLeaderboardId={preselectedLeaderboardId}
      />

      {/* Quick Score Entry Dialog */}
      {quickScorePlayer && course && (() => {
        // Calculate holes confirmed by OTHER players (excluding the quick score player)
        const otherPlayers = players.filter(p => p.id !== quickScorePlayer.id);
        const holesConfirmedByOthers = new Set<number>();
        
        if (otherPlayers.length > 0) {
          for (let h = 1; h <= 18; h++) {
            // A hole is "round confirmed" if at least one other player has confirmed it
            const someOtherConfirmed = otherPlayers.some(p => {
              const playerScores = scores.get(p.id) || [];
              const holeScore = playerScores.find(s => s.holeNumber === h);
              return holeScore?.confirmed === true;
            });
            if (someOtherConfirmed) {
              holesConfirmedByOthers.add(h);
            }
          }
        }
        
        return (
        <QuickScoreEntry
          open={Boolean(quickScorePlayer)}
          onOpenChange={(open) => !open && setQuickScorePlayer(null)}
          playerName={quickScorePlayer.name}
          playerInitials={quickScorePlayer.initials}
          playerColor={quickScorePlayer.color}
          playerId={quickScorePlayer.id}
          course={course}
          currentScores={scores.get(quickScorePlayer.id) || []}
          roundConfirmedHoles={holesConfirmedByOthers}
          onSaveScores={async (newScores) => {
            const playerId = quickScorePlayer.id;
            const rpId = roundPlayerIds.get(playerId);
            
            // Update local state
            setScores(prev => {
              const next = new Map(prev);
              const existing = next.get(playerId) || [];
              const updated = [...existing];
              
              for (const s of newScores) {
                const idx = updated.findIndex(x => x.holeNumber === s.holeNumber);
                const holePar = course.holes[s.holeNumber - 1]?.par || 4;
                const strokesPerHole = calculateStrokesPerHole(quickScorePlayer.handicap, course);
                const strokesReceived = strokesPerHole[s.holeNumber - 1] || 0;
                
                const scoreData: PlayerScore = {
                  playerId,
                  holeNumber: s.holeNumber,
                  strokes: s.strokes,
                  putts: s.putts,
                  markers: idx >= 0 ? updated[idx].markers : { ...defaultMarkerState },
                  strokesReceived,
                  netScore: s.strokes - strokesReceived,
                  confirmed: true,
                };
                
                if (idx >= 0) {
                  updated[idx] = scoreData;
                } else {
                  updated.push(scoreData);
                }
              }
              
              next.set(playerId, updated);
              return next;
            });
            
            // Persist to database
            if (rpId && roundState.id) {
              const strokesPerHole = calculateStrokesPerHole(quickScorePlayer.handicap, course);
              const scoreRecords = newScores.map(s => ({
                round_player_id: rpId,
                hole_number: s.holeNumber,
                strokes: s.strokes,
                putts: s.putts,
                strokes_received: strokesPerHole[s.holeNumber - 1] || 0,
                net_score: s.strokes - (strokesPerHole[s.holeNumber - 1] || 0),
                confirmed: true,
              }));
              
              await supabase
                .from('hole_scores')
                .upsert(scoreRecords, { onConflict: 'round_player_id,hole_number', ignoreDuplicates: false });
            }
          }}
        />
        );
      })()}
    </div>
  );
};

export default Index;
