import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { parseScorecard, ParsedScorecard, DetectedPlayer, ScorecardInput } from '@/services/scorecardParser';
import { defaultBetConfig } from '@/components/setup/bets/defaultBetConfig';
import { generateRoundSnapshot } from '@/lib/roundSnapshot';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { validatePlayerName, initialsFromPlayerName } from '@/lib/playerInput';
import { GolfCourse, Player, PlayerScore, defaultMarkerState } from '@/types/golf';
import { devError } from '@/lib/logger';

export type ImporterStep = 1 | 2 | 3 | 4;

// UI selector maps to DB tee_color enum.
export type TeeColorDbValue = 'blue' | 'white' | 'yellow' | 'red';

export interface EditablePlayer {
  key: string;               // stable id inside the importer
  nameInCard: string;
  scores: (number | null)[]; // 18
  putts: (number | null)[] | null; // 18 or null
}

export type PlayerMappingKind = 'self' | 'registered' | 'guest';

export interface PlayerMapping {
  kind: PlayerMappingKind;
  profileId?: string | null;      // for 'registered' or 'self'
  displayName?: string;            // for 'registered' / 'self' display
  handicap?: number;               // handicap for round (0 if unknown)
}

export interface SaveProgress {
  stage:
    | 'idle'
    | 'creating_round'
    | 'starting_round'
    | 'adding_players'
    | 'saving_scores'
    | 'closing_round'
    | 'done'
    | 'error';
  message: string;
  percent: number; // 0-100
  error?: string;
  createdRoundId?: string;
}

const TEE_MAP: Record<string, TeeColorDbValue> = {
  blanco: 'white',
  azul: 'blue',
  amarillo: 'yellow',
  rojo: 'red',
};

function mapTeeColor(detected: string | null | undefined): TeeColorDbValue {
  if (!detected) return 'white';
  return TEE_MAP[detected.toLowerCase()] ?? 'white';
}

function toDbDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function fetchCourseForSnapshot(courseId: string): Promise<GolfCourse> {
  const { data: courseRow, error: courseErr } = await supabase
    .from('golf_courses')
    .select('id, name, location, is_manual')
    .eq('id', courseId)
    .single();
  if (courseErr || !courseRow) throw new Error('No se pudo cargar el campo seleccionado');

  const { data: holes, error: holesErr } = await supabase
    .from('course_holes')
    .select('hole_number, par, stroke_index, yards_white, yards_blue, yards_yellow, yards_red')
    .eq('course_id', courseId)
    .order('hole_number');
  if (holesErr || !holes || holes.length < 18) {
    throw new Error('El campo seleccionado no tiene 18 hoyos configurados');
  }

  return {
    id: courseRow.id,
    name: courseRow.name,
    location: courseRow.location ?? '',
    isManual: !!courseRow.is_manual,
    holes: holes.slice(0, 18).map((h: any) => ({
      number: h.hole_number,
      par: h.par,
      handicapIndex: h.stroke_index,
      yardsBlue: h.yards_blue ?? undefined,
      yardsWhite: h.yards_white ?? undefined,
      yardsYellow: h.yards_yellow ?? undefined,
      yardsRed: h.yards_red ?? undefined,
    })),
  };
}

