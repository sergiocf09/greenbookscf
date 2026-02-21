import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, Users, MapPin, Trophy, ChevronDown, ChevronUp, Trash2, Eye, Loader2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { devError } from '@/lib/logger';
import { parseLocalDate } from '@/lib/dateUtils';
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
  roundPlayerId: string;
  date: string;
  status: string;
  courseName: string;
  courseLocation: string;
  courseId: string;
  teeColor: string;
  totalStrokes: number;
  handicapUsed: number;
  playersCount: number;
  isOrganizer: boolean;
}

interface PlayerScoreData {
  playerId: string;
  playerName: string;
  initials: string;
  color: string;
  handicap: number;
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
  const { profile } = useAuth();
  const [rounds, setRounds] = useState<RoundHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRound, setExpandedRound] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [roundToDelete, setRoundToDelete] = useState<RoundHistoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loadingScorecard, setLoadingScorecard] = useState<string | null>(null);
  const [loadingClone, setLoadingClone] = useState<string | null>(null);

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
          rounds!inner(
            id,
            date,
            status,
            tee_color,
            course_id,
            golf_courses(name, location)
          )
        `)
        .eq('profile_id', profile.id)
        .eq('rounds.status', 'completed')
        .order('rounds(date)', { ascending: false });

      if (error) throw error;

      // Fetch all supplementary data in PARALLEL (not sequentially)
      const roundItems: RoundHistoryItem[] = await Promise.all(
        (roundPlayers || []).map(async (rp) => {
          const round = rp.rounds as any;
          const course = round.golf_courses as any;

          // Fetch strokes + player count in parallel
          const [scoresResult, countResult] = await Promise.all([
            supabase.from('hole_scores').select('strokes').eq('round_player_id', rp.id),
            supabase.from('round_players').select('id', { count: 'exact', head: true }).eq('round_id', rp.round_id),
          ]);

          const totalStrokes = scoresResult.data?.reduce((sum, s) => sum + (s.strokes || 0), 0) || 0;

          return {
            id: round.id,
            roundPlayerId: rp.id,
            date: round.date,
            status: round.status,
            courseName: course?.name || 'Campo desconocido',
            courseLocation: course?.location || '',
            courseId: round.course_id,
            teeColor: round.tee_color,
            totalStrokes,
            handicapUsed: Number(rp.handicap_for_round) || 0,
            playersCount: countResult.count || 1,
            isOrganizer: rp.is_organizer,
          };
        })
      );

      setRounds(roundItems);
    } catch (err) {
      devError('Error fetching round history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRounds();
  }, [profile]);

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
      toast.success('Ronda eliminada y balances actualizados');
    } catch (err) {
      devError('Error deleting round:', err);
      toast.error('Error al eliminar la ronda. Solo el organizador puede eliminarla.');
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setRoundToDelete(null);
    }
  };

  const handleViewRound = async (e: React.MouseEvent, round: RoundHistoryItem) => {
    e.stopPropagation();
    
    if (!onViewRound) {
      toast.info('Función de visualización no disponible');
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
          profiles(display_name, initials, avatar_color)
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
          const playerName = isGuest ? (rp.guest_name || 'Invitado') : (profileData?.display_name || 'Jugador');
          const initials = isGuest ? (rp.guest_initials || 'IN') : (profileData?.initials || 'XX');
          const color = isGuest ? (rp.guest_color || '#3B82F6') : (profileData?.avatar_color || '#3B82F6');

          return {
            playerId: isGuest ? rp.id : rp.profile_id,
            playerName,
            initials,
            color,
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
      toast.error('Error al cargar la tarjeta');
    } finally {
      setLoadingScorecard(null);
    }
  };

  const handleCloneRound = async (e: React.MouseEvent, round: RoundHistoryItem) => {
    e.stopPropagation();
    
    if (!onCloneRound) {
      toast.info('Función de duplicación no disponible');
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
          profiles(display_name, initials, avatar_color)
        `)
        .eq('round_id', round.id);

      if (rpError) throw rpError;

      // Build players list for cloning
      const clonePlayers = (roundPlayers || []).map((rp: any) => {
        const profileData = rp.profiles as any;
        const isGuest = !rp.profile_id;
        
        return {
          profileId: rp.profile_id,
          name: isGuest 
            ? (rp.guest_name || 'Invitado') 
            : (profileData?.display_name || 'Jugador'),
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
        teeColor: round.teeColor,
        startingHole: (roundData?.starting_hole === 10 ? 10 : 1) as 1 | 10,
        betConfig: roundData?.bet_config || {},
        players: clonePlayers,
      });

      toast.success('Datos cargados. Ajusta y guarda la nueva ronda.');
    } catch (err) {
      devError('Error cloning round:', err);
      toast.error('Error al cargar datos de la ronda');
    } finally {
      setLoadingClone(null);
    }
  };

  // Full clone: copy entire round including scores, handicaps, and markers from snapshot
  const handleCloneFullRound = async (e: React.MouseEvent, round: RoundHistoryItem) => {
    e.stopPropagation();
    
    if (!onCloneFullRound) {
      toast.info('Función de duplicación íntegra no disponible');
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
        teeColor: round.teeColor,
        startingHole: (snapshot.startingHole === 10 ? 10 : 1) as 1 | 10,
        betConfig: snapshot.betConfig || {},
        players: clonePlayers,
        scores,
        bilateralHandicaps,
        sourceRoundId: round.id,
      });

      toast.success('Ronda íntegra cargada con todos los scores. Revisa y cierra la tarjeta.');
    } catch (err) {
      devError('Error full cloning round:', err);
      toast.error('Error al cargar ronda íntegra');
    } finally {
      setLoadingClone(null);
    }
  };

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
        <p>No hay rondas completadas</p>
        <p className="text-sm">Completa tu primera ronda para ver el historial</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <ScrollArea className="h-[400px]">
          <div className="space-y-2 pr-2">
            {rounds.map((round) => (
              <div
                key={round.id}
                className="bg-card border border-border rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => setExpandedRound(expandedRound === round.id ? null : round.id)}
                  className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-muted/50 transition-colors whitespace-nowrap overflow-hidden"
                >
                  <div className={cn('w-2 h-2 rounded-full flex-shrink-0', getTeeColorClass(round.teeColor))} />
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {format(parseLocalDate(round.date), "d MMM yy", { locale: es })}
                  </span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">·</span>
                  <span className="text-xs truncate min-w-0">{round.courseName}</span>
                  <span className="font-bold text-sm ml-auto flex-shrink-0 mr-1">{round.totalStrokes}</span>
                  {expandedRound === round.id ? (
                    <ChevronUp className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  )}
                </button>

                {expandedRound === round.id && (
                  <div className="px-3 pb-2 pt-1 border-t border-border/50 space-y-2">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {round.courseLocation}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {round.playersCount} jugador{round.playersCount > 1 ? 'es' : ''}
                      </span>
                    </div>
                    
                    {/* Action buttons */}
                    <div className="flex flex-col gap-2 pt-1">
                      <div className="flex gap-2">
                        {round.isOrganizer && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                            onClick={(e) => handleDeleteClick(e, round)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        {onCloneRound && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={(e) => handleCloneRound(e, round)}
                            disabled={loadingClone === round.id || loadingClone === `full-${round.id}`}
                          >
                            {loadingClone === round.id ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Copy className="h-4 w-4 mr-1" />
                            )}
                            Duplicar
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={(e) => handleViewRound(e, round)}
                          disabled={loadingScorecard === round.id}
                        >
                          {loadingScorecard === round.id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Eye className="h-4 w-4 mr-1" />
                          )}
                          Ver Tarjeta
                        </Button>
                      </div>
                      {/* Full clone button - only for organizers, centered */}
                      {round.isOrganizer && onCloneFullRound && (
                        <div className="flex justify-center">
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
                            Duplicar con scores
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
            <AlertDialogTitle>¿Eliminar esta ronda?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminarán todos los scores, 
              transacciones y datos asociados a esta ronda del {roundToDelete && format(parseLocalDate(roundToDelete.date), "d 'de' MMMM, yyyy", { locale: es })}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                'Eliminar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
