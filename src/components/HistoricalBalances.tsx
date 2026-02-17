/**
 * Historical Balances Component
 * 
 * Displays the accumulated historical balance of bets for the logged-in user:
 * - Total net amount (won or lost)
 * - Ranking of rivals (from most won to most lost)
 * - Detail per rival with rounds shared (from immutable snapshots)
 * 
 * Uses player_vs_player table for rankings and round_snapshots for detailed round info.
 */

import React, { useState, useEffect } from 'react';
import { parseLocalDate } from '@/lib/dateUtils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Trophy, 
  Loader2, 
  ChevronRight,
  ArrowLeft,
  Calendar,
  Minus,
  Target,
  UserCheck,
  UserX
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { devError, devLog } from '@/lib/logger';
import { isValidSnapshot, RoundSnapshot } from '@/lib/roundSnapshot';

interface RivalBalance {
  id: string;
  rivalName: string;
  rivalInitials: string;
  rivalColor: string;
  isGuest: boolean;
  profileId?: string | null;
  netAmount: number; // Positive = user won, Negative = user lost
  roundsPlayed: number;
  lastPlayedAt: string | null;
}

interface SharedRound {
  roundId: string;
  date: string;
  courseName: string;
  netAmount: number;
  userGross?: number;
  rivalGross?: number;
  slidingStrokes?: number; // Positive = user gave strokes, Negative = user received strokes
}

interface HistoricalBalancesProps {
  onViewRound?: (roundId: string) => void;
  onClose?: () => void;
}

