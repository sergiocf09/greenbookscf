import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Player, BetConfig, PlayerScore, GolfCourse, defaultMarkerState, HoleInfo, MarkerState, PlayerGroup } from '@/types/golf';
import { calculateStrokesPerHole, getSegmentHoleRanges } from '@/lib/handicapUtils';
// calculateHandicapIndexFromDifferentials used via dynamic import in close logic
import { Constants } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { defaultBetConfig } from '@/components/setup/BetSetup';
import { restoreMarkerStateFromRows } from '@/lib/markerPersistence';
import { devError, devLog, devWarn } from '@/lib/logger';
import { initialsFromPlayerName, validatePlayerName, formatPlayerName } from '@/lib/playerInput';
import { generateRoundSnapshot } from '@/lib/roundSnapshot';
import { BetSummary, calculateAllBets, getPressureEvolution } from '@/lib/betCalculations';
import { calculateWolfBets } from '@/lib/bets/wolf';
import { calculateSixesBets } from '@/lib/bets/sixes';
import { calculateVegasBets } from '@/lib/bets/vegas';
import { calculateNinesBets } from '@/lib/bets/nines';
import { isSixesSettlementActive, isVegasSettlementActive, isWolfSettlementActive } from '@/lib/teamBetPersistence';
import type { WolfConfig, WolfHoleState, SixesConfig, VegasConfig, NinesConfig } from '@/types/golf';
import { resolveConfigForGroup } from '@/lib/groupBetOverrides';
import { isCrossGroupPairInMap } from '@/lib/crossGroupBalance';
import { parseLocalDate } from '@/lib/dateUtils';
import { calculateSlidingResults, SlidingResult } from '@/lib/slidingCalculations';
import {
  type CloseAttemptReport,
  type ClosePlayerSummary,
  type CloseBalanceSummary,
  type CloseOverrideSummary,
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
  isOrganizer: boolean;
}

interface UseRoundManagementProps {
  players: Player[];
  playerGroups: PlayerGroup[];
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
  logEvent?: (eventType: string, payload: Record<string, any>, targetPlayerId?: string | null) => Promise<void>;
}

