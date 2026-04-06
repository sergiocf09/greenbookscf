import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useMoneyRankingDetail, useMoneyRankings } from '@/hooks/useMoneyRankings';
import type { RankingBalanceEntry, RankingPeriod } from '@/hooks/useMoneyRankings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft, Loader2, TrendingUp, Users, UserPlus, UserMinus, Trash2, ChevronRight, Search, X,
} from 'lucide-react';
import { fmtMoney } from '@/lib/formatMoney';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import GreenBookLogo from '@/components/GreenBookLogo';
import { supabase } from '@/integrations/supabase/client';

const toTitleCase = (name: string) =>
  name.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

const PERIOD_LABELS: Record<RankingPeriod, string> = {
  all: 'Todos',
  year: 'Este año',
  '90d': '90 días',
};

const NetBadge = ({ amount }: { amount: number }) => {
  if (amount > 0) return <span className="text-green-600 dark:text-green-400 font-semibold text-sm">+${fmtMoney(amount)}</span>;
  if (amount < 0) return <span className="text-red-600 dark:text-red-400 font-semibold text-sm">-${fmtMoney(Math.abs(amount))}</span>;
  return <span className="text-muted-foreground font-semibold text-sm">$0</span>;
};

const PositionBadge = ({ rank }: { rank: number }) => {
  if (rank === 1) return <span className="text-lg">🥇</span>;
  if (rank === 2) return <span className="text-lg">🥈</span>;
  if (rank === 3) return <span className="text-lg">🥉</span>;
  return <span className="text-xs font-bold text-muted-foreground w-6 text-center">{rank}</span>;
};

const MoneyRankingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [period, setPeriod] = useState<RankingPeriod>('all');
  const [showBilateral, setShowBilateral] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const {
    ranking, members, balances, bilateral, selectedMemberId,
    loadingDetail, loadingBalances, loadingBilateral,
    isCreator, fetchDetail, fetchBalances, selectMember,
  } = useMoneyRankingDetail(id ?? null, period);

  const { addMember, leaveRanking, removeMember, deleteRanking } = useMoneyRankings();

  const selectedEntry = balances.find(b => b.profile_id === selectedMemberId);
  const memberProfileIds = new Set(members.map(m => m.profile_id));

  const handleMemberTap = (entry: RankingBalanceEntry) => {
    selectMember(entry.profile_id);
    setShowBilateral(true);
  };

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase.rpc('search_profiles', { p_query: q.trim() });
    setSearchResults((data || []).filter((p: any) => !memberProfileIds.has(p.id)));
    setSearching(false);
  };

  const handleAddMember = async (profileId: string) => {
    if (!id) return;
    const ok = await addMember(id, profileId);
    if (ok) {
      setSearchResults(prev => prev.filter(p => p.id !== profileId));
      await fetchDetail();
      await fetchBalances();
    }
  };

  const handleRemoveMember = async (memberRowId: string) => {
    await removeMember(memberRowId);
    await fetchDetail();
    await fetchBalances();
  };

  const handleLeave = async () => {
    if (!id) return;
    await leaveRanking(id);
    navigate('/rankings');
  };

  const handleDelete = async () => {
    if (!id) return;
    await deleteRanking(id);
    navigate('/rankings');
  };

  if (loadingDetail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate('/rankings')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold truncate">{ranking?.name ?? 'Ranking'}</h1>
          </div>
          <GreenBookLogo />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Acciones del creador */}
        {isCreator && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => { setShowAddMember(true); setSearchQuery(''); setSearchResults([]); }}
            >
              <UserPlus className="h-4 w-4 mr-1" /> Agregar jugador
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-1" /> Eliminar ranking
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar ranking?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción no se puede deshacer. Se eliminarán el ranking y todos sus miembros.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* Botón salir (solo miembro no creador) */}
        {!isCreator && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full">
                <UserMinus className="h-4 w-4 mr-1" /> Salir del ranking
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Salir del ranking?</AlertDialogTitle>
                <AlertDialogDescription>
                  Ya no aparecerás en este ranking. El organizador puede volverte a agregar cuando quieras.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleLeave}>Salir</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {/* Filtros de período */}
        <Tabs value={period} onValueChange={(v) => setPeriod(v as RankingPeriod)}>
          <TabsList className="w-full">
            {(Object.keys(PERIOD_LABELS) as RankingPeriod[]).map(p => (
              <TabsTrigger key={p} value={p} className="flex-1">
                {PERIOD_LABELS[p]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Tabla de posiciones */}
        {loadingBalances ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : balances.length === 0 ? (
          <div className="text-center py-10 space-y-2">
            <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Sin saldos registrados en este período</p>
            <p className="text-xs text-muted-foreground">
              Los saldos se calculan solo de rondas donde ambos jugadores son miembros del ranking
            </p>
          </div>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                <TrendingUp className="h-4 w-4 inline mr-1" />
                Posiciones · {members.length} miembros
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {balances.map((entry, idx) => {
                const memberRow = members.find(m => m.profile_id === entry.profile_id);
                return (
                  <React.Fragment key={entry.profile_id}>
                    {idx > 0 && <Separator className="my-1" />}
                    <div className="flex items-center gap-2 py-2">
                      <button
                        className="flex items-center gap-2 flex-1 min-w-0 text-left hover:bg-accent/50 rounded-md p-1 -m-1 transition-colors"
                        onClick={() => handleMemberTap(entry)}
                      >
                        <PositionBadge rank={entry.rank ?? idx + 1} />
                        <PlayerAvatar
                          initials={entry.initials}
                          background={entry.avatar_color}
                          size="sm"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {entry.display_name}
                            {entry.profile_id === profile?.id && (
                              <span className="text-xs text-muted-foreground ml-1">(tú)</span>
                            )}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {entry.rounds_played} {entry.rounds_played === 1 ? 'ronda' : 'rondas'}
                          </p>
                        </div>
                        <NetBadge amount={entry.net_balance} />
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                      {isCreator && entry.profile_id !== profile?.id && memberRow && (
                        <button
                          className="shrink-0 p-1 rounded hover:bg-destructive/10 transition-colors"
                          onClick={() => handleRemoveMember(memberRow.id)}
                          title="Remover del ranking"
                        >
                          <UserMinus className="h-4 w-4 text-destructive" />
                        </button>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Toca cualquier jugador para ver sus saldos bilaterales
        </p>
      </div>

      {/* Sheet: Agregar miembro */}
      <Sheet open={showAddMember} onOpenChange={setShowAddMember}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Agregar jugador al ranking</SheetTitle>
          </SheetHeader>
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
          {searching && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}
          <div className="mt-3 space-y-2">
            {searchResults.map((p: any) => (
              <div key={p.id} className="flex items-center gap-3 py-2">
                <PlayerAvatar initials={p.initials} background={p.avatar_color} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.display_name}</p>
                  <p className="text-xs text-muted-foreground">HCP {p.current_handicap}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleAddMember(p.id)}>
                  Agregar
                </Button>
              </div>
            ))}
            {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Sin resultados</p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Sheet: Bilateral */}
      <Sheet open={showBilateral} onOpenChange={setShowBilateral}>
        <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {selectedEntry && (
                <PlayerAvatar initials={selectedEntry.initials} background={selectedEntry.avatar_color} size="sm" />
              )}
              {selectedEntry?.display_name ?? 'Jugador'}
              <NetBadge amount={selectedEntry?.net_balance ?? 0} />
            </SheetTitle>
          </SheetHeader>
          {loadingBilateral ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : bilateral.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Sin saldos bilaterales en este período
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {bilateral.map((b) => (
                <div key={b.rival_profile_id} className="flex items-center gap-3 py-2">
                  <PlayerAvatar initials={b.initials} background={b.avatar_color} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{b.display_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {b.rounds_together} {b.rounds_together === 1 ? 'ronda juntos' : 'rondas juntos'}
                    </p>
                  </div>
                  <NetBadge amount={b.net_balance} />
                </div>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default MoneyRankingDetail;
