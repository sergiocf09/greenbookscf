/**
 * Historical Balances Component
 * 
 * Displays the accumulated historical balance of bets for the logged-in user.
 * 
 * CRITICAL: Calculates ALL balances directly from round_snapshots ledger entries,
 * applying betOverrides (cancelled bets) to match the General Table logic exactly.
 * Does NOT rely on pre-calculated vsBalances or player_vs_player table.
 */

import React, { useState, useEffect, useMemo } from 'react';
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
  UserCheck,
  UserX,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { devError, devLog } from '@/lib/logger';
import { isValidSnapshot, RoundSnapshot, SnapshotLedgerEntry } from '@/lib/roundSnapshot';

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

// ────────────────────────────────────────────────────
// Override filtering logic (mirrors BetDashboard exactly)
// ────────────────────────────────────────────────────

const getCategoryKey = (betType: string): string => {
  if (betType.startsWith('Medal') && betType !== 'Medal General') return 'medal';
  if (betType.startsWith('Presiones') && betType !== 'Presiones Parejas') return 'pressures';
  if (betType.startsWith('Skins')) return 'skins';
  if (betType.startsWith('Rayas')) return 'rayas';
  if (betType === 'Putts' || betType.startsWith('Putts')) return 'putts';
  if (betType.includes('Pingüino') || betType === 'Pingüinos') return 'pinguinos';
  if (betType.startsWith('Zoológico')) return 'zoologico';
  if (betType === 'Caros') return 'caros';
  if (betType === 'Oyes') return 'oyeses';
  if (betType === 'Unidades') return 'units';
  if (betType === 'Manchas') return 'manchas';
  if (betType === 'Culebras') return 'culebras';
  if (betType === 'Coneja') return 'coneja';
  if (betType === 'Medal General') return 'medalGeneral';
  if (betType === 'Side Bet') return 'sideBets';
  if (betType === 'Stableford') return 'stableford';
  if (betType.startsWith('Carritos')) return 'carritos';
  if (betType === 'Presiones Parejas') return 'teamPressures';
  return betType;
};

const categoryToLabel = (key: string): string => {
  switch (key) {
    case 'medal': return 'Medal';
    case 'pressures': return 'Presiones';
    case 'skins': return 'Skins';
    case 'caros': return 'Caros';
    case 'oyeses': return 'Oyes';
    case 'units': return 'Unidades';
    case 'manchas': return 'Manchas';
    case 'culebras': return 'Culebras';
    case 'pinguinos': return 'Pingüinos';
    case 'rayas': return 'Rayas';
    case 'medalGeneral': return 'Medal General';
    case 'coneja': return 'Coneja';
    case 'putts': return 'Putts';
    case 'sideBets': return 'Side Bet';
    case 'stableford': return 'Stableford';
    case 'zoologico': return 'Zoológico';
    case 'carritos': return 'Carritos';
    case 'teamPressures': return 'Foursome';
    default: return key;
  }
};

/**
 * Calculate the net amount for a player vs rival from a snapshot's ledger,
 * applying betOverrides to exclude cancelled bets.
 * This mirrors getCorrectedBilateralBalance in BetDashboard (historical mode).
 */
const calculateNetFromLedger = (
  ledger: SnapshotLedgerEntry[],
  betOverrides: any[] | undefined,
  playerId: string,
  rivalId: string,
  allPlayers: any[]
): number => {
  // Build bet summaries (winner positive, loser negative) for this pair only
  const pairEntries: { betType: string; amount: number }[] = [];
  for (const entry of ledger) {
    if (entry.amount <= 0) continue;

    if (entry.toPlayerId === playerId && entry.fromPlayerId === rivalId) {
      pairEntries.push({ betType: entry.betType, amount: entry.amount });
    } else if (entry.fromPlayerId === playerId && entry.toPlayerId === rivalId) {
      pairEntries.push({ betType: entry.betType, amount: -entry.amount });
    }
  }

  // Group by category
  const grouped = new Map<string, number>();
  for (const e of pairEntries) {
    const cat = getCategoryKey(e.betType);
    grouped.set(cat, (grouped.get(cat) || 0) + e.amount);
  }

  // Helper to match player IDs (id or profileId)
  const matchesPlayer = (overrideId: string, pId: string): boolean => {
    if (overrideId === pId) return true;
    const p = allPlayers.find((x: any) => x.id === pId);
    if (p?.profileId && overrideId === p.profileId) return true;
    const pByProfile = allPlayers.find((x: any) => x.profileId === pId);
    if (pByProfile && overrideId === pByProfile.id) return true;
    return false;
  };

  let total = 0;
  for (const [catKey, amount] of grouped) {
    const label = categoryToLabel(catKey);
    const override = (betOverrides || []).find(
      (o: any) =>
        (o.betType === label || o.betType === catKey) &&
        ((matchesPlayer(o.playerAId, playerId) && matchesPlayer(o.playerBId, rivalId)) ||
          (matchesPlayer(o.playerAId, rivalId) && matchesPlayer(o.playerBId, playerId)))
    );
    if (override?.enabled === false) continue;
    total += amount;
  }
  return total;
};

