import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { ArrowLeft, Loader2, Trophy, Share2, Users, Copy, Hash, RefreshCw, Calendar, Settings, Pencil, Trash2, CheckCircle } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EditMultiDayConfigDialog } from './EditMultiDayConfigDialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import GreenBookLogo from '@/components/GreenBookLogo';
import { formatPlayerName } from '@/lib/playerInput';
import type { MultiDayRulesJson } from '@/types/leaderboard';
import {
  computeAccumulatedStandings,
  type DayStanding,
} from '@/lib/leaderboardAggregation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { parseLocalDate } from '@/lib/dateUtils';

type SortMode = 'gross' | 'net' | 'stableford';

interface Participant {
  id: string;
  profile_id: string | null;
  guest_name: string | null;
  guest_initials: string | null;
  guest_color: string | null;
  handicap_for_leaderboard: number;
  display_name: string;
  initials: string;
  avatar_color: string;
}

interface Props {
  leaderboardId: string;
  onBack?: () => void;
}

export const MultiDayLeaderboardDetail: React.FC<Props> = ({ leaderboardId, onBack }) => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<any>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [standingsByDay, setStandingsByDay] = useState<Record<number, DayStanding[]>>({});
  const [sortMode, setSortMode] = useState<SortMode>('net');
  const [selectedTab, setSelectedTab] = useState<string>('all');
  const [showEditConfig, setShowEditConfig] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [showClose, setShowClose] = useState(false);
  const [closeText, setCloseText] = useState('');

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const isCreator = event?.created_by === profile?.id;

  const rules = useMemo<MultiDayRulesJson>(() => {
    const r = (event?.rules_json ?? {}) as MultiDayRulesJson;
    return {
      days: Array.isArray(r.days) ? r.days : [],
      aggregation: r.aggregation === 'best_n' ? 'best_n' : 'sum',
      best_n: r.best_n,
    };
  }, [event]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [eventRes, partRes, linkedRes] = await Promise.all([
        supabase.from('leaderboard_events').select('*').eq('id', leaderboardId).single(),
        supabase
          .from('leaderboard_participants')
          .select('*')
          .eq('leaderboard_id', leaderboardId)
          .eq('is_active', true),
        supabase.from('leaderboard_rounds').select('round_id').eq('leaderboard_id', leaderboardId),
      ]);
      if (eventRes.error) throw eventRes.error;
      if (partRes.error) throw partRes.error;
      setEvent(eventRes.data);

      const partData = partRes.data || [];
      const profileIds = partData.filter(p => p.profile_id).map(p => p.profile_id!);
      let profileMap: Record<string, any> = {};
      if (profileIds.length > 0) {
        const { data } = await supabase
          .from('profiles')
          .select('id, display_name, initials, avatar_color')
          .in('id', profileIds);
        if (data) profileMap = Object.fromEntries(data.map(p => [p.id, p]));
      }
      const enriched: Participant[] = partData.map(p => {
        const prof = p.profile_id ? profileMap[p.profile_id] : null;
        return {
          id: p.id,
          profile_id: p.profile_id,
          guest_name: p.guest_name,
          guest_initials: p.guest_initials,
          guest_color: p.guest_color,
          handicap_for_leaderboard: Number(p.handicap_for_leaderboard) || 0,
          display_name: prof ? formatPlayerName(prof.display_name) : formatPlayerName(p.guest_name || 'Invitado'),
          initials: prof ? prof.initials : (p.guest_initials || '??'),
          avatar_color: prof ? prof.avatar_color : (p.guest_color || '#3B82F6'),
        };
      });
      setParticipants(enriched);

      const roundIds = (linkedRes.data || []).map(l => l.round_id);
      if (roundIds.length === 0) {
        setStandingsByDay({});
        return;
      }

      const [rpRes, roundsRes] = await Promise.all([
        supabase
          .from('round_players')
          .select('id, profile_id, round_id, handicap_for_round, guest_name')
          .in('round_id', roundIds),
        supabase.from('rounds').select('id, course_id, date').in('id', roundIds),
      ]);
      const rpData = rpRes.data || [];
      const roundsData = roundsRes.data || [];

      const roundCourse: Record<string, string> = {};
      const roundDate: Record<string, string> = {};
      for (const r of roundsData) {
        roundCourse[r.id] = r.course_id;
        roundDate[r.id] = r.date;
      }

      const courseIds = [...new Set(roundsData.map(r => r.course_id))];
      const holesMap: Record<string, { hole_number: number; par: number; stroke_index: number }[]> = {};
      if (courseIds.length > 0) {
        const { data: holesData } = await supabase
          .from('course_holes')
          .select('course_id, hole_number, par, stroke_index')
          .in('course_id', courseIds);
        for (const h of (holesData || [])) {
          if (!holesMap[h.course_id]) holesMap[h.course_id] = [];
          holesMap[h.course_id].push(h);
        }
      }

      const profileToPart = new Map<string, string>();
      const guestToPart = new Map<string, string>();
      for (const part of enriched) {
        if (part.profile_id) profileToPart.set(part.profile_id, part.id);
        if (part.guest_name) guestToPart.set(part.guest_name, part.id);
      }

      const rpToPart = new Map<string, string>();
      const rpToRound = new Map<string, string>();
      const rpToHcp = new Map<string, number>();
      const rpIds: string[] = [];
      for (const rp of rpData) {
        let pid: string | undefined;
        if (rp.profile_id && profileToPart.has(rp.profile_id)) pid = profileToPart.get(rp.profile_id);
        else if (rp.guest_name && guestToPart.has(rp.guest_name)) pid = guestToPart.get(rp.guest_name);
        if (pid) {
          rpIds.push(rp.id);
          rpToPart.set(rp.id, pid);
          rpToRound.set(rp.id, rp.round_id);
          const part = enriched.find(p => p.id === pid);
          rpToHcp.set(rp.id, part?.handicap_for_leaderboard ?? Number(rp.handicap_for_round) ?? 0);
        }
      }

      // dayNum -> participantId -> running totals
      const acc: Record<number, Record<string, DayStanding>> = {};
      for (const d of rules.days) {
        acc[d.day_number] = {};
        for (const part of enriched) {
          acc[d.day_number][part.id] = {
            participantId: part.id,
            profile_id: part.profile_id,
            grossTotal: 0,
            netTotal: 0,
            grossVsPar: 0,
            netVsPar: 0,
            stablefordTotal: 0,
            holesPlayed: 0,
            position: 0,
          };
        }
      }

      if (rpIds.length > 0) {
        const { data: holeScores } = await supabase
          .from('hole_scores')
          .select('round_player_id, hole_number, strokes, confirmed')
          .in('round_player_id', rpIds)
          .eq('confirmed', true);

        const dayByDate: Record<string, number> = {};
        for (const d of rules.days) dayByDate[d.date] = d.day_number;

        for (const hs of (holeScores || [])) {
          const partId = rpToPart.get(hs.round_player_id);
          if (!partId || !hs.strokes) continue;
          const roundId = rpToRound.get(hs.round_player_id)!;
          const date = roundDate[roundId];
          const dayNum = dayByDate[date];
          if (!dayNum) continue;
          const courseId = roundCourse[roundId];
          const courseHoles = holesMap[courseId] || [];
          const holeInfo = courseHoles.find(h => h.hole_number === hs.hole_number);
          const par = holeInfo?.par || 4;
          const handicap = rpToHcp.get(hs.round_player_id) ?? 0;
          const sortedHoles = [...courseHoles].sort((a, b) => a.stroke_index - b.stroke_index);
          const idx = sortedHoles.findIndex(h => h.hole_number === hs.hole_number);
          const fullStrokes = Math.floor(handicap / 18);
          const remainder = Math.round(handicap) % 18;
          const strokesReceived = fullStrokes + (idx < remainder ? 1 : 0);
          const netStrokes = hs.strokes - strokesReceived;
          const diff = netStrokes - par;
          let stb = 0;
          if (diff <= -3) stb = 5;
          else if (diff === -2) stb = 4;
          else if (diff === -1) stb = 3;
          else if (diff === 0) stb = 2;
          else if (diff === 1) stb = 1;

          const entry = acc[dayNum][partId];
          if (!entry) continue;
          entry.grossTotal += hs.strokes;
          entry.netTotal += netStrokes;
          entry.grossVsPar += hs.strokes - par;
          entry.netVsPar += diff;
          entry.stablefordTotal += stb;
          entry.holesPlayed += 1;
        }
      }

      const byDay: Record<number, DayStanding[]> = {};
      for (const dayNum of Object.keys(acc)) {
        byDay[Number(dayNum)] = Object.values(acc[Number(dayNum)]);
      }
      setStandingsByDay(byDay);
    } catch (err: any) {
      console.error(err);
      toast.error('Error cargando leaderboard: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [leaderboardId, rules.days.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const sortDay = (entries: DayStanding[]): DayStanding[] => {
    const played = entries.filter(e => e.holesPlayed > 0);
    const unplayed = entries.filter(e => e.holesPlayed === 0);
    played.sort((a, b) => {
      if (sortMode === 'gross') return a.grossVsPar - b.grossVsPar;
      if (sortMode === 'stableford') return b.stablefordTotal - a.stablefordTotal;
      return a.netVsPar - b.netVsPar;
    });
    return [...played.map((e, i) => ({ ...e, position: i + 1 })), ...unplayed];
  };

  const accumulated = useMemo(
    () => computeAccumulatedStandings(standingsByDay, rules.aggregation, rules.best_n, sortMode),
    [standingsByDay, rules.aggregation, rules.best_n, sortMode],
  );

  const formatVsPar = (v: number): string => v === 0 ? 'E' : v > 0 ? `+${v}` : `${v}`;
  const vsParColor = (v: number): string => {
    if (v < 0) return 'text-green-600 font-semibold';
    if (v === 0) return 'text-foreground font-semibold';
    if (v <= 3) return 'text-orange-500 font-semibold';
    return 'text-destructive font-semibold';
  };

  const copyCode = () => {
    if (event?.code) { navigator.clipboard.writeText(event.code); toast.success('Código copiado'); }
  };
  const copyShareLink = () => {
    if (event?.code) {
      navigator.clipboard.writeText(`${window.location.origin}/leaderboards/join/${event.code}`);
      toast.success('Link copiado');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <p className="text-muted-foreground">Leaderboard no encontrado</p>
        {onBack && <Button onClick={onBack}>Volver</Button>}
      </div>
    );
  }

  const availableModes: SortMode[] = (event.scoring_modes || ['gross', 'net']) as SortMode[];
  const partMap = new Map(participants.map(p => [p.id, p]));

  const renderStandingsTable = (entries: DayStanding[]) => (
    <table className="table-fixed w-full text-sm">
      <thead>
        <tr className="text-xs border-b">
          <th className="h-8 w-8 text-center font-medium text-muted-foreground">#</th>
          <th className="h-8 text-left font-medium text-muted-foreground">Jugador</th>
          <th className="h-8 w-10 text-center font-medium text-muted-foreground">Hcp</th>
          <th className="h-8 w-10 text-center font-medium text-muted-foreground">Hoyos</th>
          <th className="h-8 w-14 text-center font-medium text-muted-foreground">
            {sortMode === 'stableford' ? 'Pts' : 'Score'}
          </th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e, idx) => {
          const part = partMap.get(e.participantId);
          if (!part) return null;
          const has = e.holesPlayed > 0;
          const score = sortMode === 'gross' ? e.grossVsPar
            : sortMode === 'stableford' ? e.stablefordTotal
            : e.netVsPar;
          return (
            <tr key={e.participantId} className="border-b hover:bg-muted/50">
              <td className="text-center font-bold text-muted-foreground py-1.5">
                {has ? idx + 1 : '-'}
              </td>
              <td className="py-1.5 px-1">
                <div className="flex items-center gap-1.5">
                  <PlayerAvatar
                    initials={part.initials}
                    background={part.avatar_color}
                    size="sm"
                    isLoggedInUser={part.profile_id === profile?.id}
                  />
                  <span className="font-semibold text-sm truncate">{part.display_name}</span>
                </div>
              </td>
              <td className="text-center text-xs text-muted-foreground py-1.5">
                {part.handicap_for_leaderboard}
              </td>
              <td className="text-center text-xs text-muted-foreground py-1.5">
                {has ? e.holesPlayed : '-'}
              </td>
              <td className={cn('text-center text-base py-1.5',
                has ? (sortMode === 'stableford' ? 'font-extrabold text-amber-600' : vsParColor(score))
                    : 'text-muted-foreground')}>
                {has ? (sortMode === 'stableford' ? score : formatVsPar(score)) : '-'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const renderAccumulated = () => {
    if (accumulated.length === 0) {
      return <p className="text-center text-sm text-muted-foreground py-8">Aún no hay resultados</p>;
    }
    return (
      <table className="table-fixed w-full text-sm">
        <thead>
          <tr className="text-xs border-b">
            <th className="h-8 w-8 text-center font-medium text-muted-foreground">#</th>
            <th className="h-8 text-left font-medium text-muted-foreground">Jugador</th>
            <th className="h-8 w-10 text-center font-medium text-muted-foreground">Días</th>
            <th className="h-8 w-16 text-center font-medium text-muted-foreground">
              {rules.aggregation === 'best_n' ? `Mejores ${rules.best_n}` : 'Total'}
            </th>
          </tr>
        </thead>
        <tbody>
          {accumulated.map((a, idx) => {
            const part = partMap.get(a.participantId);
            if (!part) return null;
            const total = sortMode === 'stableford'
              ? (rules.aggregation === 'best_n' ? (a.bestNStableford ?? 0) : a.totalStableford)
              : sortMode === 'gross'
                ? (rules.aggregation === 'best_n' ? (a.bestNGross ?? 0) : a.totalGrossVsPar)
                : (rules.aggregation === 'best_n' ? (a.bestNNetVsPar ?? 0) : a.totalNetVsPar);
            return (
              <tr key={a.participantId} className="border-b hover:bg-muted/50">
                <td className="text-center font-bold text-muted-foreground py-1.5">{idx + 1}</td>
                <td className="py-1.5 px-1">
                  <div className="flex items-center gap-1.5">
                    <PlayerAvatar
                      initials={part.initials}
                      background={part.avatar_color}
                      size="sm"
                      isLoggedInUser={part.profile_id === profile?.id}
                    />
                    <span className="font-semibold text-sm truncate">{part.display_name}</span>
                  </div>
                </td>
                <td className="text-center text-xs text-muted-foreground py-1.5">{a.daysPlayed}</td>
                <td className={cn('text-center text-base py-1.5',
                  sortMode === 'stableford' ? 'font-extrabold text-amber-600' : vsParColor(total))}>
                  {sortMode === 'stableford' ? total : formatVsPar(total)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <div className="min-h-full bg-background">
      <div className="bg-card border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onBack && (
              <Button variant="ghost" size="icon" onClick={onBack}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <GreenBookLogo height={24} />
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => fetchAll()} aria-label="Actualizar">
              <RefreshCw className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={copyShareLink}>
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-lg">{event.name}</CardTitle>
              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold uppercase">
                Multi-día
              </span>
            </div>
            {event.description && (
              <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
            )}
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
              <button onClick={copyCode}
                className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md hover:bg-muted/80">
                <Hash className="h-3 w-3" />
                <span className="font-mono font-bold">{event.code}</span>
                <Copy className="h-3 w-3 ml-1" />
              </button>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> {participants.length} jugadores
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> {rules.days.length} días
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Agregación: {rules.aggregation === 'best_n'
                ? `Mejores ${rules.best_n} de ${rules.days.length} días`
                : 'Suma total'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="px-0 pb-2 pt-3">
            {availableModes.length > 1 && (
              <div className="px-4 mb-2">
                <Tabs value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
                  <TabsList className="w-full h-8">
                    {availableModes.includes('gross') &&
                      <TabsTrigger value="gross" className="flex-1 text-xs h-7">Gross</TabsTrigger>}
                    {availableModes.includes('net') &&
                      <TabsTrigger value="net" className="flex-1 text-xs h-7">Neto</TabsTrigger>}
                    {availableModes.includes('stableford') &&
                      <TabsTrigger value="stableford" className="flex-1 text-xs h-7">Stableford</TabsTrigger>}
                  </TabsList>
                </Tabs>
              </div>
            )}

            <div className="px-4">
              <Tabs value={selectedTab} onValueChange={setSelectedTab}>
                <TabsList className="w-full h-auto flex-wrap">
                  {rules.days.map(d => (
                    <TabsTrigger key={d.day_number} value={String(d.day_number)}
                      className="flex-1 text-xs h-7 min-w-[60px]">
                      Día {d.day_number}
                    </TabsTrigger>
                  ))}
                  <TabsTrigger value="all" className="flex-1 text-xs h-7 min-w-[80px] font-semibold">
                    Acumulado
                  </TabsTrigger>
                </TabsList>

                {rules.days.map(d => (
                  <TabsContent key={d.day_number} value={String(d.day_number)} className="mt-3">
                    <div className="text-xs text-muted-foreground mb-2 px-1">
                      {d.label ? <span className="font-medium text-foreground">{d.label} · </span> : null}
                      {d.date ? format(parseLocalDate(d.date), "d 'de' MMM yyyy", { locale: es }) : ''}
                    </div>
                    {renderStandingsTable(sortDay(standingsByDay[d.day_number] || []))}
                  </TabsContent>
                ))}

                <TabsContent value="all" className="mt-3">
                  {renderAccumulated()}
                </TabsContent>
              </Tabs>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MultiDayLeaderboardDetail;
