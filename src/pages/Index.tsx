import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PlayerScoreInput } from '@/components/scoring/PlayerScoreInput';
import { PlayerSetup } from '@/components/setup/PlayerSetup';
import { CourseSelect } from '@/components/setup/CourseSelect';
import { BetSetup, defaultBetConfig } from '@/components/setup/BetSetup';
import { Scorecard } from '@/components/scorecard/Scorecard';
import { BetDashboard } from '@/components/bets/BetDashboard';
import { RoundHistory } from '@/components/RoundHistory';
import { HandicapCalculator } from '@/components/HandicapCalculator';
import { HistoricalRoundView } from '@/components/HistoricalRoundView';
import { ShareRoundDialog } from '@/components/ShareRoundDialog';
import { AddPlayerFromScorecardDialog, type AddGuestPayload } from '@/components/scorecard/AddPlayerFromScorecardDialog';
import { Player, PlayerScore, BetConfig, GolfCourse, HoleInfo } from '@/types/golf';
import { defaultMarkerState } from '@/types/golf';
import { useGolfCourses } from '@/hooks/useGolfCourses';
import { useRoundManagement } from '@/hooks/useRoundManagement';
import { useRealtimeScores } from '@/hooks/useRealtimeScores';
import { useBetConfigPersistence } from '@/hooks/useBetConfigPersistence';
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
import { Settings, LayoutGrid, Trophy, Users, LogOut, User, Check, CheckCircle2, Calendar as CalendarIcon, Share2, Lock, Play, Loader2, History, Calculator, Hash } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { isAutoDetectedMarker } from '@/lib/scoreDetection';
import { markerKeyToDb } from '@/lib/markerTypeMapping';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';

type AppView = 'setup' | 'scoring' | 'scorecard' | 'bets';

