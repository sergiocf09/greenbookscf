import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PlayerScoreInput } from '@/components/scoring/PlayerScoreInput';
import { ScoringView } from '@/components/scoring/ScoringView';
import { PlayerSetup } from '@/components/setup/PlayerSetup';
import { CourseSelect } from '@/components/setup/CourseSelect';
import { BetSetup, defaultBetConfig } from '@/components/setup/BetSetup';
import { HandicapMatrix } from '@/components/setup/HandicapMatrix';
import { Scorecard } from '@/components/scorecard/Scorecard';
import { BetDashboard } from '@/components/bets/BetDashboard';
import { RoundHistory } from '@/components/RoundHistory';
import { HandicapCalculator } from '@/components/HandicapCalculator';
import { HistoricalRoundView } from '@/components/HistoricalRoundView';
import { HistoricalBalances } from '@/components/HistoricalBalances';
import { ShareRoundDialog } from '@/components/ShareRoundDialog';
import { AddPlayerFromScorecardDialog, type AddGuestPayload } from '@/components/scorecard/AddPlayerFromScorecardDialog';
import { LeaderboardDialog } from '@/components/LeaderboardDialog';
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
} from '@/components/ui/alert-dialog';
import { Settings, LayoutGrid, Trophy, Users, LogOut, User, Check, CheckCircle2, Calendar as CalendarIcon, Share2, Lock, Play, Loader2, History, Calculator, Hash, Sliders, DollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { devError } from '@/lib/logger';
import { isAutoDetectedMarker } from '@/lib/scoreDetection';
import { markerKeyToDb } from '@/lib/markerTypeMapping';
import { initialsFromPlayerName, validatePlayerName } from '@/lib/playerInput';
import GreenBookLogo from '@/components/GreenBookLogo';
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

type AppView = 'setup' | 'scoring' | 'scorecard' | 'bets' | 'handicaps';

const Index = () => {
  const navigate = useNavigate();
  const { profile, signOut, updateProfile } = useAuth();

  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [manualHandicap, setManualHandicap] = useState<string>("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
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
  const [showScorecardDialog, setShowScorecardDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showAddPlayerDialog, setShowAddPlayerDialog] = useState(false);
  const [showLeaderboardDialog, setShowLeaderboardDialog] = useState(false);
  const [showHandicapMatrixDialog, setShowHandicapMatrixDialog] = useState(false);
  const [showPendingRoundDialog, setShowPendingRoundDialog] = useState(false);
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
  } = useRoundManagement({
    players,
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

    const validPlayerIds = new Set(players.map((p) => p.id));
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
  }, [roundState.id, isRestoring, isBetConfigLoaded, players, betConfig, saveBetConfig, setBetConfig]);

  // Auto-restore the most recent pending round without showing the dialog
  useEffect(() => {
    // Skip if already processing a restore (prevent infinite loops)
    const restoreInProgress = sessionStorage.getItem('restore_round_id');
    if (restoreInProgress) return;
    
    // Skip if no pending rounds or already restoring
    if (!pendingRounds?.length) return;
    if (isRestoring) return;
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
  }, [pendingRounds, isRestoring, roundState.id, isRoundStarted, players.length, selectedCourseId]);

  // Load summaries for pending rounds (so the user recognizes them)
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

  // Add a new player group
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

      // Persist any *new* players so they survive refresh
      const existingIds = new Set<string>();
      playerGroups.find((g) => g.id === groupId)?.players.forEach((p) => existingIds.add(p.id));

      const added = newPlayers.filter((p) => !existingIds.has(p.id));
      if (!added.length) return;

      for (const p of added) {
        await addPlayerToRound(p, groupId);
      }
    },
    [addPlayerToRound, playerGroups, setPlayerGroups]
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

  // Keep dialog fields in sync
  useEffect(() => {
    if (!profile) return;
    setManualHandicap(String(profile.current_handicap ?? ""));
  }, [profile?.id, profile?.current_handicap]);

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

  // Handle player removal - delete from database for persistence
  const handleRemovePlayer = useCallback(async (playerId: string) => {
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
  }, [roundState.id, roundPlayerIds, setRoundPlayerIds, setPlayers, setScores]);

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

    // If round is in progress, initialize scores for new players
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

      // Add players to the round in database
      for (const player of addedPlayers) {
        await addPlayerToRound(player);
      }
    }
  }, [players, isRoundStarted, course, initializePlayerScores, setPlayers, addPlayerToRound, handleRemovePlayer, roundState.id, roundPlayerIds]);

  // Create round in database (can do with 1 player to get share link)
  const handleCreateRound = async () => {
    if (!course || !selectedCourseId) return;
    
    if (!roundState.id) {
      const result = await createRound(selectedCourseId, teeColor, roundState.date, startingHole);
      if (result) {
        // Show share dialog after successful creation
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
        const strokes = payload.strokesByHole[holeNumber] ?? holePar;
        const strokesReceived = strokesPerHole[i] ?? 0;
        return {
          playerId: newPlayerId,
          holeNumber,
          strokes,
          putts: 2,
          markers: { ...defaultMarkerState },
          strokesReceived,
          netScore: strokes - strokesReceived,
          confirmed: true,
        };
      });

      setScores((prev) => {
        const next = new Map(prev);
        next.set(newPlayerId, newPlayerScores);
        return next;
      });

      // 4) Persist hole_scores (confirmed)
      const scoreRecords = newPlayerScores.map((s) => ({
        round_player_id: newPlayerId,
        hole_number: s.holeNumber,
        strokes: s.strokes,
        putts: s.putts,
        strokes_received: s.strokesReceived,
        net_score: s.netScore,
        oyes_proximity: null,
        oyes_proximity_sangron: null,
        confirmed: true,
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
          
          {/* Right: Profile Menu */}
          <div className="flex items-center flex-shrink-0">
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
                <DropdownMenuItem onClick={() => setShowHistoryDialog(true)}>
                  <History className="h-4 w-4 mr-2" />
                  Historial de Rondas
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowBalancesDialog(true)}>
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
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()} className="text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Cerrar Sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Perfil</DialogTitle>
              </DialogHeader>

              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  {profile?.initials && (
                    <PlayerAvatar
                      initials={profile.initials}
                      background={profile.avatar_color || "#3B82F6"}
                      size="md"
                    />
                  )}
                  <div>
                    <p className="font-semibold leading-tight">{profile?.display_name}</p>
                    <p className="text-xs text-muted-foreground">Ajustes de cuenta</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manual-handicap">Handicap (manual)</Label>
                  <Input
                    id="manual-handicap"
                    inputMode="decimal"
                    value={manualHandicap}
                    onChange={(e) => setManualHandicap(e.target.value)}
                    placeholder="Ej. 12.4"
                  />
                  <Button
                    type="button"
                    className="w-full"
                    disabled={!profile || savingProfile}
                    onClick={async () => {
                      if (!profile) return;
                      const parsed = Number(String(manualHandicap).replace(",", "."));
                      if (!Number.isFinite(parsed)) {
                        toast.error("Handicap inválido");
                        return;
                      }

                      setSavingProfile(true);
                      try {
                        await updateProfile({ current_handicap: parsed });
                        toast.success("Handicap actualizado");
                      } catch (e: any) {
                        toast.error("No se pudo actualizar", { description: e?.message });
                      } finally {
                        setSavingProfile(false);
                      }
                    }}
                  >
                    {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar Handicap"}
                  </Button>
                </div>

                <div className="border-t border-border pt-4 space-y-2">
                  <Label htmlFor="new-password">Cambiar contraseña</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nueva contraseña"
                    minLength={6}
                  />
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirmar contraseña"
                    minLength={6}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    disabled={!newPassword || newPassword.length < 6 || savingProfile}
                    onClick={async () => {
                      if (newPassword !== confirmPassword) {
                        toast.error("Las contraseñas no coinciden");
                        return;
                      }

                      setSavingProfile(true);
                      try {
                        const { error } = await supabase.auth.updateUser({ password: newPassword });
                        if (error) throw error;
                        toast.success("Contraseña actualizada");
                        setNewPassword("");
                        setConfirmPassword("");
                      } catch (e: any) {
                        toast.error("No se pudo actualizar la contraseña", { description: e?.message });
                      } finally {
                        setSavingProfile(false);
                      }
                    }}
                  >
                    {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : "Actualizar contraseña"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Navigation Tabs - show when round is in progress OR not in setup view */}
      {(isRoundStarted || view !== 'setup') && (
        <div className="bg-card border-b border-border">
          <div className="max-w-md mx-auto">
            <Tabs value={view} onValueChange={(v) => setView(v as AppView)}>
              <TabsList className="w-full grid grid-cols-5 h-12">
                <TabsTrigger value="setup" className="text-xs"><Settings className="h-4 w-4" /></TabsTrigger>
                <TabsTrigger value="handicaps" className="text-xs"><Sliders className="h-4 w-4" /></TabsTrigger>
                <TabsTrigger value="scoring" className="text-xs"><Users className="h-4 w-4" /></TabsTrigger>
                <TabsTrigger value="scorecard" className="text-xs"><LayoutGrid className="h-4 w-4" /></TabsTrigger>
                <TabsTrigger value="bets" className="text-xs"><Trophy className="h-4 w-4" /></TabsTrigger>
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
              onTeeColorChange={setTeeColor}
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
            />
            
            {/* Additional Groups */}
            {playerGroups.map((group, idx) => (
              <div key={group.id} className="space-y-2">
                <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                  <span className="text-sm font-medium">{group.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    onClick={() => {
                      setPlayerGroups(prev => prev.filter(g => g.id !== group.id));
                      toast.success(`${group.name} eliminado`);
                    }}
                  >
                    Eliminar
                  </Button>
                </div>
                <PlayerSetup
                  players={group.players}
                  onChange={(newPlayers) => {
                    void handleGroupPlayersChange(group.id, newPlayers);
                  }}
                  maxPlayers={6}
                  courseId={selectedCourseId}
                  defaultTeeColor={teeColor}
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

            {players.length >= 2 && <BetSetup config={betConfig} onChange={setBetConfig} players={players} />}
            
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
              getBilateralHandicapsForEngine={getBilateralHandicapsForEngine}
            />
            
            {/* Close Scorecard Button */}
            {isRoundStarted && roundState.status !== 'completed' && (
              <Button 
                variant="destructive"
                onClick={async () => {
                  const success = await closeScorecard(currentBetSummaries);
                  if (success) {
                    toast.success('Tarjeta cerrada exitosamente');
                  }
                }}
                disabled={isLoading}
                className="w-full mt-4"
              >
                <Lock className="h-4 w-4 mr-2" />
                Cerrar Tarjeta y Guardar
              </Button>
            )}
            
            {roundState.status === 'completed' && (
              <div className="space-y-4">
                <div className="text-center text-muted-foreground text-sm py-4 bg-muted rounded-lg">
                  <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-green-600" />
                  Tarjeta cerrada y guardada
                </div>
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
      </main>

      {/* History Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-md">
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
          />
        </DialogContent>
      </Dialog>

      {/* Handicap Calculator Dialog */}
      <Dialog open={showHandicapDialog} onOpenChange={setShowHandicapDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Calculadora de Handicap</DialogTitle>
          </DialogHeader>
          <HandicapCalculator onClose={() => setShowHandicapDialog(false)} />
        </DialogContent>
      </Dialog>

      {/* Historical Round View Dialog */}
      <Dialog open={showScorecardDialog} onOpenChange={setShowScorecardDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Balances Históricos</DialogTitle>
          </DialogHeader>
          <HistoricalBalances 
            onClose={() => setShowBalancesDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