export const HistoricalBalances = React.forwardRef<HTMLDivElement, HistoricalBalancesProps>(({ 
  onViewRound,
  onClose 
}, ref) => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rivals, setRivals] = useState<RivalBalance[]>([]);
  const [totalNet, setTotalNet] = useState(0);
  const [totalRounds, setTotalRounds] = useState(0);
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'rivals' | 'rounds'>('rivals');

  // Detail view state
  const [selectedRival, setSelectedRival] = useState<RivalBalance | null>(null);
  const [sharedRounds, setSharedRounds] = useState<SharedRound[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showGuests, setShowGuests] = useState(false);
  const [sortField, setSortField] = useState<'amount' | 'name'>('amount');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Cache all snapshots to reuse in detail view
  const [allSnapshots, setAllSnapshots] = useState<RoundSnapshot[]>([]);


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

          const betOverrides = snap.betConfig?.betOverrides;

          // Calculate net vs each other player using ledger + overrides
          for (const rival of snap.players) {
            if (rival.id === userPlayer.id) continue;

            const net = calculateNetFromLedger(
              snap.ledger,
              betOverrides,
              userPlayer.id,
              rival.id,
              snap.players
            );

            // Build a stable key for this rival across rounds.
            // Guests use roundId+name to avoid merging different guests with the same name.
            const rivalKey = rival.profileId
              ? `profile:${rival.profileId}`
              : `guest:${snap.roundId}:${rival.name}`;

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
            rivalName,
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
          ? snap.players.find((p: any) => p.isGuest && p.name === rival.rivalName)
          : snap.players.find((p: any) => p.profileId === rival.profileId);

        if (!rivalPlayer) continue;

        // Calculate net from ledger with overrides
        const netAmount = calculateNetFromLedger(
          snap.ledger,
          snap.betConfig?.betOverrides,
          userPlayer.id,
          rivalPlayer.id,
          snap.players
        );

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

  // ── "Mis Rondas" data: one row per round with date, course, score, net ──
  const myRounds = useMemo<MyRoundRow[]>(() => {
    if (!profile) return [];
    const rows: MyRoundRow[] = [];
    for (const snap of allSnapshots) {
      const userPlayer = snap.players.find((p: any) => p.profileId === profile.id);
      if (!userPlayer) continue;

      const userScores = snap.scores[userPlayer.id] || [];
      const score = userScores.reduce((sum: number, s: any) => sum + (s.strokes || 0), 0);

      // Recalculate net from ledger applying betOverrides (matches "Vs Rivales" logic)
      const betOverrides = snap.betConfig?.betOverrides;
      let netAmount = 0;
      for (const rival of snap.players) {
        if (rival.id === userPlayer.id) continue;
        netAmount += calculateNetFromLedger(
          snap.ledger,
          betOverrides,
          userPlayer.id,
          rival.id,
          snap.players
        );
      }

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
                {sharedRounds.length} ronda{sharedRounds.length !== 1 ? 's' : ''} compartida{sharedRounds.length !== 1 ? 's' : ''}
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
                    <div className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {format(parseLocalDate(round.date), "d MMM yy", { locale: es })}
                      </span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">·</span>
                      <span className="text-sm truncate min-w-0">{round.courseName}</span>
                      <span className={cn(
                        'font-bold text-sm ml-auto flex-shrink-0',
                        round.netAmount > 0 ? 'text-green-600 dark:text-green-500' : 
                        round.netAmount < 0 ? 'text-destructive' : 'text-muted-foreground'
                      )}>
                        {round.netAmount >= 0 ? '+' : ''}${round.netAmount}
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

  return (
    <div className="space-y-3 overflow-hidden">
      {/* Tabs: Vs Rivales / Mis Rondas */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'rivals' | 'rounds')} className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="rivals" className="flex-1 text-xs">Vs Rivales</TabsTrigger>
          <TabsTrigger value="rounds" className="flex-1 text-xs">Mis Rondas</TabsTrigger>
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
                totalNet > 0 ? 'text-green-600 dark:text-green-500' : totalNet < 0 ? 'text-destructive' : 'text-muted-foreground'
              )}>
                {totalNet > 0 && <TrendingUp className="h-4 w-4 flex-shrink-0" />}
                {totalNet < 0 && <TrendingDown className="h-4 w-4 flex-shrink-0" />}
                <span>{totalNet > 0 ? '+' : ''}{totalNet < 0 ? '-' : ''}${Math.abs(totalNet)}</span>
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
                <button
                  onClick={() => setShowGuests(!showGuests)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground/70 hover:text-muted-foreground transition-colors"
                >
                  {showGuests ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                  {showGuests ? 'Ocultar invitados' : 'Ver invitados'}
                </button>
              )}
            </div>
          </div>

          {/* Rivals ranking */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1">
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
                    <span className={cn(
                      'font-bold text-sm ml-auto flex-shrink-0',
                      rival.netAmount > 0 ? 'text-green-600 dark:text-green-500' : 
                      rival.netAmount < 0 ? 'text-destructive' : 'text-muted-foreground'
                    )}>
                      {rival.netAmount >= 0 ? '+' : '-'}${Math.abs(rival.netAmount)}
                    </span>
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
                <span>{totalNet > 0 ? '+' : ''}{totalNet < 0 ? '-' : ''}${Math.abs(totalNet)}</span>
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
                    className="w-full px-2 py-1.5 bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
                      <span className="text-xs text-muted-foreground flex-shrink-0 w-[58px]">
                        {format(parseLocalDate(round.date), "dd MMM yy", { locale: es })}
                      </span>
                      <span className="font-bold text-sm flex-shrink-0 w-[24px] text-center">{round.score}</span>
                      <span className="text-xs truncate min-w-0">{round.courseName}</span>
                      <span className={cn(
                        'font-bold text-sm ml-auto flex-shrink-0',
                        round.netAmount > 0 ? 'text-green-600 dark:text-green-500' :
                        round.netAmount < 0 ? 'text-destructive' : 'text-muted-foreground'
                      )}>
                        {round.netAmount > 0 ? '+' : round.netAmount < 0 ? '-' : ''}${Math.abs(round.netAmount)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
});

HistoricalBalances.displayName = 'HistoricalBalances';
