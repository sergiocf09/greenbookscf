/**
 * Historical Balances Component
 * 
 * Displays the accumulated historical balance of bets for the logged-in user.
 * 
 * CRITICAL: Historical totals are read from round_snapshots.balances, the same
 * immutable source used by the historical detail view. It does NOT rely on
 * recalculated ledger entries, vsBalances from live tables, or player_vs_player.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { fmtMoney } from '@/lib/formatMoney';
import { parseLocalDate } from '@/lib/dateUtils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
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
  UserCheck,
  UserX,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { devError, devLog } from '@/lib/logger';
import { usePreAppBalances } from '@/hooks/usePreAppBalances';
import { PreAppBalanceSheet } from '@/components/balances/PreAppBalanceSheet';
import { History } from 'lucide-react';
import { isValidSnapshot, RoundSnapshot } from '@/lib/roundSnapshot';
import { formatPlayerName } from '@/lib/playerInput';

interface RivalBalance {
  id: string;
  rivalName: string;
  rivalInitials: string;
  rivalColor: string;
  isGuest: boolean;
  profileId?: string | null;
  netAmount: number;
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
  slidingStrokes?: number;
}

interface HistoricalBalancesProps {
  onViewRound?: (roundId: string) => void;
  onClose?: () => void;
}

interface MyRoundRow {
  roundId: string;
  date: string;
  courseName: string;
  score: number;
  netAmount: number;
}

interface SlidingEntry {
  rivalProfileId: string;
  rivalName: string;
  rivalInitials: string;
  rivalColor: string;
  strokes: number;
  lastRoundDate: string | null;
}

type SlidingSortKey = 'name' | 'strokes_desc' | 'strokes_asc';

const getSnapshotVsBalance = (
  snap: RoundSnapshot,
  playerId: string,
  rivalId: string
): number => {
  const playerBalance = snap.balances.find((b: any) => b.playerId === playerId);
  const vsBalance = playerBalance?.vsBalances.find((vb: any) => vb.rivalId === rivalId);
  return Number(vsBalance?.netAmount) || 0;
};

const getSnapshotTotalBalance = (snap: RoundSnapshot, playerId: string): number => {
  const playerBalance = snap.balances.find((b: any) => b.playerId === playerId);
  return Number(playerBalance?.totalNet) || 0;
};

export const HistoricalBalances = React.forwardRef<HTMLDivElement, HistoricalBalancesProps>(({ 
  onViewRound,
  onClose 
}, ref) => {
  const { profile } = useAuth();
  const { canAccessHistory } = useSubscription();
  const [loading, setLoading] = useState(true);
  const [rivals, setRivals] = useState<RivalBalance[]>([]);
  const [totalNet, setTotalNet] = useState(0);
  const [totalRounds, setTotalRounds] = useState(0);
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'rivals' | 'rounds' | 'sliding'>('rivals');

  // Sliding tab state
  const [slidingEntries, setSlidingEntries] = useState<SlidingEntry[]>([]);
  const [loadingSliding, setLoadingSliding] = useState(false);
  const [slidingSort, setSlidingSort] = useState<SlidingSortKey>('name');

  // Detail view state
  const [selectedRival, setSelectedRival] = useState<RivalBalance | null>(null);
  const [sharedRounds, setSharedRounds] = useState<SharedRound[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showGuests, setShowGuests] = useState(false);
  const [sortField, setSortField] = useState<'amount' | 'name'>('amount');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Cache all snapshots to reuse in detail view
  const [allSnapshots, setAllSnapshots] = useState<RoundSnapshot[]>([]);

  const { summaryByRival, addEntry: addPreApp, deleteEntry: deletePreApp } = usePreAppBalances();
  const preAppMap = summaryByRival();
  const [preAppSheet, setPreAppSheet] = useState<{
    rivalKey: string;
    rivalName: string;
    rivalProfileId: string | null;
  } | null>(null);
  // Global persisted toggle: include Pre-GB in totals across all rivals.
  const [includePreApp, setIncludePreApp] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('gb:includePreApp');
      return v === null ? true : v === '1';
    } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('gb:includePreApp', includePreApp ? '1' : '0'); } catch {}
  }, [includePreApp]);


  // Fetch ALL snapshots and compute balances from ledger + overrides
  useEffect(() => {
    const fetchBalances = async () => {
      if (!profile) return;
      
      try {
        // SINGLE SOURCE OF TRUTH GUARDRAIL:
        // Only load snapshots whose round still exists with status='completed'.
        // This ensures balances reflect exactly the same set of rounds shown in RoundHistory.
        // If a round is deleted (delete_round_with_financials removes both round + snapshot),
        // it will never appear here. This join acts as a safety net for any inconsistency.
        const { data: snapshotsData, error } = await supabase
          .from('round_snapshots')
          .select('round_id, snapshot_json, rounds!inner(status)')
          .eq('rounds.status', 'completed');

        if (error) throw error;

        const snapshots: RoundSnapshot[] = [];
        // rivalKey -> { netAmount, roundsPlayed, lastDate, rivalInfo }
        const rivalMap = new Map<string, {
          netAmount: number;
          roundsPlayed: number;
          lastDate: string | null;
          rivalName: string;
          rivalProfileId: string | null;
          isGuest: boolean;
        }>();

        let completedCount = 0;

        for (const row of snapshotsData || []) {
          const snap = row.snapshot_json as unknown;
          if (!isValidSnapshot(snap)) continue;

          snapshots.push(snap);

          // Find this user in the snapshot
          const userPlayer = snap.players.find((p: any) => p.profileId === profile.id);
          if (!userPlayer) continue;

          completedCount++;

          // Read net vs each other player from immutable snapshot balances.
          for (const rival of snap.players) {
            if (rival.id === userPlayer.id) continue;

            const net = getSnapshotVsBalance(snap, userPlayer.id, rival.id);

            // Build a stable key for this rival across rounds.
            // Guests use roundId+name to avoid merging different guests with the same name.
            // Guests accumulate by normalized name (case-insensitive, trimmed)
            const rivalKey = rival.profileId
              ? `profile:${rival.profileId}`
              : `guest:${rival.name.trim().toLowerCase()}`;

            const existing = rivalMap.get(rivalKey);
            if (existing) {
              existing.netAmount += net;
              existing.roundsPlayed += 1;
              if (!existing.lastDate || snap.date > existing.lastDate) {
                existing.lastDate = snap.date;
              }
            } else {
              rivalMap.set(rivalKey, {
                netAmount: net,
                roundsPlayed: 1,
                lastDate: snap.date,
                rivalName: rival.name,
                rivalProfileId: rival.profileId || null,
                isGuest: rival.isGuest,
              });
            }
          }
        }

        setAllSnapshots(snapshots);

        // Resolve profile display info for registered rivals
        const profileIds = [...rivalMap.entries()]
          .filter(([_, v]) => v.rivalProfileId)
          .map(([_, v]) => v.rivalProfileId!);

        let profilesMap = new Map<string, { display_name: string; initials: string; avatar_color: string }>();
        if (profileIds.length > 0) {
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, display_name, initials, avatar_color')
            .in('id', profileIds);
          for (const p of profilesData || []) {
            profilesMap.set(p.id, p);
          }
        }

        const balances: RivalBalance[] = [];
        let totalNetAmount = 0;

        for (const [key, data] of rivalMap) {
          let rivalName = data.rivalName;
          let rivalInitials: string;
          let rivalColor: string;

          if (data.rivalProfileId && profilesMap.has(data.rivalProfileId)) {
            const pInfo = profilesMap.get(data.rivalProfileId)!;
            rivalName = pInfo.display_name;
            rivalInitials = pInfo.initials;
            rivalColor = pInfo.avatar_color;
          } else if (data.isGuest) {
            rivalInitials = rivalName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
            rivalColor = '#6B7280';
          } else {
            rivalInitials = rivalName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
            rivalColor = '#3B82F6';
          }

          totalNetAmount += data.netAmount;

          balances.push({
            id: key,
            rivalName: formatPlayerName(rivalName),
            rivalInitials,
            rivalColor,
            isGuest: data.isGuest,
            profileId: data.rivalProfileId,
            netAmount: data.netAmount,
            roundsPlayed: data.roundsPlayed,
            lastPlayedAt: data.lastDate,
          });
        }

        balances.sort((a, b) => b.netAmount - a.netAmount);

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


  // Fetch shared rounds with a specific rival - computed from cached snapshots
  const fetchRivalDetail = async (rival: RivalBalance) => {
    if (!profile) return;
    
    setLoadingDetail(true);
    setSelectedRival(rival);
    
    try {
      // Also fetch round_handicaps for sliding display
      const roundIds = allSnapshots.map(s => s.roundId);
      const { data: handicapsData } = roundIds.length > 0
        ? await supabase
            .from('round_handicaps')
            .select(`
              round_id, 
              strokes_given_by_a,
              player_a:round_players!round_handicaps_player_a_id_fkey(profile_id),
              player_b:round_players!round_handicaps_player_b_id_fkey(profile_id)
            `)
            .in('round_id', roundIds)
        : { data: [] };

      const handicapsByRound = new Map<string, { profileAId: string | null; profileBId: string | null; strokes: number }[]>();
      for (const h of handicapsData || []) {
        if (!handicapsByRound.has(h.round_id)) handicapsByRound.set(h.round_id, []);
        handicapsByRound.get(h.round_id)!.push({
          profileAId: (h.player_a as any)?.profile_id || null,
          profileBId: (h.player_b as any)?.profile_id || null,
          strokes: h.strokes_given_by_a,
        });
      }

      const sharedRoundsList: SharedRound[] = [];

      for (const snap of allSnapshots) {
        const userPlayer = snap.players.find((p: any) => p.profileId === profile.id);
        if (!userPlayer) continue;

        const rivalPlayer = rival.isGuest
          ? snap.players.find((p: any) => p.isGuest && p.name?.trim().toLowerCase() === rival.rivalName?.trim().toLowerCase())
          : snap.players.find((p: any) => p.profileId === rival.profileId);

        if (!rivalPlayer) continue;

        const netAmount = getSnapshotVsBalance(snap, userPlayer.id, rivalPlayer.id);

        // Gross scores
        const userScores = snap.scores[userPlayer.id] || [];
        const rivalScores = snap.scores[rivalPlayer.id] || [];
        const userGross = userScores.reduce((sum: number, s: any) => sum + (s.strokes || 0), 0);
        const rivalGross = rivalScores.reduce((sum: number, s: any) => sum + (s.strokes || 0), 0);

        // Sliding strokes
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

        if (slidingStrokes === undefined) {
          const userBalance = snap.balances.find((b: any) => b.playerId === userPlayer.id);
          const vsRivalBalance = userBalance?.vsBalances.find((vb: any) => vb.rivalId === rivalPlayer.id);
          if (vsRivalBalance?.slidingStrokes !== undefined) {
            slidingStrokes = vsRivalBalance.slidingStrokes;
          }
        }

        if (slidingStrokes === undefined) {
          const roundHandicaps = handicapsByRound.get(snap.roundId) || [];
          const handicapRecord = roundHandicaps.find(
            h => (h.profileAId === userPlayer.profileId && h.profileBId === rivalPlayer.profileId) ||
                 (h.profileAId === rivalPlayer.profileId && h.profileBId === userPlayer.profileId)
          );
          if (handicapRecord) {
            slidingStrokes = handicapRecord.profileAId === userPlayer.profileId
              ? handicapRecord.strokes
              : -handicapRecord.strokes;
          }
        }

        // Only include if there's any interaction (net != 0 or they were both in the round)
        sharedRoundsList.push({
          roundId: snap.roundId,
          date: snap.date,
          courseName: snap.courseName,
          netAmount,
          userGross,
          rivalGross,
          slidingStrokes,
        });
      }

      sharedRoundsList.sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime());
      
      setSharedRounds(sharedRoundsList);
    } catch (err) {
      devError('Error fetching rival detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Fetch current sliding entries for the logged-in user from sliding_current table
  const fetchSliding = async () => {
    if (!profile) return;
    setLoadingSliding(true);
    try {
      const { data, error } = await supabase
        .from('sliding_current')
        .select(`
          player_a_profile_id,
          player_b_profile_id,
          strokes_a_gives_b_current,
          last_updated_at,
          last_round:rounds!sliding_current_last_round_id_fkey(date)
        `)
        .or(`player_a_profile_id.eq.${profile.id},player_b_profile_id.eq.${profile.id}`);

      if (error) {
        devError('fetchSliding error:', error);
        setSlidingEntries([]);
        return;
      }

      if (!data || data.length === 0) {
        setSlidingEntries([]);
        return;
      }

      const rivalIds = data.map((row: any) =>
        row.player_a_profile_id === profile.id
          ? row.player_b_profile_id
          : row.player_a_profile_id
      );

      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, display_name, initials, avatar_color')
        .in('id', rivalIds);

      const profilesMap = new Map((profilesData || []).map((p: any) => [p.id, p]));

      const entries: SlidingEntry[] = data
        .map((row: any) => {
          const isUserA = row.player_a_profile_id === profile.id;
          const rivalId = isUserA ? row.player_b_profile_id : row.player_a_profile_id;
          const strokes = isUserA
            ? row.strokes_a_gives_b_current
            : -row.strokes_a_gives_b_current;
          const rival: any = profilesMap.get(rivalId);
          const lastDate = (row.last_round as any)?.date ?? null;
          // Filter out entries where the rival profile can't be resolved
          // (deleted users, RLS-blocked, or orphaned snapshot data)
          if (!rival?.display_name) return null;
          return {
            rivalProfileId: rivalId,
            rivalName: rival.display_name,
            rivalInitials: rival.initials ?? '?',
            rivalColor: rival.avatar_color ?? '#3B82F6',
            strokes,
            lastRoundDate: lastDate,
          };
        })
        .filter((e: SlidingEntry | null): e is SlidingEntry => e !== null);

      setSlidingEntries(entries);
    } catch (err) {
      devError('fetchSliding exception:', err);
    } finally {
      setLoadingSliding(false);
    }
  };


  // ── "Mis Rondas" data: one row per round with date, course, score, net ──
  const myRounds = useMemo<MyRoundRow[]>(() => {
    if (!profile) return [];
    const rows: MyRoundRow[] = [];
    for (const snap of allSnapshots) {
      const userPlayer = snap.players.find((p: any) => p.profileId === profile.id);
      if (!userPlayer) continue;

      // Prefer the immutable balances.totalGross (respects 9H vs 18H segments).
      // Fall back to summing scores for legacy snapshots without that field.
      const userBalance = snap.balances.find((b: any) => b.playerId === userPlayer.id);
      let score = Number((userBalance as any)?.totalGross) || 0;
      if (!score) {
        const userScores = snap.scores[userPlayer.id] || [];
        score = userScores.reduce((sum: number, s: any) => sum + (s.strokes || 0), 0);
      }

      const netAmount = getSnapshotTotalBalance(snap, userPlayer.id);

      rows.push({
        roundId: snap.roundId,
        date: snap.date,
        courseName: snap.courseName,
        score,
        netAmount,
      });
    }
    rows.sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime());
    return rows;
  }, [allSnapshots, profile]);

  if (!canAccessHistory) {
    return (
      <div className="text-center py-12 space-y-4">
        <Lock className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="font-semibold">Balances históricos bloqueados</p>
        <p className="text-sm text-muted-foreground">
          Suscríbete para acceder a tu historial completo de balances con cada jugador.
        </p>
        <Button onClick={() => window.dispatchEvent(new CustomEvent('greenbook:show-upgrade', {
          detail: { reason: 'history' }
        }))}>
          Ver planes
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Shared Sheet element used in both the detail view and the main view,
  // so the sheet mounts immediately regardless of which view is active.
  const preAppSheetEl = preAppSheet ? (
    <PreAppBalanceSheet
      open={!!preAppSheet}
      onClose={() => setPreAppSheet(null)}
      rivalName={preAppSheet.rivalName}
      rivalProfileId={preAppSheet.rivalProfileId}
      summary={preAppMap.get(preAppSheet.rivalKey)}
      onAdd={addPreApp}
      onDelete={deletePreApp}
    />
  ) : null;

  // Detail view for a specific rival
  if (selectedRival) {
    return (
      <>
      <div className="space-y-4 w-full max-w-full overflow-hidden">
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
        <div className="flex items-center justify-between gap-2 p-3 bg-card border border-border rounded-lg overflow-hidden max-w-full">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <PlayerAvatar 
              initials={selectedRival.rivalInitials} 
              background={selectedRival.rivalColor}
              size="lg"
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate text-sm">{selectedRival.rivalName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {sharedRounds.length} ronda{sharedRounds.length !== 1 ? 's' : ''} compartida{sharedRounds.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          {(() => {
            const preApp = preAppMap.get(selectedRival.id);
            const preTotal = preApp?.totalAmount ?? 0;
            const hasPreApp = preTotal !== 0;
            const shown = hasPreApp && includePreApp
              ? selectedRival.netAmount + preTotal
              : selectedRival.netAmount;
            return (
              <div className="flex flex-col items-end shrink-0 gap-1">
                <div className={cn(
                  'text-lg font-bold flex items-center gap-0.5 tabular-nums',
                  shown > 0 ? 'text-green-600 dark:text-green-500' :
                  shown < 0 ? 'text-destructive' : 'text-muted-foreground'
                )}>
                  {shown > 0 && <TrendingUp className="h-4 w-4" />}
                  {shown < 0 && <TrendingDown className="h-4 w-4" />}
                  {shown === 0 && <Minus className="h-4 w-4" />}
                  ${fmtMoney(Math.abs(shown))}
                </div>
                {hasPreApp && (
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="text-muted-foreground">
                      App: {selectedRival.netAmount >= 0 ? '+' : '-'}${fmtMoney(Math.abs(selectedRival.netAmount))}
                    </span>
                    <span className={cn(
                      includePreApp
                        ? (preTotal > 0 ? 'text-green-600 dark:text-green-500' : 'text-destructive')
                        : 'line-through opacity-60 text-muted-foreground'
                    )}>
                      Pre: {preTotal > 0 ? '+' : '-'}${fmtMoney(Math.abs(preTotal))}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setPreAppSheet({
                    rivalKey: selectedRival.id,
                    rivalName: selectedRival.rivalName,
                    rivalProfileId: selectedRival.profileId ?? null,
                  })}
                  className="flex items-center gap-1 text-[11px] text-primary border border-primary/30 rounded-md px-2 py-1 hover:bg-primary/5 transition-colors"
                  title="Cargar balance pre-GB"
                >
                  <History className="h-3 w-3" />
                  Pre-GB
                </button>
              </div>
            );
          })()}
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
            <div className="space-y-2 pr-2">
              {sharedRounds.map((round) => {
                const hasScores = round.userGross !== undefined && round.rivalGross !== undefined;
                const slidingDisplay = round.slidingStrokes !== undefined 
                  ? (round.slidingStrokes > 0 
                      ? `+${round.slidingStrokes}` 
                      : round.slidingStrokes < 0 
                        ? `${round.slidingStrokes}` 
                        : '0')
                  : null;

                return (
                  <button
                    key={round.roundId}
                    onClick={() => onViewRound?.(round.roundId)}
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors text-left space-y-0.5"
                  >
                    {/* Line 1: Date · Club · $Result */}
                    <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_max-content] items-center gap-1.5 whitespace-nowrap overflow-hidden">
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {format(parseLocalDate(round.date), "d MMM yy", { locale: es })}
                      </span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">·</span>
                      <span className="text-sm truncate min-w-0 overflow-hidden" title={round.courseName}>
                        {round.courseName.length > 27 ? `${round.courseName.slice(0, 26)}…` : round.courseName}
                      </span>
                      <span className={cn(
                        'font-bold text-sm justify-self-end shrink-0 tabular-nums',
                        round.netAmount > 0 ? 'text-green-600 dark:text-green-500' : 
                        round.netAmount < 0 ? 'text-destructive' : 'text-muted-foreground'
                      )}>
                        {round.netAmount > 0 ? '+' : round.netAmount < 0 ? '-' : ''}${fmtMoney(Math.abs(round.netAmount))}
                      </span>
                    </div>
                    {/* Line 2: SLDG +N below date, Yo: XX vs YY left-aligned under club */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="flex-shrink-0 w-[62px] text-left">
                        {slidingDisplay ? (
                          <span className="text-foreground/70"><span className="text-[9px]">SLDG</span> <span className="font-semibold">{slidingDisplay}</span></span>
                        ) : (
                          <span>&nbsp;</span>
                        )}
                      </span>
                      <span className="flex-shrink-0">&nbsp;</span>
                      {hasScores ? (
                        <span>Yo: {round.userGross} vs {round.rivalGross}</span>
                      ) : (
                        <span className="italic">Sin datos</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>
      {preAppSheetEl}
      </>
    );
  }

  // Main summary view
  if (rivals.length === 0 && myRounds.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No hay historial de apuestas</p>
        <p className="text-sm">Completa rondas con apuestas para ver tu historial</p>
      </div>
    );
  }

  const displayedTotalNet = rivals.reduce((sum, r) => {
    const pre = preAppMap.get(r.id)?.totalAmount ?? 0;
    return sum + r.netAmount + (includePreApp ? pre : 0);
  }, 0);

  return (
    <div className="space-y-3 overflow-hidden">
      {/* Tabs: Vs Rivales / Mis Rondas */}
      <Tabs value={activeTab} onValueChange={(v) => {
        const tab = v as 'rivals' | 'rounds' | 'sliding';
        setActiveTab(tab);
        if (tab === 'sliding') fetchSliding();
      }} className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="rivals" className="flex-1 text-xs">Vs Rivales</TabsTrigger>
          <TabsTrigger value="rounds" className="flex-1 text-xs">Mis Rondas</TabsTrigger>
          <TabsTrigger value="sliding" className="flex-1 text-xs">Sliding</TabsTrigger>
        </TabsList>

        {/* ── Vs Rivales Tab ── */}
        <TabsContent value="rivals" className="mt-3 space-y-4">
          {/* Summary card */}
          <div className="p-3 bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between mb-2 gap-2">
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Trophy className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium">Balance Total</span>
              </div>
              <div className={cn(
                'text-xl font-bold flex items-center gap-1',
                displayedTotalNet > 0 ? 'text-green-600 dark:text-green-500' : displayedTotalNet < 0 ? 'text-destructive' : 'text-muted-foreground'
              )}>
                {displayedTotalNet > 0 && <TrendingUp className="h-4 w-4 flex-shrink-0" />}
                {displayedTotalNet < 0 && <TrendingDown className="h-4 w-4 flex-shrink-0" />}
                <span>{displayedTotalNet > 0 ? '+' : ''}{displayedTotalNet < 0 ? '-' : ''}${fmtMoney(Math.abs(displayedTotalNet))}</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {rivals.length} rival{rivals.length !== 1 ? 'es' : ''}
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {totalRounds} ronda{totalRounds !== 1 ? 's' : ''}
                </div>
              </div>
              {rivals.some(r => r.isGuest) && (
                <div className="space-y-1">
                  <button
                    onClick={() => setShowGuests(!showGuests)}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground/70 hover:text-muted-foreground transition-colors"
                  >
                    {showGuests ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                    {showGuests ? 'Ocultar invitados' : 'Ver invitados'}
                  </button>
                  {showGuests && (
                    <p className="text-[11px] text-muted-foreground px-1">
                      Los invitados se identifican por nombre. Si un mismo jugador aparece duplicado, verifica que su nombre se haya escrito exactamente igual en todas las rondas.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Rivals ranking */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-medium text-muted-foreground">Ranking por Rival</h3>
                <button
                  onClick={() => {
                    if (sortField === 'name') {
                      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortField('name');
                      setSortDir('asc');
                    }
                  }}
                  className="p-0.5 rounded hover:bg-muted/50 transition-colors"
                  title="Ordenar por nombre"
                >
                  {sortField === 'name' ? (
                    sortDir === 'asc' ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
                  ) : (
                    <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                  )}
                </button>
                {rivals.some(r => (preAppMap.get(r.id)?.totalAmount ?? 0) !== 0) && (
                  <button
                    onClick={() => setIncludePreApp(v => !v)}
                    aria-pressed={includePreApp}
                    title={includePreApp ? 'Ocultar Pre-GB del total' : 'Incluir Pre-GB en el total'}
                    className={cn(
                      'flex items-center gap-1 text-[10px] rounded-md border px-1.5 py-0.5 transition-colors',
                      includePreApp
                        ? 'border-primary/40 text-primary bg-primary/5'
                        : 'border-border text-muted-foreground line-through opacity-70'
                    )}
                  >
                    <History className="h-3 w-3" />
                    Pre-GB
                  </button>
                )}
              </div>
              <div className="flex items-center mr-6">
                <button
                  onClick={() => {
                    if (sortField === 'amount') {
                      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortField('amount');
                      setSortDir('desc');
                    }
                  }}
                  className="p-0.5 rounded hover:bg-muted/50 transition-colors"
                  title="Ordenar por importe"
                >
                  {sortField === 'amount' ? (
                    sortDir === 'desc' ? <ArrowDown className="h-3 w-3 text-primary" /> : <ArrowUp className="h-3 w-3 text-primary" />
                  ) : (
                    <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                  )}
                </button>
              </div>
            </div>
            <ScrollArea className="h-[280px]">
              <div className="space-y-1.5 pr-1">
                {rivals.filter(r => showGuests || !r.isGuest)
                  .sort((a, b) => {
                    if (sortField === 'name') {
                      const cmp = a.rivalName.localeCompare(b.rivalName);
                      return sortDir === 'asc' ? cmp : -cmp;
                    }
                    return sortDir === 'desc' ? b.netAmount - a.netAmount : a.netAmount - b.netAmount;
                  })
                  .map((rival, index) => (
                  <button
                    key={rival.id}
                    onClick={() => fetchRivalDetail(rival)}
                    className="w-full px-2 py-1.5 bg-card border border-border rounded-lg flex items-center gap-1.5 hover:bg-muted/50 transition-colors overflow-hidden"
                  >
                    <span className="text-xs text-muted-foreground w-4 text-right flex-shrink-0">
                      {index + 1}
                    </span>
                    <PlayerAvatar 
                      initials={rival.rivalInitials} 
                      background={rival.rivalColor}
                      size="xs"
                    />
                    <span className="text-xs font-medium truncate min-w-0">
                      {rival.rivalName}
                      {rival.isGuest && <span className="text-muted-foreground font-normal"> inv</span>}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">({rival.roundsPlayed})</span>
                    {(() => {
                      const preTotal = preAppMap.get(rival.id)?.totalAmount ?? 0;
                      const shown = includePreApp ? rival.netAmount + preTotal : rival.netAmount;
                      return (
                        <span className={cn(
                          'ml-auto font-bold text-sm flex-shrink-0',
                          shown > 0 ? 'text-green-600 dark:text-green-500' :
                          shown < 0 ? 'text-destructive' : 'text-muted-foreground'
                        )}>
                          {shown >= 0 ? '+' : '-'}${fmtMoney(Math.abs(shown))}
                        </span>
                      );
                    })()}
                    <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        {/* ── Mis Rondas Tab ── */}
        <TabsContent value="rounds" className="mt-3 space-y-3">
          {/* Summary card (mirrors Vs Rivales) */}
          <div className="p-3 bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between mb-2 gap-2">
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Trophy className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium">Balance Total</span>
              </div>
              <div className={cn(
                'text-xl font-bold flex items-center gap-1',
                totalNet > 0 ? 'text-green-600 dark:text-green-500' : totalNet < 0 ? 'text-destructive' : 'text-muted-foreground'
              )}>
                {totalNet > 0 && <TrendingUp className="h-4 w-4 flex-shrink-0" />}
                {totalNet < 0 && <TrendingDown className="h-4 w-4 flex-shrink-0" />}
                <span>{totalNet > 0 ? '+' : ''}{totalNet < 0 ? '-' : ''}${fmtMoney(Math.abs(totalNet))}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {rivals.length} rival{rivals.length !== 1 ? 'es' : ''}
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {myRounds.length} ronda{myRounds.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          {myRounds.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No hay rondas completadas</p>
            </div>
          ) : (
            <ScrollArea className="h-[340px]">
              <div className="space-y-1 pr-1">
                {myRounds.map((round) => (
                  <button
                    key={round.roundId}
                    onClick={() => onViewRound?.(round.roundId)}
                    className="w-full overflow-hidden px-2 py-1.5 bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="grid grid-cols-[58px_24px_minmax(0,1fr)_max-content] items-center gap-1.5 whitespace-nowrap overflow-hidden">
                      <span className="text-xs text-muted-foreground">
                        {format(parseLocalDate(round.date), "dd MMM yy", { locale: es })}
                      </span>
                      <span className="font-bold text-sm text-center">{round.score}</span>
                      <span
                        className={cn('truncate min-w-0', round.courseName.length > 28 ? 'text-[11px]' : 'text-xs')}
                        title={round.courseName}
                      >
                        {round.courseName}
                      </span>
                      <span className={cn(
                        'font-bold text-sm text-right tabular-nums',
                        round.netAmount > 0 ? 'text-green-600 dark:text-green-500' :
                        round.netAmount < 0 ? 'text-destructive' : 'text-muted-foreground'
                      )}>
                        {round.netAmount > 0 ? '+' : round.netAmount < 0 ? '-' : ''}${fmtMoney(Math.abs(round.netAmount))}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        {/* ── Sliding Tab ── */}
        <TabsContent value="sliding" className="mt-3 space-y-3">
          {/* Summary card (mirrors Vs Rivales / Mis Rondas) */}
          {(() => {
            const receivers = slidingEntries.filter(e => e.strokes < 0);
            const givers = slidingEntries.filter(e => e.strokes > 0);
            const evens = slidingEntries.filter(e => e.strokes === 0);
            const totalReceived = receivers.reduce((s, e) => s + Math.abs(e.strokes), 0);
            const totalGiven = givers.reduce((s, e) => s + e.strokes, 0);
            const net = totalReceived - totalGiven;
            return (
              <div className="p-3 bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Trophy className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium">Sliding Neto</span>
                  </div>
                  <div className={cn(
                    'text-xl font-bold tabular-nums',
                    net > 0 ? 'text-green-700 dark:text-green-500' : net < 0 ? 'text-destructive' : 'text-muted-foreground'
                  )}>
                    {net > 0 ? `+${net}` : net}
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <span className="text-green-700 dark:text-green-500 font-semibold">−{totalReceived}</span>
                    <span>recibes ({receivers.length})</span>
                  </div>
                  {evens.length > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="font-semibold">{evens.length}</span>
                      <span>scratch</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <span>das ({givers.length})</span>
                    <span className="text-destructive font-semibold">+{totalGiven}</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Sort control */}
          <div className="flex items-center gap-1.5 px-1">
            <span className="text-[10px] text-muted-foreground font-medium">Ordenar:</span>
            {([
              { key: 'name', label: 'A-Z' },
              { key: 'strokes_desc', label: 'Mayor→Menor' },
              { key: 'strokes_asc', label: 'Menor→Mayor' },
            ] as { key: SlidingSortKey; label: string }[]).map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSlidingSort(opt.key)}
                className={cn(
                  'px-2 py-0.5 text-[10px] rounded-full border transition-colors',
                  slidingSort === opt.key
                    ? 'bg-primary text-primary-foreground border-primary font-semibold'
                    : 'bg-muted text-muted-foreground border-border'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {loadingSliding ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : slidingEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <p className="text-sm text-muted-foreground">Sin datos de sliding</p>
              <p className="text-xs text-muted-foreground text-center">
                El sliding se genera automáticamente al cerrar rondas con hándicap bilateral.
              </p>
            </div>
          ) : (() => {
            const sortFn = (a: SlidingEntry, b: SlidingEntry) => {
              if (slidingSort === 'name') return a.rivalName.localeCompare(b.rivalName, 'es');
              if (slidingSort === 'strokes_desc') return Math.abs(b.strokes) - Math.abs(a.strokes);
              return Math.abs(a.strokes) - Math.abs(b.strokes);
            };
            // Recibes incluye scratch (0 golpes) en verde con valor 0
            const receives = [...slidingEntries].filter(e => e.strokes <= 0).sort(sortFn);
            const gives = [...slidingEntries].filter(e => e.strokes > 0).sort(sortFn);

            const Row: React.FC<{ entry: SlidingEntry; side: 'left' | 'right' }> = ({ entry, side }) => {
              const isReceive = side === 'left';
              const value = isReceive
                ? (entry.strokes === 0 ? '0' : `−${Math.abs(entry.strokes)}`)
                : `+${entry.strokes}`;
              return (
                <div className={cn(
                  'flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-card border border-border',
                  isReceive ? 'justify-start' : 'justify-end flex-row-reverse'
                )}>
                  <span className="text-[11px] font-medium truncate min-w-0 flex-1">{entry.rivalName}</span>
                  <span className={cn(
                    'text-xs font-bold tabular-nums shrink-0',
                    isReceive ? 'text-green-700 dark:text-green-500' : 'text-destructive'
                  )}>
                    {value}
                  </span>
                </div>
              );
            };

            return (
              <ScrollArea className="h-[320px]">
                <div className="grid grid-cols-2 gap-2 pr-1">
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-green-700 dark:text-green-500 px-1">
                      Recibes ({receives.length})
                    </p>
                    {receives.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground px-1 italic">—</p>
                    ) : (
                      receives.map(e => <Row key={e.rivalProfileId} entry={e} side="left" />)
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-destructive px-1 text-right">
                      Das ({gives.length})
                    </p>
                    {gives.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground px-1 italic text-right">—</p>
                    ) : (
                      gives.map(e => <Row key={e.rivalProfileId} entry={e} side="right" />)
                    )}
                  </div>
                </div>
              </ScrollArea>
            );
          })()}
        </TabsContent>
      </Tabs>

      {preAppSheetEl}
    </div>
  );
});

HistoricalBalances.displayName = 'HistoricalBalances';