export function useScorecardImporter() {
  const { profile } = useAuth();

  const [step, setStep] = useState<ImporterStep>(1);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedScorecard | null>(null);

  // Step 2 editable state
  const [editablePlayers, setEditablePlayers] = useState<EditablePlayer[]>([]);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseName, setCourseName] = useState<string>('');
  const [teeColor, setTeeColorState] = useState<TeeColorDbValue>('white');
  const [roundDate, setRoundDate] = useState<Date>(new Date());
  // Per-player tee color overrides (missing key = use global teeColor).
  const [playerTeeColors, setPlayerTeeColors] = useState<Record<string, TeeColorDbValue>>({});

  const setTeeColor = useCallback((t: TeeColorDbValue) => {
    setTeeColorState(t);
    setPlayerTeeColors({}); // reapply as new default for everyone
  }, []);

  const setPlayerTeeColor = useCallback((key: string, t: TeeColorDbValue) => {
    setPlayerTeeColors(prev => ({ ...prev, [key]: t }));
  }, []);

  // Step 3 mappings, keyed by EditablePlayer.key
  const [mappings, setMappings] = useState<Record<string, PlayerMapping>>({});

  // Step 4 progress
  const [progress, setProgress] = useState<SaveProgress>({
    stage: 'idle',
    message: '',
    percent: 0,
  });

  // ────────────────────── STEP 1: Upload + analyze ──────────────────────
  const pickImage = useCallback((file: File | null) => {
    setImageFile(file);
    setAnalyzeError(null);
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(file ? URL.createObjectURL(file) : null);
  }, [imagePreviewUrl]);

  const analyze = useCallback(async () => {
    if (!imageFile) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const result = await parseScorecard(imageFile as ScorecardInput);
      setParsed(result);
      // Seed step-2 editable state
      setEditablePlayers(
        result.detectedPlayers.map((p: DetectedPlayer, i) => ({
          key: `p_${i}_${Date.now()}`,
          nameInCard: p.nameInCard,
          scores: p.scores.slice(0, 18).concat(Array(Math.max(0, 18 - p.scores.length)).fill(null)).slice(0, 18),
          putts: p.putts ? p.putts.slice(0, 18).concat(Array(Math.max(0, 18 - p.putts.length)).fill(null)).slice(0, 18) : null,
        }))
      );
      setCourseName(result.detectedCourseName ?? '');
      setTeeColor(mapTeeColor(result.detectedTeeColor));
      if (result.detectedDate && /^\d{4}-\d{2}-\d{2}$/.test(result.detectedDate)) {
        // Parse as local midday to avoid TZ shift
        setRoundDate(new Date(`${result.detectedDate}T12:00:00`));
      } else {
        setRoundDate(new Date());
      }
      setStep(2);
    } catch (e: any) {
      devError('[scorecardImporter] analyze failed', e);
      setAnalyzeError(e?.message || 'No se pudo analizar la tarjeta');
    } finally {
      setAnalyzing(false);
    }
  }, [imageFile]);

  // ────────────────────── STEP 2 helpers ──────────────────────
  const updateScoreCell = useCallback(
    (playerKey: string, holeIdx: number, value: number | null) => {
      setEditablePlayers(prev =>
        prev.map(p => {
          if (p.key !== playerKey) return p;
          const next = [...p.scores];
          next[holeIdx] = value;
          return { ...p, scores: next };
        })
      );
    },
    []
  );

  const updatePuttCell = useCallback(
    (playerKey: string, holeIdx: number, value: number | null) => {
      setEditablePlayers(prev =>
        prev.map(p => {
          if (p.key !== playerKey) return p;
          const puttsArr = p.putts ? [...p.putts] : Array(18).fill(null);
          puttsArr[holeIdx] = value;
          return { ...p, putts: puttsArr as (number | null)[] };
        })
      );
    },
    []
  );

  const updatePlayerName = useCallback((playerKey: string, name: string) => {
    setEditablePlayers(prev =>
      prev.map(p => (p.key === playerKey ? { ...p, nameInCard: name } : p))
    );
  }, []);

  const removePlayer = useCallback((playerKey: string) => {
    setEditablePlayers(prev => prev.filter(p => p.key !== playerKey));
    setMappings(prev => {
      const { [playerKey]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  // ────────────────────── STEP 3 helpers ──────────────────────
  const setMapping = useCallback((playerKey: string, mapping: PlayerMapping) => {
    setMappings(prev => {
      // If setting to 'self', clear any other 'self' assignment (only one self allowed)
      if (mapping.kind === 'self') {
        const next: Record<string, PlayerMapping> = {};
        for (const [k, v] of Object.entries(prev)) {
          next[k] = v.kind === 'self' ? { kind: 'guest' } : v;
        }
        next[playerKey] = mapping;
        return next;
      }
      return { ...prev, [playerKey]: mapping };
    });
  }, []);

  const mappingsValid = (() => {
    if (editablePlayers.length === 0) return false;
    let selfCount = 0;
    for (const p of editablePlayers) {
      const m = mappings[p.key];
      if (!m) return false;
      if (m.kind === 'self') selfCount++;
      if (m.kind === 'registered' && !m.profileId) return false;
    }
    return selfCount === 1;
  })();

  // ────────────────────── STEP 4: Save pipeline ──────────────────────
  const runSave = useCallback(async () => {
    if (!profile) {
      setProgress({ stage: 'error', message: '', percent: 0, error: 'Debes iniciar sesión' });
      return;
    }
    if (!courseId) {
      setProgress({ stage: 'error', message: '', percent: 0, error: 'Selecciona el campo antes de guardar' });
      return;
    }
    if (!mappingsValid) {
      setProgress({ stage: 'error', message: '', percent: 0, error: 'Mapeo de jugadores inválido' });
      return;
    }

    setStep(4);
    try {
      // 1) CREATE ROUND (uses server RPC — creates round + group + organizer round_player)
      setProgress({ stage: 'creating_round', message: 'Creando ronda…', percent: 5 });
      const { data: created, error: createErr } = await supabase.rpc('create_round', {
        p_course_id: courseId,
        p_tee_color: teeColor,
        p_date: toDbDate(roundDate),
        p_bet_config: defaultBetConfig as any,
        p_starting_hole: 1,
      });
      if (createErr) throw new Error(createErr.message);
      const createdRow: any = Array.isArray(created) ? created[0] : created;
      if (!createdRow?.round_id) throw new Error('No se pudo crear la ronda');
      const roundId: string = createdRow.round_id;
      const groupId: string = createdRow.group_id;
      const organizerRoundPlayerId: string = createdRow.round_player_id;
      const organizerProfileId: string = createdRow.organizer_profile_id;

      // Load full course for snapshot
      const course = await fetchCourseForSnapshot(courseId);

      // 2) START ROUND (transition to in_progress)
      setProgress({ stage: 'starting_round', message: 'Iniciando ronda…', percent: 15 });
      const { error: startErr } = await supabase
        .from('rounds')
        .update({ status: 'in_progress' })
        .eq('id', roundId);
      if (startErr) throw new Error(startErr.message);

      // 3) ADD PLAYERS (all non-self mappings)
      setProgress({ stage: 'adding_players', message: 'Agregando jugadores…', percent: 25 });
      // Build list: { editableKey, roundPlayerId, playerObj }
      const playerRoundIds = new Map<string, string>(); // editableKey -> round_players.id
      const playerObjects = new Map<string, Player>();  // editableKey -> Player (for snapshot)
      const teeFor = (key: string): TeeColorDbValue => playerTeeColors[key] ?? teeColor;

      for (const ep of editablePlayers) {
        const m = mappings[ep.key];
        if (!m) throw new Error(`Falta mapeo para ${ep.nameInCard}`);

        if (m.kind === 'self') {
          const selfTee = teeFor(ep.key);
          playerRoundIds.set(ep.key, organizerRoundPlayerId);
          playerObjects.set(ep.key, {
            id: organizerRoundPlayerId,
            name: profile.display_name,
            initials: profile.initials,
            color: profile.avatar_color,
            handicap: m.handicap ?? profile.current_handicap ?? 0,
            profileId: organizerProfileId,
            teeColor: selfTee,
            groupId,
          });
          // Sync organizer handicap + tee
          const selfUpdate: { tee_color: TeeColorDbValue; handicap_for_round?: number } = { tee_color: selfTee };
          if (typeof m.handicap === 'number') selfUpdate.handicap_for_round = m.handicap;
          await supabase
            .from('round_players')
            .update(selfUpdate)
            .eq('id', organizerRoundPlayerId);
        } else if (m.kind === 'registered') {
          if (!m.profileId) throw new Error(`Falta perfil registrado para ${ep.nameInCard}`);
          const { data, error } = await supabase
            .from('round_players')
            .insert({
              round_id: roundId,
              group_id: groupId,
              profile_id: m.profileId,
              handicap_for_round: m.handicap ?? 0,
              is_organizer: false,
              is_admin: false,
              tee_color: teeFor(ep.key),
            })
            .select('id')
            .single();
          if (error) throw new Error(`Error agregando ${ep.nameInCard}: ${error.message}`);
          playerRoundIds.set(ep.key, data.id);
          playerObjects.set(ep.key, {
            id: data.id,
            name: m.displayName || ep.nameInCard,
            initials: initialsFromPlayerName(m.displayName || ep.nameInCard),
            color: '#3B82F6',
            handicap: m.handicap ?? 0,
            profileId: m.profileId,
            teeColor,
            groupId,
          });
        } else {
          // guest
          let safeName: string;
          try {
            safeName = validatePlayerName(ep.nameInCard);
          } catch (e: any) {
            throw new Error(`Nombre de invitado inválido (${ep.nameInCard}): ${e?.message || 'inválido'}`);
          }
          const guestInitials = initialsFromPlayerName(safeName);
          const { data, error } = await supabase
            .from('round_players')
            .insert({
              round_id: roundId,
              group_id: groupId,
              profile_id: null,
              handicap_for_round: m.handicap ?? 0,
              is_organizer: false,
              guest_name: safeName,
              guest_initials: guestInitials,
              guest_color: '#3B82F6',
              tee_color: teeColor,
            })
            .select('id')
            .single();
          if (error) throw new Error(`Error agregando invitado ${safeName}: ${error.message}`);
          playerRoundIds.set(ep.key, data.id);
          playerObjects.set(ep.key, {
            id: data.id,
            name: safeName,
            initials: guestInitials,
            color: '#3B82F6',
            handicap: m.handicap ?? 0,
            teeColor,
            groupId,
          });
        }
      }

      // 4) SAVE SCORES for each player × 18 holes
      setProgress({ stage: 'saving_scores', message: 'Guardando scores…', percent: 45 });

      type HoleScoreInsert = {
        round_player_id: string;
        hole_number: number;
        strokes: number;
        putts: number;
        strokes_received: number;
        net_score: number;
        confirmed: boolean;
      };
      const holeScoresRows: HoleScoreInsert[] = [];
      const scoresMap = new Map<string, PlayerScore[]>();

      for (const ep of editablePlayers) {
        const rpId = playerRoundIds.get(ep.key)!;
        const playerObj = playerObjects.get(ep.key)!;
        const strokesPerHole = calculateStrokesPerHole(playerObj.handicap, course);
        const playerScoreArr: PlayerScore[] = [];

        for (let i = 0; i < 18; i++) {
          const holeNumber = i + 1;
          const par = course.holes[i]?.par ?? 4;
          const rawStrokes = ep.scores[i];
          const strokes = typeof rawStrokes === 'number' && rawStrokes > 0 ? rawStrokes : par;
          const rawPutts = ep.putts?.[i];
          const putts = typeof rawPutts === 'number' && rawPutts >= 0 ? rawPutts : 2;
          const strokesReceived = strokesPerHole[i] ?? 0;
          const netScore = strokes - strokesReceived;

          holeScoresRows.push({
            round_player_id: rpId,
            hole_number: holeNumber,
            strokes,
            putts,
            strokes_received: strokesReceived,
            net_score: netScore,
            confirmed: true,
          });

          playerScoreArr.push({
            playerId: rpId,
            holeNumber,
            strokes,
            putts,
            markers: { ...defaultMarkerState },
            strokesReceived,
            netScore,
            oyesProximity: null,
            oyesProximitySangron: null,
            confirmed: true,
          });
        }
        scoresMap.set(rpId, playerScoreArr);
      }

      // Bulk upsert scores (chunked)
      const chunkSize = 100;
      for (let i = 0; i < holeScoresRows.length; i += chunkSize) {
        const chunk = holeScoresRows.slice(i, i + chunkSize);
        const { error: scoreErr } = await supabase
          .from('hole_scores')
          .upsert(chunk, { onConflict: 'round_player_id,hole_number', ignoreDuplicates: false });
        if (scoreErr) throw new Error(`Error guardando scores: ${scoreErr.message}`);
        setProgress(prev => ({
          ...prev,
          percent: Math.min(75, 45 + Math.round((30 * (i + chunk.length)) / holeScoresRows.length)),
        }));
      }

      // 5) CLOSE ROUND: generate snapshot with empty bets, update status
      setProgress({ stage: 'closing_round', message: 'Cerrando ronda…', percent: 80 });

      const playersForSnapshot: Player[] = editablePlayers.map(ep => playerObjects.get(ep.key)!);

      // Build snapshot (no bets → empty ledger / balances; passes integrity checks)
      const snapshot = generateRoundSnapshot(
        roundId,
        course,
        playersForSnapshot,
        scoresMap,
        defaultBetConfig,
        [], // no bet summaries
        teeColor,
        1,
        toDbDate(roundDate),
        undefined,
        undefined
      );

      const { error: snapErr } = await supabase
        .from('round_snapshots')
        .upsert(
          {
            round_id: roundId,
            snapshot_json: snapshot as any,
            snapshot_version: 1,
            closed_at: new Date().toISOString(),
          },
          { onConflict: 'round_id', ignoreDuplicates: false }
        );
      if (snapErr) throw new Error(`Error guardando snapshot: ${snapErr.message}`);

      // Mark round completed
      const { error: completeErr } = await supabase
        .from('rounds')
        .update({ status: 'completed' })
        .eq('id', roundId);
      if (completeErr) throw new Error(`Error cerrando ronda: ${completeErr.message}`);

      // Best-effort rebuild (idempotent, non-fatal)
      try {
        await supabase.rpc('rebuild_round_financials_from_snapshot', { p_round_id: roundId });
      } catch (e) {
        devError('[scorecardImporter] rebuild_round_financials_from_snapshot failed (non-fatal)', e);
      }

      setProgress({
        stage: 'done',
        message: '¡Ronda importada!',
        percent: 100,
        createdRoundId: roundId,
      });
    } catch (e: any) {
      devError('[scorecardImporter] save failed', e);
      setProgress(prev => ({
        stage: 'error',
        message: prev.message,
        percent: prev.percent,
        error: e?.message || 'Error inesperado al guardar la ronda',
      }));
    }
  }, [
    profile,
    courseId,
    teeColor,
    roundDate,
    editablePlayers,
    mappings,
    mappingsValid,
  ]);

  const reset = useCallback(() => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setStep(1);
    setImageFile(null);
    setImagePreviewUrl(null);
    setAnalyzing(false);
    setAnalyzeError(null);
    setParsed(null);
    setEditablePlayers([]);
    setCourseId(null);
    setCourseName('');
    setTeeColor('white');
    setRoundDate(new Date());
    setMappings({});
    setProgress({ stage: 'idle', message: '', percent: 0 });
  }, [imagePreviewUrl]);

  return {
    // step control
    step, setStep,
    // step 1
    imageFile, imagePreviewUrl, analyzing, analyzeError,
    pickImage, analyze,
    // parsed data
    parsed,
    // step 2 state
    editablePlayers, updateScoreCell, updatePuttCell, updatePlayerName, removePlayer,
    courseId, setCourseId,
    courseName, setCourseName,
    teeColor, setTeeColor,
    roundDate, setRoundDate,
    // step 3
    mappings, setMapping, mappingsValid,
    // step 4
    progress, runSave,
    // control
    reset,
  };
}