export const HistoricalBalances = React.forwardRef<HTMLDivElement, HistoricalBalancesProps>(({ 
  onViewRound,
  onClose 
}, ref) => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rivals, setRivals] = useState<RivalBalance[]>([]);
  const [totalNet, setTotalNet] = useState(0);
  const [totalRounds, setTotalRounds] = useState(0);
  
  // Detail view state
  const [selectedRival, setSelectedRival] = useState<RivalBalance | null>(null);
  const [sharedRounds, setSharedRounds] = useState<SharedRound[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showGuests, setShowGuests] = useState(false);

  // Fetch all PvP records for the current user
  useEffect(() => {
    const fetchBalances = async () => {
      if (!profile) return;
      
      try {
        // Get all player_vs_player records where this user is involved
        const { data, error } = await supabase
          .from('player_vs_player')
          .select('*')
          .or(`player_a_id.eq.${profile.id},player_b_id.eq.${profile.id}`);

        if (error) throw error;

        const balances: RivalBalance[] = [];
        let totalNetAmount = 0;

        for (const record of data || []) {
          const isPlayerA = record.player_a_id === profile.id;
          
          // Determine rival info
          let rivalName: string;
          let rivalInitials: string;
          let rivalColor: string;
          let isGuest: boolean;
          let rivalProfileId: string | null = null;

          if (isPlayerA) {
            // Rival is player B
            isGuest = record.player_b_is_guest;
            rivalProfileId = record.player_b_id;
            
            if (isGuest) {
              rivalName = record.player_b_name || 'Invitado';
              rivalInitials = rivalName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
              rivalColor = '#6B7280'; // Gray for guests
            } else if (rivalProfileId) {
              // Fetch profile info
              const { data: profileData } = await supabase
                .from('profiles')
                .select('display_name, initials, avatar_color')
                .eq('id', rivalProfileId)
                .maybeSingle();
              
              rivalName = profileData?.display_name || 'Jugador';
              rivalInitials = profileData?.initials || 'XX';
              rivalColor = profileData?.avatar_color || '#3B82F6';
            } else {
              rivalName = 'Desconocido';
              rivalInitials = '??';
              rivalColor = '#6B7280';
            }
          } else {
            // Rival is player A
            isGuest = record.player_a_is_guest;
            rivalProfileId = record.player_a_id;
            
            if (isGuest) {
              rivalName = record.player_a_name || 'Invitado';
              rivalInitials = rivalName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
              rivalColor = '#6B7280';
            } else if (rivalProfileId) {
              const { data: profileData } = await supabase
                .from('profiles')
                .select('display_name, initials, avatar_color')
                .eq('id', rivalProfileId)
                .maybeSingle();
              
              rivalName = profileData?.display_name || 'Jugador';
              rivalInitials = profileData?.initials || 'XX';
              rivalColor = profileData?.avatar_color || '#3B82F6';
            } else {
              rivalName = 'Desconocido';
              rivalInitials = '??';
              rivalColor = '#6B7280';
            }
          }

          // Calculate net amount for this user
          const netAmount = isPlayerA 
            ? (record.total_won_by_a - record.total_won_by_b)
            : (record.total_won_by_b - record.total_won_by_a);

          totalNetAmount += netAmount;

          balances.push({
            id: record.id,
            rivalName,
            rivalInitials,
            rivalColor,
            isGuest,
            profileId: rivalProfileId,
            netAmount,
            roundsPlayed: record.rounds_played,
            lastPlayedAt: record.last_played_at,
          });
        }

        // Sort by net amount (most won first, then most lost)
        balances.sort((a, b) => b.netAmount - a.netAmount);

        // Count actual completed rounds (with snapshots) where this user participated
        const [userRoundsResult, snapshotRoundsResult] = await Promise.all([
          supabase.from('round_players').select('round_id').eq('profile_id', profile.id),
          supabase.from('round_snapshots').select('round_id'),
        ]);
        
        const userRoundSet = new Set((userRoundsResult.data || []).map(r => r.round_id));
        const snapshotSet = new Set((snapshotRoundsResult.data || []).map(s => s.round_id));
        let completedCount = 0;
        for (const rid of userRoundSet) {
          if (snapshotSet.has(rid)) completedCount++;
        }

        setRivals(balances);
        setTotalNet(totalNetAmount);
        setTotalRounds(completedCount);
      } catch (err) {
        devError('Error fetching historical balances:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBalances();
  }, [profile]);

  // Fetch shared rounds with a specific rival - reading from snapshots for accurate data
  const fetchRivalDetail = async (rival: RivalBalance) => {
    if (!profile) return;
    
    setLoadingDetail(true);
    setSelectedRival(rival);
    
    try {
      // Get round IDs from both ledger transactions AND snapshots
      // (some pre-migration rounds only have guest balances in snapshots, no ledger entries)
      const [ledgerResult, snapshotsListResult] = await Promise.all([
        supabase
          .from('ledger_transactions')
          .select('round_id')
          .or(`from_profile_id.eq.${profile.id},to_profile_id.eq.${profile.id}`),
        supabase
          .from('round_snapshots')
          .select('round_id')
      ]);

      if (ledgerResult.error) throw ledgerResult.error;

      // Combine round IDs from both sources
      const ledgerRoundIds = (ledgerResult.data || []).map(t => t.round_id);
      const snapshotRoundIds = (snapshotsListResult.data || []).map(s => s.round_id);
      const roundIds = [...new Set([...ledgerRoundIds, ...snapshotRoundIds])];
      
      if (roundIds.length === 0) {
        setSharedRounds([]);
        setLoadingDetail(false);
        return;
      }

      // Fetch snapshots and round_handicaps in parallel
      const [snapshotsResult, handicapsResult] = await Promise.all([
        supabase
          .from('round_snapshots')
          .select('round_id, snapshot_json')
          .in('round_id', roundIds),
        supabase
          .from('round_handicaps')
          .select(`
            round_id, 
            strokes_given_by_a,
            player_a:round_players!round_handicaps_player_a_id_fkey(profile_id),
            player_b:round_players!round_handicaps_player_b_id_fkey(profile_id)
          `)
          .in('round_id', roundIds)
      ]);

      if (snapshotsResult.error) throw snapshotsResult.error;

      // Build a map of round_id -> handicaps with profile_ids for quick lookup
      const handicapsByRound = new Map<string, { profileAId: string | null; profileBId: string | null; strokes: number }[]>();
      for (const h of handicapsResult.data || []) {
        if (!handicapsByRound.has(h.round_id)) {
          handicapsByRound.set(h.round_id, []);
        }
        const profileA = (h.player_a as any)?.profile_id || null;
        const profileB = (h.player_b as any)?.profile_id || null;
        handicapsByRound.get(h.round_id)!.push({
          profileAId: profileA,
          profileBId: profileB,
          strokes: h.strokes_given_by_a,
        });
      }

      const sharedRoundsList: SharedRound[] = [];

      for (const snapshotRow of snapshotsResult.data || []) {
        const snap = snapshotRow.snapshot_json as unknown;
        if (!isValidSnapshot(snap)) continue;

        // Find user and rival in this snapshot
        const userId = profile.id;
        const rivalId = rival.profileId;
        
        // For guests, match by name
        const userPlayer = snap.players.find((p: any) => p.profileId === userId);
        const rivalPlayer = rival.isGuest
          ? snap.players.find((p: any) => p.isGuest && p.name === rival.rivalName)
          : snap.players.find((p: any) => p.profileId === rivalId);

        if (!userPlayer || !rivalPlayer) continue;

        // Get balance from snapshot
        const userBalance = snap.balances.find((b: any) => b.playerId === userPlayer.id);
        const vsRivalBalance = userBalance?.vsBalances.find(
          (vb: any) => vb.rivalId === rivalPlayer.id
        );

        if (!vsRivalBalance) continue;

        // Calculate gross scores
        const userScores = snap.scores[userPlayer.id] || [];
        const rivalScores = snap.scores[rivalPlayer.id] || [];
        const userGross = userScores.reduce((sum: number, s: any) => sum + (s.strokes || 0), 0);
        const rivalGross = rivalScores.reduce((sum: number, s: any) => sum + (s.strokes || 0), 0);

        // Get sliding from bilateral handicaps in snapshot first
        let slidingStrokes: number | undefined = undefined;
        
        if (snap.bilateralHandicaps) {
          const handicap = snap.bilateralHandicaps.find(
            (h: any) => 
              (h.playerAId === userPlayer.id && h.playerBId === rivalPlayer.id) ||
              (h.playerAId === rivalPlayer.id && h.playerBId === userPlayer.id)
          );
          if (handicap) {
            slidingStrokes = handicap.playerAId === userPlayer.id 
              ? handicap.strokesGivenByA 
              : -handicap.strokesGivenByA;
          }
        }

        // Fallback to vsBalance sliding
        if (slidingStrokes === undefined && vsRivalBalance.slidingStrokes !== undefined) {
          slidingStrokes = vsRivalBalance.slidingStrokes;
        }

        // Fallback to round_handicaps table if not in snapshot
        // Use profileId for matching since that's what we fetched
        if (slidingStrokes === undefined) {
          const roundHandicaps = handicapsByRound.get(snap.roundId) || [];
          const userProfileId = userPlayer.profileId;
          const rivalProfileId = rivalPlayer.profileId;
          
          const handicapRecord = roundHandicaps.find(
            h => (h.profileAId === userProfileId && h.profileBId === rivalProfileId) ||
                 (h.profileAId === rivalProfileId && h.profileBId === userProfileId)
          );
          if (handicapRecord) {
            slidingStrokes = handicapRecord.profileAId === userProfileId
              ? handicapRecord.strokes
              : -handicapRecord.strokes;
          }
        }

        sharedRoundsList.push({
          roundId: snap.roundId,
          date: snap.date,
          courseName: snap.courseName,
          netAmount: vsRivalBalance.netAmount,
          userGross,
          rivalGross,
          slidingStrokes,
        });
      }

      // Sort by date descending
      sharedRoundsList.sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime());
      
      setSharedRounds(sharedRoundsList);
    } catch (err) {
      devError('Error fetching rival detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Detail view for a specific rival
  if (selectedRival) {
    return (
      <div className="space-y-4">
        {/* Back button */}
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setSelectedRival(null)}
          className="mb-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Volver
        </Button>

        {/* Rival header */}
        <div className="flex items-center justify-between p-4 bg-card border border-border rounded-lg">
          <div className="flex items-center gap-3">
            <PlayerAvatar 
              initials={selectedRival.rivalInitials} 
              background={selectedRival.rivalColor}
              size="lg"
            />
            <div>
              <p className="font-semibold">{selectedRival.rivalName}</p>
              <p className="text-xs text-muted-foreground">
                {selectedRival.roundsPlayed} ronda{selectedRival.roundsPlayed !== 1 ? 's' : ''} compartida{selectedRival.roundsPlayed !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className={cn(
            'text-2xl font-bold flex items-center gap-1',
            selectedRival.netAmount > 0 ? 'text-green-600 dark:text-green-500' : 
            selectedRival.netAmount < 0 ? 'text-destructive' : 'text-muted-foreground'
          )}>
            {selectedRival.netAmount > 0 && <TrendingUp className="h-5 w-5" />}
            {selectedRival.netAmount < 0 && <TrendingDown className="h-5 w-5" />}
            {selectedRival.netAmount === 0 && <Minus className="h-5 w-5" />}
            ${Math.abs(selectedRival.netAmount)}
          </div>
        </div>

        {/* Shared rounds list */}
        <ScrollArea className="h-[350px]">
          {loadingDetail ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sharedRounds.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No hay rondas detalladas disponibles</p>
              <p className="text-xs mt-1">Las rondas sin snapshot no mostrarán detalles</p>
            </div>
          ) : (
            <div className="space-y-2 pr-4">
              {sharedRounds.map((round) => {
                const hasScores = round.userGross !== undefined && round.rivalGross !== undefined;
                const slidingDisplay = round.slidingStrokes !== undefined 
                  ? (round.slidingStrokes > 0 
                      ? `+${round.slidingStrokes} (doy)` 
                      : round.slidingStrokes < 0 
                        ? `${round.slidingStrokes} (recibo)` 
                        : '0')
                  : null;

                return (
                  <button
                    key={round.roundId}
                    onClick={() => onViewRound?.(round.roundId)}
                    className="w-full p-3 bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    {/* Header row: date and course */}
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-medium text-sm">{round.courseName}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseLocalDate(round.date), "d MMM yyyy", { locale: es })}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </div>

                    {/* Detail row: Scores, Sliding, Money */}
                    <div className="flex items-center justify-between text-xs border-t border-border/50 pt-2 mt-1">
                      {/* Scores */}
                      <div className="flex items-center gap-3">
                        {hasScores ? (
                          <>
                            <div className="flex items-center gap-1">
                              <Target className="h-3 w-3 text-primary" />
                              <span className="font-medium">Yo: {round.userGross}</span>
                            </div>
                            <span className="text-muted-foreground">vs</span>
                            <span className="font-medium">{round.rivalGross}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground italic">Sin datos</span>
                        )}
                      </div>

                      {/* Sliding */}
                      {slidingDisplay && (
                        <span className="text-muted-foreground px-2 py-0.5 bg-muted rounded text-[10px]">
                          {slidingDisplay}
                        </span>
                      )}

                      {/* Money */}
                      <span className={cn(
                        'font-bold text-sm',
                        round.netAmount > 0 ? 'text-green-600 dark:text-green-500' : 
                        round.netAmount < 0 ? 'text-destructive' : 'text-muted-foreground'
                      )}>
                        {round.netAmount >= 0 ? '+' : ''}${round.netAmount}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    );
  }

  // Main summary view
  if (rivals.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No hay historial de apuestas</p>
        <p className="text-sm">Completa rondas con apuestas para ver tu historial</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Balance Total</span>
          </div>
          <div className={cn(
            'text-2xl font-bold flex items-center gap-1',
            totalNet > 0 ? 'text-green-600 dark:text-green-500' : totalNet < 0 ? 'text-destructive' : 'text-muted-foreground'
          )}>
            {totalNet > 0 && <TrendingUp className="h-5 w-5" />}
            {totalNet < 0 && <TrendingDown className="h-5 w-5" />}
            {totalNet > 0 ? '+' : ''}${totalNet}
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            {rivals.length} rival{rivals.length !== 1 ? 'es' : ''}
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {totalRounds} ronda{totalRounds !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Rivals ranking */}
      <div className="space-y-1">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-medium text-muted-foreground">Ranking por Rival</h3>
          {rivals.some(r => r.isGuest) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowGuests(!showGuests)}
              className="h-7 text-xs gap-1 text-muted-foreground"
            >
              {showGuests ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
              {showGuests ? 'Ocultar invitados' : 'Ver invitados'}
            </Button>
          )}
        </div>
        <ScrollArea className="h-[280px]">
          <div className="space-y-2 pr-4">
            {rivals.filter(r => showGuests || !r.isGuest).map((rival, index) => (
              <button
                key={rival.id}
                onClick={() => fetchRivalDetail(rival)}
                className="w-full p-3 bg-card border border-border rounded-lg flex items-center justify-between hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-5 text-right">
                    {index + 1}
                  </span>
                  <PlayerAvatar 
                    initials={rival.rivalInitials} 
                    background={rival.rivalColor}
                    size="sm"
                  />
                  <div className="text-left">
                    <p className="font-medium text-sm">{rival.rivalName}</p>
                    <p className="text-xs text-muted-foreground">
                      {rival.roundsPlayed} ronda{rival.roundsPlayed !== 1 ? 's' : ''}
                      {rival.isGuest && ' • Invitado'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'font-semibold',
                    rival.netAmount > 0 ? 'text-green-600 dark:text-green-500' : 
                    rival.netAmount < 0 ? 'text-destructive' : 'text-muted-foreground'
                  )}>
                    {rival.netAmount >= 0 ? '+' : ''}${rival.netAmount}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
});

HistoricalBalances.displayName = 'HistoricalBalances';