export const useRoundManagement = ({
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
        // Read persisted current_handicap from profile (already calculated by previous close)
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('current_handicap')
          .eq('id', profile.id)
          .single();

        if (profileError) throw profileError;

        const handicapIndex = Number(profileData?.current_handicap);
        if (!Number.isFinite(handicapIndex) || handicapIndex < 0 || handicapIndex > 54) return;

        // Check if user has actual handicap history; skip if no history AND value is default 20.0
        // This avoids applying the DB default (20.0) as a real handicap for new users
        if (handicapIndex === 20.0) {
          const { count } = await supabase
            .from('handicap_history')
            .select('id', { count: 'exact', head: true })
            .eq('profile_id', profile.id);
          if (!count || count === 0) return;
        }

        // Calculate Course Handicap if course is available
        let finalHandicap = handicapIndex;
        if (course) {
          const roundTeeColor = (course as any).teeColor || 'white';
          const { data: teeData } = await supabase
            .from('course_tees')
            .select('course_rating, slope_rating')
            .eq('course_id', course.id)
            .eq('tee_color', roundTeeColor)
            .maybeSingle();

          if (teeData) {
            const coursePar = course.holes.reduce((sum, h) => sum + h.par, 0);
            const { calculateCourseHandicap } = await import('@/lib/usgaHandicap');
            finalHandicap = calculateCourseHandicap(handicapIndex, teeData.slope_rating, teeData.course_rating, coursePar);
          }
        }

        // Persist to backend
        const { error: updateError } = await supabase
          .from('round_players')
          .update({ handicap_for_round: finalHandicap })
          .eq('id', targetRoundPlayerId);

        if (updateError) throw updateError;

        // Update local player handicap
        setPlayers((prev) =>
          prev.map((p) => (p.profileId === profile.id || p.id === profile.id ? { ...p, handicap: finalHandicap } : p))
        );

        // Recompute strokesReceived if scores exist
        if (course) {
          setScores((prev) => {
            const next = new Map(prev);
            const myPlayerKey = profile.id;
            const myScores = next.get(myPlayerKey);
            if (!myScores) return prev;
            const strokesPerHole = calculateStrokesPerHole(finalHandicap, course);
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
    // Set the guard synchronously BEFORE the async work begins.
    // This prevents duplicate concurrent restores when dependencies change
    // while the first restore is still in flight.
    hasRestoredRef.current = true;
    
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
        }

        // ── STEP 1: Always fetch pending rounds (for badge + auto-restore) ──
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

        const roundIds = [...new Set(roundPlayers.map(rp => rp.round_id))];
        const { data: rounds, error: roundsError } = await supabase
          .from('rounds')
          .select('id, status, date, course_id, tee_color, starting_hole, updated_at, organizer_id, golf_courses(name)')
          .in('id', roundIds)
          .in('status', ['setup', 'in_progress'])
          .order('updated_at', { ascending: false })
          .limit(20);

        if (roundsError || !rounds?.length) {
          setIsRestoring(false);
          hasRestoredRef.current = true;
          return;
        }

        const mappedPending: PendingRoundInfo[] = (rounds || []).map((r: any) => ({
          roundId: r.id,
          status: r.status as 'setup' | 'in_progress',
          date: parseLocalDate(r.date),
          courseId: r.course_id,
          courseName: r.golf_courses?.name ?? undefined,
          teeColor: r.tee_color as any,
          startingHole: (r.starting_hole === 10 ? 10 : 1) as 1 | 10,
          isOrganizer: r.organizer_id === profile.id,
        }));

        setPendingRounds(mappedPending);
        setPendingRound(mappedPending[0] ?? null);

        // If skip was requested, don't auto-restore — just show pending badge
        if (skipRestoreOnce) {
          return;
        }

        // ── STEP 2: Determine which round to restore ──
        const explicitRestoreRoundId = sessionStorage.getItem('restore_round_id');
        const autoRestoreRoundId = !explicitRestoreRoundId
          ? mappedPending.find(r => !localStorage.getItem(`round_closed_${r.roundId}`))?.roundId ?? null
          : null;
        const restoreRoundId = explicitRestoreRoundId || autoRestoreRoundId;

        if (!restoreRoundId) {
          // Nothing to restore
          return;
        }

        // ── STEP 3: Restore the selected round ──
        {
          const activeRound = await retry<any>(() =>
            supabase.from('rounds').select('*').eq('id', restoreRoundId).single() as any
          );

          if (!activeRound) {
            toast.error('No se pudo cargar la ronda (intenta de nuevo)');
            sessionStorage.removeItem('restore_round_id');
            return;
          }

          devLog('Restoring round:', activeRound.id);

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
              .select('id, profile_id, handicap_for_round, group_id, guest_name, guest_initials, guest_color, tee_color, is_admin')
              .eq('round_id', activeRound.id) as any
          );

          if (!allRoundPlayers?.length) {
            toast.error('No se pudieron cargar los jugadores de la ronda');
            sessionStorage.removeItem('restore_round_id');
            return;
          }
          
          devLog('Loaded round players:', allRoundPlayers.length, 'players');

          // Fallback: if no groups were loaded from DB, use first player's group as main
          if (!mainGroupId && allRoundPlayers.length > 0) {
            mainGroupId = allRoundPlayers[0].group_id;
            devLog('Using fallback mainGroupId from first player:', mainGroupId);
          }

          // Detect the logged-in user's actual group
          const myProfileId = profile?.id;
          const myRoundPlayer = myProfileId
            ? allRoundPlayers.find((rp: any) => rp.profile_id === myProfileId)
            : null;
          const myGroupId = myRoundPlayer?.group_id || mainGroupId;
          devLog('User group detection:', { myProfileId, myGroupId, mainGroupId, isMainGroup: myGroupId === mainGroupId });

          // Restore round state
          setRoundState({
            id: activeRound.id,
            status: activeRound.status as 'setup' | 'in_progress' | 'completed',
            date: parseLocalDate(activeRound.date),
            courseId: activeRound.course_id,
            teeColor: activeRound.tee_color as 'blue' | 'white' | 'yellow' | 'red',
            startingHole: (activeRound.starting_hole === 10 ? 10 : 1) as 1 | 10,
            groupId: myGroupId,
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

          const profilesById = new Map<string, { display_name: string; initials: string; avatar_color: string; is_founder: boolean }>();
          if (profileIds.length) {
            const profilesData = await retry<any[]>(() =>
              supabase.from('profiles').select('id, display_name, initials, avatar_color, is_founder').in('id', profileIds) as any
            );

            (profilesData || []).forEach((p: any) => {
              profilesById.set(p.id, {
                display_name: p.display_name,
                initials: p.initials,
                avatar_color: p.avatar_color,
                is_founder: p.is_founder ?? false,
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
            const rawName = isGuest ? ((rp.guest_name || 'Invitado').trim().replace(/\s+/g, ' ')) : (profileData?.display_name || 'Jugador');
            const name = formatPlayerName(rawName);
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
              groupId: rp.group_id || undefined,
              isFounder: profileData?.is_founder ?? false,
              isAdmin: !!rp.is_admin,
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
              putts: { ...defaultBetConfig.putts, ...incoming.putts },
              carritosTeams: incoming.carritosTeams ?? defaultBetConfig.carritosTeams,
              betOverrides: incoming.betOverrides ?? defaultBetConfig.betOverrides,
              bilateralHandicaps: incoming.bilateralHandicaps ?? defaultBetConfig.bilateralHandicaps,
              crossGroupRivals: incoming.crossGroupRivals ?? defaultBetConfig.crossGroupRivals,
              groupBetOverrides: incoming.groupBetOverrides ?? defaultBetConfig.groupBetOverrides,
              disabledTeamBetIds: incoming.disabledTeamBetIds ?? (defaultBetConfig as any).disabledTeamBetIds ?? [],
              sideBets: incoming.sideBets ?? defaultBetConfig.sideBets,
              stableford: incoming.stableford ?? defaultBetConfig.stableford,
              teamPressures: incoming.teamPressures ?? defaultBetConfig.teamPressures,
              zoologico: incoming.zoologico ?? defaultBetConfig.zoologico,
              skinsGrupal: incoming.skinsGrupal ?? defaultBetConfig.skinsGrupal,
              wolfSetup: incoming.wolfSetup ?? (defaultBetConfig as any).wolfSetup,
              sixesBets: incoming.sixesBets ?? (defaultBetConfig as any).sixesBets ?? [],
              vegasBets: incoming.vegasBets ?? (defaultBetConfig as any).vegasBets ?? [],
              ninesBets: incoming.ninesBets ?? (defaultBetConfig as any).ninesBets ?? [],
              parejasExcluded: incoming.parejasExcluded ?? (defaultBetConfig as any).parejasExcluded ?? {},
            };
            setBetConfig(merged);
          }

           // Get course to restore scores
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
                 .select('hole_score_id, marker_type, is_auto_detected, marker_count')
                 .in('hole_score_id', holeScoreIds) as any
             );

             if (holeMarkers?.length) {
               markersByHoleScoreId = new Map();
               const rowsByHoleScoreId = new Map<string, any[]>();
               for (const m of holeMarkers as any[]) {
                 const bucket = rowsByHoleScoreId.get(m.hole_score_id) ?? [];
                 bucket.push(m);
                 rowsByHoleScoreId.set(m.hole_score_id, bucket);
               }
               for (const [holeScoreId, rows] of rowsByHoleScoreId.entries()) {
                 markersByHoleScoreId.set(holeScoreId, restoreMarkerStateFromRows(rows));
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
      } catch (err) {
        devError('Error restoring round:', err);
        // Allow retry on failure
        hasRestoredRef.current = false;
      } finally {
        setIsRestoring(false);
      }
    };

    restoreActiveRound();
  }, [profile, setPlayers, setScores, setConfirmedHoles, setBetConfig, setSelectedCourseId, setTeeColor, setStartingHole, getCourseById, applyMyUsgaHandicapIfAvailable]);

  // ── Realtime: detect when the user is added to a round ──
  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel(`my-round-invites-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'round_players',
          filter: `profile_id=eq.${profile.id}`,
        },
        async (payload) => {
          const newRoundId = (payload.new as any)?.round_id;
          if (!newRoundId) return;

          // Skip if this round is already known
          if (pendingRounds.some(r => r.roundId === newRoundId)) return;
          if (roundState.id === newRoundId) return;

          // Fetch the round info
          const { data: roundRow, error } = await supabase
            .from('rounds')
            .select('id, status, date, course_id, tee_color, starting_hole, organizer_id, golf_courses(name)')
            .eq('id', newRoundId)
            .in('status', ['setup', 'in_progress'])
            .maybeSingle();

          if (error || !roundRow) return;

          const newPending: PendingRoundInfo = {
            roundId: roundRow.id,
            status: roundRow.status as 'setup' | 'in_progress',
            date: parseLocalDate(roundRow.date),
            courseId: roundRow.course_id,
            courseName: (roundRow as any).golf_courses?.name ?? undefined,
            teeColor: roundRow.tee_color as any,
            startingHole: (roundRow.starting_hole === 10 ? 10 : 1) as 1 | 10,
            isOrganizer: (roundRow as any).organizer_id === profile.id,
          };

          setPendingRounds(prev => {
            if (prev.some(r => r.roundId === newRoundId)) return prev;
            return [newPending, ...prev];
          });
          setPendingRound(prev => prev ?? newPending);

          const courseName = newPending.courseName ?? 'una ronda';
          toast.info(`Te han agregado a ${courseName}`, {
            action: {
              label: 'Abrir',
              onClick: () => {
                sessionStorage.setItem('restore_round_id', newRoundId);
                window.location.reload();
              },
            },
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, roundState.id, pendingRounds]);

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
    // Paywall check: can user create rounds?
    const { data: canCreate } = await supabase.rpc('can_create_round_as_organizer');
    if (canCreate === false) {
      window.dispatchEvent(new CustomEvent('greenbook:show-upgrade', {
        detail: { reason: 'create_round' }
      }));
      setIsLoading(false);
      return null;
    }

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
      if (logEvent) {
        logEvent('round_created', { course_id: courseId });
      }


      // Persist the organizer's locally-set handicap from setup.
      // The RPC always creates the organizer with handicap = 0, so we must sync
      // the UI value immediately. Only fall back to USGA if the user hasn't set one.
      const organizerPlayer = players.find(
        p => p.profileId === result.organizer_profile_id || p.id === result.organizer_profile_id
      );
      const localHandicap = organizerPlayer?.handicap ?? 0;

      if (localHandicap !== 0) {
        // User already set a handicap in setup — persist it
        supabase
          .from('round_players')
          .update({ handicap_for_round: localHandicap })
          .eq('id', result.round_player_id)
          .then(({ error }) => {
            if (error) devError('Error persisting organizer handicap:', error);
          });
      } else {
        // No manual handicap set — try USGA auto-apply
        void applyMyUsgaHandicapIfAvailable(result.round_player_id);
      }
      return result.round_id;
    } catch (error) {
      devError('Error creating round:', error);
      toast.error('Error al crear la ronda');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [profile, players, betConfig, applyMyUsgaHandicapIfAvailable]);

  // Start the round (change status to in_progress)
  // Accepts an optional explicit roundId to avoid stale-state issues when
  // createRound and startRound are called in the same event handler.
  const startRound = useCallback(async (explicitRoundId?: string) => {
    const effectiveRoundId = explicitRoundId || roundState.id;
    if (!effectiveRoundId || !course) return false;

    setIsLoading(true);
    try {
      // Update round status
      const { error } = await supabase
        .from('rounds')
        .update({ status: 'in_progress' })
        .eq('id', effectiveRoundId);

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

    // Build a canonical player list for close: main group + additional groups (deduped by id)
    const allPlayersForClose = (() => {
      const merged = [...players, ...playerGroups.flatMap((g) => g.players)];
      const byId = new Map<string, Player>();
      merged.forEach((p) => {
        if (!byId.has(p.id)) byId.set(p.id, p);
      });
      return Array.from(byId.values());
    })();

    // Local lock (prevents double-tap / re-entrancy)
    if (closeInFlightRef.current) {
      const report = newCloseAttemptReport({
        roundId: roundState.id,
        currentRoundStatus: roundState.status,
        userId: profile?.id,
        playersCount: allPlayersForClose.length,
        loggedPlayers: allPlayersForClose.filter((p) => p.profileId && isUuid(p.profileId)).length,
        guestPlayers: allPlayersForClose.filter((p) => !p.profileId || !isUuid(p.profileId)).length,
        invalidProfileIds: allPlayersForClose
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
    const invalidProfileIds = allPlayersForClose
      .filter((p) => p.profileId && !isUuid(p.profileId))
      .map((p) => ({ playerId: p.id, name: p.name, profileId: p.profileId as string }));

    const report: CloseAttemptReport = newCloseAttemptReport({
      roundId: roundState.id,
      currentRoundStatus: roundState.status,
      userId: profile?.id,
      playersCount: allPlayersForClose.length,
      loggedPlayers: allPlayersForClose.filter((p) => p.profileId && isUuid(p.profileId)).length,
      guestPlayers: allPlayersForClose.filter((p) => !p.profileId || !isUuid(p.profileId)).length,
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
      // First: detect and auto-clear zombie backend locks. The backend lock window
      // is 60s, so any attempt older than 90s that never ended is dead.
      try {
        const staleBefore = new Date(Date.now() - 90 * 1000).toISOString();
        const { data: zombieLocks } = await supabase
          .from('round_close_attempts')
          .select('id')
          .eq('round_id', roundState.id)
          .eq('status', 'started')
          .lt('started_at', staleBefore)
          .is('ended_at', null);
        if (zombieLocks && zombieLocks.length > 0) {
          devWarn('Auto-clearing zombie backend locks:', zombieLocks.map(z => z.id));
          // Mark them failed via the RPC (which only the organizer can do)
          for (const zombie of zombieLocks) {
            await supabase.rpc('finish_round_close_attempt', {
              p_attempt_id: zombie.id,
              p_status: 'failed',
              p_error_stage: 'validateInputs',
              p_error_message: 'Auto-cleared zombie lock (>5 min without ending)',
              p_report: null,
            });
          }
        }
      } catch (zombieErr) {
        devWarn('Could not clear zombie locks (non-fatal):', zombieErr);
      }

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
          // Reset local lock so future calls work
          closeInFlightRef.current = false;
          setIsClosing(false);
          return true;
        }

        if (state === 'locked') {
          pushStageFail(report, 'beginAttempt', 'Ya hay un cierre en proceso (lock backend)');
          setLastCloseReport({ ...report });
          toast('Cierre en proceso (backend)');
          // Reset local lock — backend is handling it, don't block future retries
          closeInFlightRef.current = false;
          setIsClosing(false);
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
      const sanitizedPlayers = allPlayersForClose.map((p) => {
        if (!p.profileId) return p;
        if (isUuid(p.profileId)) return p;
        devError('Malformed profileId detected; treating as guest for closeScorecard:', {
          playerId: p.id,
          profileId: p.profileId,
          name: p.name,
        });
        return { ...p, profileId: undefined };
      });

      // ─── CANONICAL NORMALIZATION ───────────────────────────────────────────
      // Canonicalize betOverrides player IDs before persisting and calculating:
      // - Accept local player.id
      // - Accept profileId
      // - Accept round_player_id (legacy / stale entries)
      // Then dedupe by pair+betType (last one wins) so Array.find() order does not
      // accidentally pick stale entries.
      const roundPlayerIdToLocalPlayerId = new Map<string, string>();
      for (const [localPlayerId, roundPlayerId] of roundPlayerIds.entries()) {
        roundPlayerIdToLocalPlayerId.set(roundPlayerId, localPlayerId);
      }

      const resolveOverridePlayerIdForClose = (rawId: string): string | undefined => {
        if (!rawId) return undefined;
        const direct = sanitizedPlayers.find((p) => p.id === rawId);
        if (direct) return direct.id;
        const byProfile = sanitizedPlayers.find((p) => p.profileId === rawId);
        if (byProfile) return byProfile.id;
        return roundPlayerIdToLocalPlayerId.get(rawId);
      };

      const normalizedBetConfig: BetConfig = (() => {
        const sourceOverrides = Array.isArray(betConfig.betOverrides) ? betConfig.betOverrides : [];
        const dedupedByPairAndType = new Map<string, (typeof sourceOverrides)[number]>();

        for (const override of sourceOverrides) {
          const resolvedA = resolveOverridePlayerIdForClose(override.playerAId);
          const resolvedB = resolveOverridePlayerIdForClose(override.playerBId);
          if (!resolvedA || !resolvedB || resolvedA === resolvedB) continue;

          const [leftId, rightId] = resolvedA < resolvedB
            ? [resolvedA, resolvedB]
            : [resolvedB, resolvedA];
          const betTypeKey = String(override.betType ?? '').toLowerCase();
          const dedupeKey = `${leftId}::${rightId}::${betTypeKey}`;

          dedupedByPairAndType.set(dedupeKey, {
            ...override,
            playerAId: resolvedA,
            playerBId: resolvedB,
          });
        }

        return {
          ...betConfig,
          betOverrides: Array.from(dedupedByPairAndType.values()),
        };
      })();

      report.normalizedBets = undefined;
      pushStageOk(report, 'canonicalNormalization');
      // ─── END CANONICAL NORMALIZATION ────────────────────────────────────────

      const activeHoleNumbersForClose: Set<number> = (() => {
        const roundHoles = ((normalizedBetConfig as any).roundHoles === 9 ? 9 : 18) as 9 | 18;
        if (roundHoles === 18) return new Set(Array.from({ length: 18 }, (_, i) => i + 1));
        const [start, end] = getSegmentHoleRanges(roundState.startingHole, 9).front;
        return new Set(Array.from({ length: end - start + 1 }, (_, i) => start + i));
      })();

      // IMPORTANT: Do NOT mark the round as completed until ALL persistence succeeds.
      // Otherwise we can end up with a "completed" round without ledger/snapshot/sliding.
      try {
        const { error: betConfigError } = await supabase
          .from('rounds')
          .update({ bet_config: normalizedBetConfig as any })
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
            confirmed: activeHoleNumbersForClose.has(score.holeNumber),
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
            (s) => activeHoleNumbersForClose.has(s.holeNumber) && s.confirmed && typeof s.strokes === 'number' && Number.isFinite(s.strokes)
          )
        );
      });

      // Bet config was already canonically normalized before persistence.
      // We reuse that exact source of truth for snapshot generation.


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
            return { ...normalizedBetConfig, bilateralHandicaps: bilateralHandicapsForEngine };
          })()
        : normalizedBetConfig;

      // Derive confirmedHoles consistently with the live BetDashboard: a hole is
      // "confirmed" only when every player in the round has a confirmed score on it.
      // Passing {1..18} unconditionally caused close-time bets (e.g. Coneja) to
      // diverge from the live UI by a few dollars on certain bilateral pairs.
      const confirmedHolesForClose: Set<number> = (() => {
        const holeCounts = new Map<number, number>();
        confirmedScoresForClose.forEach((playerScores) => {
          playerScores.forEach((s) => {
            holeCounts.set(s.holeNumber, (holeCounts.get(s.holeNumber) || 0) + 1);
          });
        });
        const totalPlayers = sanitizedPlayers.length;
        const set = new Set<number>();
        holeCounts.forEach((count, hole) => {
          if (count >= totalPlayers) set.add(hole);
        });
        return set;
      })();

      // Intra-group bet calculation: resolve config per group when overrides exist
      let intraGroupBetResults: BetSummary[];
      const hasGroupOverrides = betConfigWithHandicaps.groupBetOverrides && 
        Object.keys(betConfigWithHandicaps.groupBetOverrides).length > 0;
      
      // Detect distinct groups from sanitizedPlayers
      const distinctGroupIds = new Set(sanitizedPlayers.map(p => p.groupId).filter(Boolean) as string[]);
      
      if (hasGroupOverrides && distinctGroupIds.size > 1) {
        // Multiple groups with overrides: calculate per group with resolved config
        intraGroupBetResults = [];
        for (const gId of distinctGroupIds) {
          const groupPlayers = sanitizedPlayers.filter(p => p.groupId === gId);
          if (groupPlayers.length < 2) continue; // Need at least 2 players for intra-group bets
          
          const resolvedConfig = resolveConfigForGroup(betConfigWithHandicaps, gId);
          const groupResults = calculateAllBets(
            groupPlayers,
            confirmedScoresForClose,
            resolvedConfig,
            course,
            roundState.startingHole,
            confirmedHolesForClose
          );
          intraGroupBetResults.push(...groupResults);
        }
      } else {
        // Single group or no overrides: use global config as before
        intraGroupBetResults = calculateAllBets(
          sanitizedPlayers,
          confirmedScoresForClose,
          betConfigWithHandicaps,
          course,
          roundState.startingHole,
          confirmedHolesForClose
        );
      }


      // ─── CROSS-GROUP BET CALCULATION ────────────────────────────────────────
      // The main engine skips cross-group pairs (different groupId). We must compute
      // them separately — mirroring BetDashboard's crossGroupBetSummaries logic —
      // so the snapshot includes cross-group balances and the pre-validation check
      // matches the UI totals.
      const crossGroupSummaries: BetSummary[] = [];
      const crossGroupRivalsMap = betConfigWithHandicaps.crossGroupRivals || {};
      const processedCGPairs = new Set<string>();

      if (getStrokesForPair) {
        Object.entries(crossGroupRivalsMap).forEach(([baseId, rivalIds]) => {
          const ids = Array.isArray(rivalIds) ? rivalIds : [];
          (ids as string[]).forEach((rivalId) => {
            const pairKey = [baseId, rivalId].sort().join('|');
            if (processedCGPairs.has(pairKey)) return;
            processedCGPairs.add(pairKey);

            const playerA = sanitizedPlayers.find(p => p.id === baseId);
            const playerB = sanitizedPlayers.find(p => p.id === rivalId);
            if (!playerA || !playerB) return;
            if (playerA.groupId && playerB.groupId && playerA.groupId === playerB.groupId) return;

            const strokesAGivesB = getStrokesForPair(playerA.id, playerB.id);
            const handicapA = strokesAGivesB < 0 ? Math.abs(strokesAGivesB) : 0;
            const handicapB = strokesAGivesB > 0 ? strokesAGivesB : 0;

            const crossGroupBilateral: import('@/types/golf').BilateralHandicap = {
              playerAId: playerA.id,
              playerBId: playerB.id,
              playerAHandicap: handicapA,
              playerBHandicap: handicapB,
            };

            const tempGroupId = `__xg_${pairKey}`;
            const syntheticA: Player = { ...playerA, groupId: tempGroupId };
            const syntheticB: Player = { ...playerB, groupId: tempGroupId };

            // Filter betOverrides to only those relevant to this pair
            const pairOverrides = (betConfigWithHandicaps.betOverrides || []).filter(o => {
              const ids = [playerA.id, playerB.id];
              return ids.includes(o.playerAId) && ids.includes(o.playerBId);
            });

            // Preserve participantIds on pool bets so cross-group pairs respect
            // exclusions configured by the organizer (e.g. Eduardo not in Medal
            // General). If either player is excluded, the bet engine returns no
            // summaries for that pair, matching the live BetDashboard.
            const crossGroupConfig: BetConfig = {
              ...betConfigWithHandicaps,
              bilateralHandicaps: [crossGroupBilateral],
              betOverrides: pairOverrides,
              groupBetOverrides: {},
              manchas: { ...betConfigWithHandicaps.manchas, enabled: false },
              culebras: { ...betConfigWithHandicaps.culebras, enabled: false },
              pinguinos: { ...betConfigWithHandicaps.pinguinos, enabled: false },
              zoologico: { ...betConfigWithHandicaps.zoologico, enabled: false },
              coneja: { ...betConfigWithHandicaps.coneja, enabled: false },
              oyeses: { ...betConfigWithHandicaps.oyeses, enabled: false },
              rayas: { ...betConfigWithHandicaps.rayas, enabled: false },
              sideBets: { bets: [], enabled: false },
            };


            // Cross-group pair: confirmedHoles = holes where BOTH players confirmed
            const pairConfirmedHoles = (() => {
              const aScores = confirmedScoresForClose.get(playerA.id) || [];
              const bScores = confirmedScoresForClose.get(playerB.id) || [];
              const bSet = new Set(bScores.map(s => s.holeNumber));
              return new Set(aScores.map(s => s.holeNumber).filter(h => bSet.has(h)));
            })();

            const pairSummaries = calculateAllBets(
              [syntheticA, syntheticB],
              confirmedScoresForClose,
              crossGroupConfig,
              course,
              roundState.startingHole,
              pairConfirmedHoles
            );


            pairSummaries.forEach(s => {
              crossGroupSummaries.push({
                ...s,
                playerId: s.playerId === syntheticA.id ? playerA.id : playerB.id,
                vsPlayer: s.vsPlayer === syntheticA.id ? playerA.id : playerB.id,
              });
            });
          });
        });
      }

      // ─── SPRINT 3 BET CALCULATION ────────────────────────────────────────────
      const sprint3Summaries: BetSummary[] = [];

      try {
        const rId = roundState.id!;

        // ── WOLF ──────────────────────────────────────────────────────────────
        const [{ data: wolfCfgRow }, { data: wolfStates }] = await Promise.all([
          supabase.from('wolf_config').select('*').eq('round_id', rId).maybeSingle(),
          supabase.from('wolf_hole_state').select('*').eq('round_id', rId).order('hole_number'),
        ]);
        if (wolfCfgRow && wolfStates && isWolfSettlementActive(normalizedBetConfig)) {
          const wolfSetupForClose = normalizedBetConfig.wolfSetup;
          const wolfConfig: WolfConfig = {
            roundId: wolfCfgRow.round_id,
            amountPerHole: wolfCfgRow.amount_per_hole,
            scoringMode: wolfCfgRow.scoring_mode as WolfConfig['scoringMode'],
            useHandicap: wolfCfgRow.use_handicap,
            timing: wolfCfgRow.timing as WolfConfig['timing'],
            carryover: wolfCfgRow.carryover,
            playerOrder: wolfCfgRow.player_order ?? [],
            participantIds: wolfCfgRow.participant_ids ?? [],
            playerHandicaps: wolfSetupForClose?.playerHandicaps ?? (wolfCfgRow.player_handicaps as any) ?? [],
          };
          const holeStates: WolfHoleState[] = (wolfStates as any[]).map(s => ({
            roundId: s.round_id,
            holeNumber: s.hole_number,
            wolfPlayerId: s.wolf_player_id,
            partnerIds: s.partner_ids ?? [],
            wentSolo: s.went_solo,
            result: s.result ?? null,
            effectiveAmount: s.effective_amount ?? null,
            carryoverHoles: s.carryover_holes ?? 0,
          }));
          const wolfPlayers = wolfConfig.participantIds.length > 0
            ? sanitizedPlayers.filter(p => wolfConfig.participantIds.includes(p.id))
            : sanitizedPlayers;
          sprint3Summaries.push(...calculateWolfBets(wolfPlayers, wolfConfig, holeStates, confirmedScoresForClose, course));
          devLog(`[CLOSE] Wolf: ${sprint3Summaries.filter(s => s.betType === 'Wolf' && s.amount > 0).length} winning entries`);
        }

        // ── SIXES ─────────────────────────────────────────────────────────────
        const [{ data: sixesCfgRow }, { data: sixesSetsRows }] = await Promise.all([
          supabase.from('sixes_config').select('*').eq('round_id', rId).maybeSingle(),
          supabase.from('sixes_sets').select('*').eq('round_id', rId).order('set_number'),
        ]);
        if (
          sixesCfgRow &&
          isSixesSettlementActive(normalizedBetConfig)
        ) {
          const sixesBetInstanceForClose = normalizedBetConfig.sixesBets?.[0];
          const sixesConfig: SixesConfig = {
            roundId: sixesCfgRow.round_id,
            scoringMode: sixesCfgRow.scoring_mode as SixesConfig['scoringMode'],
            cobro: sixesCfgRow.cobro as SixesConfig['cobro'],
            amount: sixesCfgRow.amount,
            useHandicap: sixesCfgRow.use_handicap,
            usePerSetAmounts: sixesCfgRow.use_per_set_amounts ?? false,
            set1Amount: sixesCfgRow.set1_amount ?? undefined,
            set2Amount: sixesCfgRow.set2_amount ?? undefined,
            set3Amount: sixesCfgRow.set3_amount ?? undefined,
            sets: ((sixesSetsRows ?? []) as any[]).map(s => ({
              setNumber: s.set_number as 1 | 2 | 3,
              team1: [s.team1_player1_id, s.team1_player2_id] as [string, string],
              team2: [s.team2_player1_id, s.team2_player2_id] as [string, string],
            })),
            teamHandicaps: sixesBetInstanceForClose?.teamHandicaps,
            handicapConfig: sixesBetInstanceForClose?.handicapConfig,
          };
          sprint3Summaries.push(...calculateSixesBets(sanitizedPlayers, confirmedScoresForClose, sixesConfig, course, sixesBetInstanceForClose?.teamHandicaps));
          devLog(`[CLOSE] Sixes: ${sprint3Summaries.filter(s => s.betType === 'Sixes' && s.amount > 0).length} winning entries`);
        }

        // ── VEGAS ─────────────────────────────────────────────────────────────
        const { data: vegasCfgRow } = await supabase
          .from('vegas_config').select('*').eq('round_id', rId).maybeSingle();
        if (
          vegasCfgRow &&
          isVegasSettlementActive(normalizedBetConfig)
        ) {
          const vegasBetInstanceForClose = normalizedBetConfig.vegasBets?.[0];
          const vegasConfig: VegasConfig = {
            roundId: vegasCfgRow.round_id,
            valuePerPoint: vegasCfgRow.value_per_point,
            useHandicap: vegasCfgRow.use_handicap,
            birdieMultiplier: vegasCfgRow.birdie_multiplier,
            variant: vegasCfgRow.variant as VegasConfig['variant'],
            playerAId: vegasCfgRow.player_a_id ?? '',
            playerBId: vegasCfgRow.player_b_id ?? '',
            playerCId: vegasCfgRow.player_c_id ?? '',
            playerDId: vegasCfgRow.player_d_id ?? '',
            useSegmentAmounts: vegasCfgRow.use_segment_amounts ?? false,
            frontAmount: vegasCfgRow.front_amount ?? undefined,
            backAmount: vegasCfgRow.back_amount ?? undefined,
            set1Amount: vegasCfgRow.set1_amount ?? undefined,
            set2Amount: vegasCfgRow.set2_amount ?? undefined,
            set3Amount: vegasCfgRow.set3_amount ?? undefined,
            teamHandicaps: vegasBetInstanceForClose?.teamHandicaps,
            handicapConfig: vegasBetInstanceForClose?.handicapConfig,
          };
          sprint3Summaries.push(...calculateVegasBets(sanitizedPlayers, confirmedScoresForClose, vegasConfig, course, vegasBetInstanceForClose?.teamHandicaps, roundState.startingHole));
          devLog(`[CLOSE] Vegas: ${sprint3Summaries.filter(s => s.betType === 'Vegas' && s.amount > 0).length} winning entries`);
        }

        // ── NINES ─────────────────────────────────────────────────────────────
        const { data: ninesCfgRow } = await supabase
          .from('nines_config').select('*').eq('round_id', rId).maybeSingle();
        if (ninesCfgRow && (ninesCfgRow.player_ids?.length ?? 0) >= 3) {
          const ninesConfig: NinesConfig = {
            roundId: ninesCfgRow.round_id,
            valuePerPoint: ninesCfgRow.value_per_point,
            playerIds: ninesCfgRow.player_ids,
            playerHandicaps: (ninesCfgRow.player_handicaps as Record<string, number>) ?? undefined,
          };
          sprint3Summaries.push(...calculateNinesBets(sanitizedPlayers, confirmedScoresForClose, ninesConfig, course));
          devLog(`[CLOSE] Nines: ${sprint3Summaries.filter(s => s.betType === 'Nines' && s.amount > 0).length} winning entries`);
        }

      } catch (sprint3Err) {
        devError('[CLOSE] Error fetching Sprint3 bets for snapshot (non-fatal):', sprint3Err);
      }
      // ─── END SPRINT 3 BET CALCULATION ────────────────────────────────────────

      const allBetResults = [...intraGroupBetResults, ...crossGroupSummaries, ...sprint3Summaries];
      devLog(`Close engine: ${intraGroupBetResults.length} intra-group + ${crossGroupSummaries.length} cross-group + ${sprint3Summaries.length} sprint3 = ${allBetResults.length} total bet summaries`);
      // ─── END SYNCHRONOUS BET CALCULATION ────────────────────────────────────

      // ─── SIDE BETS DIAGNOSTIC LOG ───────────────────────────────────────────
      {
        const sideBetsConfig = betConfigWithHandicaps.sideBets;
        const sideBetsInConfig = sideBetsConfig?.bets?.length ?? 0;
        const validSideBetsInConfig = sideBetsConfig?.bets?.filter(b => b.winners?.length > 0 && b.losers?.length > 0 && b.amount > 0 && !b.deleted).length ?? 0;
        const sideBetSummaries = allBetResults.filter(r => r.betType === 'Side Bet');
        const sideBetSummaryCount = sideBetSummaries.length;
        const sideBetTotal = sideBetSummaries.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0);
        devLog('[CLOSE] Side Bets diagnostic', {
          enabled: sideBetsConfig?.enabled ?? false,
          totalInConfig: sideBetsInConfig,
          validInConfig: validSideBetsInConfig,
          summariesGenerated: sideBetSummaryCount,
          totalPositiveAmount: sideBetTotal,
          configBets: sideBetsConfig?.bets?.map(b => ({
            id: b.id,
            winners: b.winners,
            losers: b.losers,
            amount: b.amount,
            description: b.description,
            deleted: b.deleted,
          })) ?? [],
        });
        if (sideBetsConfig?.enabled && validSideBetsInConfig > 0 && sideBetSummaryCount === 0) {
          devWarn('[CLOSE] ⚠️ Side Bets enabled with valid bets but NO summaries generated!');
        }
      }
      // ─── END SIDE BETS DIAGNOSTIC ──────────────────────────────────────────

      // ─── POINT 5: Enriched Logging — Player Summaries ───────────────────────
      report.playerSummaries = sanitizedPlayers.map((p): ClosePlayerSummary => ({
        id: p.id,
        name: p.name,
        isGuest: !p.profileId || !isUuid(p.profileId),
        handicap: p.handicap,
        profileId: p.profileId,
      }));

      // ─── POINT 4: Override ID Validation ────────────────────────────────────
      const validPlayerIds = new Set(sanitizedPlayers.map(p => p.id));
      const overrideSummaries: CloseOverrideSummary[] = [];
      let orphanedOverrides = 0;

      if (betConfigWithHandicaps.betOverrides && betConfigWithHandicaps.betOverrides.length > 0) {
        for (const override of betConfigWithHandicaps.betOverrides) {
          const aValid = validPlayerIds.has(override.playerAId);
          const bValid = validPlayerIds.has(override.playerBId);
          const isValid = aValid && bValid;
          if (!isValid) {
            orphanedOverrides++;
            devWarn(`⚠️ Orphaned betOverride: playerA=${override.playerAId} (${aValid ? 'ok' : 'MISSING'}), playerB=${override.playerBId} (${bValid ? 'ok' : 'MISSING'}), betType=${override.betType}`);
          }
          overrideSummaries.push({
            playerAId: override.playerAId,
            playerBId: override.playerBId,
            betType: override.betType || 'unknown',
            action: override.enabled ? 'enabled' : 'disabled',
            valid: isValid,
            amountOverride: (override as any).amountOverride,
          } as any);
        }
      }
      report.overrideSummaries = overrideSummaries;
      report.orphanedOverrides = orphanedOverrides;
      pushStageOk(report, 'overrideValidation');

      if (orphanedOverrides > 0) {
        devWarn(`⚠️ ${orphanedOverrides} orphaned betOverride(s) detected. They will be ignored by the engine but are logged for auditing.`);
      }
      // ─── END POINT 4 ───────────────────────────────────────────────────────

      // ─── POINT 2: Pre-Persistence Validation ───────────────────────────────
      // Compare UI-provided bet results against engine-recalculated results.
      // If discrepancy > $1, log a warning (but don't block — the engine is authoritative).
      const engineBalanceByPlayer = new Map<string, number>();
      for (const result of allBetResults) {
        if (result.amount > 0) {
          // Winner
          engineBalanceByPlayer.set(result.playerId, (engineBalanceByPlayer.get(result.playerId) || 0) + result.amount);
          // Loser
          engineBalanceByPlayer.set(result.vsPlayer, (engineBalanceByPlayer.get(result.vsPlayer) || 0) - result.amount);
        }
      }

      const validPlayerIdsForValidation = new Set(sanitizedPlayers.map((p) => p.id));
      const resolveUiPlayerIdForValidation = (rawId: string): string | undefined => {
        if (!rawId) return undefined;
        if (validPlayerIdsForValidation.has(rawId)) return rawId;
        const byProfile = sanitizedPlayers.find((p) => p.profileId === rawId);
        if (byProfile) return byProfile.id;
        return roundPlayerIdToLocalPlayerId.get(rawId);
      };

      const isUiSummaryDisabledByOverride = (summary: BetSummary): boolean => {
        const summaryType = summary.betType.toLowerCase();
        return (betConfigWithHandicaps.betOverrides ?? []).some((override) => {
          if (override.enabled !== false) return false;
          const matchesPair =
            (override.playerAId === summary.playerId && override.playerBId === summary.vsPlayer) ||
            (override.playerAId === summary.vsPlayer && override.playerBId === summary.playerId);
          if (!matchesPair) return false;

          const rawOverrideType = String(override.betType ?? '').toLowerCase();
          const overrideType = (() => {
            switch (rawOverrideType) {
              case 'pressures': return 'presiones';
              case 'oyeses': return 'oyes';
              case 'units': return 'unidades';
              case 'pinguinos': return 'pingüinos';
              case 'medalgeneral': return 'medal general';
              case 'zoologico': return 'zoológico';
              default: return rawOverrideType;
            }
          })();

          if (overrideType === 'medal' && (summaryType.includes('medal general') || summaryType.includes('rayas medal'))) return false;
          if (overrideType === 'presiones' && summaryType.includes('presiones parejas')) return false;
          return summaryType.includes(overrideType);
        });
      };

      const shouldKeepUiSummaryForValidation = (summary: BetSummary): boolean => {
        const playerA = sanitizedPlayers.find((p) => p.id === summary.playerId);
        const playerB = sanitizedPlayers.find((p) => p.id === summary.vsPlayer);
        if (!playerA || !playerB) return false;

        const isCrossGroupPair = !!playerA.groupId && !!playerB.groupId && playerA.groupId !== playerB.groupId;
        if (isCrossGroupPair && !isCrossGroupPairInMap(crossGroupRivalsMap, summary.playerId, summary.vsPlayer)) {
          return false;
        }

        return !isUiSummaryDisabledByOverride(summary);
      };

      const resolvedUiBetResults: BetSummary[] = allBetResultsFromUI
        .map((result) => {
          const playerId = resolveUiPlayerIdForValidation(result.playerId);
          const vsPlayer = resolveUiPlayerIdForValidation(result.vsPlayer);
          if (!playerId || !vsPlayer || playerId === vsPlayer) return null;
          return { ...result, playerId, vsPlayer };
        })
        .filter((result): result is BetSummary => result !== null);

      const normalizedUiBetResults = resolvedUiBetResults.filter(shouldKeepUiSummaryForValidation);

      if (normalizedUiBetResults.length !== allBetResultsFromUI.length) {
        devWarn(
          `[CLOSE] Filtered ${allBetResultsFromUI.length - normalizedUiBetResults.length} UI summaries with unresolved/stale IDs, non-rival cross-group pairs, or disabled overrides before preValidation`
        );
      }

      const uiBalanceByPlayer = new Map<string, number>();
      for (const result of normalizedUiBetResults) {
        if (result.amount > 0) {
          uiBalanceByPlayer.set(result.playerId, (uiBalanceByPlayer.get(result.playerId) || 0) + result.amount);
          uiBalanceByPlayer.set(result.vsPlayer, (uiBalanceByPlayer.get(result.vsPlayer) || 0) - result.amount);
        }
      }

      const balanceComparison: CloseBalanceSummary[] = sanitizedPlayers.map((p) => {
        const engineNet = Math.round((engineBalanceByPlayer.get(p.id) || 0) * 100) / 100;
        const uiNet = Math.round((uiBalanceByPlayer.get(p.id) || 0) * 100) / 100;
        return {
          playerId: p.id,
          playerName: p.name,
          engineNet,
          uiNet,
          delta: Math.round((engineNet - uiNet) * 100) / 100,
        };
      });
      report.balanceComparison = balanceComparison;

      const maxDelta = Math.max(...balanceComparison.map(b => Math.abs(b.delta)), 0);
      // Skip blocking validation when the UI provided no summaries at all —
      // this happens when BetDashboard is not mounted (user closes from scoring/scorecard view).
      // In that case UI=$0 for everyone is expected; the engine is authoritative.
      const uiProvidedResults = normalizedUiBetResults.length > 0;
      if (maxDelta > 1 && uiProvidedResults) {
        devWarn(`⚠️ PRE-VALIDATION: UI vs Engine discrepancy detected (max delta: $${maxDelta})`);
        const discrepancies = balanceComparison
          .filter(b => Math.abs(b.delta) > 1)
          .map(b => `${b.playerName}: UI=$${b.uiNet}, Engine=$${b.engineNet}, Δ=$${b.delta}`);
        discrepancies.forEach(d => devWarn(`  → ${d}`));

        // ─── Build per-pair, per-bet-type breakdown ──────────────────────────
        // Group summaries by canonical pair (sorted ids) + betType + segment, summing
        // signed amounts from A's perspective (A is the lexicographically smaller id).
        const aggregateByPairAndType = (summaries: BetSummary[]) => {
          const map = new Map<string, { aId: string; bId: string; betType: string; segment?: string; netAtoB: number }>();
          for (const s of summaries) {
            if (!s.playerId || !s.vsPlayer || s.playerId === s.vsPlayer) continue;
            const [aId, bId] = [s.playerId, s.vsPlayer].sort();
            const seg = (s as any).segment ?? '';
            const key = `${aId}|${bId}|${s.betType}|${seg}`;
            const existing = map.get(key) ?? { aId, bId, betType: s.betType, segment: (s as any).segment, netAtoB: 0 };
            // If summary is from A's perspective (playerId === aId), add as-is; else negate
            const signedAmount = s.playerId === aId ? s.amount : -s.amount;
            existing.netAtoB += signedAmount;
            map.set(key, existing);
          }
          return map;
        };
        const engineMap = aggregateByPairAndType(allBetResults);
        const uiMap = aggregateByPairAndType(normalizedUiBetResults);
        const allKeys = new Set<string>([...engineMap.keys(), ...uiMap.keys()]);
        const nameById = new Map(sanitizedPlayers.map((p) => [p.id, p.name]));
        const breakdown: NonNullable<CloseAttemptReport['discrepancyBreakdown']> = [];
        for (const key of allKeys) {
          const e = engineMap.get(key);
          const u = uiMap.get(key);
          const eAmt = Math.round(((e?.netAtoB ?? 0) / 2) * 100) / 100;
          const uAmt = Math.round(((u?.netAtoB ?? 0) / 2) * 100) / 100;
          // Each pair appears twice in summaries (A→B and B→A), so divide by 2 to get net
          const delta = Math.round((eAmt - uAmt) * 100) / 100;
          if (Math.abs(delta) < 0.5) continue;
          const ref = e ?? u!;
          breakdown.push({
            playerAName: nameById.get(ref.aId) ?? ref.aId,
            playerBName: nameById.get(ref.bId) ?? ref.bId,
            betType: ref.betType,
            segment: ref.segment,
            engineAmount: eAmt,
            uiAmount: uAmt,
            delta,
          });
        }
        breakdown.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
        report.discrepancyBreakdown = breakdown;
        breakdown.slice(0, 20).forEach((d) => {
          devWarn(`  Δ$${d.delta} | ${d.playerAName}↔${d.playerBName} | ${d.betType}${d.segment ? ` (${d.segment})` : ''} | engine=$${d.engineAmount} ui=$${d.uiAmount}`);
        });
        // ─── End breakdown ───────────────────────────────────────────────────

        // BLOCKING GUARDRAIL: Abort closure if discrepancy exceeds $1
        const errorMsg = `Discrepancia UI vs Motor detectada (máx Δ$${maxDelta}):\n${discrepancies.join('\n')}\n\nEl cierre fue bloqueado. Revisa la configuración de participantes en las apuestas.`;
        await fail('preValidation', new Error(errorMsg), report.attemptId);
        toast.error(`Cierre bloqueado: discrepancia de $${maxDelta} entre UI y motor de cálculo. Revisa participantes.`, { duration: 8000 });
        return false;
      } else if (maxDelta > 1 && !uiProvidedResults) {
        devWarn(`[CLOSE] PRE-VALIDATION skipped: UI provided 0 summaries (BetDashboard not mounted). Engine is authoritative. Max delta: $${maxDelta}`);
      }

      // ── Structural guardrail: verify enabled bets produced results ──────────
      // If a bet is enabled+has participants but the engine produced zero summaries,
      // something is wrong (e.g. oneVsAll misconfiguration, guest ID mismatch).
      const engineBetTypes = new Set(allBetResults.map(r => r.betType));
      const structuralWarnings: string[] = [];

      const checkBetPresence = (enabled: boolean | undefined, participantIds: string[] | undefined, label: string, expectedTypes: string[]) => {
        if (!enabled) return;
        // Only warn if there are participants (or participantIds is undefined = everyone)
        const hasParticipants = participantIds === undefined || participantIds.length > 0;
        if (!hasParticipants) return;
        const found = expectedTypes.some(t => engineBetTypes.has(t));
        if (!found) {
          structuralWarnings.push(`${label} está habilitada con participantes pero no generó resultados en el motor`);
        }
      };

      checkBetPresence(betConfigWithHandicaps.medal?.enabled, betConfigWithHandicaps.medal?.participantIds, 'Medal', ['Medal Front 9', 'Medal Back 9', 'Medal Total']);
      checkBetPresence(betConfigWithHandicaps.pressures?.enabled, betConfigWithHandicaps.pressures?.participantIds, 'Presiones', ['Presiones Front', 'Presiones Back', 'Presiones Match 18']);
      checkBetPresence(betConfigWithHandicaps.skins?.enabled, betConfigWithHandicaps.skins?.participantIds, 'Skins', ['Skins Front', 'Skins Back']);
      checkBetPresence(betConfigWithHandicaps.rayas?.enabled, betConfigWithHandicaps.rayas?.participantIds, 'Rayas', ['Rayas Front', 'Rayas Back', 'Rayas Oyes Front', 'Rayas Oyes Back', 'Rayas Medal']);

      if (structuralWarnings.length > 0) {
        structuralWarnings.forEach(w => devWarn(`⚠️ STRUCTURAL: ${w}`));
        devWarn('Engine bet types found:', Array.from(engineBetTypes));
        devWarn('BetConfig rayas:', JSON.stringify({
          enabled: betConfigWithHandicaps.rayas?.enabled,
          oneVsAll: betConfigWithHandicaps.rayas?.oneVsAll,
          anchorPlayerId: betConfigWithHandicaps.rayas?.anchorPlayerId,
          participantIds: betConfigWithHandicaps.rayas?.participantIds,
        }));
      }
      // ── End structural guardrail ───────────────────────────────────────────

      pushStageOk(report, 'preValidation');
      // ─── END POINT 2 ───────────────────────────────────────────────────────

      // Save ledger transactions for bet results (only for registered players)
      const ledgerRecords: any[] = [];
      allBetResults.forEach(result => {
        if (result.amount > 0) {
          // Get players - winner is playerId, loser is vsPlayer
          const winner = sanitizedPlayers.find(p => p.id === result.playerId);
          const loser = sanitizedPlayers.find(p => p.id === result.vsPlayer);
          
          // Only create ledger entries for registered players (with profileId)
          if (winner?.profileId && loser?.profileId && isUuid(winner.profileId) && isUuid(loser.profileId) && winner.profileId !== loser.profileId) {
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

      // Generate and save the round snapshot for historical view.
      // generateRoundSnapshot THROWS if integrity checks fail (symmetry / zero-sum).
      // We catch that separately so the user gets a clear error message and the
      // pipeline is NOT marked as "closed" (partial state is avoided).
      let snapshot: any = null;
      try {
        // ── Build pairSegmentResults: display-ready result text for each pair+segment ─
        // This is computed once at close time so the historic view never recalculates.
        // Currently covers: Presiones (finalDisplay/hasCarry) and Medal (net score strings).
        const pairSegmentResults: import('@/lib/roundSnapshot').SnapshotPairSegmentResults = {};

        if (betConfigWithHandicaps.pressures?.enabled) {
          const bilateralHandicapsArr = betConfigWithHandicaps.bilateralHandicaps ?? [];
          for (let i = 0; i < sanitizedPlayers.length; i++) {
            for (let j = 0; j < sanitizedPlayers.length; j++) {
              if (i === j) continue;
              const pA = sanitizedPlayers[i];
              const pB = sanitizedPlayers[j];
              try {
                const evo = getPressureEvolution(
                  pA, pB,
                  confirmedScoresForClose,
                  course,
                  betConfigWithHandicaps,
                  bilateralHandicapsArr,
                  roundState.startingHole
                );
                const frontKey  = `${pA.id}::${pB.id}::Presiones Front::front`;
                const backKey   = `${pA.id}::${pB.id}::Presiones Back::back`;
                const totalKey  = `${pA.id}::${pB.id}::Presiones Total::total`;
                pairSegmentResults[frontKey] = { resultText: evo.front.finalDisplay, hasCarry: evo.front.hasCarry };
                pairSegmentResults[backKey]  = { resultText: evo.back.finalDisplay,  hasCarry: evo.back.hasCarry };

                const frontLineVal = evo.front.hasCarry ? null : (() => {
                  const m = evo.front.finalDisplay.match(/^([+-]?\d+)/);
                  return m ? parseInt(m[1], 10) : null;
                })();
                const backLineVal = (() => {
                  const m = evo.back.finalDisplay.match(/^([+-]?\d+)/);
                  return m ? parseInt(m[1], 10) : null;
                })();
                let matchTotalText: string;
                if (evo.front.hasCarry) {
                  matchTotalText = 'Carry';
                } else if (frontLineVal !== null && backLineVal !== null) {
                  const total = frontLineVal + backLineVal;
                  matchTotalText = total > 0 ? `+${total}` : total < 0 ? `${total}` : 'Even';
                } else {
                  matchTotalText = '—';
                }
                pairSegmentResults[totalKey] = { resultText: matchTotalText, hasCarry: evo.front.hasCarry };
              } catch (_e) {
                // Non-fatal: if pressure evolution fails for a pair, skip it
              }
            }
          }
        }

        // Medal: save net score strings for each pair+segment ("43 vs 42")
        const getNetForSegment = (playerId: string, start: number, end: number): number => {
          const pScores = confirmedScoresForClose.get(playerId) || [];
          return pScores
            .filter(s => s.holeNumber >= start && s.holeNumber <= end)
            .reduce((sum, s) => sum + (typeof s.netScore === 'number' ? s.netScore : (s.strokes || 0)), 0);
        };

        if (betConfigWithHandicaps.medal?.enabled !== false) {
          for (let i = 0; i < sanitizedPlayers.length; i++) {
            for (let j = 0; j < sanitizedPlayers.length; j++) {
              if (i === j) continue;
              const pA = sanitizedPlayers[i];
              const pB = sanitizedPlayers[j];
              const frontNetA = getNetForSegment(pA.id, 1, 9);
              const frontNetB = getNetForSegment(pB.id, 1, 9);
              const backNetA  = getNetForSegment(pA.id, 10, 18);
              const backNetB  = getNetForSegment(pB.id, 10, 18);
              const totalNetA = getNetForSegment(pA.id, 1, 18);
              const totalNetB = getNetForSegment(pB.id, 1, 18);
              pairSegmentResults[`${pA.id}::${pB.id}::Medal Front 9::front`]  = { resultText: `${frontNetA} vs ${frontNetB}` };
              pairSegmentResults[`${pA.id}::${pB.id}::Medal Back 9::back`]    = { resultText: `${backNetA} vs ${backNetB}` };
              pairSegmentResults[`${pA.id}::${pB.id}::Medal Total::total`]    = { resultText: `${totalNetA} vs ${totalNetB}` };
              // Putts
              const puttsFn = (pid: string, s: number, e: number) =>
                (confirmedScoresForClose.get(pid) || [])
                  .filter(sc => sc.holeNumber >= s && sc.holeNumber <= e && typeof sc.putts === 'number')
                  .reduce((sum, sc) => sum + (sc.putts || 0), 0);
              const pPuttsFront = puttsFn(pA.id, 1, 9);  const rPuttsFront = puttsFn(pB.id, 1, 9);
              const pPuttsBack  = puttsFn(pA.id, 10, 18); const rPuttsBack  = puttsFn(pB.id, 10, 18);
              pairSegmentResults[`${pA.id}::${pB.id}::Putts Front 9::front`] = { resultText: `${pPuttsFront} vs ${rPuttsFront} putts` };
              pairSegmentResults[`${pA.id}::${pB.id}::Putts Back 9::back`]   = { resultText: `${pPuttsBack} vs ${rPuttsBack} putts` };
              pairSegmentResults[`${pA.id}::${pB.id}::Putts Total::total`] = { resultText: `${pPuttsFront + pPuttsBack} vs ${rPuttsFront + rPuttsBack} putts` };
            }
          }
        }
        // ─────────────────────────────────────────────────────────────────────

        // BUG FIX #3: Use confirmedScoresForClose (only confirmed holes) instead of
        // the full `scores` map which may include unconfirmed/partial hole entries.
        // This ensures the snapshot scorecard matches exactly what the bet engine used.
        // NOTE: generateRoundSnapshot now THROWS if integrity checks fail.
        snapshot = generateRoundSnapshot(
          roundState.id,
          course,
          sanitizedPlayers,
          confirmedScoresForClose,
          betConfigWithHandicaps,
          allBetResults,
          roundState.teeColor,
          roundState.startingHole,
          roundState.date.toISOString().split('T')[0],
          bilateralHandicapsMap,
          Object.keys(pairSegmentResults).length > 0 ? pairSegmentResults : undefined
        );
        pushStageOk(report, 'createSnapshot');
      } catch (e) {
        // Integrity failure or snapshot generation error — ABORT, do NOT write DB
        await fail('createSnapshot', e, report.attemptId);
        const errMsg = (e as any)?.message ?? 'Error al generar snapshot';
        const isIntegrityFailure = errMsg.includes('integrity check failed');
        toast.error(
          isIntegrityFailure
            ? `Error de integridad en el snapshot: ${errMsg.split(':')[1]?.trim() ?? errMsg}`
            : 'Error al generar snapshot'
        );
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

      // Update handicap history + recalculate & persist USGA Handicap Index for all registered players
      // Uses caches for course_holes and course_tees to avoid repeated queries across players
      try {
        const { calculateAdjustedGrossScore, calculateDifferential, calculateHandicapIndexFromDifferentials: calcHI } = await import('@/lib/usgaHandicap');
        const { calculateStrokesPerHole: calcSPH } = await import('@/lib/handicapUtils');

        // Caches to avoid re-fetching the same course data for multiple players
        const courseHolesCache = new Map<string, any[]>();
        const courseTeesCache = new Map<string, any>();

        const getCourseHolesCached = async (courseId: string) => {
          if (courseHolesCache.has(courseId)) return courseHolesCache.get(courseId)!;
          const { data } = await supabase.from('course_holes')
            .select('hole_number, par, stroke_index')
            .eq('course_id', courseId).order('hole_number');
          if (data) courseHolesCache.set(courseId, data);
          return data || [];
        };

        const getCourseTeeCached = async (courseId: string, tee: string) => {
          const key = `${courseId}::${tee}`;
          if (courseTeesCache.has(key)) return courseTeesCache.get(key);
          const { data } = await supabase.from('course_tees')
            .select('course_rating, slope_rating')
            .eq('course_id', courseId).eq('tee_color', tee).maybeSingle();
          courseTeesCache.set(key, data);
          return data;
        };

        // Recalculate USGA Handicap Index for each registered player (parallel per player)
        // Also insert handicap_history with traceability data
        //
        // FIX (Apr-2026): Compute the CURRENT round's metrics IN MEMORY (not from DB),
        // because the round status is still 'in_progress' here and would be excluded by
        // the historical query (rounds.status = 'completed'). This guarantees:
        //   - handicap_history persists tee_color, slope_rating, course_rating, gross,
        //     adjusted_gross_score and differential for the round just closed.
        //   - The new Handicap Index includes the round just closed.
        const registeredPlayers = sanitizedPlayers.filter(p => p.profileId && isUuid(p.profileId));

        // Pre-fetch course holes for the CURRENT round (single course)
        const currentCourseId = course?.id;
        const currentCourseHoles = currentCourseId ? await getCourseHolesCached(currentCourseId) : [];

        // Helper: compute current-round trace for one registered player using in-memory state
        const computeCurrentRoundTrace = async (player: typeof sanitizedPlayers[number]) => {
          if (!currentCourseId || !currentCourseHoles || currentCourseHoles.length < 18) return null;
          const playerScores = confirmedScoresForClose.get(player.id) || [];
          if (playerScores.length < 18) return null;

          const tee = (player as any).teeColor || roundState.teeColor || 'white';
          const td = await getCourseTeeCached(currentCourseId, tee);
          const cr = td?.course_rating || 72;
          const sr = td?.slope_rating || 113;

          const holePars = currentCourseHoles.map((h: any) => h.par);
          const holeStrokesArr: (number | null)[] = new Array(18).fill(null);
          for (const s of playerScores) {
            if (s.holeNumber >= 1 && s.holeNumber <= 18) holeStrokesArr[s.holeNumber - 1] = s.strokes;
          }

          const minCourse = {
            id: currentCourseId, name: course?.name || '', location: '',
            holes: currentCourseHoles.map((h: any) => ({ number: h.hole_number, par: h.par, handicapIndex: h.stroke_index })),
          } as any;

          const sph = calcSPH(Number(player.handicap) || 0, minCourse);
          const ags = calculateAdjustedGrossScore(holeStrokesArr, holePars, sph);
          const diff = calculateDifferential(ags, cr, sr);
          const gross = playerScores.reduce((sum, s) => sum + (Number(s.strokes) || 0), 0);

          return { diff, ags, gross, cr, sr, tee };
        };

        await Promise.all(
          registeredPlayers.map(async (player) => {
            try {
              // Compute trace for the round currently being closed (in memory)
              const currentTrace = await computeCurrentRoundTrace(player);

              // Fetch historical completed rounds (current round still in_progress is excluded)
              const { data: rpHistory } = await supabase
                .from('round_players')
                .select(`id, tee_color, handicap_for_round,
                  rounds!inner ( id, date, status, course_id, tee_color, golf_courses!inner ( id, name ) )`)
                .eq('profile_id', player.profileId!)
                .eq('rounds.status', 'completed')
                .order('rounds(date)', { ascending: false })
                .limit(20);

              const diffs: number[] = [];
              if (currentTrace) diffs.push(currentTrace.diff);

              for (const rp of rpHistory || []) {
                const rd = (rp as any).rounds;
                if (rd.id === roundState.id) continue; // safety: avoid double-count
                const crs = rd.golf_courses;
                const tee = (rp as any).tee_color || rd.tee_color || 'white';
                const hcpUsed = Number((rp as any).handicap_for_round) || 0;

                const { data: hs } = await supabase
                  .from('hole_scores')
                  .select('hole_number, strokes, confirmed')
                  .eq('round_player_id', rp.id)
                  .eq('confirmed', true)
                  .not('strokes', 'is', null)
                  .order('hole_number');
                if (!hs || hs.length < 18) continue;

                const ch = await getCourseHolesCached(crs.id);
                if (!ch || ch.length < 18) continue;

                const td = await getCourseTeeCached(crs.id, tee);
                const cr = td?.course_rating || 72;
                const sr = td?.slope_rating || 113;

                const holePars = ch.map(h => h.par);
                const holeStrokesArr: (number | null)[] = new Array(18).fill(null);
                for (const s of hs) {
                  if (s.hole_number >= 1 && s.hole_number <= 18) holeStrokesArr[s.hole_number - 1] = s.strokes;
                }

                const minCourse = {
                  id: crs.id, name: crs.name, location: '',
                  holes: ch.map(h => ({ number: h.hole_number, par: h.par, handicapIndex: h.stroke_index })),
                } as any;

                const sph = calcSPH(hcpUsed, minCourse);
                const ags = calculateAdjustedGrossScore(holeStrokesArr, holePars, sph);
                const diff = calculateDifferential(ags, cr, sr);
                diffs.push(diff);
              }

              const newIndex = calcHI(diffs);

              // Insert handicap_history with traceability data from in-memory current round
              await supabase.from('handicap_history').insert({
                profile_id: player.profileId!,
                handicap: newIndex ?? player.handicap,
                round_id: roundState.id,
                differential: currentTrace?.diff ?? null,
                adjusted_gross_score: currentTrace?.ags ?? null,
                gross_score: currentTrace?.gross ?? null,
                course_rating: currentTrace?.cr ?? null,
                slope_rating: currentTrace?.sr ?? null,
                tee_color: currentTrace?.tee ?? null,
              });

              if (newIndex !== null && Number.isFinite(newIndex) && newIndex >= 0 && newIndex <= 54) {
                await supabase
                  .from('profiles')
                  .update({ current_handicap: newIndex })
                  .eq('id', player.profileId);
                devLog(`[CloseUSGA] ${player.name}: new Handicap Index = ${newIndex}`);
              }
            } catch (usgaErr) {
              devError(`[CloseUSGA] Error recalculating index for ${player.name}:`, usgaErr);
            }
          })
        );
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
            getStrokesForPair,
            roundState.startingHole
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

            // Update sliding_current for each pair (parallel for faster close)
            await Promise.all(
              slidingResults.map(async (result) => {
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
                  devError('Error upserting sliding_current:', {
                    error: slidingCurrError,
                    playerAProfileId: result.playerAProfileId,
                    playerBProfileId: result.playerBProfileId,
                  });
                }
              })
            );

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
      // Retry up to 3 times with backoff to handle stale connections after long USGA recalc.
      try {
        let lastErr: any = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const { error: roundCompleteError } = await supabase
              .from('rounds')
              .update({ status: 'completed' })
              .eq('id', roundState.id);
            if (roundCompleteError) throw roundCompleteError;
            lastErr = null;
            break;
          } catch (retryErr) {
            lastErr = retryErr;
            devWarn(`[setRoundClosed] Attempt ${attempt + 1} failed:`, retryErr);
            if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
        if (lastErr) throw lastErr;
        pushStageOk(report, 'setRoundClosed');
        if (logEvent) {
          logEvent('round_closed', { round_id: roundState.id });
        }

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

      // Set conversion deadline for guest sessions (72h window)
      try {
        const { error: guestErr } = await supabase
          .from('guest_sessions')
          .update({ conversion_deadline: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString() })
          .eq('round_id', roundState.id)
          .is('converted_profile_id', null);
        if (guestErr) devError('Error setting guest conversion deadline:', guestErr);
      } catch (e) {
        devError('Error updating guest sessions on close:', e);
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
            is_admin: !!player.isAdmin,
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

        // Propagate course visibility for manual courses
        if (roundState.courseId && player.profileId) {
          supabase
            .from('golf_courses')
            .select('is_manual')
            .eq('id', roundState.courseId)
            .single()
            .then(({ data: courseData }) => {
              if (courseData?.is_manual) {
                supabase
                  .from('course_visibility')
                  .upsert({
                    course_id: roundState.courseId!,
                    profile_id: player.profileId!,
                    reason: 'round_participant',
                  }, { onConflict: 'course_id,profile_id' })
                  .then(() => {});
              }
            });
        }

        // participantIds are managed exclusively by the organizer through the UI.
        // We do NOT auto-add players to bets — this caused guests to be included
        // in bets they were intentionally excluded from.
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

        // Guard: check if a guest with the same name already exists in this round
        const { data: existingGuest } = await supabase
          .from('round_players')
          .select('id')
          .eq('round_id', roundState.id)
          .is('profile_id', null)
          .eq('guest_name', safeName)
          .eq('group_id', groupId)
          .maybeSingle();

        if (existingGuest) {
          devLog(`Guest "${safeName}" already exists in round, skipping insert. Mapping to ${existingGuest.id}`);
          // Map existing guest instead of creating a duplicate
          const oldId = player.id;
          const newId = existingGuest.id as string;
          if (oldId !== newId) {
            setPlayers((prev) =>
              prev.map((p) =>
                p.id === oldId ? { ...p, id: newId } : p
              )
            );
            setScores((prev) => {
              const next = new Map(prev);
              const oldScores = next.get(oldId);
              if (oldScores) {
                next.delete(oldId);
                next.set(newId, oldScores.map((s) => ({ ...s, playerId: newId })));
              }
              return next;
            });
            setRoundPlayerIds((prev) => {
              const next = new Map(prev);
              next.delete(oldId);
              next.set(newId, newId);
              return next;
            });
          }
          return true;
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

        // 4) Update betConfig references AND canonically add new player to participantIds (Point 1)
        if (setBetConfig) {
          setBetConfig((prev) => {
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

            // Only migrate oldId→newId in participantIds, do NOT auto-add to bets.
            // The organizer manages participation explicitly through the UI.

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
              rayas: { ...safePrev.rayas, participantIds: migrateParticipantIds(safePrev.rayas.participantIds) },
              coneja: { ...safePrev.coneja, participantIds: migrateParticipantIds(safePrev.coneja.participantIds) },
              zoologico: safePrev.zoologico ? { ...safePrev.zoologico, participantIds: migrateParticipantIds(safePrev.zoologico.participantIds) } : safePrev.zoologico,
              stableford: {
                ...safePrev.stableford,
                participantIds: migrateParticipantIds(safePrev.stableford.participantIds),
                playerHandicaps: (safePrev.stableford.playerHandicaps ?? []).map((ph) => ({
                  ...ph,
                  playerId: replaceId(ph.playerId),
                })),
              },
              // Oyeses: intentionally NOT adding to participantIds — respects matrix exclusion
              oyeses: {
                ...safePrev.oyeses,
                playerConfigs: (safePrev.oyeses.playerConfigs ?? []).map((pc) => ({
                  ...pc,
                  playerId: replaceId(pc.playerId),
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
      console.error('[addPlayerToRound] Error inesperado:', err);
      toast.error('Error al agregar jugador. Intenta de nuevo.');
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

  const resetRoundForReclose = useCallback(async () => {
    if (!roundState.id) return false;
    try {
      const { error } = await supabase.rpc('reset_round_for_reclose', {
        p_round_id: roundState.id,
      } as any);
      if (error) throw error;
      setRoundState(prev => ({ ...prev, status: 'in_progress' }));
      toast.success('Ronda reabierta. Puedes cerrarla de nuevo.');
      return true;
    } catch (err: any) {
      devError('[resetRoundForReclose]', err);
      toast.error(`Error al reabrir ronda: ${err.message}`);
      return false;
    }
  }, [roundState.id]);

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
    resetRoundForReclose,
  };
};

