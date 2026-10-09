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
  Star, CheckCircle, Clock, Share2, RefreshCw, Link2,
} from 'lucide-react';
import { LinkRoundToLeagueDialog } from '@/components/leaderboards/LinkRoundToLeagueDialog';
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
}

export const LeagueLeaderboardDetail: React.FC<Props> = ({ leaderboardId, onBack }) => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<any>(null);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [jornadas, setJornadas] = useState<JornadaSummary[]>([]);
  const [selectedTab, setSelectedTab] = useState<'standings' | 'jornadas' | 'detalle'>('standings');
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [grossByParticipant, setGrossByParticipant] = useState<Record<string, Record<string, number>>>({});
  const [netByParticipant, setNetByParticipant] = useState<Record<string, Record<string, number>>>({});
  const [roundDateMap, setRoundDateMap] = useState<Record<string, string>>({});

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
      const [eventRes, standingsRes] = await Promise.all([
        supabase.from('leaderboard_events').select('*').eq('id', leaderboardId).single(),
        supabase.rpc('get_league_accumulated_standings' as any, { p_leaderboard_id: leaderboardId }),
      ]);

      if (eventRes.error) throw eventRes.error;
      setEvent(eventRes.data);
      setStandings((((standingsRes as any).data as any[]) ?? []).map(r => ({ ...r, position: r.position_rank })));

      const { data: linkedRounds } = await supabase
        .from('leaderboard_rounds')
        .select('round_id, rounds(date)')
        .eq('leaderboard_id', leaderboardId);

      const dateSet = new Set<string>();
      const rDateMap: Record<string, string> = {};
      for (const lr of linkedRounds ?? []) {
        const d = (lr.rounds as any)?.date;
        if (d) {
          dateSet.add(d);
          rDateMap[(lr as any).round_id] = d;
        }
      }
      setRoundDateMap(rDateMap);

      // Gross scores per participant per round (for player detail history)
      const { data: scoreRows } = await supabase
        .from('leaderboard_scores')
        .select('participant_id, round_id, gross_total, net_total')
        .eq('leaderboard_id', leaderboardId);
      const grossMap: Record<string, Record<string, number>> = {};
      const netMap: Record<string, Record<string, number>> = {};
      for (const s of (scoreRows ?? []) as any[]) {
        if (s.gross_total != null) (grossMap[s.participant_id] ??= {})[s.round_id] = s.gross_total;
        if (s.net_total != null) (netMap[s.participant_id] ??= {})[s.round_id] = s.net_total;
      }
      setGrossByParticipant(grossMap);
      setNetByParticipant(netMap);

      const jornadasData: JornadaSummary[] = [];
      for (const date of [...dateSet].sort().reverse()) {
        const { data: jornadaResults } = await supabase.rpc('compute_league_jornada_standings' as any, {
          p_leaderboard_id: leaderboardId,
          p_jornada_date: date,
        });
        if (jornadaResults && (jornadaResults as any[]).length > 0) {
          jornadasData.push({ date, results: (jornadaResults as any[]).map(r => ({ ...r, position: r.position_rank })) as JornadaResult[] });
        }
      }
      setJornadas(jornadasData);
    } catch (err: any) {
      toast.error(trs("Error cargando liga: ") + err.message);
    } finally {
      setLoading(false);
    }
  }, [leaderboardId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleCloseLeague = async () => {
    if (!confirm(trs('¿Cerrar la liga? Los standings quedarán congelados.'))) return;
    const { error } = await supabase.rpc('close_leaderboard' as any, { p_leaderboard_id: leaderboardId });
    if (error) { toast.error(error.message); return; }
    toast.success(trs("Liga cerrada"));
    await fetchData();
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full min-w-0 max-w-full overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border shrink-0">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label={trs("Volver")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold truncate">{event?.name}</h1>
          <p className="text-xs text-muted-foreground truncate">
            {trs('Liga')} · {trs(scoringLabel)} · {trs(event?.status === 'completed' ? 'Cerrada' : 'Activa')}
          </p>
        </div>
        {event?.status !== 'completed' && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLinkDialogOpen(true)}
            aria-label={trs("Vincular ronda")}
            title={trs("Vincular ronda a la liga")}
          >
            <Link2 className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={handleShare} aria-label={trs("Compartir")}>
          <Share2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={refreshing} aria-label={trs("Refrescar")}>
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
        </Button>
      </div>

      {/* Info chips */}
      <div className="flex flex-wrap gap-2 px-3 py-2 border-b border-border shrink-0">
        <Badge variant="outline" className="gap-1">
          <Hash className="h-3 w-3" />
          {event?.code}
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Calendar className="h-3 w-3" />
           {trs('Hasta')} {event?.end_date ? format(parseISO(event.end_date), 'dd/MM/yyyy') : '—'}
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
      </div>

      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as any)} className="flex-1 flex flex-col min-h-0 min-w-0">
        <TabsList className="grid grid-cols-3 mx-3 mt-2 shrink-0">
          <TabsTrigger value="standings">{trs("Standings")}</TabsTrigger>
          <TabsTrigger value="jornadas">{trs("Jornadas")}</TabsTrigger>
          <TabsTrigger value="detalle">{trs("Detalle")}</TabsTrigger>
        </TabsList>

        {/* TAB: STANDINGS */}
        <TabsContent value="standings" className="flex-1 min-h-0 mt-2">
          <ScrollArea className="h-full w-full px-3 pb-4 [&>div>div]:!block">
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
          </ScrollArea>
        </TabsContent>

        {/* TAB: JORNADAS */}
        <TabsContent value="jornadas" className="flex-1 min-h-0 mt-2">
          <ScrollArea className="h-full w-full px-3 pb-4 [&>div>div]:!block">
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
          </ScrollArea>
        </TabsContent>

        {/* TAB: DETALLE POR JUGADOR */}
        <TabsContent value="detalle" className="flex-1 min-h-0 mt-2">
          <ScrollArea className="h-full w-full px-3 pb-4 [&>div>div]:!block">
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
                               ? selectedStanding.points_acumulados
                              : selectedStanding.score_cuenta}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-1">
                            {rules.scoring_system === 'points' ? <>{trs('Total')} {trs('Puntos')}</> : summaryLabel}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Historial de jornadas del jugador */}
                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                      <div className="px-3 py-2 border-b border-border bg-muted/40 text-sm font-semibold flex items-center gap-2">
                        <Star className="h-4 w-4 text-primary" />
                        {trs("Historial de jornadas")}
                      </div>
                      {participantJornadas.length === 0 && (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          {trs("Sin jornadas registradas.")}
                        </div>
                      )}
                      {participantJornadas.length > 0 && (
                        <table className="w-full table-fixed text-xs tabular-nums">
                          <colgroup>
                            <col className="w-[28%]" />
                            <col className="w-[18%]" />
                            <col className="w-[18%]" />
                            <col className="w-[18%]" />
                            <col className="w-[18%]" />
                          </colgroup>
                          <thead>
                            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                              <th className="text-left font-medium px-2 py-1.5">{trs('Fecha')}</th>
                              <th className="text-center font-medium px-1 py-1.5">{trs('Lugar')}</th>
                              <th className="text-right font-medium px-1 py-1.5">
                                {rules.scoring_system === 'points' ? trs('Puntos') : trs(scoringLabel)}
                              </th>
                              <th className="text-right font-medium px-1 py-1.5">{trs('Gross')}</th>
                              <th className="text-right font-medium px-2 py-1.5">{trs('Neto')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {participantJornadas.map((j) => (
                              <tr key={j.date}>
                                <td className="px-2 py-2">
                                  <div className="whitespace-nowrap">{format(parseISO(j.date), i18n.language === 'en' ? 'MMM d' : 'd MMM', { locale: i18n.language === 'en' ? enUS : es })}</div>
                                  <div className="text-[10px] text-muted-foreground">{format(parseISO(j.date), 'yyyy')}</div>
                                </td>
                                <td className="text-center px-1">
                                  <span className={cn('font-bold', positionColor(j.result.position))}>
                                    {j.result.position}°
                                  </span>
                                </td>
                                <td className="text-right px-1">
                                  {j.result.points_earned !== null && j.result.points_earned !== undefined ? (
                                    <span className="text-primary font-semibold">{j.result.points_earned}</span>
                                  ) : (
                                    <span className="font-semibold">
                                      {j.result.score_value > 0 ? '+' : ''}{j.result.score_value}
                                    </span>
                                  )}
                                </td>
                                <td className="text-right px-1 text-muted-foreground tabular-nums">
                                  {j.gross ?? '—'}
                                </td>
                                <td className="text-right px-2 text-muted-foreground tabular-nums">
                                  {j.net ?? '—'}
                                </td>
                              </tr>
                            ))}
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
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Footer acciones del creador */}
      {isCreator && event?.status === 'active' && (
        <div className="p-3 border-t border-border shrink-0">
          <Button variant="destructive" className="w-full" onClick={handleCloseLeague}>
            {trs("Cerrar liga y congelar standings")}
          </Button>
        </div>
      )}

      <LinkRoundToLeagueDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        leaderboardId={leaderboardId}
        onLinked={fetchData}
      />
    </div>
  );
};
