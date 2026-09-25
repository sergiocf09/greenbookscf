import { trs } from '@/i18n/tr';
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { format } from 'date-fns';
import { enUS, es } from 'date-fns/locale';
import i18n from '@/i18n';
import { Calendar, Users, MapPin, Trophy, ChevronDown, ChevronUp, Trash2, Eye, Loader2, Copy, RefreshCw, Lock, ImagePlus, AlertTriangle, BarChart2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { devError } from '@/lib/logger';
import { formatPlayerName } from '@/lib/playerInput';
import { parseLocalDate } from '@/lib/dateUtils';
import { RoundHolesBadge } from '@/components/RoundHolesBadge';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
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

interface RoundHistoryItem {
  id: string;
  roundPlayerId: string | null;
  date: string;
  status: string;
  courseName: string;
  courseLocation: string;
  courseId: string;
  teeColor: string;      // tee actually used by the logged-in player
  roundTeeColor: string; // round default tee (used for cloning)
  totalStrokes: number;
  handicapUsed: number;
  playersCount: number;
  isOrganizer: boolean;
  capturedOnly: boolean; // organizer but not a participant
  roundHoles: 9 | 18;
  isIncomplete?: boolean;
  isCoAdmin?: boolean;
}

interface PlayerScoreData {
  playerId: string;
  playerName: string;
  initials: string;
  color: string;
  handicap: number;
  profileId?: string | null;
  teeColor?: string;
  scores: { holeNumber: number; strokes: number; putts: number; oyesProximity?: number | null }[];
  totalStrokes: number;
}

export interface CloneRoundData {
  courseId: string;
  teeColor: string;
  startingHole: 1 | 10;
  betConfig: any;
  players: {
    profileId: string | null;
    name: string;
    initials: string;
    color: string;
    handicap: number;
    teeColor?: string;
  }[];
}

// Extended interface for full round duplication (including scores)
export interface FullCloneRoundData extends CloneRoundData {
  scores: Record<string, { holeNumber: number; strokes: number; putts: number; oyesProximity?: number | null; oyesProximitySangron?: number | null; markers?: Record<string, boolean> }[]>;
  bilateralHandicaps: { playerAId: string; playerBId: string; strokesGivenByA: number }[];
  sourceRoundId: string;
}

interface RoundHistoryProps {
  onClose?: () => void;
  onViewRound?: (roundData: {
    roundId: string;
    courseId: string;
    players: PlayerScoreData[];
    teeColor: string;
    date: string;
  }) => void;
  onCloneRound?: (roundData: CloneRoundData) => void;
  onCloneFullRound?: (roundData: FullCloneRoundData) => void;
}

export const RoundHistory: React.FC<RoundHistoryProps> = ({ onClose, onViewRound, onCloneRound, onCloneFullRound }) => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { canAccessHistory } = useSubscription();
  const [rounds, setRounds] = useState<RoundHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRound, setExpandedRound] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [roundToDelete, setRoundToDelete] = useState<RoundHistoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loadingScorecard, setLoadingScorecard] = useState<string | null>(null);
  const [loadingClone, setLoadingClone] = useState<string | null>(null);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [roundToReopen, setRoundToReopen] = useState<RoundHistoryItem | null>(null);
  const [reopening, setReopening] = useState(false);

  // El panel de actividad siempre arranca cerrado al abrir el historial:
  // no debe bloquear la lista de rondas al entrar.
  const [showActivity, setShowActivity] = useState<boolean>(false);
  const [selectedFieldPeriod, setSelectedFieldPeriod] = useState<3 | 6 | 12 | null>(null);
  const dateLocale = i18n.language === 'en' ? enUS : es;

  const toggleActivity = () => setShowActivity(prev => !prev);

  const activityData = useMemo(() => {
    // Agrupar por mes YYYY-MM
    const monthMap = new Map<string, {
      label: string;
      rondas: number;
      totalScore: number;
      scoredRounds: number;
      courses: Set<string>;
    }>();

    for (const r of rounds) {
      if (!r.totalStrokes || r.totalStrokes === 0) continue;
      const d = parseLocalDate(r.date);
      const key = format(d, 'yyyy-MM');
      const label = format(d, 'MMM yy', { locale: dateLocale });
      if (!monthMap.has(key)) {
        monthMap.set(key, { label, rondas: 0, totalScore: 0, scoredRounds: 0, courses: new Set() });
      }
      const m = monthMap.get(key)!;
      m.rondas += 1;
      m.courses.add(r.courseId);
      // El promedio usa todas las rondas finalizadas de 18 hoyos que aparecen
      // con score en el historial. `isIncomplete` puede conservarse en rondas
      // cerradas válidas, por lo que no debe excluirlas del promedio mensual.
      const isComparable = r.roundHoles === 18 && r.status === 'completed';
      if (isComparable) {
        m.totalScore += r.totalStrokes;
        m.scoredRounds += 1;
      }
    }

    const sorted = [...monthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12); // máximo últimos 12 meses

    const points = sorted.map(([, v]) => ({
      label: v.label.charAt(0).toUpperCase() + v.label.slice(1),
      rondas: v.rondas,
      promScore: v.scoredRounds > 0 ? Math.round(v.totalScore / v.scoredRounds) : null,
      scoredRounds: v.scoredRounds,
      totalRounds: v.rondas,
      campos: v.courses.size,
    }));

    const totalScoreAll = sorted.reduce((s, [, v]) => s + v.totalScore, 0);
    const totalScoredRounds = sorted.reduce((s, [, v]) => s + v.scoredRounds, 0);
    const globalAvg = totalScoredRounds > 0 ? Math.round(totalScoreAll / totalScoredRounds) : 0;

    // Campos distintos por período
    const now = new Date();
    const cutoff3m  = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    const cutoff6m  = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    const cutoff12m = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const playedRounds = rounds.filter(r => r.totalStrokes > 0);
    const summarizeFields = (cutoff: Date) => {
      const counts = new Map<string, { name: string; count: number }>();
      for (const round of playedRounds) {
        if (parseLocalDate(round.date) < cutoff) continue;
        const current = counts.get(round.courseId);
        counts.set(round.courseId, {
          name: round.courseName,
          count: (current?.count ?? 0) + 1,
        });
      }
      return [...counts.values()].sort((a, b) =>
        b.count - a.count || a.name.localeCompare(b.name, 'es'),
      );
    };

    const fieldsByPeriod = {
      3: summarizeFields(cutoff3m),
      6: summarizeFields(cutoff6m),
      12: summarizeFields(cutoff12m),
    };

    return { points, globalAvg, fieldsByPeriod };
  }, [rounds, dateLocale]);

  const fetchRounds = async () => {
    if (!profile) return;
    
    try {
      // Get all completed rounds for this player
      const { data: roundPlayers, error } = await supabase
        .from('round_players')
        .select(`
          id,
          handicap_for_round,
          round_id,
          is_organizer,
          is_admin,
          tee_color,

          rounds!inner(
            id,
            date,
            status,
            tee_color,
            course_id,
            bet_config,
            starting_hole,
            is_incomplete,
            golf_courses(name, location)
          )
        `)
        .eq('profile_id', profile.id)
        .eq('rounds.status', 'completed')
        .order('rounds(date)', { ascending: false });

      if (error) throw error;

      // ── Batched supplementary data (chunked: PostgREST caps each response) ──
      const rpRows = (roundPlayers || []) as any[];
      const rpIds = rpRows.map(rp => rp.id as string);
      const participantRoundIds = new Set(rpRows.map(rp => rp.round_id as string));

      const chunk = <T,>(arr: T[], size: number): T[][] => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
      };

      const [organizedRes, scoreChunks] = await Promise.all([
        supabase
          .from('rounds')
          .select(`
            id, date, status, tee_color, course_id, bet_config, starting_hole, is_incomplete,
            golf_courses(name, location)
          `)
          .eq('organizer_id', profile.id)
          .eq('status', 'completed')
          .order('date', { ascending: false }),
        Promise.all(
          chunk(rpIds, 40).map(ids =>
            supabase
              .from('hole_scores')
              .select('round_player_id, hole_number, strokes')
              .eq('confirmed', true)
              .in('round_player_id', ids),
          ),
        ),
      ]);

      const organizedRounds = (organizedRes.data || []) as any[];
      const extraRounds = organizedRounds.filter(r => !participantRoundIds.has(r.id));

      const countRoundIds = [...participantRoundIds, ...extraRounds.map(r => r.id as string)];
      const countChunks = await Promise.all(
        chunk(countRoundIds, 40).map(ids =>
          supabase.from('round_players').select('round_id').in('round_id', ids),
        ),
      );
      const countByRound = new Map<string, number>();
      for (const res of countChunks) {
        for (const row of ((res.data || []) as any[])) {
          countByRound.set(row.round_id, (countByRound.get(row.round_id) || 0) + 1);
        }
      }

      const scoresByRp = new Map<string, { hole_number: number; strokes: number | null }[]>();
      for (const res of scoreChunks) {
        for (const s of ((res.data || []) as any[])) {
          const arr = scoresByRp.get(s.round_player_id) || [];
          arr.push({ hole_number: s.hole_number, strokes: s.strokes });
          scoresByRp.set(s.round_player_id, arr);
        }
      }

      const roundItems: RoundHistoryItem[] = rpRows.map((rp) => {
        const round = rp.rounds as any;
        const course = round.golf_courses as any;

        // Filter by active segment for 9H rounds: any back/front data persisted
        // from a prior 18H state must be ignored.
        const roundHoles: 9 | 18 = (round.bet_config as any)?.roundHoles === 9 ? 9 : 18;
        const startingHole: 1 | 10 = round.starting_hole === 10 ? 10 : 1;
        const inActiveSegment = (h: number) => {
          if (roundHoles === 18) return true;
          return startingHole === 10 ? h >= 10 && h <= 18 : h >= 1 && h <= 9;
        };
        const totalStrokes = (scoresByRp.get(rp.id) || []).reduce(
          (sum, s) => (inActiveSegment(s.hole_number) ? sum + (s.strokes || 0) : sum),
          0
        );

        return {
          id: round.id,
          roundPlayerId: rp.id,
          date: round.date,
          status: round.status,
          courseName: course?.name || 'Campo desconocido',
          courseLocation: course?.location || '',
          courseId: round.course_id,
          teeColor: (rp as any).tee_color || round.tee_color,
          roundTeeColor: round.tee_color,
          totalStrokes,
          handicapUsed: Number(rp.handicap_for_round) || 0,
          playersCount: countByRound.get(round.id) || 1,
          isOrganizer: rp.is_organizer,
          capturedOnly: false,
          roundHoles,
          isIncomplete: round.is_incomplete ?? false,
          isCoAdmin: (rp as any).is_admin ?? false,
        };
      });

      // Rounds this user ORGANIZED but did not play (external capturist mode)
      const extras: RoundHistoryItem[] = extraRounds.map((r: any) => {
        const course = r.golf_courses as any;
        const roundHoles: 9 | 18 = (r.bet_config as any)?.roundHoles === 9 ? 9 : 18;
        return {
          id: r.id,
          roundPlayerId: null,
          date: r.date,
          status: r.status,
          courseName: course?.name || 'Campo desconocido',
          courseLocation: course?.location || '',
          courseId: r.course_id,
          teeColor: r.tee_color,
          roundTeeColor: r.tee_color,
          totalStrokes: 0,
          handicapUsed: 0,
          playersCount: countByRound.get(r.id) || 0,
          isOrganizer: true,
          capturedOnly: true,
          roundHoles,
          isIncomplete: r.is_incomplete ?? false,
          isCoAdmin: false,
        };
      });

      const merged = [...roundItems, ...extras].sort(
        (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
      );
      setRounds(merged);
    } catch (err) {
      devError('Error fetching round history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRounds();
  }, [profile]);

  // Enfocar (expandir + scroll) una ronda concreta, p.ej. tras importar una tarjeta
  useEffect(() => {
    if (loading || rounds.length === 0) return;
    const focusId = sessionStorage.getItem('focus_history_round_id');
    if (!focusId) return;
    sessionStorage.removeItem('focus_history_round_id');
    if (!rounds.some(r => r.id === focusId)) return;
    setExpandedRound(focusId);
    setTimeout(() => {
      document
        .getElementById(`history-round-${focusId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 250);
  }, [loading, rounds]);


  const getTeeColorClass = (tee: string) => {
    switch (tee) {
      case 'blue': return 'bg-blue-500';
      case 'white': return 'bg-white border border-gray-300';
      case 'yellow': return 'bg-yellow-400';
      case 'red': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, round: RoundHistoryItem) => {
    e.stopPropagation();
    setRoundToDelete(round);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!roundToDelete) return;

    setDeleting(true);
    try {
      // Use the RPC function that handles all cleanup including player_vs_player balances
      const { error } = await supabase
        .rpc('delete_round_with_financials', { p_round_id: roundToDelete.id });

      if (error) throw error;

      // Remove from local state
      setRounds(prev => prev.filter(r => r.id !== roundToDelete.id));
      toast.success(trs("Ronda eliminada y balances actualizados"));
    } catch (err) {
      devError('Error deleting round:', err);
      toast.error(trs("Error al eliminar la ronda. Solo el organizador puede eliminarla."));
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setRoundToDelete(null);
    }
  };

  const handleViewRound = async (e: React.MouseEvent, round: RoundHistoryItem) => {
    e.stopPropagation();
    
    if (!onViewRound) {
      toast.info(trs("Función de visualización no disponible"));
      return;
    }

    setLoadingScorecard(round.id);
    
    try {
      // Get all players in this round (including guests)
      const { data: roundPlayers, error: rpError } = await supabase
        .from('round_players')
        .select(`
          id,
          profile_id,
          handicap_for_round,
          guest_name,
          guest_initials,
          guest_color,
          tee_color,
          profiles!round_players_profile_id_fkey(display_name, initials, avatar_color)
        `)
        .eq('round_id', round.id);

      if (rpError) throw rpError;

      // Fetch all players' hole scores in PARALLEL (not sequentially)
      const playerScores: PlayerScoreData[] = await Promise.all(
        (roundPlayers || []).map(async (rp) => {
          const profileData = rp.profiles as any;
          const isGuest = !rp.profile_id;
          
          const { data: scores } = await supabase
            .from('hole_scores')
            .select('hole_number, strokes, putts, oyes_proximity')
            .eq('round_player_id', rp.id)
            .order('hole_number');

          const totalStrokes = scores?.reduce((sum, s) => sum + (s.strokes || 0), 0) || 0;
          const rawName = isGuest ? (rp.guest_name || 'Invitado') : (profileData?.display_name || 'Jugador');
          const playerName = formatPlayerName(rawName);
          const initials = isGuest ? (rp.guest_initials || 'IN') : (profileData?.initials || 'XX');
          const color = isGuest ? (rp.guest_color || '#3B82F6') : (profileData?.avatar_color || '#3B82F6');

          return {
            playerId: isGuest ? rp.id : rp.profile_id,
            playerName,
            initials,
            color,
            profileId: rp.profile_id,
            teeColor: (rp as any).tee_color || round.roundTeeColor,
            handicap: Number(rp.handicap_for_round) || 0,
            scores: (scores || []).map(s => ({
              holeNumber: s.hole_number,
              strokes: s.strokes || 0,
              putts: s.putts || 0,
              oyesProximity: s.oyes_proximity,
            })),
            totalStrokes,
          };
        })
      );

      onViewRound({
        roundId: round.id,
        courseId: round.courseId,
        players: playerScores,
        teeColor: round.teeColor,
        date: round.date,
      });
    } catch (err) {
      devError('Error loading scorecard:', err);
      toast.error(trs("Error al cargar la tarjeta"));
    } finally {
      setLoadingScorecard(null);
    }
  };

  const handleCloneRound = async (e: React.MouseEvent, round: RoundHistoryItem) => {
    e.stopPropagation();
    
    if (!onCloneRound) {
      toast.info(trs("Función de duplicación no disponible"));
      return;
    }

    setLoadingClone(round.id);
    
    try {
      // Get round details including bet_config and starting_hole
      const { data: roundData, error: roundError } = await supabase
        .from('rounds')
        .select('bet_config, starting_hole')
        .eq('id', round.id)
        .single();

      if (roundError) throw roundError;

      // Get all players in this round (including guests)
      const { data: roundPlayers, error: rpError } = await supabase
        .from('round_players')
        .select(`
          id,
          profile_id,
          handicap_for_round,
          guest_name,
          guest_initials,
          guest_color,
          profiles!round_players_profile_id_fkey(display_name, initials, avatar_color)
        `)
        .eq('round_id', round.id);

      if (rpError) throw rpError;

      // Build players list for cloning
      const clonePlayers = (roundPlayers || []).map((rp: any) => {
        const profileData = rp.profiles as any;
        const isGuest = !rp.profile_id;
        
        return {
          profileId: rp.profile_id,
          name: formatPlayerName(isGuest 
            ? (rp.guest_name || 'Invitado') 
            : (profileData?.display_name || 'Jugador')),
          initials: isGuest 
            ? (rp.guest_initials || 'IN') 
            : (profileData?.initials || 'XX'),
          color: isGuest 
            ? (rp.guest_color || '#3B82F6') 
            : (profileData?.avatar_color || '#3B82F6'),
          handicap: Number(rp.handicap_for_round) || 0,
        };
      });

      onCloneRound({
        courseId: round.courseId,
        teeColor: round.roundTeeColor,
        startingHole: (roundData?.starting_hole === 10 ? 10 : 1) as 1 | 10,
        betConfig: roundData?.bet_config || {},
        players: clonePlayers,
      });

      toast.success(trs("Datos cargados. Ajusta y guarda la nueva ronda."));
    } catch (err) {
      devError('Error cloning round:', err);
      toast.error(trs("Error al cargar datos de la ronda"));
    } finally {
      setLoadingClone(null);
    }
  };

  // Full clone: copy entire round including scores, handicaps, and markers from snapshot
  const handleCloneFullRound = async (e: React.MouseEvent, round: RoundHistoryItem) => {
    e.stopPropagation();
    
    if (!onCloneFullRound) {
      toast.info(trs("Función de duplicación íntegra no disponible"));
      return;
    }

    setLoadingClone(`full-${round.id}`);
    
    try {
      // Get snapshot for this round
      const { data: snapshotData, error: snapshotError } = await supabase
        .from('round_snapshots')
        .select('snapshot_json')
        .eq('round_id', round.id)
        .single();

      if (snapshotError || !snapshotData) {
        throw new Error('Snapshot no encontrado para esta ronda');
      }

      const snapshot = snapshotData.snapshot_json as any;
      
      // Extract players with their round_player IDs for mapping
      const snapshotPlayers = (snapshot.players || []) as any[];
      const clonePlayers = snapshotPlayers.map((p: any) => ({
        originalId: p.id, // Store original ID for score mapping
        profileId: p.profileId || null,
        name: p.name,
        initials: p.initials,
        color: p.color,
        handicap: p.handicap,
        teeColor: p.teeColor,
      }));

      // Extract scores mapped by original player ID
      const snapshotScores = snapshot.scores || {};
      const scores: Record<string, any[]> = {};
      for (const [playerId, playerScores] of Object.entries(snapshotScores)) {
        scores[playerId] = (playerScores as any[]).map((s: any) => ({
          holeNumber: s.holeNumber,
          strokes: s.strokes,
          putts: s.putts,
          oyesProximity: s.oyesProximity,
          oyesProximitySangron: s.oyesProximitySangron,
          markers: s.markers || {},
        }));
      }

      // Extract bilateral handicaps
      const bilateralHandicaps = (snapshot.bilateralHandicaps || []).map((bh: any) => ({
        playerAId: bh.playerAId,
        playerBId: bh.playerBId,
        strokesGivenByA: bh.strokesGivenByA,
      }));

      onCloneFullRound({
        courseId: round.courseId,
        teeColor: round.roundTeeColor,
        startingHole: (snapshot.startingHole === 10 ? 10 : 1) as 1 | 10,
        betConfig: snapshot.betConfig || {},
        players: clonePlayers,
        scores,
        bilateralHandicaps,
        sourceRoundId: round.id,
      });

      toast.success(trs("Ronda íntegra cargada con todos los scores. Revisa y cierra la tarjeta."));
    } catch (err) {
      devError('Error full cloning round:', err);
      toast.error(trs("Error al cargar ronda íntegra"));
    } finally {
      setLoadingClone(null);
    }
  };

  const handleReopenClick = (e: React.MouseEvent, round: RoundHistoryItem) => {
    e.stopPropagation();
    setRoundToReopen(round);
    setReopenDialogOpen(true);
  };

  const handleReopenConfirm = async () => {
    if (!roundToReopen) return;

    setReopening(true);
    try {
      const { error } = await supabase.rpc('reset_round_for_reclose', { p_round_id: roundToReopen.id });
      if (error) throw error;

      toast.success(trs("Ronda re-abierta correctamente"));
      
      // Auto-load the round after reopening
      sessionStorage.setItem('restore_round_id', roundToReopen.id);
      window.location.reload();
    } catch (err: any) {
      devError('Error reopening round:', err);
      toast.error(`${trs("Error al reabrir ronda:")} ${err.message}`);
    } finally {
      setReopening(false);
      setReopenDialogOpen(false);
      setRoundToReopen(null);
    }
  };

  if (!canAccessHistory) {
    return (
      <div className="text-center py-12 space-y-4">
        <div className="bg-muted rounded-full w-16 h-16 flex items-center justify-center mx-auto">
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold">{trs("Historial bloqueado")}</p>
          <p className="text-sm text-muted-foreground">
            {trs("Has completado tus 4 rondas de acceso gratuito al historial. Suscríbete para ver todas tus rondas anteriores.")}
          </p>
        </div>
        <Button onClick={() => window.dispatchEvent(new CustomEvent('greenbook:show-upgrade', {
          detail: { reason: 'history' }
        }))}>
          {trs("Ver planes")}
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (rounds.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Trophy className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>{trs("No hay rondas completadas")}</p>
        <p className="text-sm">{trs("Completa tu primera ronda para ver el historial")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 w-full max-w-full overflow-hidden">
        {/* Header: botón importar + botón actividad en el mismo renglón */}
        <div className="relative">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => navigate('/import-scorecard')}
            >
              <ImagePlus className="h-4 w-4 mr-2" />
              {trs("Importar Tarjeta")}
            </Button>
            <Button
              variant={showActivity ? 'default' : 'outline'}
              size="sm"
              className="shrink-0 px-3"
              onClick={toggleActivity}
              title={trs("Mi actividad mensual")}
            >
              <BarChart2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Pop-up de actividad mensual: anclado a la parte superior de la pantalla.
              pointerEvents 'auto' es imprescindible: el diálogo contenedor pone
              pointer-events:none en <body> y el portal heredaría ese bloqueo,
              impidiendo tooltips y dejando pasar los toques a la app de atrás. */}
          {showActivity && createPortal(
            <div
              className="fixed inset-0 z-[80]"
              style={{ pointerEvents: 'auto' }}
            >
              {/* Fondo que bloquea la app de atrás; tocarlo solo cierra el pop-up */}
              <div
                className="absolute inset-0 bg-black/50"
                onClick={toggleActivity}
                aria-hidden="true"
              />
              <div className="absolute bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-2 right-2 top-[max(0.5rem,env(safe-area-inset-top))] flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/40">
              {/* Encabezado con crucecita para cerrar */}
              <div className="relative z-10 flex shrink-0 items-center justify-between border-b border-border bg-card px-4 pb-2 pt-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {trs("Mi Actividad · Últimos 12 meses")}
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleActivity(); }}
                  className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title={trs("Cerrar")}
                  aria-label={trs("Cerrar panel de actividad")}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {activityData.points.length < 2 ? (
                <div className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">
                    {trs("Completa rondas en al menos 2 meses diferentes para ver tu actividad")}
                  </p>
                </div>
              ) : (
                <div
                  className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
                  onTouchMove={(event) => event.stopPropagation()}
                >
                  <div className="space-y-5 p-4 pb-8">

                    {/* Gráfica 1: Rondas por mes */}
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">{trs("Rondas por mes")}</p>
                      <ResponsiveContainer width="100%" height={150}>
                        <BarChart data={activityData.points} margin={{ top: 4, right: 8, left: -24, bottom: 0 }} barSize={20}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            tickLine={false}
                            axisLine={false}
                            interval={0}
                          />
                          <YAxis
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            tickLine={false}
                            axisLine={false}
                            allowDecimals={false}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              border: '1px solid #1e293b',
                              borderRadius: '8px',
                              fontSize: '12px',
                              color: '#f8fafc',
                            }}
                            formatter={(v: number) => [`${v} ${trs("ronda")}${v !== 1 ? 's' : ''}`, '']}
                            labelStyle={{ color: '#94a3b8', fontSize: '11px' }}
                            cursor={{ fill: '#1e293b' }}
                          />
                          <Bar dataKey="rondas" fill="#22c55e" radius={[4, 4, 0, 0]} fillOpacity={0.85} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Separador */}
                    <div className="border-t border-border" />

                    {/* Gráfica 2: Score promedio por mes */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-muted-foreground">{trs("Score promedio por mes")}</p>
                        <span className="text-[11px] text-muted-foreground">
                          {trs('Prom. global:')} <span className="font-semibold text-foreground">{activityData.globalAvg}</span>
                        </span>
                      </div>
                      <ResponsiveContainer width="100%" height={150}>
                        <LineChart data={activityData.points} margin={{ top: 6, right: 8, left: -24, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            tickLine={false}
                            axisLine={false}
                            interval={0}
                          />
                          <YAxis
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            tickLine={false}
                            axisLine={false}
                            domain={['auto', 'auto']}
                            reversed={false}
                          />
                          <ReferenceLine
                            y={activityData.globalAvg}
                            stroke="#475569"
                            strokeDasharray="4 2"
                            strokeWidth={1}
                          />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              const point = payload[0]?.payload as {
                                promScore?: number | null;
                                scoredRounds?: number;
                                totalRounds?: number;
                              } | undefined;
                              if (!point || point.promScore === null || point.promScore === undefined) return null;
                              return (
                                <div className="max-w-[220px] rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground shadow-lg">
                                  <p className="text-[11px] text-muted-foreground">{label}</p>
                                  <p className="mt-1 text-sm font-medium text-sky-500">
                                    {trs('Promedio:')} {point.promScore}
                                  </p>
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    {point.scoredRounds ?? 0} {trs('de')} {point.totalRounds ?? 0} {trs('rondas')} · {trs('18 hoyos')}
                                  </p>
                                </div>
                              );
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="promScore"
                            stroke="#38bdf8"
                            strokeWidth={2}
                            connectNulls
                            dot={{ fill: '#38bdf8', r: 3, strokeWidth: 0 }}
                            activeDot={{ r: 5, strokeWidth: 0 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Separador */}
                    <div className="border-t border-border" />

                    {/* Campos distintos por período */}
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">{trs("Campos distintos jugados")}</p>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                           { label: '3 meses', period: 3 as const },
                           { label: '6 meses', period: 6 as const },
                           { label: '12 meses', period: 12 as const },
                        ].map(({ label, period }) => (
                          <Button
                            key={period}
                            type="button"
                            variant="ghost"
                            onClick={() => setSelectedFieldPeriod(current => current === period ? null : period)}
                            aria-expanded={selectedFieldPeriod === period}
                            className={cn(
                              'h-auto min-w-0 flex-col gap-0.5 rounded-lg border px-2 py-2.5 text-center',
                              selectedFieldPeriod === period
                                ? 'border-primary bg-primary/10'
                                : 'border-transparent bg-muted/50',
                            )}
                          >
                            <span className="text-xl font-bold text-primary">
                              {activityData.fieldsByPeriod[period].length}
                            </span>
                             <span className="text-[10px] font-normal text-muted-foreground">{trs(label)}</span>
                            {selectedFieldPeriod === period
                              ? <ChevronUp className="mt-0.5 h-3 w-3" />
                              : <ChevronDown className="mt-0.5 h-3 w-3" />}
                          </Button>
                        ))}
                      </div>
                      {selectedFieldPeriod && (
                        <div className="mt-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
                          <p className="mb-1.5 text-[11px] font-medium text-foreground">
                             {trs('Campos jugados')} · {selectedFieldPeriod} {trs('meses')}
                          </p>
                          {activityData.fieldsByPeriod[selectedFieldPeriod].length > 0 ? (
                            <div className="space-y-1">
                              {activityData.fieldsByPeriod[selectedFieldPeriod].map(field => (
                                <div key={field.name} className="flex items-start justify-between gap-3 text-xs">
                                  <span className="min-w-0 text-foreground">{field.name}</span>
                                  <span className="shrink-0 tabular-nums text-muted-foreground">
                                     ({field.count} {trs(field.count === 1 ? 'vez' : 'veces')})
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">{trs("No hay campos jugados en este período.")}</p>
                          )}
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}
              </div>
            </div>,
            document.body
          )}
        </div>



        <ScrollArea className="h-[400px]">
          <div className="space-y-2 pr-2">
            {rounds.map((round) => (
              <div
                key={round.id}
                id={`history-round-${round.id}`}
                className="bg-card border border-border rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => setExpandedRound(expandedRound === round.id ? null : round.id)}
                  className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-muted/50 transition-colors whitespace-nowrap overflow-hidden"
                >
                  <div className={cn('w-2 h-2 rounded-full flex-shrink-0', getTeeColorClass(round.teeColor))} />
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {format(parseLocalDate(round.date), "d MMM yy", { locale: dateLocale })}
                  </span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">·</span>
                  <span className="text-xs truncate min-w-0" title={round.courseName}>
                    {round.courseName.length > 27 ? `${round.courseName.slice(0, 26)}…` : round.courseName}
                  </span>
                  {round.roundHoles === 9 && (
                    <RoundHolesBadge holes={9} className="flex-shrink-0 ml-1" />
                  )}
                  {round.capturedOnly && !round.isIncomplete && (
                    <span
                      className="flex-shrink-0 ml-1 inline-flex items-center"
                      title={trs("Ronda capturada — no participaste como jugador")}
                      aria-label={trs("Ronda capturada — no participaste")}
                    >
                      <ImagePlus className="h-3 w-3 text-muted-foreground" />
                    </span>
                  )}
                  {round.capturedOnly ? (
                    <span
                      className="ml-auto flex-shrink-0 mr-1 inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border"
                      title={trs("Creaste esta ronda pero no participaste como jugador.")}
                    >
                      {trs("Sin jugar")}
                    </span>
                  ) : round.isIncomplete ? (
                    <span
                      className="ml-auto flex-shrink-0 mr-1 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-700"
                      title={trs("Cerrada automáticamente. Reabre para completar scores y calcular handicap.")}
                    >
                      <AlertTriangle className="h-2.5 w-2.5" />
                      {trs("Incompleta")}
                    </span>
                  ) : (
                    <span className="font-bold text-sm ml-auto flex-shrink-0 mr-1">
                      {round.totalStrokes}
                    </span>
                  )}
                  {expandedRound === round.id ? (
                    <ChevronUp className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  )}
                </button>

                {expandedRound === round.id && (
                  <div className="px-3 pb-2 pt-1 border-t border-border/50 space-y-2 overflow-hidden">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 flex-wrap">
                      <span className="flex items-center gap-1 min-w-0">
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{round.courseLocation}</span>
                      </span>
                      <span className="flex items-center gap-1 flex-shrink-0">
                        <Users className="h-3 w-3" />
                        {round.playersCount} jugador{round.playersCount > 1 ? 'es' : ''}
                      </span>
                    </div>
                    {round.capturedOnly && (
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1 pt-0.5">
                        <ImagePlus className="h-3 w-3" />
                        <span>{trs("Capturada por ti — no participaste como jugador.")}</span>
                      </div>
                    )}
                    {round.isIncomplete && !round.capturedOnly && (
                      <div className="text-[11px] text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 rounded-md p-2 mt-1 space-y-1">
                        <p className="font-medium">{trs("Ronda no cerrada en tiempo")}</p>
                        <p className="text-[10px] text-orange-700/90 dark:text-orange-400/90">
                          {trs("Se cerró automáticamente a las 24h sin snapshots, cálculo de handicap ni liquidación de apuestas. Si el organizador o un co-admin la reabre y completa los scores, podrá cerrarla con el flujo tradicional para generar snapshot, sliding, handicap y ledger.")}
                        </p>
                      </div>
                    )}
                    
                    {/* Action buttons */}
                    <div className="flex flex-col gap-2 pt-1">
                      <div className="flex gap-1.5 flex-nowrap">
                        {round.isOrganizer && (
                          <Button
                            variant="outline"
                            size="icon"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0 h-9 w-9"
                            onClick={(e) => handleDeleteClick(e, round)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        {onCloneRound && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 min-w-0 px-2"
                            onClick={(e) => handleCloneRound(e, round)}
                            disabled={loadingClone === round.id || loadingClone === `full-${round.id}`}
                          >
                            {loadingClone === round.id ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin flex-shrink-0" />
                            ) : (
                              <Copy className="h-4 w-4 mr-1 flex-shrink-0" />
                            )}
                            <span className="truncate">{trs("Duplicar")}</span>
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 min-w-0 px-2 whitespace-nowrap"
                          onClick={(e) => handleViewRound(e, round)}
                          disabled={loadingScorecard === round.id}
                        >
                          {loadingScorecard === round.id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin flex-shrink-0" />
                          ) : (
                            <Eye className="h-4 w-4 mr-1 flex-shrink-0" />
                          )}
                          {trs("Ver Tarjeta")}
                        </Button>
                      </div>
                      {/* Bottom row: Duplicar con scores + Reabrir, centered */}
                      {(round.isOrganizer || round.isCoAdmin) && (
                        <div className="flex justify-center gap-2">
                          {onCloneFullRound && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e) => handleCloneFullRound(e, round)}
                              disabled={loadingClone === `full-${round.id}` || loadingClone === round.id}
                            >
                              {loadingClone === `full-${round.id}` ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Copy className="h-4 w-4 mr-1" />
                              )}
                              {trs("Duplicar con scores")}
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="icon"
                            className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 flex-shrink-0 h-9 w-9"
                            onClick={(e) => handleReopenClick(e, round)}
                            disabled={reopening}
                          >
                            <RefreshCw className={cn("h-4 w-4", reopening && "animate-spin")} />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{trs("¿Eliminar esta ronda?")}</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminarán todos los scores, 
              {trs('transacciones y datos asociados a esta ronda del')} {roundToDelete && format(parseLocalDate(roundToDelete.date), i18n.language === 'en' ? 'MMMM d, yyyy' : "d 'de' MMMM, yyyy", { locale: dateLocale })}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{trs("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {trs("Eliminando...")}
                </>
              ) : (
                'Eliminar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reopen confirmation dialog */}
      <AlertDialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{trs("¿Re-abrir esta ronda?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {trs("Esto eliminará el snapshot, ledger e historial de sliding actuales. Podrás volver a cerrarla con los scores u overrides corregidos.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reopening}>{trs("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReopenConfirm}
              disabled={reopening}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {reopening ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {trs("Re-abriendo...")}
                </>
              ) : (
                'Confirmar re-apertura'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
