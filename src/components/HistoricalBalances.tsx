/**
 * Historical Balances Component
 * 
 * Displays the accumulated historical balance of bets for the logged-in user:
 * - Total net amount (won or lost)
 * - Ranking of rivals (from most won to most lost)
 * - Detail per rival with rounds shared
 * 
 * Uses player_vs_player table which includes both registered players and guests.
 */

import React, { useState, useEffect } from 'react';
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
  Minus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { devError, devLog } from '@/lib/logger';

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
        const roundIds = new Set<string>();

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
          
          if (record.last_round_id) {
            roundIds.add(record.last_round_id);
          }

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
        
        setRivals(balances);
        setTotalNet(totalNetAmount);
        setTotalRounds(roundIds.size);
      } catch (err) {
        devError('Error fetching historical balances:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBalances();
  }, [profile]);

  // Fetch shared rounds with a specific rival
  const fetchRivalDetail = async (rival: RivalBalance) => {
    if (!profile) return;
    
    setLoadingDetail(true);
    setSelectedRival(rival);
    
    try {
      // Get ledger transactions between this user and the rival
      const { data: transactions, error } = await supabase
        .from('ledger_transactions')
        .select(`
          round_id,
          amount,
          from_profile_id,
          to_profile_id,
          rounds(date, golf_courses(name))
        `)
        .or(`from_profile_id.eq.${profile.id},to_profile_id.eq.${profile.id}`)
        .or(
          rival.profileId 
            ? `from_profile_id.eq.${rival.profileId},to_profile_id.eq.${rival.profileId}`
            : ''
        );

      if (error) throw error;

      // Group by round and calculate net
      const roundMap = new Map<string, SharedRound>();
      
      for (const tx of transactions || []) {
        const round = tx.rounds as any;
        if (!round) continue;
        
        const roundId = tx.round_id;
        
        // Check if this transaction involves both the user and the rival
        const involvesUser = tx.from_profile_id === profile.id || tx.to_profile_id === profile.id;
        const involvesRival = rival.profileId && 
          (tx.from_profile_id === rival.profileId || tx.to_profile_id === rival.profileId);
        
        if (!involvesUser || !involvesRival) continue;

        if (!roundMap.has(roundId)) {
          roundMap.set(roundId, {
            roundId,
            date: round.date,
            courseName: round.golf_courses?.name || 'Campo desconocido',
            netAmount: 0,
          });
        }

        const entry = roundMap.get(roundId)!;
        
        // Calculate net for this user
        if (tx.to_profile_id === profile.id) {
          entry.netAmount += tx.amount;
        } else if (tx.from_profile_id === profile.id) {
          entry.netAmount -= tx.amount;
        }
      }

      const rounds = Array.from(roundMap.values());
      rounds.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      setSharedRounds(rounds);
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
            selectedRival.netAmount > 0 ? 'text-green-600' : 
            selectedRival.netAmount < 0 ? 'text-red-500' : 'text-muted-foreground'
          )}>
            {selectedRival.netAmount > 0 && <TrendingUp className="h-5 w-5" />}
            {selectedRival.netAmount < 0 && <TrendingDown className="h-5 w-5" />}
            {selectedRival.netAmount === 0 && <Minus className="h-5 w-5" />}
            ${Math.abs(selectedRival.netAmount)}
          </div>
        </div>

        {/* Shared rounds list */}
        <ScrollArea className="h-[300px]">
          {loadingDetail ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sharedRounds.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No hay rondas detalladas disponibles</p>
            </div>
          ) : (
            <div className="space-y-2 pr-4">
              {sharedRounds.map((round) => (
                <button
                  key={round.roundId}
                  onClick={() => onViewRound?.(round.roundId)}
                  className="w-full p-3 bg-card border border-border rounded-lg flex items-center justify-between hover:bg-muted/50 transition-colors"
                >
                  <div className="text-left">
                    <p className="font-medium text-sm">{round.courseName}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(round.date), "d MMM yyyy", { locale: es })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'font-semibold',
                      round.netAmount > 0 ? 'text-green-600' : 
                      round.netAmount < 0 ? 'text-red-500' : 'text-muted-foreground'
                    )}>
                      {round.netAmount >= 0 ? '+' : ''}${round.netAmount}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
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
            totalNet > 0 ? 'text-green-600' : totalNet < 0 ? 'text-red-500' : 'text-muted-foreground'
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
        <h3 className="text-sm font-medium text-muted-foreground px-1">Ranking por Rival</h3>
        <ScrollArea className="h-[280px]">
          <div className="space-y-2 pr-4">
            {rivals.map((rival, index) => (
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
                    rival.netAmount > 0 ? 'text-green-600' : 
                    rival.netAmount < 0 ? 'text-red-500' : 'text-muted-foreground'
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
