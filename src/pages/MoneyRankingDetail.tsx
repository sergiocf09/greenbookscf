import React, { useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useMoneyRankingDetail, useMoneyRankings } from '@/hooks/useMoneyRankings';
import type { RankingBalanceEntry, RankingPeriod } from '@/hooks/useMoneyRankings';
import { useHandicapRankingByIds } from '@/hooks/useHandicapRanking';
import { useLiveHandicap } from '@/hooks/useLiveHandicap';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  ArrowLeft, Loader2, TrendingUp, TrendingDown, UserPlus, UserMinus, Trash2, ChevronRight, Search, Minus, DollarSign, Award, CalendarRange, CalendarIcon, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { fmtMoney } from '@/lib/formatMoney';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import GreenBookLogo from '@/components/GreenBookLogo';
import { supabase } from '@/integrations/supabase/client';
import { HandicapRankingHeader } from '@/components/handicap/HandicapRankingHeader';
import { sortHandicapRankingEntries, withLiveHandicapOverride, type HandicapRankingSortKey, type HandicapRankingSortDirection } from '@/lib/handicapRankingUtils';
import { HandicapRankingRows } from '@/components/handicap/HandicapRankingRows';

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

const PositionBadge = ({ rank }: { rank: number }) => (
  <span className="text-xs font-bold text-muted-foreground w-6 text-center">{rank}</span>
);

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
  const [period, setPeriod] = useState<RankingPeriod>('year');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);
  const [showCustomPeriod, setShowCustomPeriod] = useState(false);
  const lastCustomFrom = useRef('');
  const lastCustomTo = useRef('');
  const [rankingView, setRankingView] = useState<RankingView>('money');
  const [showBilateral, setShowBilateral] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [handicapSortKey, setHandicapSortKey] = useState<HandicapRankingSortKey>('handicap');

  const {
    ranking, members, balances, bilateral, selectedMemberId,
    loadingDetail, loadingBalances, loadingBilateral,
    isCreator, fetchDetail, fetchBalances, selectMember,
  } = useMoneyRankingDetail(id ?? null, period, customDateFrom, customDateTo);

  const { addMember, leaveRanking, removeMember, deleteRanking } = useMoneyRankings();
  const { liveHandicapIndex } = useLiveHandicap(profile?.id ?? null, profile?.current_handicap ?? null);

  const { entries: handicapEntries, loading: loadingHandicap } = useHandicapRankingByIds(
    id ?? null,
    period,
    customDateFrom,
    customDateTo,
  );

  const selectedEntry = balances.find(b => b.profile_id === selectedMemberId);
  const memberProfileIds = useMemo(() => members.map(m => m.profile_id), [members]);
  const memberProfileIdSet = useMemo(() => new Set(memberProfileIds), [memberProfileIds]);
  const displayHandicapEntries = useMemo(
    () => sortHandicapRankingEntries(
      withLiveHandicapOverride(handicapEntries, profile?.id ?? null, liveHandicapIndex),
      handicapSortKey,
    ),
    [handicapEntries, handicapSortKey, liveHandicapIndex, profile?.id],
  );

  const handleMemberTap = (entry: RankingBalanceEntry) => {
    selectMember(entry.profile_id);
    setShowBilateral(true);
  };

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
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

  const handleRename = async () => {
    if (!id || !profile || !renameValue.trim()) return;

    setRenaming(true);
    const { error } = await supabase
      .from('money_rankings')
      .update({ name: renameValue.trim() })
      .eq('id', id)
      .eq('creator_id', profile.id);
    setRenaming(false);

    if (error) {
      toast.error(`No se pudo actualizar el nombre: ${error.message}`);
      return;
    }

    toast.success('Nombre del ranking actualizado');
    setShowRenameDialog(false);
    await fetchDetail();
  };

  const handlePeriodChange = (v: string) => {
    const val = v as RankingPeriod;
    if (val === 'custom') {
      if (lastCustomFrom.current) {
        setCustomDateFrom(lastCustomFrom.current);
        setCustomDateTo(lastCustomTo.current);
        setPeriod('custom');
      } else {
        setShowCustomPeriod(true);
      }
    } else {
      setPeriod(val);
    }
  };

  const applyCustomPeriod = () => {
    if (!customDateFrom) return;
    lastCustomFrom.current = customDateFrom;
    lastCustomTo.current = customDateTo;
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
        {isCreator && (
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                setRenameValue(ranking?.name ?? '');
                setShowRenameDialog(true);
              }}
            >
              <Pencil className="h-4 w-4 mr-1" /> Editar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => { setShowAddMember(true); setSearchQuery(''); setSearchResults([]); }}
            >
              <UserPlus className="h-4 w-4 mr-1" /> Agregar jugador
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => { setShowDeleteConfirm(true); setDeleteConfirmText(''); }}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Eliminar ranking
            </Button>
          </div>
        )}

        {!isCreator && (
          <Button variant="outline" size="sm" className="w-full" onClick={handleLeave}>
            <UserMinus className="h-4 w-4 mr-1" /> Salir del ranking
          </Button>
        )}

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
          <button
            className="text-xs text-muted-foreground text-center w-full hover:underline"
            onClick={() => setShowCustomPeriod(true)}
          >
            {customDateFrom} → {customDateTo || 'hoy'} · Editar
          </button>
        )}

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

        {rankingView === 'money' && (
          <>
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
                        <div className="flex items-center gap-1.5 py-1">
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
                              <p className="text-sm font-medium truncate leading-tight">
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

        {rankingView === 'handicap' && (
          <>
            {loadingHandicap ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : displayHandicapEntries.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <Award className="h-10 w-10 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Sin datos de hándicap disponibles</p>
              </div>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    <HandicapRankingHeader sortKey={handicapSortKey} onSortChange={setHandicapSortKey} />
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {displayHandicapEntries.map((entry, idx) => (
                    <React.Fragment key={entry.profile_id}>
                      {idx > 0 && <Separator className="my-1" />}
                      <div className="flex items-center gap-2 py-1">
                        <PositionBadge rank={entry.rank ?? idx + 1} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate leading-tight">
                            {toTitleCase(entry.display_name)}
                            {entry.profile_id === profile?.id && (
                              <span className="text-xs text-muted-foreground ml-1">(tú)</span>
                            )}
                          </p>
                          <p className="text-[11px] text-muted-foreground leading-tight">
                            {entry.rounds_played} {entry.rounds_played === 1 ? 'ronda' : 'rondas'}
                          </p>
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
              Promedio y mejor score de las últimas 20 rondas · Rondas del período seleccionado
            </p>
          </>
        )}
      </div>

      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar nombre del ranking</DialogTitle>
            <DialogDescription>Actualiza el nombre visible del ranking.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-ranking">Nombre</Label>
            <Input
              id="rename-ranking"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>Cancelar</Button>
            <Button disabled={!renameValue.trim() || renaming} onClick={handleRename}>
              {renaming && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <Dialog open={showCustomPeriod} onOpenChange={setShowCustomPeriod}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Período personalizado</DialogTitle>
            <DialogDescription>Selecciona las fechas de inicio y fin del período.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">Desde</Label>
              <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !customDateFrom && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customDateFrom ? format(new Date(customDateFrom + 'T12:00:00'), 'dd/MM/yyyy') : 'Seleccionar fecha'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customDateFrom ? new Date(customDateFrom + 'T12:00:00') : undefined}
                    onSelect={(d) => {
                      if (d) {
                        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        setCustomDateFrom(iso);
                      }
                      setDateFromOpen(false);
                    }}
                    disabled={(date) => date > new Date()}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-sm">Hasta</Label>
              <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !customDateTo && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customDateTo ? format(new Date(customDateTo + 'T12:00:00'), 'dd/MM/yyyy') : 'Hoy'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customDateTo ? new Date(customDateTo + 'T12:00:00') : undefined}
                    onSelect={(d) => {
                      if (d) {
                        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        setCustomDateTo(iso);
                      }
                      setDateToOpen(false);
                    }}
                    disabled={(date) => date > new Date() || (customDateFrom ? date < new Date(customDateFrom + 'T12:00:00') : false)}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Deja «Hasta» vacío para que sea hasta hoy.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomPeriod(false)}>Cancelar</Button>
            <Button disabled={!customDateFrom} onClick={applyCustomPeriod}>Aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
