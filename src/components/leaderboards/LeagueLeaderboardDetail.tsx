import { trs } from '@/i18n/tr';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { enUS, es } from 'date-fns/locale';
import i18n from '@/i18n';
import {
  ArrowLeft, Trophy, Calendar, Users, Hash, Loader2,
  Star, CheckCircle, CheckCircle2, Clock, Share2, RefreshCw, Link2, Settings,
} from 'lucide-react';
import { LinkRoundToLeagueDialog } from '@/components/leaderboards/LinkRoundToLeagueDialog';
import { EditLeagueConfigDialog } from '@/components/leaderboards/EditLeagueConfigDialog';
import { LeagueRoundsTab } from '@/components/leaderboards/LeagueRoundsTab';
import type { LeagueAuditEntry, LeagueLinkedRound } from '@/lib/leagueRoundsAudit';
import { computeCountedJornadaDates } from '@/lib/leagueCountedRounds';
import { toast } from 'sonner';
import type { LeagueRulesJson } from '@/components/leaderboards/CreateLeagueDialog';

interface StandingRow {
  participant_id: string;
  display_name: string;
  initials: string;
  avatar_color: string;
  jornadas_jugadas: number;
  score_acumulado: number;
  score_cuenta: number;
  points_acumulados: number;
  points_cuenta: number;
  position: number;
  qualifies: boolean;
}

interface JornadaResult {
  participant_id: string;
  display_name: string;
  score_value: number;
  position: number;
  points_earned: number | null;
}

interface JornadaSummary {
  date: string;
  results: JornadaResult[];
}

interface Props {
  leaderboardId: string;
  onBack?: () => void;
  inline?: boolean;
}

