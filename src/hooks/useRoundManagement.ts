import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Player, BetConfig, PlayerScore, GolfCourse, defaultMarkerState, HoleInfo, MarkerState, PlayerGroup } from '@/types/golf';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { calculateHandicapIndexFromDifferentials } from '@/lib/usgaHandicap';
import { Constants } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { defaultBetConfig } from '@/components/setup/BetSetup';
import { markerDbToKey } from '@/lib/markerTypeMapping';
import { isAutoDetectedMarker } from '@/lib/scoreDetection';
import { devError, devLog, devWarn } from '@/lib/logger';
import { initialsFromPlayerName, validatePlayerName } from '@/lib/playerInput';
import { generateRoundSnapshot } from '@/lib/roundSnapshot';
import { BetSummary, calculateAllBets } from '@/lib/betCalculations';
import { parseLocalDate } from '@/lib/dateUtils';
import { calculateSlidingResults, SlidingResult } from '@/lib/slidingCalculations';
import {
  type CloseAttemptReport,
  newCloseAttemptReport,
  pushStageFail,
  pushStageOk,
  type CloseStage,
} from '@/lib/closeAttemptReport';

interface RoundState {
  id: string | null;
  status: 'setup' | 'in_progress' | 'completed';
  date: Date;
  courseId: string | null;
  teeColor: 'blue' | 'white' | 'yellow' | 'red';
  startingHole: 1 | 10;
  groupId: string | null;
  organizerProfileId: string | null;
}

export interface PendingRoundInfo {
  roundId: string;
  status: 'setup' | 'in_progress';
  date: Date;
  courseId: string;
  courseName?: string;
  teeColor: 'blue' | 'white' | 'yellow' | 'red';
  startingHole: 1 | 10;
}

interface UseRoundManagementProps {
  players: Player[];
  setPlayers: React.Dispatch<React.SetStateAction<Player[]>>;
  scores: Map<string, PlayerScore[]>;
  setScores: React.Dispatch<React.SetStateAction<Map<string, PlayerScore[]>>>;
  setConfirmedHoles: React.Dispatch<React.SetStateAction<Set<number>>>;
  betConfig: BetConfig;
  setBetConfig?: React.Dispatch<React.SetStateAction<BetConfig>>;
  course: GolfCourse | null;
  setSelectedCourseId?: React.Dispatch<React.SetStateAction<string | null>>;
  setTeeColor?: React.Dispatch<React.SetStateAction<'blue' | 'white' | 'yellow' | 'red'>>;
  setStartingHole?: React.Dispatch<React.SetStateAction<1 | 10>>;
  getCourseById?: (id: string) => GolfCourse | undefined;
  setPlayerGroups?: React.Dispatch<React.SetStateAction<PlayerGroup[]>>;
}

