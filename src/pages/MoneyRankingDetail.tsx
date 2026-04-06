import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useMoneyRankingDetail, useMoneyRankings } from '@/hooks/useMoneyRankings';
import type { RankingBalanceEntry, RankingPeriod } from '@/hooks/useMoneyRankings';
import { useHandicapRankingByIds } from '@/hooks/useHandicapRanking';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  ArrowLeft, Loader2, TrendingUp, TrendingDown, Users, UserPlus, UserMinus, Trash2, ChevronRight, Search, X, Minus, DollarSign, Award, CalendarRange,
} from 'lucide-react';
import { fmtMoney } from '@/lib/formatMoney';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import GreenBookLogo from '@/components/GreenBookLogo';
import { supabase } from '@/integrations/supabase/client';

const toTitleCase = (name: string) =>
  name.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

type RankingView = 'money' | 'handicap';

const PERIOD_LABELS: Record<RankingPeriod, string> = {
  all: 'Todos',
  year: 'Este año',
  custom: 'Período',
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

const TrendIcon = ({ trend }: { trend: number | null }) => {
  if (trend === null) return <Minus className="h-3 w-3 text-muted-foreground" />;
  if (trend < -0.4) return <TrendingDown className="h-3 w-3 text-green-500" />;
  if (trend > 0.4) return <TrendingUp className="h-3 w-3 text-red-500" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
};

const MoneyRankingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [period, setPeriod] = useState<RankingPeriod>('all');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [showCustomPeriod, setShowCustomPeriod] = useState(false);
  const [rankingView, setRankingView] = useState<RankingView>('money');
  const [showBilateral, setShowBilateral] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const {
    ranking, members, balances, bilateral, selectedMemberId,
    loadingDetail, loadingBalances, loadingBilateral,
    isCreator, fetchDetail, fetchBalances, selectMember,
  } = useMoneyRankingDetail(id ?? null, period, customDateFrom, customDateTo);

  const { addMember, leaveRanking, removeMember, deleteRanking } = useMoneyRankings();

  // Handicap ranking for this group's members
  const memberProfileIds = useMemo(() => members.map(m => m.profile_id), [members]);
  const { entries: handicapEntries, loading: loadingHandicap } = useHandicapRankingByIds(memberProfileIds);

  const selectedEntry = balances.find(b => b.profile_id === selectedMemberId);
  const memberProfileIdSet = new Set(memberProfileIds);

  const handleMemberTap = (entry: RankingBalanceEntry) => {
    selectMember(entry.profile_id);
    setShowBilateral(true);
  };

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase.rpc('search_profiles', { p_query: q.trim() });
    setSearchResults((data || []).filter((p: any) => !memberProfileIdSet.has(p.id)));
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
    if (!id || deleteConfirmText.toLowerCase() !== 'eliminar') return;
    await deleteRanking(id);
    navigate('/rankings');
  };

  const handlePeriodChange = (v: string) => {
    const val = v as RankingPeriod;
    if (val === 'custom') {
      setShowCustomPeriod(true);
    } else {
      setPeriod(val);
      setCustomDateFrom('');
      setCustomDateTo('');
    }
  };

  const applyCustomPeriod = () => {
    if (!customDateFrom) return;
    setPeriod('custom');
    setShowCustomPeriod(false);
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
      <header className="bg-primary text-primary-foreground py-3 px-4 shadow-lg">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary/80" onClick={() => navigate('/rankings')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold truncate text-accent">{ranking?.name ?? 'Ranking'}</h1>
            <p className="text-xs text-primary-foreground/70">{members.length} {members.length === 1 ? 'miembro' : 'miembros'}</p>
          </div>
          <GreenBookLogo />
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Creator actions */}
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
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { setShowDeleteConfirm(true); setDeleteConfirmText(''); }}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Eliminar ranking
            </Button>
          </div>
        )}

        {/* Leave button (non-creator) */}
        {!isCreator && (
          <Button variant="outline" size="sm" className="w-full" onClick={handleLeave}>
            <UserMinus className="h-4 w-4 mr-1" /> Salir del ranking
          </Button>
        )}

        {/* Toggle: Dinero / Hándicap */}
        <Tabs value={rankingView} onValueChange={(v) => setRankingView(v as RankingView)}>
          <TabsList className="w-full">
            <TabsTrigger value="money" className="flex-1 gap-1">
              <DollarSign className="h-3.5 w-3.5" /> Dinero
            </TabsTrigger>
            <TabsTrigger value="handicap" className="flex-1 gap-1">
              <Award className="h-3.5 w-3.5" /> Hándicap
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* === MONEY VIEW === */}
        {rankingView === 'money' && (
          <>
            {/* Period filters */}
            <Tabs value={period} onValueChange={handlePeriodChange}>
              <TabsList className="w-full">
                {(Object.keys(PERIOD_LABELS) as RankingPeriod[]).map(p => (
                  <TabsTrigger key={p} value={p} className="flex-1 gap-1">
                    {p === 'custom' && <CalendarRange className="h-3 w-3" />}
                    {PERIOD_LABELS[p]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {period === 'custom' && customDateFrom && (
              <p className="text-xs text-muted-foreground text-center">
                {customDateFrom} → {customDateTo || 'hoy'}
              </p>
            )}

            {/* Money positions */}
            {loadingBalances ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : balances.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Sin saldos registrados en este período</p>
              </div>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    <DollarSign className="h-4 w-4 inline mr-1" />
                    Posiciones · {members.length} miembros
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {balances.map((entry, idx) => {
                    const memberRow = members.find(m => m.profile_id === entry.profile_id);
                    return (
                      <React.Fragment key={entry.profile_id}>
                        {idx > 0 && <Separator className="my-1" />}
                        <div className="flex items-center gap-1.5 py-2">
                          {isCreator && entry.profile_id !== profile?.id && memberRow && (
                            <button
                              className="shrink-0 p-1 rounded hover:bg-destructive/10 transition-colors"
                              onClick={() => handleRemoveMember(memberRow.id)}
                              title="Remover del ranking"
                            >
                              <UserMinus className="h-3.5 w-3.5 text-destructive" />
                            </button>
                          )}
                          <button
                            className="flex items-center gap-2 flex-1 min-w-0 text-left hover:bg-accent/50 rounded-md p-1 -m-1 transition-colors"
                            onClick={() => handleMemberTap(entry)}
                          >
                            <PositionBadge rank={entry.rank ?? idx + 1} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {toTitleCase(entry.display_name)}
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
          </>
        )}

        {/* === HANDICAP VIEW === */}
        {rankingView === 'handicap' && (
          <>
            {loadingHandicap ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : handicapEntries.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <Award className="h-10 w-10 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Sin datos de hándicap disponibles</p>
              </div>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>Jugador</span>
                    <span className="flex gap-4 text-xs text-muted-foreground">
                      <span className="w-12 text-center">HCP</span>
                      <span className="w-10 text-center">Prom</span>
                      <span className="w-10 text-center">Mejor</span>
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {handicapEntries.map((entry, idx) => (
                    <React.Fragment key={entry.profile_id}>
                      {idx > 0 && <Separator className="my-1.5" />}
                      <div className="flex items-center gap-2 py-1.5">
                        <PositionBadge rank={entry.rank ?? idx + 1} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {toTitleCase(entry.display_name)}
                            {entry.profile_id === profile?.id && (
                              <span className="text-xs text-muted-foreground ml-1">(tú)</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">{entry.rounds_played} {entry.rounds_played === 1 ? 'ronda' : 'rondas'}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1 w-12 justify-center">
                            <TrendIcon trend={entry.handicap_trend} />
                            <span className="text-sm font-semibold">{entry.current_handicap.toFixed(1)}</span>
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-center">
                            {entry.avg_gross_score ?? '—'}
                          </span>
                          <span className="text-xs text-muted-foreground w-10 text-center">
                            {entry.best_gross_score ?? '—'}
                          </span>
                        </div>
                      </div>
                    </React.Fragment>
                  ))}
                </CardContent>
              </Card>
            )}

            <p className="text-xs text-muted-foreground text-center">
              Promedio y mejor score basados en las últimas 20 rondas · Total de rondas jugadas
            </p>
          </>
        )}
      </div>

      {/* Dialog: Confirm delete ranking */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar ranking?</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Se eliminarán el ranking y todos sus miembros.
              Escribe <strong>ELIMINAR</strong> para confirmar.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="Escribe ELIMINAR"
            className="uppercase"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmText.toLowerCase() !== 'eliminar'}
              onClick={handleDelete}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Custom period picker */}
      <Dialog open={showCustomPeriod} onOpenChange={setShowCustomPeriod}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Período personalizado</DialogTitle>
            <DialogDescription>Selecciona las fechas de inicio y fin del período.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">Desde</Label>
              <Input type="date" value={customDateFrom} onChange={(e) => setCustomDateFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-sm">Hasta</Label>
              <Input type="date" value={customDateTo} onChange={(e) => setCustomDateTo(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomPeriod(false)}>Cancelar</Button>
            <Button disabled={!customDateFrom} onClick={applyCustomPeriod}>Aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{toTitleCase(p.display_name)}</p>
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
              {selectedEntry?.display_name ? toTitleCase(selectedEntry.display_name) : 'Jugador'}
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
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{toTitleCase(b.display_name)}</p>
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