export const LeagueLeaderboardDetail: React.FC<Props> = ({ leaderboardId, onBack, inline = false }) => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<any>(null);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [jornadas, setJornadas] = useState<JornadaSummary[]>([]);
  const [selectedTab, setSelectedTab] = useState<'standings' | 'jornadas' | 'detalle' | 'rondas'>('standings');
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [editConfigOpen, setEditConfigOpen] = useState(false);
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [grossByParticipant, setGrossByParticipant] = useState<Record<string, Record<string, number>>>({});
  const [netByParticipant, setNetByParticipant] = useState<Record<string, Record<string, number>>>({});
  const [roundDateMap, setRoundDateMap] = useState<Record<string, string>>({});
  const [linkedRounds, setLinkedRounds] = useState<LeagueLinkedRound[]>([]);
  const [roundsLoading, setRoundsLoading] = useState(false);
  const [roundsError, setRoundsError] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<LeagueAuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditLoadingMore, setAuditLoadingMore] = useState(false);

  const isCreator = event?.created_by === profile?.id;

  const rules: LeagueRulesJson = event?.rules_json ?? {
    scoring_system: 'points',
    score_basis: 'net',
    aggregation: 'sum',
    best_n: null,
    min_rounds_to_qualify: 0,
    points_per_position: [],
    period_months: 6,
    allow_open_join: true,
  };

  const scoringLabel =
    rules.scoring_system === 'points'
      ? 'Puntos'
      : rules.scoring_system === 'strokes'
        ? (rules.score_basis === 'gross' ? 'Gross' : 'Neto')
        : 'Stableford';

  const fetchData = useCallback(async () => {
    try {
      const [eventRes, standingsRes, linkedRes, scoresRes] = await Promise.all([
        supabase.from('leaderboard_events').select('*').eq('id', leaderboardId).single(),
        supabase.rpc('get_league_accumulated_standings' as any, { p_leaderboard_id: leaderboardId }),
        supabase.rpc('get_league_linked_rounds', { p_leaderboard_id: leaderboardId }),
        supabase
          .from('leaderboard_scores')
          .select('participant_id, round_id, gross_total, net_total, holes_played')
          .eq('leaderboard_id', leaderboardId),
      ]);

      if (eventRes.error) throw eventRes.error;
      setEvent(eventRes.data);
      setStandings((((standingsRes as any).data as any[]) ?? []).map(r => ({ ...r, position: r.position_rank })));

      const dateSet = new Set<string>();
      const rDateMap: Record<string, string> = {};
      for (const lr of ((linkedRes.data ?? []) as unknown as LeagueLinkedRound[])) {
        if (lr.date) {
          dateSet.add(lr.date);
          rDateMap[lr.round_id] = lr.date;
        }
      }
      setRoundDateMap(rDateMap);

      // Gross scores per participant per round (for player detail history)
      const grossMap: Record<string, Record<string, number>> = {};
      const netMap: Record<string, Record<string, number>> = {};
      for (const s of (scoresRes.data ?? []) as any[]) {
        if ((s.holes_played ?? 0) < 9) continue;
        if (s.gross_total != null) (grossMap[s.participant_id] ??= {})[s.round_id] = s.gross_total;
        if (s.net_total != null) (netMap[s.participant_id] ??= {})[s.round_id] = s.net_total;
      }
      setGrossByParticipant(grossMap);
      setNetByParticipant(netMap);

      const sortedDates = [...dateSet].sort().reverse();
      const jornadaResponses = await Promise.all(
        sortedDates.map(async (date) => {
          const { data: jornadaResults } = await supabase.rpc('compute_league_jornada_standings' as any, {
            p_leaderboard_id: leaderboardId,
            p_jornada_date: date,
          });
          return { date, jornadaResults };
        }),
      );
      const jornadasData: JornadaSummary[] = [];
      for (const { date, jornadaResults } of jornadaResponses) {
        if (jornadaResults && (jornadaResults as any[]).length > 0) {
          jornadasData.push({
            date,
            results: (jornadaResults as any[]).map(r => ({ ...r, position: r.position_rank })) as JornadaResult[],
          });
        }
      }
      setJornadas(jornadasData);
    } catch (err: any) {
      toast.error(trs("Error cargando liga: ") + err.message);
    } finally {
      setLoading(false);
    }
  }, [leaderboardId]);

  const fetchLinkedRounds = useCallback(async () => {
    setRoundsLoading(true);
    setRoundsError(null);
    try {
      const { data, error } = await supabase.rpc('get_league_linked_rounds', {
        p_leaderboard_id: leaderboardId,
      });
      if (error) throw error;
      setLinkedRounds((data ?? []) as unknown as LeagueLinkedRound[]);
    } catch (err: any) {
      setRoundsError(err.message ?? trs('Error cargando rondas ligadas'));
    } finally {
      setRoundsLoading(false);
    }
  }, [leaderboardId]);

  const AUDIT_PAGE_SIZE = 20;

  const fetchAuditLog = useCallback(
    async (offset = 0, append = false) => {
      if (append) setAuditLoadingMore(true);
      else setAuditLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_league_audit_log', {
          p_leaderboard_id: leaderboardId,
          p_limit: AUDIT_PAGE_SIZE + 1,
          p_offset: offset,
        });
        if (error) throw error;
        const rows = (data ?? []) as unknown as LeagueAuditEntry[];
        const hasMore = rows.length > AUDIT_PAGE_SIZE;
        const page = hasMore ? rows.slice(0, AUDIT_PAGE_SIZE) : rows;
        setAuditHasMore(hasMore);
        setAuditEntries((prev) => (append ? [...prev, ...page] : page));
      } catch {
        if (!append) setAuditEntries([]);
      } finally {
        setAuditLoading(false);
        setAuditLoadingMore(false);
      }
    },
    [leaderboardId],
  );

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchData(), fetchLinkedRounds(), fetchAuditLog(0, false)]);
  }, [fetchData, fetchLinkedRounds, fetchAuditLog]);

  useEffect(() => {
    fetchData();
    fetchLinkedRounds();
    fetchAuditLog(0, false);
  }, [fetchData, fetchLinkedRounds, fetchAuditLog]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  const handleCloseLeague = async () => {
    if (!confirm(trs('¿Cerrar la liga? Los standings quedarán congelados.'))) return;
    const { error } = await supabase.rpc('close_leaderboard' as any, { p_leaderboard_id: leaderboardId });
    if (error) { toast.error(error.message); return; }
    toast.success(trs("Liga cerrada"));
    await refreshAll();
  };

  const handleShare = async () => {
    const code = event?.code;
    if (!code) return;
    const text = `Únete a la liga "${event?.name}" en GreenBook CF con el código: ${code}`;
    if ((navigator as any).share) {
      await (navigator as any).share({ text }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(text);
      toast.success(trs("Código copiado"));
    }
  };

  const positionColor = (pos: number) => {
    if (pos === 1) return 'text-yellow-500';
    if (pos === 2) return 'text-slate-400';
    if (pos === 3) return 'text-amber-600';
    return 'text-muted-foreground';
  };

  const displayedStandings = useMemo(() => {
    const higherIsBetter = rules.scoring_system === 'points' || rules.scoring_system === 'stableford' || rules.score_basis === 'stableford';
    const val = (r: StandingRow) => Number(rules.scoring_system === 'points' ? r.points_cuenta : r.score_cuenta) || 0;
    const rows = (eligibleOnly ? standings.filter(r => r.qualifies) : [...standings])
      .sort((a, b) => higherIsBetter ? val(b) - val(a) : val(a) - val(b));
    let lastVal: number | null = null; let lastPos = 0;
    return rows.map((r, i) => {
      const v = val(r);
      if (lastVal === null || v !== lastVal) { lastPos = i + 1; lastVal = v; }
      return { ...r, position: lastPos };
    });
  }, [standings, eligibleOnly, rules]);

  const selectedStanding = standings.find(s => s.participant_id === selectedParticipant);
  const participantJornadas = useMemo(() => {
    if (!selectedParticipant) return [];
    const grossByRound = grossByParticipant[selectedParticipant] ?? {};
    const netByRound = netByParticipant[selectedParticipant] ?? {};
    return jornadas
      .map(j => {
        const result = j.results.find(r => r.participant_id === selectedParticipant);
        if (!result) return null;
        const gross = Object.entries(roundDateMap)
          .filter(([, d]) => d === j.date)
          .reduce((acc, [rid]) => acc + (grossByRound[rid] ?? 0), 0);
        const netValues = Object.entries(roundDateMap)
          .filter(([, d]) => d === j.date)
          .flatMap(([rid]) => netByRound[rid] == null ? [] : [netByRound[rid]]);
        const net = netValues.length ? netValues.reduce((sum, value) => sum + value, 0) : null;
        return { date: j.date, result, gross: gross > 0 ? gross : null as number | null, net };
      })
      .filter(Boolean) as { date: string; result: JornadaResult; gross: number | null; net: number | null }[];
  }, [jornadas, selectedParticipant, grossByParticipant, netByParticipant, roundDateMap]);

  const countedInfo = useMemo(
    () =>
      computeCountedJornadaDates(
        participantJornadas.map((j) => ({
          date: j.date,
          pointsEarned: j.result.points_earned,
          scoreValue: j.result.score_value,
        })),
        rules,
      ),
    [participantJornadas, rules],
  );

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center', inline ? 'py-16' : 'min-h-screen')}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const wrapTabBody = (children: React.ReactNode) =>
    inline ? (
      <div className="pb-4">{children}</div>
    ) : (
      <ScrollArea className="h-full w-full px-3 pb-4 [&>div>div]:!block">{children}</ScrollArea>
    );

  return (
    <div
      className={cn(
        'flex flex-col w-full min-w-0 max-w-full',
        inline ? 'space-y-2' : 'h-screen overflow-hidden bg-background',
      )}
    >
      {/* Header */}
      <div className={cn('flex items-center gap-2 border-b border-border shrink-0', inline ? 'pb-2' : 'p-3')}>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onBack} aria-label={trs("Volver")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold truncate">{event?.name}</h1>
          <p className="text-xs text-muted-foreground truncate">
            {trs('Liga')} · {trs(scoringLabel)} · {trs(event?.status === 'completed' ? 'Cerrada' : 'Activa')}
          </p>
        </div>
        {isCreator && event?.status !== 'completed' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setEditConfigOpen(true)}
            aria-label={trs("Editar configuración")}
            title={trs("Editar configuración")}
          >
            <Settings className="h-4 w-4" />
          </Button>
        )}
        {event?.status !== 'completed' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setLinkDialogOpen(true)}
            aria-label={trs("Vincular ronda")}
            title={trs("Vincular ronda a la liga")}
          >
            <Link2 className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleShare} aria-label={trs("Compartir")}>
          <Share2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleRefresh} disabled={refreshing} aria-label={trs("Refrescar")}>
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
        </Button>
      </div>

      {/* Info chips */}
      <div className={cn('flex flex-wrap items-center justify-center gap-1.5 border-b border-border shrink-0', inline ? 'pb-2' : 'px-3 py-2')}>
        <Badge variant="outline">{trs(rules.handicap_mode === 'per_round' ? 'HCP por ronda' : 'HCP fijo')}</Badge>
        <Badge variant="outline" className="gap-1">
          <Hash className="h-3 w-3" />
          {event?.code}
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Calendar className="h-3 w-3" />
          {event?.start_date && event?.end_date
            ? `${format(parseISO(event.start_date), 'dd/MM/yy')} – ${format(parseISO(event.end_date), 'dd/MM/yy')}`
            : `${trs('Hasta')} ${event?.end_date ? format(parseISO(event.end_date), 'dd/MM/yyyy') : '—'}`}
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Users className="h-3 w-3" />
           {standings.length} {trs('participantes')}
        </Badge>
        {rules.min_rounds_to_qualify > 0 && (
          <Badge variant="outline" className="gap-1">
            <CheckCircle className="h-3 w-3" />
             {trs('Mín.')} {rules.min_rounds_to_qualify} {trs('jornadas')}
          </Badge>
        )}
        {rules.aggregation === 'best_n' && rules.best_n && (
          <Badge variant="outline" className="gap-1">
            <Star className="h-3 w-3" />
            {trs('Mejores')} {rules.best_n}
          </Badge>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        value={selectedTab}
        onValueChange={(v) => setSelectedTab(v as any)}
        className={cn('flex flex-col min-w-0', !inline && 'flex-1 min-h-0')}
      >
        <TabsList className={cn('grid grid-cols-4 shrink-0', inline ? 'mt-0' : 'mx-3 mt-2')}>
          <TabsTrigger value="standings" className="text-xs px-1.5 truncate">{trs("Standings")}</TabsTrigger>
          <TabsTrigger value="jornadas" className="text-xs px-1.5 truncate">{trs("Jornadas")}</TabsTrigger>
          <TabsTrigger value="detalle" className="text-xs px-1.5 truncate">{trs("Detalle")}</TabsTrigger>
          <TabsTrigger value="rondas" className="text-xs px-1.5 truncate">{trs("Rondas")}</TabsTrigger>
        </TabsList>

        {/* TAB: STANDINGS */}
        <TabsContent value="standings" className={cn('mt-2', !inline && 'flex-1 min-h-0')}>
          {wrapTabBody(
            <div className="space-y-2">
              {rules.min_rounds_to_qualify > 0 && standings.length > 0 && (
                <div className="flex gap-1 p-1 bg-muted rounded-lg">
                  <button onClick={() => setEligibleOnly(false)} className={cn('flex-1 text-xs py-1.5 rounded-md font-medium', !eligibleOnly ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
                    {trs("Actuales (todos)")}
                  </button>
                  <button onClick={() => setEligibleOnly(true)} className={cn('flex-1 text-xs py-1.5 rounded-md font-medium', eligibleOnly ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
                    {trs("Solo elegibles")}
                  </button>
                </div>
              )}
              {eligibleOnly && displayedStandings.length === 0 && standings.length > 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">
                  {trs("Aún nadie cumple el mínimo de jornadas para ser elegible.")}
                </div>
              )}
              {standings.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">
                  {trs("Sin jornadas registradas aún. Vincula rondas para ver los standings.")}
                </div>
              )}
              {displayedStandings.map(row => (
                <button
                  key={row.participant_id}
                  onClick={() => { setSelectedParticipant(row.participant_id); setSelectedTab('detalle'); }}
                  className="w-full flex items-center gap-3 p-3 bg-card border border-border rounded-xl hover:bg-muted/40 transition-colors text-left"
                >
                  <div className={cn('w-8 text-center text-lg font-bold', positionColor(row.position))}>
                    {row.position}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{row.display_name}</div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                       <span>{row.jornadas_jugadas} {trs(row.jornadas_jugadas === 1 ? 'jornada' : 'jornadas')}</span>
                      {!row.qualifies && rules.min_rounds_to_qualify > 0 && (
                        <span className="flex items-center gap-1 text-amber-600">
                          <Clock className="h-3 w-3" />
                          {trs("No clasifica aún")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-base font-bold">
                      {rules.scoring_system === 'points'
                        ? `${row.points_cuenta} pts`
                        : rules.scoring_system === 'stableford'
                          ? `${row.score_cuenta} pts`
                          : row.score_cuenta > 0 ? `+${row.score_cuenta}` : `${row.score_cuenta}`}
                    </div>
                    {rules.aggregation === 'best_n' && rules.best_n && (
                      <div className="text-[10px] text-muted-foreground">{trs("mejor")}{' '}{rules.best_n}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TAB: JORNADAS */}
        <TabsContent value="jornadas" className={cn('mt-2', !inline && 'flex-1 min-h-0')}>
          {wrapTabBody(
            <div className="space-y-4">
              {jornadas.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">
                  {trs("Sin jornadas registradas aún.")}
                </div>
              )}
              {jornadas.map((jornada, idx) => (
                <div key={jornada.date} className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
                    <Trophy className="h-4 w-4 text-primary" />
                    <div className="text-sm font-semibold">
                       {trs('Jornada')} {jornadas.length - idx} — {format(parseISO(jornada.date), i18n.language === 'en' ? 'MMMM d, yyyy' : "d 'de' MMMM yyyy", { locale: i18n.language === 'en' ? enUS : es })}
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    {jornada.results.map(result => (
                      <div key={result.participant_id} className="flex items-center gap-2 px-3 py-1.5">
                        <div className={cn('w-6 shrink-0 text-center text-sm font-bold', positionColor(result.position))}>
                          {result.position}
                        </div>
                        <div className="flex-1 min-w-0 text-sm truncate">{result.display_name}</div>
                        <div className="flex shrink-0 items-baseline gap-2">
                          <span className="text-sm font-semibold tabular-nums">
                            {result.score_value > 0 ? '+' : ''}{result.score_value}
                          </span>
                          {result.points_earned !== null && (
                            <span className="text-[11px] text-primary font-medium tabular-nums">
                              {result.points_earned} {trs('pts')}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TAB: DETALLE POR JUGADOR */}
        <TabsContent value="detalle" className={cn('mt-2', !inline && 'flex-1 min-h-0')}>
          {wrapTabBody(
            <div className="space-y-4">
              {/* Selector de jugador */}
              <div className="flex w-full min-w-0 max-w-full gap-2 overflow-x-auto pb-1">
                {standings.map(row => (
                  <button
                    key={row.participant_id}
                    onClick={() => setSelectedParticipant(row.participant_id)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium shrink-0 transition-colors',
                      selectedParticipant === row.participant_id
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted text-muted-foreground border-border'
                    )}
                  >
                    <span className="font-bold">{row.initials}</span>
                    {row.display_name.split(' ')[0]}
                  </button>
                ))}
              </div>

              {selectedStanding && (() => {
                const displayed = displayedStandings.find(d => d.participant_id === selectedStanding.participant_id) ?? selectedStanding;
                const summaryLabel = rules.scoring_system === 'points' || rules.scoring_system === 'stableford'
                  ? trs('pts')
                  : trs(scoringLabel);
                return (
                  <>
                    {/* Resumen compacto: posición y jornadas en un mismo renglón */}
                    <div className="bg-card border border-border rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <PlayerAvatar initials={selectedStanding.initials} background={selectedStanding.avatar_color} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold break-words">{selectedStanding.display_name}</div>
                          <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                            <span className={cn('font-bold text-sm', positionColor(displayed.position))}>
                              {displayed.position}°
                            </span>
                            <span>{trs('de')} {displayedStandings.length}</span>
                            <span className="text-border">·</span>
                            <span>
                              {selectedStanding.jornadas_jugadas}{' '}
                              {trs(selectedStanding.jornadas_jugadas === 1 ? 'jornada' : 'jornadas')}
                            </span>
                            {!selectedStanding.qualifies && rules.min_rounds_to_qualify > 0 && (
                              <>
                                <span className="text-border">·</span>
                                <span className="flex items-center gap-1 text-amber-600">
                                  <Clock className="h-3 w-3" />
                                  {trs('Faltan')} {rules.min_rounds_to_qualify - selectedStanding.jornadas_jugadas}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xl font-bold leading-none">
                            {rules.scoring_system === 'points'
                              ? selectedStanding.points_cuenta
                              : rules.scoring_system === 'strokes' && selectedStanding.score_cuenta > 0
                                ? `+${selectedStanding.score_cuenta}`
                                : selectedStanding.score_cuenta}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-1">
                            {rules.aggregation === 'best_n' && rules.best_n
                              ? <>{trs('Mejores')} {rules.best_n}</>
                              : rules.scoring_system === 'points'
                                ? <>{trs('Total')} {trs('Puntos')}</>
                                : summaryLabel}
                          </div>
                          {rules.aggregation === 'best_n' && rules.best_n && selectedStanding.jornadas_jugadas > rules.best_n && (
                            <div className="text-[10px] text-muted-foreground">
                              {trs('Total')}:{' '}
                              {rules.scoring_system === 'points'
                                ? `${selectedStanding.points_acumulados} ${trs('pts')}`
                                : rules.scoring_system === 'strokes' && selectedStanding.score_acumulado > 0
                                  ? `+${selectedStanding.score_acumulado}`
                                  : selectedStanding.score_acumulado}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Historial de jornadas del jugador */}
                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                      <div className="px-3 py-2 border-b border-border bg-muted/40 flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold flex items-center gap-2 min-w-0">
                          <Star className="h-4 w-4 text-primary shrink-0" />
                          <span className="truncate">{trs("Historial de jornadas")}</span>
                        </div>
                        {countedInfo.isBestN && (
                          <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 shrink-0">
                            {countedInfo.countedCount} {trs('de')} {countedInfo.totalCount} {trs('cuentan')}
                          </span>
                        )}
                      </div>
                      {participantJornadas.length === 0 && (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          {trs("Sin jornadas registradas.")}
                        </div>
                      )}
                      {participantJornadas.length > 0 && (
                        <table className="w-full table-fixed text-xs tabular-nums">
                          <colgroup>
                            <col className="w-[32%]" />
                            <col className="w-[17%]" />
                            <col className="w-[17%]" />
                            <col className="w-[17%]" />
                            <col className="w-[17%]" />
                          </colgroup>
                          <thead>
                            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                              <th className="text-left font-medium px-2 py-1.5">{trs('Fecha')}</th>
                              <th className="text-center font-medium px-1 py-1.5">{trs('Lugar')}</th>
                              <th className="text-center font-medium px-1 py-1.5">
                                {rules.scoring_system === 'points' ? trs('Puntos') : trs(scoringLabel)}
                              </th>
                              <th className="text-center font-medium px-1 py-1.5">{trs('Gross')}</th>
                              <th className="text-center font-medium px-2 py-1.5">{trs('Neto')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {participantJornadas.map((j) => {
                              const counts = !countedInfo.isBestN || countedInfo.countedDates.has(j.date);
                              return (
                              <tr key={j.date} className={cn(!counts && 'bg-muted/30 text-muted-foreground')}>
                                <td className="px-2 py-2">
                                  <div className="flex items-start gap-1">
                                    {countedInfo.isBestN && (
                                      counts ? (
                                        <CheckCircle2
                                          className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                                          aria-label={trs('Cuenta en standings')}
                                        />
                                      ) : (
                                        <span
                                          className="inline-block h-3.5 w-3.5 shrink-0 mt-0.5 text-center text-[10px] leading-3 text-muted-foreground"
                                          aria-label={trs('No cuenta')}
                                        >
                                          –
                                        </span>
                                      )
                                    )}
                                    <div className="min-w-0">
                                      <div className="whitespace-nowrap">{format(parseISO(j.date), i18n.language === 'en' ? 'MMM d' : 'd MMM', { locale: i18n.language === 'en' ? enUS : es })}</div>
                                      <div className="text-[10px] text-muted-foreground">
                                        {format(parseISO(j.date), 'yyyy')}
                                        {!counts && ` · ${trs('No cuenta')}`}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="text-center px-1">
                                  <span className={cn('font-bold', counts ? positionColor(j.result.position) : 'text-muted-foreground')}>
                                    {j.result.position}°
                                  </span>
                                </td>
                                <td className="text-center px-1">
                                  {j.result.points_earned !== null && j.result.points_earned !== undefined ? (
                                    <span className={cn('font-semibold', counts ? 'text-primary' : 'text-muted-foreground line-through')}>
                                      {j.result.points_earned}
                                    </span>
                                  ) : (
                                    <span className={cn('font-semibold', !counts && 'text-muted-foreground line-through')}>
                                      {j.result.score_value > 0 ? '+' : ''}{j.result.score_value}
                                    </span>
                                  )}
                                </td>
                                <td className="text-center px-1 text-muted-foreground tabular-nums">
                                  {j.gross ?? '—'}
                                </td>
                                <td className="text-center px-2 text-muted-foreground tabular-nums">
                                  {j.net ?? '—'}
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </>
                );
              })()}

              {!selectedParticipant && (
                <div className="text-center text-sm text-muted-foreground py-8">
                  {trs("Selecciona un jugador para ver su detalle.")}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* TAB: RONDAS */}
        <TabsContent value="rondas" className={cn('mt-2', !inline && 'flex-1 min-h-0')}>
          <LeagueRoundsTab
            leaderboardId={leaderboardId}
            isCreator={isCreator}
            isCompleted={event?.status === 'completed'}
            inline={inline}
            savedMinPlayers={rules.min_players_per_round}
            rounds={linkedRounds}
            roundsLoading={roundsLoading}
            roundsError={roundsError}
            onRetryRounds={fetchLinkedRounds}
            auditEntries={auditEntries}
            auditLoading={auditLoading}
            auditHasMore={auditHasMore}
            auditLoadingMore={auditLoadingMore}
            onLoadMoreAudit={() => fetchAuditLog(auditEntries.length, true)}
            onOpenLinkDialog={() => setLinkDialogOpen(true)}
            onAfterMutation={refreshAll}
          />
        </TabsContent>
      </Tabs>

      {/* Footer acciones del creador */}
      {isCreator && event?.status === 'active' && (
        <div className={cn('border-t border-border shrink-0', inline ? 'pt-3 pb-2' : 'p-3')}>
          <Button variant="destructive" className="w-full" onClick={handleCloseLeague}>
            {trs("Cerrar liga y congelar standings")}
          </Button>
        </div>
      )}

      <LinkRoundToLeagueDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        leaderboardId={leaderboardId}
        onLinked={refreshAll}
      />

      {event && (
        <EditLeagueConfigDialog
          open={editConfigOpen}
          onOpenChange={setEditConfigOpen}
          event={{
            id: event.id,
            name: event.name,
            description: event.description,
            start_date: event.start_date,
            end_date: event.end_date,
            scoring_modes: event.scoring_modes || ['gross', 'net'],
            rules_json: event.rules_json || {},
          }}
          onSaved={refreshAll}
        />
      )}
    </div>
  );
};