export const useRoundManagement = ({
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
}: UseRoundManagementProps) => {
  const { profile } = useAuth();
  const [roundState, setRoundState] = useState<RoundState>({
    id: null,
    status: 'setup',
    date: new Date(),
    courseId: null,
    teeColor: 'white',
    startingHole: 1,
    groupId: null,
    organizerProfileId: null,
  });
  const [roundPlayerIds, setRoundPlayerIds] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [pendingRound, setPendingRound] = useState<PendingRoundInfo | null>(null);
  const [pendingRounds, setPendingRounds] = useState<PendingRoundInfo[]>([]);
  const hasRestoredRef = useRef(false);
  const closeInFlightRef = useRef(false);
  const [lastCloseReport, setLastCloseReport] = useState<CloseAttemptReport | null>(null);

  const isRoundStarted = roundState.status !== 'setup';

  const fetchCourseForRestore = useCallback(async (courseId: string): Promise<GolfCourse | null> => {
    try {
      const { data: courseRow, error: courseErr } = await supabase
        .from('golf_courses')
        .select('id, name, location')
        .eq('id', courseId)
        .single();

      if (courseErr || !courseRow) return null;

      const { data: holesRows, error: holesErr } = await supabase
        .from('course_holes')
        .select('hole_number, par, stroke_index, yards_blue, yards_white, yards_yellow, yards_red')
        .eq('course_id', courseId)
        .order('hole_number');

      if (holesErr || !holesRows?.length) return null;

      const holes: HoleInfo[] = holesRows.map((h: any) => ({
        number: h.hole_number,
        par: h.par,
        handicapIndex: h.stroke_index,
        yardsBlue: h.yards_blue ?? undefined,
        yardsWhite: h.yards_white ?? undefined,
        yardsYellow: h.yards_yellow ?? undefined,
        yardsRed: h.yards_red ?? undefined,
      }));

      return {
        id: courseRow.id,
        name: courseRow.name,
        location: courseRow.location,
        holes,
      };
    } catch (e) {
      devError('Error fetching course for restore:', e);
      return null;
    }
  }, []);

  const applyMyUsgaHandicapIfAvailable = useCallback(
    async (targetRoundPlayerId?: string | null) => {
      if (!profile || !targetRoundPlayerId) return;

      try {
        // Get last 20 completed rounds for this user
        const { data: roundPlayers, error } = await supabase
          .from('round_players')
          .select(
            `
            id,
            rounds!inner(
              id,
              date,
              status
            )
          `
          )
          .eq('profile_id', profile.id)
          .eq('rounds.status', 'completed')
          .order('rounds(date)', { ascending: false })
          .limit(20);

        if (error) throw error;

        const differentials: number[] = [];

        // Ratings (placeholder until we store real course/slope ratings)
        const courseRating = 72.0;
        const slopeRating = 125;

        for (const rp of roundPlayers || []) {
          const { data: scores, error: scoresError } = await supabase
            .from('hole_scores')
            .select('strokes, confirmed')
            .eq('round_player_id', rp.id);

          if (scoresError) continue;

          // Guardrail: ignore malformed/partial historical rounds.
          // We only consider rounds with 18 confirmed holes and non-null strokes.
          const validStrokes = (scores || [])
            .filter((s: any) => s?.confirmed === true)
            .map((s: any) => (typeof s?.strokes === 'number' ? s.strokes : null))
            .filter((v: number | null): v is number => v !== null);

          if (validStrokes.length < 18) continue;

          const grossScore = validStrokes.reduce((sum: number, v: number) => sum + v, 0);
          if (!Number.isFinite(grossScore) || grossScore <= 0) continue;

          const differential = (113 / slopeRating) * (grossScore - courseRating);
          differentials.push(Math.round(differential * 10) / 10);
        }

        const handicapIndex = calculateHandicapIndexFromDifferentials(differentials);
        if (handicapIndex === null) return; // Not enough rounds; keep 0

        // Guardrail: never apply impossible/invalid indexes (prevents negatives like -62.5
        // caused by malformed historical data).
        if (!Number.isFinite(handicapIndex) || handicapIndex < 0 || handicapIndex > 54) return;

        // Persist to backend (policy allows user to update their own row)
        const { error: updateError } = await supabase
          .from('round_players')
          .update({ handicap_for_round: handicapIndex })
          .eq('id', targetRoundPlayerId);

        if (updateError) throw updateError;

        // Update local player handicap so strokesReceived uses it when scoring starts
        setPlayers((prev) =>
          prev.map((p) => (p.profileId === profile.id || p.id === profile.id ? { ...p, handicap: handicapIndex } : p))
        );

        // If scores already exist (round in progress), recompute strokesReceived + netScore for my player
        if (course) {
          setScores((prev) => {
            const next = new Map(prev);
            const myPlayerKey = profile.id;
            const myScores = next.get(myPlayerKey);
            if (!myScores) return prev;
            const strokesPerHole = calculateStrokesPerHole(handicapIndex, course);
            next.set(
              myPlayerKey,
              myScores.map((s, i) => ({
                ...s,
                strokesReceived: strokesPerHole[i] ?? s.strokesReceived,
                netScore: (s.strokes ?? 0) - (strokesPerHole[i] ?? s.strokesReceived ?? 0),
              }))
            );
            return next;
          });
        }
      } catch (err) {
        devError('Error applying USGA handicap:', err);
      }
    },
    [profile, setPlayers, setScores, course]
  );

  const isValidBetType = useCallback(
    (betType: unknown): betType is (typeof Constants.public.Enums.bet_type)[number] => {
      return (
        typeof betType === 'string' &&
        (Constants.public.Enums.bet_type as readonly string[]).includes(betType)
      );
    },
    []
  );

  const isUuid = useCallback((value: unknown): value is string => {
    if (typeof value !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }, []);

  // Restore active round on mount
  useEffect(() => {
    if (!profile || hasRestoredRef.current) return;
    
    const restoreActiveRound = async () => {
      try {
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
        const isTransientFetch = (e: any) => {
          const msg = String(e?.message ?? e ?? '');
          return msg.includes('Failed to fetch') || msg.includes('AbortError') || msg.includes('signal is aborted');
        };

        const retry = async <T,>(fn: () => Promise<{ data: T | null; error: any }>, attempts = 3): Promise<T | null> => {
          let last: any = null;
          for (let i = 0; i < attempts; i++) {
            const { data, error } = await fn();
            if (!error) return data;
            last = error;
            if (!isTransientFetch(error)) break;
            await sleep(250 * (i + 1));
          }
          devError('Retryable operation failed:', last);
          return null;
        };

        // One-shot controls set by the UI (login flow)
        const skipRestoreOnce = sessionStorage.getItem('skip_restore_once');
        if (skipRestoreOnce) {
          sessionStorage.removeItem('skip_restore_once');
          return;
        }

        const explicitRestoreRoundId = sessionStorage.getItem('restore_round_id');
        if (explicitRestoreRoundId) {
          // IMPORTANT: do NOT clear this until restore succeeds.
          // If network fails mid-restore, we want the user to be able to retry without losing selection.

          // Restore THIS round directly
          const activeRound = await retry<any>(() =>
            supabase.from('rounds').select('*').eq('id', explicitRestoreRoundId).single() as any
          );

          if (!activeRound) {
            toast.error('No se pudo cargar la ronda (intenta de nuevo)');
            return;
          }

          devLog('Restoring selected pending round:', activeRound.id);

          // Get all groups for this round (sorted by group_number to identify main group)
          const { data: allGroupsData, error: groupsError } = await supabase
            .from('round_groups')
            .select('id, group_number')
            .eq('round_id', activeRound.id)
            .order('group_number', { ascending: true });
          
          if (groupsError) {
            devError('Failed to fetch round_groups:', groupsError);
          }
          
          const allGroups = allGroupsData || [];
          devLog('Loaded groups from DB:', allGroups);
          
          // Build a map from group_id to group_number
          const groupNumberById = new Map<string, number>();
          allGroups.forEach((g: any) => {
            groupNumberById.set(g.id, g.group_number);
          });
          
          // Identify main group (group_number = 1)
          let mainGroupId = allGroups.find((g: any) => g.group_number === 1)?.id || null;

          // Get all players in this round (including guests). Avoid embedded joins
          // to ensure guests (profile_id = null) are always returned.
          const allRoundPlayers = await retry<any[]>(() =>
            supabase
              .from('round_players')
              .select('id, profile_id, handicap_for_round, group_id, guest_name, guest_initials, guest_color, tee_color')
              .eq('round_id', activeRound.id) as any
          );

          if (!allRoundPlayers?.length) {
            toast.error('No se pudieron cargar los jugadores de la ronda');
            return;
          }
          
          devLog('Loaded round players:', allRoundPlayers.length, 'players');

          // Fallback: if no groups were loaded from DB, use first player's group as main
          if (!mainGroupId && allRoundPlayers.length > 0) {
            mainGroupId = allRoundPlayers[0].group_id;
            devLog('Using fallback mainGroupId from first player:', mainGroupId);
          }

          // Restore round state
          setRoundState({
            id: activeRound.id,
            status: activeRound.status as 'setup' | 'in_progress' | 'completed',
            date: parseLocalDate(activeRound.date),
            courseId: activeRound.course_id,
            teeColor: activeRound.tee_color as 'blue' | 'white' | 'yellow' | 'red',
            startingHole: (activeRound.starting_hole === 10 ? 10 : 1) as 1 | 10,
            groupId: mainGroupId,
            organizerProfileId: activeRound.organizer_id,
          });
          
          // Also update parent state for starting hole
          if (setStartingHole) {
            setStartingHole((activeRound.starting_hole === 10 ? 10 : 1) as 1 | 10);
          }

          // Load profiles for registered players (guests have profile_id = null)
          const profileIds = Array.from(
            new Set(
              (allRoundPlayers || [])
                .map((rp: any) => rp.profile_id)
                .filter(Boolean)
            )
          ) as string[];

          const profilesById = new Map<string, { display_name: string; initials: string; avatar_color: string }>();
          if (profileIds.length) {
            const profilesData = await retry<any[]>(() =>
              supabase.from('profiles').select('id, display_name, initials, avatar_color').in('id', profileIds) as any
            );

            (profilesData || []).forEach((p: any) => {
              profilesById.set(p.id, {
                display_name: p.display_name,
                initials: p.initials,
                avatar_color: p.avatar_color,
              });
            });
          }

          // Restore players + roundPlayerIds mapping
          // Also group players by their group_id for multi-group restoration
          const rpIdMap = new Map<string, string>();
          const playersByGroupId = new Map<string, Player[]>();
          
          const restoredPlayers: Player[] = [];
          
          (allRoundPlayers || []).forEach((rp: any) => {
            const isGuest = !rp.profile_id;
            const playerId = isGuest ? rp.id : rp.profile_id;
            rpIdMap.set(playerId, rp.id);

            const profileData = !isGuest ? profilesById.get(rp.profile_id) : undefined;
            const name = isGuest ? (rp.guest_name || 'Invitado') : (profileData?.display_name || 'Jugador');
            const initials = isGuest ? (rp.guest_initials || 'IN') : (profileData?.initials || 'XX');
            const color = isGuest ? (rp.guest_color || '#3B82F6') : (profileData?.avatar_color || '#3B82F6');

            const player: Player = {
              id: playerId,
              name,
              initials,
              color,
              handicap: Number(rp.handicap_for_round) || 0,
              profileId: rp.profile_id || undefined,
              teeColor: rp.tee_color || undefined,
            };
            
            // Add to restoredPlayers for score restoration
            restoredPlayers.push(player);
            
            // Group players by group_id
            const groupPlayers = playersByGroupId.get(rp.group_id) || [];
            groupPlayers.push(player);
            playersByGroupId.set(rp.group_id, groupPlayers);
          });

          devLog('Players grouped by group_id:', Array.from(playersByGroupId.entries()).map(([k, v]) => ({ groupId: k, count: v.length })));

          // Main group players (group_number = 1)
          const mainGroupPlayers = mainGroupId ? (playersByGroupId.get(mainGroupId) || []) : [];
          
          devLog('Main group players:', mainGroupPlayers.length);
          
          // Additional groups - sorted by group_number
          const additionalGroups: PlayerGroup[] = [];
          const sortedGroupIds = Array.from(playersByGroupId.keys())
            .filter(gid => gid !== mainGroupId)
            .sort((a, b) => (groupNumberById.get(a) || 99) - (groupNumberById.get(b) || 99));
          
          sortedGroupIds.forEach(groupId => {
            const groupNumber = groupNumberById.get(groupId) || 2;
            const groupPlayers = playersByGroupId.get(groupId) || [];
            additionalGroups.push({
              id: groupId,
              name: `Grupo ${groupNumber}`,
              players: groupPlayers,
            });
          });
          
          devLog('Additional groups:', additionalGroups.length, additionalGroups.map(g => ({ name: g.name, players: g.players.length })));

          setRoundPlayerIds(rpIdMap);
          setPlayers(mainGroupPlayers);
          if (setPlayerGroups) setPlayerGroups(additionalGroups);

          // NEVER auto-apply USGA handicap on restore.
          // The handicap_for_round value persisted in the DB is the source of truth.
          // If the user wants to recalculate, they can use the USGA dialog manually.
          // This prevents overwriting handicaps that were manually agreed upon in setup.

          // Restore course selection
          if (setSelectedCourseId) setSelectedCourseId(activeRound.course_id);
          if (setTeeColor) setTeeColor(activeRound.tee_color as 'blue' | 'white' | 'yellow' | 'red');

          // Restore bet config (DEFENSIVE merge with defaults)
          if (setBetConfig) {
            const incoming = (activeRound.bet_config || {}) as Partial<BetConfig>;
            const merged: BetConfig = {
              ...defaultBetConfig,
              ...incoming,
              medal: { ...defaultBetConfig.medal, ...incoming.medal },
              pressures: { ...defaultBetConfig.pressures, ...incoming.pressures },
              skins: { ...defaultBetConfig.skins, ...incoming.skins },
              caros: { ...defaultBetConfig.caros, ...incoming.caros },
              oyeses: { ...defaultBetConfig.oyeses, ...incoming.oyeses },
              units: { ...defaultBetConfig.units, ...incoming.units },
              manchas: { ...defaultBetConfig.manchas, ...incoming.manchas },
              culebras: { ...defaultBetConfig.culebras, ...incoming.culebras },
              pinguinos: { ...defaultBetConfig.pinguinos, ...incoming.pinguinos },
              rayas: { ...defaultBetConfig.rayas, ...incoming.rayas },
              carritos: { ...defaultBetConfig.carritos, ...incoming.carritos },
              medalGeneral: { ...defaultBetConfig.medalGeneral, ...incoming.medalGeneral },
              coneja: { ...defaultBetConfig.coneja, ...incoming.coneja },
              carritosTeams: incoming.carritosTeams ?? defaultBetConfig.carritosTeams,
              betOverrides: incoming.betOverrides ?? defaultBetConfig.betOverrides,
              bilateralHandicaps: incoming.bilateralHandicaps ?? defaultBetConfig.bilateralHandicaps,
              crossGroupRivals: incoming.crossGroupRivals ?? defaultBetConfig.crossGroupRivals,
              sideBets: incoming.sideBets ?? defaultBetConfig.sideBets,
              putts: { ...defaultBetConfig.putts, ...incoming.putts },
              stableford: incoming.stableford ?? defaultBetConfig.stableford,
              teamPressures: incoming.teamPressures ?? defaultBetConfig.teamPressures,
              zoologico: incoming.zoologico ?? defaultBetConfig.zoologico,
            };
            setBetConfig(merged);
          }

           // Get course to restore scores
           // NOTE: getCourseById depends on initial course list load; on a fresh session it
           // might not be ready yet. Fallback to fetching the course+holes from backend.
           const courseData =
             getCourseById?.(activeRound.course_id) ?? (await fetchCourseForRestore(activeRound.course_id));
          const holeScores = await retry<any[]>(() =>
            supabase.from('hole_scores').select('*').in('round_player_id', Array.from(rpIdMap.values())) as any
          );

           // Load markers (manchas/unidades/etc) for restored hole scores
           const holeScoreIds = (holeScores || []).map((hs: any) => hs.id).filter(Boolean);
           let markersByHoleScoreId: Map<string, MarkerState> = new Map();
           if (holeScoreIds.length) {
             const holeMarkers = await retry<any[]>(() =>
               supabase
                 .from('hole_markers')
                 .select('hole_score_id, marker_type, is_auto_detected')
                 .in('hole_score_id', holeScoreIds) as any
             );

             if (holeMarkers?.length) {
               markersByHoleScoreId = new Map();
               for (const m of holeMarkers as any[]) {
                 if (m.is_auto_detected) continue;
                 const prev = markersByHoleScoreId.get(m.hole_score_id) ?? { ...defaultMarkerState };
                 const key = markerDbToKey(m.marker_type);
                 if (key && key in prev && !isAutoDetectedMarker(key as any)) {
                   (prev as any)[key] = true;
                 }
                 markersByHoleScoreId.set(m.hole_score_id, prev);
               }
             }
           }

           if (holeScores && courseData) {
            const newScores = new Map<string, PlayerScore[]>();
            const confirmedHoleNumbers = new Set<number>();

            restoredPlayers.forEach((player) => {
              const rpId = rpIdMap.get(player.id);
              const strokesPerHole = calculateStrokesPerHole(player.handicap, courseData);

              const playerScores: PlayerScore[] = Array.from({ length: 18 }, (_, i) => {
                const holePar = courseData.holes[i]?.par || 4;
                const dbScore = holeScores.find((hs) => hs.round_player_id === rpId && hs.hole_number === i + 1);

                if (dbScore) {
                  if (dbScore.confirmed) confirmedHoleNumbers.add(dbScore.hole_number);
                  return {
                    playerId: player.id,
                    holeNumber: i + 1,
                    strokes: dbScore.strokes ?? holePar,
                    putts: dbScore.putts ?? 2,
                     markers: markersByHoleScoreId.get(dbScore.id) ?? { ...defaultMarkerState },
                    strokesReceived: dbScore.strokes_received ?? strokesPerHole[i],
                    netScore: dbScore.net_score ?? (dbScore.strokes ?? holePar) - strokesPerHole[i],
                    oyesProximity: dbScore.oyes_proximity ?? null,
                    oyesProximitySangron: (dbScore as any).oyes_proximity_sangron ?? null,
                    confirmed: dbScore.confirmed ?? false,
                  };
                }

                return {
                  playerId: player.id,
                  holeNumber: i + 1,
                  strokes: holePar,
                  putts: 2,
                  markers: { ...defaultMarkerState },
                  strokesReceived: strokesPerHole[i],
                  netScore: holePar - strokesPerHole[i],
                   oyesProximity: null,
                   oyesProximitySangron: null,
                  confirmed: false,
                };
              });

              newScores.set(player.id, playerScores);
            });

            setScores(newScores);
            setConfirmedHoles(confirmedHoleNumbers);
            devLog('Restored', holeScores.length, 'scores from database');
          }

          toast.success('Ronda restaurada');
           sessionStorage.removeItem('restore_round_id');
        }

        // ALWAYS fetch pending rounds (even after a restore) so the badge can show
        const { data: roundPlayers, error: rpError } = await supabase
          .from('round_players')
          .select(`
            id,
            round_id,
            profile_id,
            handicap_for_round,
            group_id,
            is_organizer,
            profiles!round_players_profile_id_fkey(id, display_name, initials, avatar_color, current_handicap)
          `)
          .eq('profile_id', profile.id)
          .order('joined_at', { ascending: false });

        if (rpError || !roundPlayers?.length) {
          setIsRestoring(false);
          hasRestoredRef.current = true;
          return;
        }

        // Get rounds for these participations
        const roundIds = [...new Set(roundPlayers.map(rp => rp.round_id))];
        const { data: rounds, error: roundsError } = await supabase
          .from('rounds')
          .select('id, status, date, course_id, tee_color, starting_hole, updated_at, golf_courses(name)')
          .in('id', roundIds)
          // Restore both draft (setup) and active (in_progress) rounds.
          // This prevents losing guests when the app reloads before scoring starts.
          .in('status', ['setup', 'in_progress'])
          .order('updated_at', { ascending: false })
          .limit(20);

        if (roundsError || !rounds?.length) {
          setIsRestoring(false);
          hasRestoredRef.current = true;
          return;
        }

        // Expose *all* open rounds so the UI can let the user choose.
        const mappedPending: PendingRoundInfo[] = (rounds || []).map((r: any) => ({
          roundId: r.id,
          status: r.status as 'setup' | 'in_progress',
          date: parseLocalDate(r.date),
          courseId: r.course_id,
          courseName: r.golf_courses?.name ?? undefined,
          teeColor: r.tee_color as any,
          startingHole: (r.starting_hole === 10 ? 10 : 1) as 1 | 10,
        }));

        setPendingRounds(mappedPending);
        setPendingRound(mappedPending[0] ?? null); // back-compat
        return;
      } catch (err) {
        devError('Error restoring round:', err);
      } finally {
        setIsRestoring(false);
        hasRestoredRef.current = true;
      }
    };

    restoreActiveRound();
  }, [profile, setPlayers, setScores, setConfirmedHoles, setBetConfig, setSelectedCourseId, setTeeColor, setStartingHole, getCourseById, applyMyUsgaHandicapIfAvailable]);

  // Generate shareable link
  const getShareableLink = useCallback(() => {
    if (!roundState.id) return null;
    return `${window.location.origin}/join/${roundState.id}`;
  }, [roundState.id]);

  // Create a new round in the database using server-side RPC
  const createRound = useCallback(async (courseId: string, teeColor: string, date: Date, startingHole: 1 | 10 = 1) => {
    if (!profile) {
      toast.error('Debes iniciar sesión para crear una ronda');
      return null;
    }

    // Verify we have an active session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      toast.error('Sesión expirada. Por favor, inicia sesión nuevamente.');
      return null;
    }

    setIsLoading(true);
    try {
      // Use the security-definer RPC to create round atomically
      const { data, error } = await supabase.rpc('create_round', {
        p_course_id: courseId,
        p_tee_color: teeColor,
        p_date: date.toISOString().split('T')[0],
        p_bet_config: betConfig as any,
        p_starting_hole: startingHole,
      });

      if (error) {
        devError('Round creation error:', error);
        throw error;
      }

      // RPC returns an array with one row
      const result = Array.isArray(data) ? data[0] : data;
      
      if (!result) {
        throw new Error('No data returned from create_round');
      }

      // Update state
      setRoundState({
        id: result.round_id,
        status: 'setup',
        date: date,
        courseId: courseId,
        teeColor: teeColor as any,
        startingHole: startingHole,
        groupId: result.group_id,
        organizerProfileId: result.organizer_profile_id,
      });

      setRoundPlayerIds(new Map([[result.organizer_profile_id, result.round_player_id]]));

      toast.success('Ronda creada');

      // Auto-apply USGA handicap for the organizer if available (otherwise stays 0)
      void applyMyUsgaHandicapIfAvailable(result.round_player_id);
      return result.round_id;
    } catch (error) {
      devError('Error creating round:', error);
      toast.error('Error al crear la ronda');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [profile, betConfig, applyMyUsgaHandicapIfAvailable]);

  // Start the round (change status to in_progress)
  const startRound = useCallback(async () => {
    if (!roundState.id || !course) return false;

    setIsLoading(true);
    try {
      // Update round status
      const { error } = await supabase
        .from('rounds')
        .update({ status: 'in_progress' })
        .eq('id', roundState.id);

      if (error) throw error;

      // Initialize scores locally
      const initialScores = new Map<string, PlayerScore[]>();
      players.forEach(player => {
        const strokesPerHole = calculateStrokesPerHole(player.handicap, course);
        const playerScores: PlayerScore[] = Array.from({ length: 18 }, (_, i) => {
          const holePar = course.holes[i]?.par || 4;
          return {
            playerId: player.id,
            holeNumber: i + 1,
            strokes: holePar,
            putts: 2,
            markers: { ...defaultMarkerState },
            strokesReceived: strokesPerHole[i],
            netScore: holePar - strokesPerHole[i],
            oyesProximity: null,
            oyesProximitySangron: null,
            confirmed: false,
          };
        });
        initialScores.set(player.id, playerScores);
      });

      setScores(initialScores);
      setRoundState(prev => ({ ...prev, status: 'in_progress' }));
      
      return true;
    } catch (error) {
      devError('Error starting round:', error);
      toast.error('Error al iniciar la ronda');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [roundState.id, course, players, setScores]);

  // Close the scorecard (complete the round)
  // allBetResults from the UI is used as a fallback but we ALWAYS recalculate synchronously
  // to guarantee the snapshot includes ALL bets (individual + Carritos + Presiones Parejas)
  // regardless of which UI tabs were rendered at close time.
  const closeScorecard = useCallback(async (
    allBetResultsFromUI: BetSummary[],
    getStrokesForPair?: (playerAId: string, playerBId: string) => number
  ) => {
    if (!roundState.id || !profile || !course) return false;

    // Local lock (prevents double-tap / re-entrancy)
    if (closeInFlightRef.current || isClosing) {
      const report = newCloseAttemptReport({
        roundId: roundState.id,
        currentRoundStatus: roundState.status,
        userId: profile?.id,
        playersCount: players.length,
        loggedPlayers: players.filter((p) => p.profileId && isUuid(p.profileId)).length,
        guestPlayers: players.filter((p) => !p.profileId || !isUuid(p.profileId)).length,
        invalidProfileIds: players
          .filter((p) => p.profileId && !isUuid(p.profileId))
          .map((p) => ({ playerId: p.id, name: p.name, profileId: p.profileId as string })),
      });
      pushStageFail(report, 'validateInputs', 'Cierre en proceso');
      setLastCloseReport(report);
      toast('Cierre en proceso');
      return false;
    }

    closeInFlightRef.current = true;
    setIsClosing(true);
    setLastCloseReport(null);

    setIsLoading(true);

    // Build base report early
    const invalidProfileIds = players
      .filter((p) => p.profileId && !isUuid(p.profileId))
      .map((p) => ({ playerId: p.id, name: p.name, profileId: p.profileId as string }));

    const report: CloseAttemptReport = newCloseAttemptReport({
      roundId: roundState.id,
      currentRoundStatus: roundState.status,
      userId: profile?.id,
      playersCount: players.length,
      loggedPlayers: players.filter((p) => p.profileId && isUuid(p.profileId)).length,
      guestPlayers: players.filter((p) => !p.profileId || !isUuid(p.profileId)).length,
      invalidProfileIds,
    });

    const fail = async (stage: CloseStage, err: unknown, attemptId?: string) => {
      pushStageFail(report, stage, err);
      setLastCloseReport({ ...report });
      devError('CloseAttemptReport failed:', report);
      try {
        if (attemptId) {
          await supabase.rpc('finish_round_close_attempt', {
            p_attempt_id: attemptId,
            p_status: 'failed',
            p_error_stage: stage,
            p_error_message: String((err as any)?.message ?? err ?? 'Error'),
            p_report: report as any,
          });
        }
      } catch (e) {
        devError('Failed finishing round close attempt:', e);
      }
    };

    try {
      // Stage: validateInputs
      pushStageOk(report, 'validateInputs');

      // Backend idempotency lock
      let attemptId: string | undefined;
      try {
        const { data: attemptData, error: attemptErr } = await supabase.rpc('begin_round_close_attempt', {
          p_round_id: roundState.id,
          p_lock_seconds: 60,
        });
        if (attemptErr) throw attemptErr;

        const state = (attemptData as any)?.state;
        if (state === 'already_closed') {
          pushStageOk(report, 'beginAttempt');
          setLastCloseReport({ ...report });
          setRoundState((prev) => ({ ...prev, status: 'completed' }));
          toast.success('Ronda ya estaba cerrada');
          return true;
        }

        if (state === 'locked') {
          pushStageFail(report, 'beginAttempt', 'Ya hay un cierre en proceso (lock backend)');
          setLastCloseReport({ ...report });
          toast('Cierre en proceso (backend)');
          return false;
        }

        attemptId = (attemptData as any)?.attempt_id;
        report.attemptId = attemptId;
        pushStageOk(report, 'beginAttempt');
      } catch (e) {
        await fail('beginAttempt', e);
        toast.error('No se pudo iniciar el cierre (lock)');
        return false;
      }

      // Guardrail: if any player has a malformed profileId (e.g. a shortened code like "01f284d7"),
      // treat them as a guest for persistence purposes so backend UUID casts don't fail.
      const sanitizedPlayers = players.map((p) => {
        if (!p.profileId) return p;
        if (isUuid(p.profileId)) return p;
        devError('Malformed profileId detected; treating as guest for closeScorecard:', {
          playerId: p.id,
          profileId: p.profileId,
          name: p.name,
        });
        return { ...p, profileId: undefined };
      });

      // IMPORTANT: Do NOT mark the round as completed until ALL persistence succeeds.
      // Otherwise we can end up with a "completed" round without ledger/snapshot/sliding.
      try {
        const { error: betConfigError } = await supabase
          .from('rounds')
          .update({ bet_config: betConfig as any })
          .eq('id', roundState.id);
        if (betConfigError) throw betConfigError;
        pushStageOk(report, 'saveBetConfig');
      } catch (e) {
        await fail('saveBetConfig', e, report.attemptId);
        toast.error('Error al guardar configuración');
        return false;
      }

      // Save all hole scores to database
      const scoreRecords: any[] = [];
      for (const [playerId, playerScores] of scores) {
        const rpId = roundPlayerIds.get(playerId);
        if (!rpId) continue;

        playerScores.forEach(score => {
          scoreRecords.push({
            round_player_id: rpId,
            hole_number: score.holeNumber,
            strokes: score.strokes,
            putts: score.putts,
            strokes_received: score.strokesReceived,
            net_score: score.netScore,
            oyes_proximity: score.oyesProximity,
            oyes_proximity_sangron: (score as any).oyesProximitySangron ?? null,
            confirmed: true,
          });
        });
      }

      // Upsert scores
      try {
        if (scoreRecords.length > 0) {
          const { error: scoresError } = await supabase
            .from('hole_scores')
            .upsert(scoreRecords, {
              onConflict: 'round_player_id,hole_number',
              ignoreDuplicates: false,
            });
          if (scoresError) throw scoresError;
        }
        pushStageOk(report, 'writeScores');
      } catch (e) {
        await fail('writeScores', e, report.attemptId);
        toast.error('Error al guardar scores');
        return false;
      }

      // Fetch bilateral handicaps from round_handicaps table for the snapshot
      // These are stored with round_player_ids, we need to convert to local player IDs
      let bilateralHandicapsMap: Map<string, number> | undefined;
      try {
        const { data: rhData, error: rhError } = await supabase
          .from('round_handicaps')
          .select('player_a_id, player_b_id, strokes_given_by_a')
          .eq('round_id', roundState.id);

        if (rhError) throw rhError;

        if (rhData && rhData.length > 0) {
          bilateralHandicapsMap = new Map();
          
          // Create reverse lookup from round_player_id to local player id
          const rpIdToLocalId = new Map<string, string>();
          for (const [localId, rpId] of roundPlayerIds) {
            rpIdToLocalId.set(rpId, localId);
          }

          for (const rh of rhData) {
            const localA = rpIdToLocalId.get(rh.player_a_id);
            const localB = rpIdToLocalId.get(rh.player_b_id);
            if (localA && localB) {
              const key = `${localA}::${localB}`;
              bilateralHandicapsMap.set(key, rh.strokes_given_by_a);
            }
          }
        }
      } catch (e) {
        devError('Error fetching bilateral handicaps for snapshot (non-fatal):', e);
        // Non-fatal - continue without bilateral handicaps in snapshot
      }

      // VALIDATION: Check if bilateral handicaps are expected but missing
      const loggedInPlayers = sanitizedPlayers.filter(p => p.profileId && isUuid(p.profileId));
      const expectedPairs = (loggedInPlayers.length * (loggedInPlayers.length - 1)) / 2;
      const actualPairs = bilateralHandicapsMap?.size || 0;
      
      if (betConfig.pressures?.enabled && loggedInPlayers.length >= 2 && actualPairs === 0) {
        devWarn(`⚠️ VALIDATION WARNING: Presiones enabled with ${loggedInPlayers.length} logged-in players but no bilateral handicaps found.`);
      } else if (betConfig.pressures?.enabled && actualPairs < expectedPairs) {
        devWarn(`⚠️ VALIDATION: Expected ${expectedPairs} bilateral handicap pairs, found ${actualPairs}.`);
      }

      // ─── SYNCHRONOUS BET CALCULATION ────────────────────────────────────────
      // CRITICAL: Always recalculate ALL bet results synchronously here.
      // This guarantees the snapshot ledger is complete (Individual + Carritos +
      // Presiones Parejas) regardless of which UI tabs were rendered at close time.
      // betOverrides in betConfig are applied by calculateAllBets automatically.
      const confirmedScoresForClose = new Map<string, import('@/types/golf').PlayerScore[]>();
      scores.forEach((playerScores, playerId) => {
        confirmedScoresForClose.set(
          playerId,
          playerScores.filter(
            (s) => s.confirmed && typeof s.strokes === 'number' && Number.isFinite(s.strokes)
          )
        );
      });

      // Inject bilateral handicaps into betConfig so calculateAllBets uses them
      const betConfigWithHandicaps = bilateralHandicapsMap
        ? (() => {
            const bilateralHandicapsForEngine: import('@/types/golf').BilateralHandicap[] = [];
            for (const [key, strokes] of bilateralHandicapsMap!) {
              const [aId, bId] = key.split('::');
              if (aId && bId) {
                bilateralHandicapsForEngine.push(
                  strokes >= 0
                    ? { playerAId: aId, playerBId: bId, playerAHandicap: 0, playerBHandicap: strokes }
                    : { playerAId: aId, playerBId: bId, playerAHandicap: Math.abs(strokes), playerBHandicap: 0 }
                );
              }
            }
            return { ...betConfig, bilateralHandicaps: bilateralHandicapsForEngine };
          })()
        : betConfig;

      const allBetResults = calculateAllBets(
        sanitizedPlayers,
        confirmedScoresForClose,
        betConfigWithHandicaps,
        course,
        roundState.startingHole,
        new Set(Array.from({ length: 18 }, (_, i) => i + 1))
      );
      // ─── END SYNCHRONOUS BET CALCULATION ────────────────────────────────────

      // Save ledger transactions for bet results (only for registered players)
      const ledgerRecords: any[] = [];
      allBetResults.forEach(result => {
        if (result.amount > 0) {
          // Get players - winner is playerId, loser is vsPlayer
          const winner = sanitizedPlayers.find(p => p.id === result.playerId);
          const loser = sanitizedPlayers.find(p => p.id === result.vsPlayer);
          
          // Only create ledger entries for registered players (with profileId)
          if (winner?.profileId && loser?.profileId && isUuid(winner.profileId) && isUuid(loser.profileId)) {
            // Map human-readable labels to DB enum values
            const labelToEnum: Record<string, string> = {
              'Medal Front 9': 'medal_front',
              'Medal Back 9': 'medal_back',
              'Medal Total': 'medal_total',
              'Presiones Front': 'pressure_front',
              'Presiones Back': 'pressure_back',
              'Presiones Match 18': 'medal_total',
              'Presiones Parejas': 'pressure_front',
              'Carritos Front': 'carritos_front',
              'Carritos Back': 'carritos_back',
              'Carritos Total': 'carritos_total',
              'Caros': 'caros',
              'Unidades': 'units',
              'Manchas': 'manchas',
              'Culebras': 'culebras',
              'Pingüinos': 'pinguinos',
              'Coneja': 'coneja',
              'Side Bet': 'medal_total',
            };
            const mappedType = labelToEnum[result.betType] ?? result.betType;
            const betType = isValidBetType(mappedType) ? mappedType : 'medal_total';
            ledgerRecords.push({
              from_profile_id: loser.profileId,
              to_profile_id: winner.profileId,
              amount: result.amount,
              bet_type: betType,
              segment: result.segment || 'total',
              hole_number: result.holeNumber || null,
              description: result.description || null,
            });
          }
        }
      });

      try {
        if (ledgerRecords.length > 0) {
          const { error: ledgerError } = await supabase.rpc('finalize_round_bets', {
            p_round_id: roundState.id,
            p_ledger: ledgerRecords,
          });
          if (ledgerError) throw ledgerError;
        }
        pushStageOk(report, 'finalizeRoundBets');
      } catch (e) {
        await fail('finalizeRoundBets', e, report.attemptId);
        toast.error('Error al finalizar apuestas');
        return false;
      }

      // Generate and save the round snapshot for historical view
      // This snapshot is immutable and will be used for all future historical views
      let snapshot: any = null;
      try {
        snapshot = generateRoundSnapshot(
          roundState.id,
          course,
          sanitizedPlayers,
          scores,
          betConfigWithHandicaps,
          allBetResults,
          roundState.teeColor,
          roundState.startingHole,
          roundState.date.toISOString().split('T')[0],
          bilateralHandicapsMap
        );
        pushStageOk(report, 'createSnapshot');
      } catch (e) {
        await fail('createSnapshot', e, report.attemptId);
        toast.error('Error al generar snapshot');
        return false;
      }

      try {
        const { error: snapshotError } = await supabase
          .from('round_snapshots')
          .upsert(
            {
              round_id: roundState.id,
              snapshot_json: snapshot as any,
              snapshot_version: 1,
              closed_at: new Date().toISOString(),
            },
            {
              onConflict: 'round_id',
              ignoreDuplicates: false,
            }
          );

        if (snapshotError) throw snapshotError;
        pushStageOk(report, 'saveSnapshot');
      } catch (e) {
        // Snapshot SHOULD be reliable; fail to make it diagnosable and to avoid partial "closed" states.
        await fail('saveSnapshot', e, report.attemptId);
        toast.error('Error al guardar snapshot');
        return false;
      }

      // Repair/ensure PvP + ledger consistency for guest-inclusive rounds.
      // This is SECURITY DEFINER on the backend, and is idempotent.
      // (If ledger/PvP already exist for this round, it returns without changes.)
      try {
        const { error: rebuildError } = await supabase.rpc('rebuild_round_financials_from_snapshot', {
          p_round_id: roundState.id,
        });
        if (rebuildError) {
          devError('Error rebuilding round financials from snapshot:', rebuildError);
          // keep going (not fatal)
        } else {
          pushStageOk(report, 'rebuildFinancials');
        }
      } catch (e) {
        devError('Exception rebuilding round financials from snapshot:', e);
        // keep going (not fatal)
      }

      // NOTE: Player vs Player (PvP) records for registered players are updated server-side
      // within the finalize_round_bets RPC function for security.

      // Update handicap history for all players with profiles
      try {
        for (const player of sanitizedPlayers) {
          if (player.profileId && isUuid(player.profileId)) {
            await supabase.from('handicap_history').insert({
              profile_id: player.profileId,
              handicap: player.handicap,
              round_id: roundState.id,
            });
          }
        }
        pushStageOk(report, 'saveHandicapHistory');
      } catch (e) {
        // Not fatal to closing.
        devError('Error saving handicap history:', e);
      }

      // Calculate and save sliding adjustments for logged-in player pairs
      // Only if Presiones is enabled and we have a function to get strokes
      if (getStrokesForPair && betConfig.pressures?.enabled) {
        try {
          const slidingResults = calculateSlidingResults(
            sanitizedPlayers,
            scores,
            betConfig,
            course,
            getStrokesForPair
          );

          if (slidingResults.length > 0) {
            // Prepare history records
            const historyRecords = slidingResults.map(r => ({
              round_id: roundState.id,
              player_a_profile_id: r.playerAProfileId,
              player_b_profile_id: r.playerBProfileId,
              strokes_a_gives_b_used: r.strokesUsed,
              front_main_winner: r.frontMainWinner,
              back_main_winner: r.backMainWinner,
              match_total_winner: r.matchTotalWinner,
              carry_front_main: r.carryFrontMain,
              strokes_a_gives_b_next: r.strokesNext,
            }));

            // Insert sliding history
            const { error: slidingHistError } = await supabase
              .from('sliding_history')
              .insert(historyRecords);

            if (slidingHistError) {
              devError('Error saving sliding history:', slidingHistError);
            } else {
              devLog(`Saved sliding history for ${slidingResults.length} pairs`);
            }

            // Update sliding_current for each pair
            for (const result of slidingResults) {
              const { error: slidingCurrError } = await supabase
                .from('sliding_current')
                .upsert({
                  player_a_profile_id: result.playerAProfileId,
                  player_b_profile_id: result.playerBProfileId,
                  strokes_a_gives_b_current: result.strokesNext,
                  last_round_id: roundState.id,
                  last_updated_at: new Date().toISOString(),
                }, {
                  onConflict: 'player_a_profile_id,player_b_profile_id',
                });

              if (slidingCurrError) {
                devError('Error upserting sliding_current:', slidingCurrError);
              }
            }

            // Log sliding results for debugging
            slidingResults.forEach(r => {
              const change = r.strokesNext - r.strokesUsed;
              const desc = r.carryFrontMain 
                ? 'Carry en Front → Sin ajuste' 
                : change === 0 
                  ? 'Empate Total → Sin ajuste'
                  : change > 0 
                    ? `A gana Total → +${change} golpe` 
                    : `B gana Total → ${change} golpe`;
              devLog(`Sliding ${r.playerAProfileId.slice(0,8)} vs ${r.playerBProfileId.slice(0,8)}: ${r.strokesUsed} → ${r.strokesNext} (${desc})`);
            });
          }
          pushStageOk(report, 'updateSliding');
        } catch (slidingError) {
          devError('Error calculating/saving sliding:', slidingError);
          // Don't fail the round closure for sliding errors
        }
      }

      // Mark the round as completed ONLY at the very end.
      try {
        const { error: roundCompleteError } = await supabase
          .from('rounds')
          .update({ status: 'completed' })
          .eq('id', roundState.id);
        if (roundCompleteError) throw roundCompleteError;
        pushStageOk(report, 'setRoundClosed');
      } catch (e) {
        await fail('setRoundClosed', e, report.attemptId);
        toast.error('No se pudo marcar la ronda como cerrada');
        return false;
      }

      // Close attempt succeeded
      try {
        if (report.attemptId) {
          await supabase.rpc('finish_round_close_attempt', {
            p_attempt_id: report.attemptId,
            p_status: 'succeeded',
            p_error_stage: null,
            p_error_message: null,
            p_report: report as any,
          });
        }
      } catch (e) {
        devError('Failed to finish close attempt as succeeded:', e);
      }

      setRoundState(prev => ({ ...prev, status: 'completed' }));
      toast.success('Tarjeta cerrada y guardada');
      setLastCloseReport({ ...report });
      return true;
    } catch (error) {
      // Unknown/unexpected stage
      await fail('setRoundClosed', error, report.attemptId);
      toast.error('Error al cerrar la tarjeta');
      return false;
    } finally {
      setIsLoading(false);
      setIsClosing(false);
      closeInFlightRef.current = false;
    }
  }, [roundState.id, roundState.teeColor, roundState.startingHole, roundState.date, profile, scores, players, betConfig, roundPlayerIds, isValidBetType, isUuid, course]);

  // Add a player to an active round (creates round_player entry in DB)
  const addPlayerToRound = useCallback(async (player: Player, targetGroupId?: string | null): Promise<boolean> => {
    const groupId = targetGroupId ?? roundState.groupId;
    if (!roundState.id || !groupId) {
      devLog('No active round to add player to');
      return false;
    }

    try {
      // Check if player already exists in round_players
      if (roundPlayerIds.has(player.id)) {
        devLog('Player already in round');
        return true;
      }

      // For non-guest players with profileId, create a round_player entry
      if (player.profileId) {
        const { data, error } = await supabase
          .from('round_players')
          .insert({
            round_id: roundState.id,
            group_id: groupId,
            profile_id: player.profileId,
            handicap_for_round: player.handicap || 0,
            is_organizer: false,
            tee_color: player.teeColor || roundState.teeColor || 'white',
          })
          .select('id')
          .single();

        if (error) {
          devError('Error adding player to round:', error);
          toast.error('Error al agregar jugador a la ronda');
          return false;
        }

        // Update roundPlayerIds map
        setRoundPlayerIds(prev => {
          const newMap = new Map(prev);
          newMap.set(player.id, data.id);
          return newMap;
        });
      } else {
        // Guest player: persist on round_players so scores survive refresh
        const isHexColor = typeof player.color === 'string' && player.color.startsWith('#');
        const guestColor = isHexColor ? player.color : '#3B82F6';

        let safeName = player.name;
        let safeInitials = player.initials;
        try {
          safeName = validatePlayerName(player.name);
          safeInitials = initialsFromPlayerName(safeName);
        } catch (e: any) {
          toast.error(e?.message || 'Nombre inválido');
          return false;
        }

        const { data, error } = await supabase
          .from('round_players')
          .insert({
            round_id: roundState.id,
            group_id: groupId,
            profile_id: null,
            handicap_for_round: player.handicap || 0,
            is_organizer: false,
            guest_name: safeName,
            guest_initials: safeInitials,
            guest_color: guestColor,
            tee_color: player.teeColor || roundState.teeColor || 'white',
          })
          .select('id')
          .single();

        if (error) {
          devError('Error adding guest player to round:', error);
          toast.error('Error al agregar invitado a la ronda');
          return false;
        }

        const oldId = player.id;
        const newId = data.id as string;

        // 1) Update players list to use stable id (round_players.id)
        setPlayers((prev) =>
          prev.map((p) =>
            p.id === oldId
              ? { ...p, id: newId, color: guestColor, name: safeName, initials: safeInitials }
              : p
          )
        );

        // 2) Migrate scores map key + playerId inside score rows
        setScores((prev) => {
          const next = new Map(prev);
          const oldScores = next.get(oldId);
          if (oldScores) {
            next.delete(oldId);
            next.set(
              newId,
              oldScores.map((s) => ({ ...s, playerId: newId }))
            );
          }
          return next;
        });

        // 3) Update roundPlayerIds mapping
        setRoundPlayerIds((prev) => {
          const next = new Map(prev);
          next.delete(oldId);
          next.set(newId, newId);
          return next;
        });

        // 4) Update betConfig references (best-effort, only if hook controls it)
        if (setBetConfig) {
          setBetConfig((prev) => {
            // `prev` may be partially shaped if it was restored from a legacy/partial bet_config.
            // Ensure nested objects exist before mapping.
            const safePrev: BetConfig = {
              ...defaultBetConfig,
              ...(prev as any),
              carritos: { ...defaultBetConfig.carritos, ...(prev as any)?.carritos },
              oyeses: { ...defaultBetConfig.oyeses, ...(prev as any)?.oyeses },
              medalGeneral: { ...defaultBetConfig.medalGeneral, ...(prev as any)?.medalGeneral },
            };

            const replaceId = (value: string) => (value === oldId ? newId : value);

            // Helper to migrate participantIds arrays across all bet types
            const migrateParticipantIds = (ids?: string[]): string[] | undefined => {
              if (!ids || ids.length === 0) return ids;
              return ids.map(replaceId);
            };

            return {
              ...safePrev,
              medal: { ...safePrev.medal, participantIds: migrateParticipantIds(safePrev.medal.participantIds) },
              pressures: { ...safePrev.pressures, participantIds: migrateParticipantIds(safePrev.pressures.participantIds) },
              skins: { ...safePrev.skins, participantIds: migrateParticipantIds(safePrev.skins.participantIds) },
              caros: { ...safePrev.caros, participantIds: migrateParticipantIds(safePrev.caros.participantIds) },
              units: { ...safePrev.units, participantIds: migrateParticipantIds(safePrev.units.participantIds) },
              manchas: { ...safePrev.manchas, participantIds: migrateParticipantIds(safePrev.manchas.participantIds) },
              culebras: { ...safePrev.culebras, participantIds: migrateParticipantIds(safePrev.culebras.participantIds) },
              pinguinos: { ...safePrev.pinguinos, participantIds: migrateParticipantIds(safePrev.pinguinos.participantIds) },
              putts: { ...safePrev.putts, participantIds: migrateParticipantIds(safePrev.putts.participantIds) },
              zoologico: safePrev.zoologico ? { ...safePrev.zoologico, participantIds: migrateParticipantIds(safePrev.zoologico.participantIds) } : safePrev.zoologico,
              stableford: {
                ...safePrev.stableford,
                playerHandicaps: (safePrev.stableford.playerHandicaps ?? []).map((ph) => ({
                  ...ph,
                  playerId: replaceId(ph.playerId),
                })),
              },
              carritos: {
                ...safePrev.carritos,
                teamA: [replaceId(safePrev.carritos.teamA[0]), replaceId(safePrev.carritos.teamA[1])],
                teamB: [replaceId(safePrev.carritos.teamB[0]), replaceId(safePrev.carritos.teamB[1])],
                teamHandicaps: safePrev.carritos.teamHandicaps
                  ? Object.fromEntries(Object.entries(safePrev.carritos.teamHandicaps).map(([pid, h]) => [replaceId(pid), h]))
                  : safePrev.carritos.teamHandicaps,
              },
              carritosTeams: safePrev.carritosTeams?.map((t) => ({
                ...t,
                teamA: [replaceId(t.teamA[0]), replaceId(t.teamA[1])],
                teamB: [replaceId(t.teamB[0]), replaceId(t.teamB[1])],
                teamHandicaps: t.teamHandicaps
                  ? Object.fromEntries(Object.entries(t.teamHandicaps).map(([pid, h]) => [replaceId(pid), h]))
                  : t.teamHandicaps,
              })),
              oyeses: {
                ...safePrev.oyeses,
                playerConfigs: (safePrev.oyeses.playerConfigs ?? []).map((pc) => ({
                  ...pc,
                  playerId: replaceId(pc.playerId),
                })),
              },
              medalGeneral: {
                ...safePrev.medalGeneral,
                playerHandicaps: (safePrev.medalGeneral.playerHandicaps ?? []).map((ph) => ({
                  ...ph,
                  playerId: replaceId(ph.playerId),
                })),
              },
              betOverrides: safePrev.betOverrides?.map((o) => ({
                ...o,
                playerAId: replaceId(o.playerAId),
                playerBId: replaceId(o.playerBId),
              })),
              bilateralHandicaps: safePrev.bilateralHandicaps?.map((h) => ({
                ...h,
                playerAId: replaceId(h.playerAId),
                playerBId: replaceId(h.playerBId),
              })),
              crossGroupRivals: safePrev.crossGroupRivals
                ? Object.fromEntries(
                    Object.entries(safePrev.crossGroupRivals).map(([pid, rivals]) => [
                      replaceId(pid),
                      rivals.map(replaceId),
                    ])
                  )
                : safePrev.crossGroupRivals,
            };
          });
        }
      }

      return true;
    } catch (err) {
      console.error('Error in addPlayerToRound:', err);
      return false;
    }
  }, [roundState.id, roundState.groupId, roundPlayerIds, setPlayers, setScores, setBetConfig]);

  // Add a guest player (non-registered) - just local, no DB entry
  const addGuestPlayer = useCallback(async (name: string, handicap: number) => {
    if (!roundState.id || !roundState.groupId) return null;

    const initials = name
      .split(' ')
      .map(n => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    const colors = [
      '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
      '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'
    ];

    const newPlayer: Player = {
      id: `guest-${Date.now()}`,
      name,
      initials,
      color: colors[players.length % colors.length],
      handicap: 0,
    };

    return newPlayer;
  }, [roundState.id, roundState.groupId, players.length]);

  // Update round date
  const setRoundDate = useCallback((date: Date) => {
    setRoundState(prev => ({ ...prev, date }));
    
    // If round exists, update in database
    if (roundState.id) {
      supabase
        .from('rounds')
        .update({ date: date.toISOString().split('T')[0] })
        .eq('id', roundState.id)
        .then(({ error }) => {
          if (error) console.error('Error updating date:', error);
        });
    }
  }, [roundState.id]);

  // Copy link to clipboard
  const copyShareLink = useCallback(async () => {
    const link = getShareableLink();
    if (!link) {
      toast.error('Primero crea la ronda');
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copiado al portapapeles');
    } catch {
      toast.error('Error al copiar el link');
    }
  }, [getShareableLink]);

  return {
    roundState,
    setRoundState,
    roundPlayerIds,
    setRoundPlayerIds,
    isLoading,
    isClosing,
    lastCloseReport,
    isRestoring,
    isRoundStarted,
    pendingRound,
    pendingRounds,
    getShareableLink,
    createRound,
    startRound,
    closeScorecard,
    addPlayerToRound,
    addGuestPlayer,
    setRoundDate,
    copyShareLink,
  };
};

