import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowLeft, Trophy, Calendar, Users, Hash, Loader2,
  Star, CheckCircle, Clock, Share2, RefreshCw,
} from 'lucide-react';
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
      setStandings(((standingsRes as any).data as StandingRow[]) ?? []);

      const { data: linkedRounds } = await supabase
        .from('leaderboard_rounds')
        .select('round_id, rounds(date)')
        .eq('leaderboard_id', leaderboardId);

      const dateSet = new Set<string>();
      for (const lr of linkedRounds ?? []) {
        const d = (lr.rounds as any)?.date;
        if (d) dateSet.add(d);
      }

      const jornadasData: JornadaSummary[] = [];
      for (const date of [...dateSet].sort().reverse()) {
        const { data: jornadaResults } = await supabase.rpc('compute_league_jornada_standings' as any, {
          p_leaderboard_id: leaderboardId,
          p_jornada_date: date,
        });
        if (jornadaResults && (jornadaResults as any[]).length > 0) {
          jornadasData.push({ date, results: jornadaResults as JornadaResult[] });
        }
      }
      setJornadas(jornadasData);
    } catch (err: any) {
      toast.error('Error cargando liga: ' + err.message);
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
    if (!confirm('¿Cerrar la liga? Los standings quedarán congelados.')) return;
    const { error } = await supabase.rpc('close_leaderboard' as any, { p_leaderboard_id: leaderboardId });
    if (error) { toast.error(error.message); return; }
    toast.success('Liga cerrada');
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
      toast.success('Código copiado');
    }
  };

  const positionColor = (pos: number) => {
    if (pos === 1) return 'text-yellow-500';
    if (pos === 2) return 'text-slate-400';
    if (pos === 3) return 'text-amber-600';
    return 'text-muted-foreground';
  };

  const selectedStanding = standings.find(s => s.participant_id === selectedParticipant);
  const participantJornadas = jornadas
    .map(j => ({ date: j.date, result: j.results.find(r => r.participant_id === selectedParticipant) }))
    .filter(j => j.result);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border shrink-0">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold truncate">{event?.name}</h1>
          <p className="text-xs text-muted-foreground truncate">
            Liga · {scoringLabel} · {event?.status === 'completed' ? 'Cerrada' : 'Activa'}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={handleShare} aria-label="Compartir">
          <Share2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={refreshing} aria-label="Refrescar">
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
          Hasta {event?.end_date ? format(parseISO(event.end_date), 'dd/MM/yyyy') : '—'}
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Users className="h-3 w-3" />
          {standings.length} participantes
        </Badge>
        {rules.min_rounds_to_qualify > 0 && (
          <Badge variant="outline" className="gap-1">
            <CheckCircle className="h-3 w-3" />
            Mín. {rules.min_rounds_to_qualify} jornadas
          </Badge>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as any)} className="flex-1 flex flex-col min-h-0">
        <TabsList className="grid grid-cols-3 mx-3 mt-2 shrink-0">
          <TabsTrigger value="standings">Standings</TabsTrigger>
          <TabsTrigger value="jornadas">Jornadas</TabsTrigger>
          <TabsTrigger value="detalle">Detalle</TabsTrigger>
        </TabsList>

        {/* TAB: STANDINGS */}
        <TabsContent value="standings" className="flex-1 min-h-0 mt-2">
          <ScrollArea className="h-full px-3 pb-4">
            <div className="space-y-2">
              {standings.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">
                  Sin jornadas registradas aún. Vincula rondas para ver los standings.
                </div>
              )}
              {standings.map(row => (
                <button
                  key={row.participant_id}
                  onClick={() => { setSelectedParticipant(row.participant_id); setSelectedTab('detalle'); }}
                  className="w-full flex items-center gap-3 p-3 bg-card border border-border rounded-xl hover:bg-muted/40 transition-colors text-left"
                >
                  <div className={cn('w-8 text-center text-lg font-bold', positionColor(row.position))}>
                    {row.position}
                  </div>
                  <PlayerAvatar initials={row.initials} background={row.avatar_color} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{row.display_name}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{row.jornadas_jugadas} jornada{row.jornadas_jugadas !== 1 ? 's' : ''}</span>
                      {!row.qualifies && rules.min_rounds_to_qualify > 0 && (
                        <span className="flex items-center gap-1 text-amber-600">
                          <Clock className="h-3 w-3" />
                          No clasifica aún
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
                      <div className="text-[10px] text-muted-foreground">mejor {rules.best_n}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* TAB: JORNADAS */}
        <TabsContent value="jornadas" className="flex-1 min-h-0 mt-2">
          <ScrollArea className="h-full px-3 pb-4">
            <div className="space-y-4">
              {jornadas.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">
                  Sin jornadas registradas aún.
                </div>
              )}
              {jornadas.map((jornada, idx) => (
                <div key={jornada.date} className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
                    <Trophy className="h-4 w-4 text-primary" />
                    <div className="text-sm font-semibold">
                      Jornada {jornadas.length - idx} — {format(parseISO(jornada.date), "d 'de' MMMM yyyy", { locale: es })}
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    {jornada.results.map(result => (
                      <div key={result.participant_id} className="flex items-center gap-3 px-3 py-2">
                        <div className={cn('w-6 text-center text-sm font-bold', positionColor(result.position))}>
                          {result.position}
                        </div>
                        <div className="flex-1 min-w-0 text-sm truncate">{result.display_name}</div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-semibold">
                            {result.score_value > 0 ? '+' : ''}{result.score_value}
                          </div>
                          {result.points_earned !== null && (
                            <div className="text-[10px] text-primary font-medium">
                              +{result.points_earned} pts
                            </div>
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
          <ScrollArea className="h-full px-3 pb-4">
            <div className="space-y-4">
              {/* Selector de jugador */}
              <div className="flex gap-2 overflow-x-auto pb-1">
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

              {selectedStanding && (
                <>
                  {/* Resumen del jugador */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-card border border-border rounded-xl p-3">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Posición</div>
                      <div className={cn('text-2xl font-bold', positionColor(selectedStanding.position))}>
                        {selectedStanding.position}°
                      </div>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-3">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                        {rules.scoring_system === 'points' ? 'Puntos' : scoringLabel}
                      </div>
                      <div className="text-2xl font-bold">
                        {rules.scoring_system === 'points'
                          ? selectedStanding.points_cuenta
                          : selectedStanding.score_cuenta}
                      </div>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-3">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Jornadas jugadas</div>
                      <div className="text-2xl font-bold">{selectedStanding.jornadas_jugadas}</div>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-3">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Clasifica</div>
                      <div className={cn('text-lg font-bold', selectedStanding.qualifies ? 'text-primary' : 'text-amber-600')}>
                        {selectedStanding.qualifies
                          ? '✓ Sí'
                          : `Faltan ${rules.min_rounds_to_qualify - selectedStanding.jornadas_jugadas}`}
                      </div>
                    </div>
                  </div>

                  {/* Historial de jornadas del jugador */}
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-3 py-2 border-b border-border bg-muted/40 text-sm font-semibold flex items-center gap-2">
                      <Star className="h-4 w-4 text-primary" />
                      Historial de jornadas
                    </div>
                    {participantJornadas.length === 0 && (
                      <div className="p-4 text-sm text-muted-foreground text-center">
                        Sin jornadas registradas.
                      </div>
                    )}
                    <div className="divide-y divide-border">
                      {participantJornadas.map((j) => (
                        <div key={j.date} className="flex items-center gap-3 px-3 py-2">
                          <div className={cn('w-8 text-center text-sm font-bold', positionColor(j.result!.position))}>
                            {j.result!.position}°
                          </div>
                          <div className="flex-1 text-sm">
                            {format(parseISO(j.date), 'd MMM yyyy', { locale: es })}
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold">
                              {j.result!.score_value > 0 ? '+' : ''}{j.result!.score_value}
                            </div>
                            {j.result!.points_earned !== null && (
                              <div className="text-[10px] text-primary font-medium">+{j.result!.points_earned} pts</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {!selectedParticipant && (
                <div className="text-center text-sm text-muted-foreground py-8">
                  Selecciona un jugador para ver su detalle.
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
            Cerrar liga y congelar standings
          </Button>
        </div>
      )}
    </div>
  );
};