const Index = () => {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [view, setView] = useState<AppView>('setup');
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [betConfig, setBetConfig] = useState<BetConfig>(defaultBetConfig);
  const [currentHole, setCurrentHole] = useState(1);
  const [scores, setScores] = useState<Map<string, PlayerScore[]>>(new Map());
  const [confirmedHoles, setConfirmedHoles] = useState<Set<number>>(new Set());

  // Keep an always-fresh reference to scores to avoid stale closures when persisting confirmations.
  const scoresRef = useRef<Map<string, PlayerScore[]>>(new Map());
  useEffect(() => {
    scoresRef.current = scores;
  }, [scores]);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [showHandicapDialog, setShowHandicapDialog] = useState(false);
  const [showScorecardDialog, setShowScorecardDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showAddPlayerDialog, setShowAddPlayerDialog] = useState(false);
  const [showPendingRoundDialog, setShowPendingRoundDialog] = useState(false);
  const [pendingRoundSummary, setPendingRoundSummary] = useState<{
    courseName: string;
    holesPlayed: number;
    totalStrokes: number;
  } | null>(null);
  const [historicalScorecardData, setHistoricalScorecardData] = useState<{
    roundId: string;
    courseId: string;
    players: any[];
    teeColor: string;
    date: string;
  } | null>(null);
  
  const [teeColor, setTeeColor] = useState<'blue' | 'white' | 'yellow' | 'red'>('white');

  const { getCourseById } = useGolfCourses();
  const course = selectedCourseId ? getCourseById(selectedCourseId) : null;

  // Round management hook with restoration
  const {
    roundState,
    isLoading,
    isRestoring,
    isRoundStarted,
    pendingRound,
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
    getCourseById,
  });

  // Persist bet config (overrides, handicaps bilaterales, carritos cancelados, etc.) to backend
  const { loadBetConfig, saveBetConfig, isLoaded: isBetConfigLoaded } = useBetConfigPersistence({
    roundId: roundState.id,
    betConfig,
    setBetConfig,
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

  useEffect(() => {
    // If we are currently restoring (or already restored) the same pending round,
    // don't keep prompting the user.
    if (!pendingRound) return;
    if (isRestoring) return;
    if (roundState.id && roundState.id === pendingRound.roundId) return;
    if (isRoundStarted) return;

    setShowPendingRoundDialog(true);
  }, [pendingRound, isRestoring, roundState.id, isRoundStarted]);

  // Load summary for the pending round (so the user recognizes it)
  useEffect(() => {
    let cancelled = false;

    const loadPendingRoundSummary = async () => {
      if (!pendingRound || !profile) {
        setPendingRoundSummary(null);
        return;
      }

      try {
        const courseName = getCourseById?.(pendingRound.courseId)?.name ?? 'Campo';

        // Get my round_player id for this round
        const { data: myRp, error: rpErr } = await supabase
          .from('round_players')
          .select('id')
          .eq('round_id', pendingRound.roundId)
          .eq('profile_id', profile.id)
          .maybeSingle();

        if (cancelled) return;

        if (rpErr || !myRp?.id) {
          setPendingRoundSummary({ courseName, holesPlayed: 0, totalStrokes: 0 });
          return;
        }

        const { data: myScores, error: scoresErr } = await supabase
          .from('hole_scores')
          .select('hole_number, strokes')
          .eq('round_player_id', myRp.id);

        if (cancelled) return;

        if (scoresErr) {
          setPendingRoundSummary({ courseName, holesPlayed: 0, totalStrokes: 0 });
          return;
        }

        const holesPlayed = (myScores || []).filter(
          (s) => typeof s.strokes === 'number' && Number.isFinite(s.strokes)
        ).length;
        const totalStrokes = (myScores || []).reduce(
          (sum, s) => sum + (typeof s.strokes === 'number' && Number.isFinite(s.strokes) ? s.strokes : 0),
          0
        );

        setPendingRoundSummary({ courseName, holesPlayed, totalStrokes });
      } catch (e) {
        console.error('Error loading pending round summary:', e);
        if (!cancelled) setPendingRoundSummary(null);
      }
    };

    void loadPendingRoundSummary();
    return () => {
      cancelled = true;
    };
  }, [pendingRound, profile, getCourseById]);

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
    setHasInitialNavigated(true); // Prevent auto-navigate
    setView('setup');
    
    // Force page reload to reset hook state
    window.location.reload();
  }, []);

  const handleRestorePendingRound = useCallback(() => {
    if (!pendingRound) return;
    // Use a one-shot flag so the hook restores exactly this round on next mount.
    sessionStorage.setItem('restore_round_id', pendingRound.roundId);
    window.location.reload();
  }, [pendingRound]);

  const handleDiscardPendingRoundAndStartNew = useCallback(() => {
    // Skip the restore prompt once, then continue clean.
    sessionStorage.setItem('skip_restore_once', '1');
    startNewRound();
  }, [startNewRound]);

  const handleClosePendingRoundPermanently = useCallback(async () => {
    if (!pendingRound) return;

    try {
      // Mark round as completed. This is a minimal "close" without rebuilding local state.
      const { error: roundErr } = await supabase
        .from('rounds')
        .update({ status: 'completed' })
        .eq('id', pendingRound.roundId);

      if (roundErr) throw roundErr;

      // Best-effort: set existing hole scores as confirmed (so they count as "final")
      const { data: rpIds, error: rpErr } = await supabase
        .from('round_players')
        .select('id')
        .eq('round_id', pendingRound.roundId);

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
      console.error('Error closing pending round:', e);
      toast.error('No se pudo cerrar la tarjeta (requiere ser organizador)');
    }
  }, [pendingRound]);

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

  // Handle players change - initialize scores for new players when round is active
  const handlePlayersChange = useCallback(async (newPlayers: Player[]) => {
    // Find new players (in newPlayers but not in current players)
    const currentPlayerIds = new Set(players.map(p => p.id));
    const addedPlayers = newPlayers.filter(p => !currentPlayerIds.has(p.id));

    // Update players first
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
  }, [players, isRoundStarted, course, initializePlayerScores, setPlayers, addPlayerToRound]);

  // Create round in database (can do with 1 player to get share link)
  const handleCreateRound = async () => {
    if (!course || !selectedCourseId) return;
    
    if (!roundState.id) {
      const result = await createRound(selectedCourseId, teeColor, roundState.date);
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
      const roundId = await createRound(selectedCourseId, teeColor, roundState.date);
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

      // 1) Create guest in backend
      const { data: rpRow, error: rpErr } = await supabase
        .from('round_players')
        .insert({
          round_id: roundState.id,
          group_id: roundState.groupId,
          profile_id: null,
          handicap_for_round: 0,
          is_organizer: false,
          guest_name: payload.name,
          guest_initials: payload.initials,
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
        name: payload.name,
        initials: payload.initials,
        color: payload.color,
        handicap: 0,
      };

      setPlayers((prev) => [...prev, newPlayer]);
      // Ensure mapping exists for persistence/realtime (guests: playerId === round_player_id)
      setRoundPlayerIds((prev) => {
        const next = new Map(prev);
        next.set(newPlayerId, newPlayerId);
        return next;
      });

      // 3) Build local scores for the new player
      const strokesPerHole = calculateStrokesPerHole(0, course);
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
    },
    [roundState.id, roundState.groupId, course, setRoundPlayerIds]
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

  const updateScore = useCallback((playerId: string, holeNumber: number, updates: Partial<PlayerScore>) => {
    setScores(prev => {
      const newScores = new Map(prev);
      const playerScores = [...(newScores.get(playerId) || [])];
      const idx = playerScores.findIndex(s => s.holeNumber === holeNumber);
      if (idx >= 0) {
        const wasConfirmed = !!playerScores[idx].confirmed;
        // Only unconfirm when the actual score changes.
        // Markers (unidades/manchas) should NOT force re-confirmation, otherwise
        // a simple mancha toggle removes the hole from Medal/Presiones/Skins.
        const isScoringMutation =
          updates.strokes !== undefined ||
          updates.putts !== undefined ||
          updates.oyesProximity !== undefined;

        // If a hole is edited (golpes/putts/oyes), force re-confirmation.
        // IMPORTANT: We also unconfirm when the *global* state says it's confirmed, even if the
        // local per-player flag got out of sync (this was disabling the confirm button incorrectly).
        const shouldUnconfirm =
          isScoringMutation && (wasConfirmed || confirmedHoles.has(holeNumber));

        playerScores[idx] = {
          ...playerScores[idx],
          ...updates,
          ...(shouldUnconfirm ? { confirmed: false } : {}),
        };
        if (updates.strokes !== undefined) {
          playerScores[idx].netScore = updates.strokes - playerScores[idx].strokesReceived;
        }
        // Save to database
        if (roundState.id) {
          saveScoreToDb(playerId, holeNumber, playerScores[idx]);
        }

        // If any player edited a previously-confirmed hole, the hole should require confirmation again.
        if (shouldUnconfirm) {
          setConfirmedHoles((prevHoles) => {
            const next = new Set(prevHoles);
            next.delete(holeNumber);
            return next;
          });
        }
      }
      newScores.set(playerId, playerScores);
      return newScores;
    });
  }, [saveScoreToDb, roundState.id, setConfirmedHoles, confirmedHoles]);

  const confirmHole = useCallback((holeNumber: number) => {
    // Mark all players' scores for this hole as confirmed
    setScores(prev => {
      const newScores = new Map(prev);
      players.forEach(player => {
        const playerScores = [...(newScores.get(player.id) || [])];
        const idx = playerScores.findIndex(s => s.holeNumber === holeNumber);
        if (idx >= 0) {
          playerScores[idx] = { ...playerScores[idx], confirmed: true };
        }
        newScores.set(player.id, playerScores);
      });
      return newScores;
    });
    setConfirmedHoles(prev => new Set([...prev, holeNumber]));

    // Persist confirmation explicitly using the latest known score snapshot.
    // This prevents cases where a hole appears confirmed locally but remains unconfirmed in backend.
    if (roundState.id) {
      void Promise.all(
        players.map(async (player) => {
          const holeScore = scoresRef.current.get(player.id)?.find((s) => s.holeNumber === holeNumber);
          if (!holeScore) return;
          await saveScoreToDb(player.id, holeNumber, { ...holeScore, confirmed: true });
        })
      );
    }
  }, [players, saveScoreToDb, roundState.id]);

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
      <AlertDialog open={showPendingRoundDialog && !!pendingRound && !isRestoring && !isRoundStarted}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tarjeta pendiente</AlertDialogTitle>
            <AlertDialogDescription>
              Encontramos una ronda sin “Cerrar Tarjeta”. ¿Qué quieres hacer?
              {pendingRound && (
                <span className="block mt-2 text-xs text-muted-foreground">
                  {pendingRound.status === 'in_progress' ? 'En progreso' : 'En configuración'} •{' '}
                  {format(pendingRound.date, "d 'de' MMMM, yyyy", { locale: es })}
                  {pendingRoundSummary && (
                    <>
                      {' '}• {pendingRoundSummary.courseName} • {pendingRoundSummary.holesPlayed} hoyos • {pendingRoundSummary.totalStrokes} golpes
                    </>
                  )}
                </span>
              )}
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
            <AlertDialogAction asChild>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowPendingRoundDialog(false);
                  handleRestorePendingRound();
                }}
              >
                Restaurar
              </Button>
            </AlertDialogAction>
            <AlertDialogAction asChild>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  setShowPendingRoundDialog(false);
                  void handleClosePendingRoundPermanently();
                }}
              >
                Cerrar definitiva
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <header className="bg-primary text-primary-foreground py-3 px-4 shadow-lg">
        <div className="max-w-md mx-auto flex items-center">
          {/* Left: Logo - fixed width */}
          <div className="w-16 flex-shrink-0">
            <h1 className="text-lg font-bold tracking-tight">Golf Bets</h1>
            <p className="text-[10px] text-primary-foreground/70">by SCF</p>
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
          
          {/* Right: Profile Menu - fixed width to match left */}
          <div className="w-16 flex-shrink-0 flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: profile?.avatar_color || '#3B82F6' }}
                  >
                    {profile?.initials || <User className="h-4 w-4" />}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="px-2 py-1.5">
                  <p className="font-medium text-sm">{profile?.display_name}</p>
                  <p className="text-xs text-muted-foreground">HCP: {profile?.current_handicap}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/join')}>
                  <Hash className="h-4 w-4 mr-2" />
                  Unirse con Código
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowHistoryDialog(true)}>
                  <History className="h-4 w-4 mr-2" />
                  Historial de Rondas
                </DropdownMenuItem>
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
        </div>
      </header>

      {/* Navigation Tabs - show when round is in progress OR not in setup view */}
      {(isRoundStarted || view !== 'setup') && (
        <div className="bg-card border-b border-border">
          <div className="max-w-md mx-auto">
            <Tabs value={view} onValueChange={(v) => setView(v as AppView)}>
              <TabsList className="w-full grid grid-cols-4 h-12">
                <TabsTrigger value="setup" className="text-xs"><Settings className="h-4 w-4" /></TabsTrigger>
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
            />
            <PlayerSetup players={players} onChange={handlePlayersChange} maxPlayers={6} />
            
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

        {view === 'scoring' && course && (
          <>
            {/* Hole Navigation */}
            <div className="flex gap-1 overflow-x-auto pb-2">
              {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => {
                const confirmed = isHoleConfirmed(hole);
                return (
                  <button
                    key={hole}
                    onClick={() => setCurrentHole(hole)}
                    className={`min-w-[2rem] h-8 rounded-full text-sm font-medium transition-all relative
                      ${currentHole === hole ? 'bg-primary text-primary-foreground scale-110' : 
                        confirmed ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}
                      ${hole === 9 ? 'mr-2' : ''}`}
                  >
                    {confirmed && currentHole !== hole ? <CheckCircle2 className="h-4 w-4 mx-auto" /> : hole}
                  </button>
                );
              })}
            </div>

            {/* Player Score Inputs */}
            {players.map(player => {
              const playerScores = scores.get(player.id) || [];
              const holeScore = playerScores.find(s => s.holeNumber === currentHole);
              const isBasePlayer = player.profileId === profile?.id;
              const isPar3 = holePar === 3;
              
              // Check if player has Oyeses enabled
              // NOTE: When a player is added after the round has started, they may not yet have a
              // per-player config entry. We default to enabled (same behavior as BetSetup UI).
              const oyesPlayerConfig = betConfig.oyeses.playerConfigs.find(pc => pc.playerId === player.id);
              const oyesEnabled = betConfig.oyeses.enabled && (oyesPlayerConfig?.enabled ?? true);
              
              return (
                <PlayerScoreInput
                  key={player.id}
                  playerName={player.name}
                  playerInitials={player.initials}
                  avatarColor={player.color}
                  holeNumber={currentHole}
                  par={holePar}
                  strokes={holeScore?.strokes ?? holePar}
                  putts={holeScore?.putts ?? 2}
                  markers={holeScore?.markers || defaultMarkerState}
                  onStrokesChange={(strokes) => updateScore(player.id, currentHole, { strokes })}
                  onPuttsChange={(putts) => updateScore(player.id, currentHole, { putts })}
                  onMarkersChange={(markers) => updateScore(player.id, currentHole, { markers })}
                  handicapStrokes={holeScore?.strokesReceived || 0}
                  isBasePlayer={isBasePlayer}
                  isPar3={isPar3}
                  oyesEnabled={oyesEnabled}
                  oyesProximity={holeScore?.oyesProximity}
                  onOyesProximityChange={(proximity) => updateScore(player.id, currentHole, { oyesProximity: proximity })}
                />
              );
            })}

            {/* Confirm Button */}
            <Button 
              onClick={() => confirmHole(currentHole)}
              disabled={isHoleConfirmed(currentHole)}
              className={`w-full ${isHoleConfirmed(currentHole) ? 'bg-green-600 hover:bg-green-600' : 'bg-accent hover:bg-accent/90'}`}
            >
              {isHoleConfirmed(currentHole) ? (
                <><CheckCircle2 className="h-4 w-4 mr-2" /> Hoyo Confirmado</>
              ) : (
                <><Check className="h-4 w-4 mr-2" /> Confirmar Scores del Hoyo {currentHole}</>
              )}
            </Button>

            {/* Navigation Buttons */}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setCurrentHole(Math.max(1, currentHole - 1))} disabled={currentHole === 1} className="flex-1">
                ← Anterior
              </Button>
              <Button onClick={() => setCurrentHole(Math.min(18, currentHole + 1))} disabled={currentHole === 18} className="flex-1">
                Siguiente →
              </Button>
            </div>
          </>
        )}

        {view === 'scorecard' && course && (
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
          />
        )}

        {roundState.id && (
          <AddPlayerFromScorecardDialog
            open={showAddPlayerDialog}
            onOpenChange={setShowAddPlayerDialog}
            roundId={roundState.id}
            onAddGuest={handleAddGuestFromScorecard}
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
            />
            
            {/* Close Scorecard Button */}
            {isRoundStarted && roundState.status !== 'completed' && (
              <Button 
                variant="destructive"
                onClick={async () => {
                  // TODO: Collect all bet results from BetDashboard
                  const allBetResults: any[] = [];
                  const success = await closeScorecard(allBetResults);
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
    </div>
  );
};

export default Index;
