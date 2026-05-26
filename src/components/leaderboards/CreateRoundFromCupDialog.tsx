import React, { useEffect, useMemo, useState } from 'react';
// (navigation kept local — caller decides where to go after onCreated)
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar as CalendarIcon, Loader2, Users, Sparkles } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CourseSelect } from '@/components/setup/CourseSelect';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { formatPlayerName } from '@/lib/playerInput';
import { createRoundFromCup, type ParticipantPlayOverride } from '@/lib/teamsCupRoundBuilder';
import { calculateCourseHandicap } from '@/lib/usgaHandicap';
import { TeePicker, type TeeColor } from '@/components/leaderboards/TeePicker';
import type { CupParticipant, CupTeam, CupMatch } from '@/hooks/useTeamsCup';

interface Props {
  open: boolean;
  onClose: () => void;
  leaderboardId: string;
  organizerProfileId: string;
  participants: CupParticipant[];
  teams: CupTeam[];
  matches: CupMatch[];
  onCreated: (roundId: string) => void;
}

const MAX_PER_GROUP = 6;
const MAX_GROUPS = 6;

export const CreateRoundFromCupDialog: React.FC<Props> = ({
  open, onClose, leaderboardId, organizerProfileId, participants, teams, matches, onCreated,
}) => {
  // No router navigation here — caller decides via onCreated.
  const queryClient = useQueryClient();

  const [courseId, setCourseId] = useState<string | null>(null);
  const [teeColor, setTeeColor] = useState<'blue' | 'white' | 'yellow' | 'red'>('white');
  const [startingHole, setStartingHole] = useState<1 | 10>(1);
  const [roundHoles, setRoundHoles] = useState<9 | 18>(18);
  const [date, setDate] = useState<Date>(new Date());

  // Per-participant tee override (initial = participant's stored tee, else 'white')
  const [teeByPart, setTeeByPart] = useState<Map<string, TeeColor>>(new Map());

  // Course tee/par data — recomputed when courseId changes
  const [teeData, setTeeData] = useState<Map<string, { rating: number; slope: number }>>(new Map());
  const [coursePar, setCoursePar] = useState<number>(72);

  // groupByPart: participantId -> groupNumber (1..6) or null (no juega esta ronda)
  const [groupByPart, setGroupByPart] = useState<Map<string, number | null>>(() => {
    const m = new Map<string, number | null>();
    participants.forEach(p => m.set(p.id, 1));
    return m;
  });

  const [submitting, setSubmitting] = useState(false);

  // Recompute defaults whenever the participants list changes (dialog reopen).
  React.useEffect(() => {
    if (!open) return;
    const m = new Map<string, number | null>();
    const tm = new Map<string, TeeColor>();
    participants.forEach(p => {
      m.set(p.id, 1);
      tm.set(p.id, (p.tee_color as TeeColor | null) ?? 'white');
    });
    setGroupByPart(m);
    setTeeByPart(tm);
    setDate(new Date());
  }, [open, participants]);

  // Load tee rating/slope + course par when courseId changes.
  useEffect(() => {
    let cancelled = false;
    if (!courseId) { setTeeData(new Map()); setCoursePar(72); return; }
    (async () => {
      const [teesRes, holesRes] = await Promise.all([
        supabase.from('course_tees').select('tee_color, course_rating, slope_rating').eq('course_id', courseId),
        supabase.from('course_holes').select('par').eq('course_id', courseId),
      ]);
      if (cancelled) return;
      const tm = new Map<string, { rating: number; slope: number }>();
      (teesRes.data ?? []).forEach((t: any) => {
        tm.set(t.tee_color, { rating: Number(t.course_rating) || 72, slope: Number(t.slope_rating) || 113 });
      });
      setTeeData(tm);
      const par = (holesRes.data ?? []).reduce((s: number, h: any) => s + (h.par ?? 0), 0) || 72;
      setCoursePar(par);
    })();
    return () => { cancelled = true; };
  }, [courseId]);

  const computeCourseHcp = (index: number, tee: TeeColor): number => {
    const td = teeData.get(tee);
    if (!td) return Math.round(index); // fallback when course tee data is missing
    return calculateCourseHandicap(index, td.slope, td.rating, coursePar);
  };

  const teamColorById = useMemo(() => {
    const m = new Map<string, string>();
    teams.forEach(t => m.set(t.id, t.color));
    return m;
  }, [teams]);

  const setPartGroup = (partId: string, n: number | null) => {
    setGroupByPart(prev => new Map(prev).set(partId, n));
  };

  const groupCounts = useMemo(() => {
    const counts = new Map<number, number>();
    groupByPart.forEach(g => {
      if (g != null) counts.set(g, (counts.get(g) ?? 0) + 1);
    });
    return counts;
  }, [groupByPart]);

  const usedGroupNumbers = useMemo(() => {
    return Array.from(groupCounts.keys()).sort((a, b) => a - b);
  }, [groupCounts]);

  const nextGroupNumber = useMemo(() => {
    for (let i = 1; i <= MAX_GROUPS; i++) {
      if (!usedGroupNumbers.includes(i)) return i;
    }
    return null;
  }, [usedGroupNumbers]);

  const playingCount = useMemo(
    () => Array.from(groupByPart.values()).filter(g => g != null).length,
    [groupByPart],
  );

  /** Auto-armar: round-robin distribution that keeps team A/B balanced per group. */
  const autoBalance = () => {
    const teamAId = teams[0]?.id ?? null;
    const teamBId = teams[1]?.id ?? null;
    const byTeam = {
      A: participants.filter(p => p.cup_team_id === teamAId),
      B: participants.filter(p => p.cup_team_id === teamBId),
      none: participants.filter(p => !p.cup_team_id || (p.cup_team_id !== teamAId && p.cup_team_id !== teamBId)),
    };
    const total = participants.length;
    // Default to foursomes (4); otherwise spread across as few groups as possible.
    const numGroups = Math.max(1, Math.min(MAX_GROUPS, Math.ceil(total / 4)));
    const next = new Map<string, number | null>();
    let cursor = 0;
    const interleaved: typeof participants = [];
    const maxLen = Math.max(byTeam.A.length, byTeam.B.length, byTeam.none.length);
    for (let i = 0; i < maxLen; i++) {
      if (byTeam.A[i]) interleaved.push(byTeam.A[i]);
      if (byTeam.B[i]) interleaved.push(byTeam.B[i]);
      if (byTeam.none[i]) interleaved.push(byTeam.none[i]);
    }
    for (const p of interleaved) {
      next.set(p.id, (cursor % numGroups) + 1);
      cursor++;
    }
    setGroupByPart(next);
  };

  const handleCreate = async () => {
    if (!courseId) { toast.error('Selecciona el campo'); return; }
    if (playingCount === 0) { toast.error('Asigna al menos un jugador a un grupo'); return; }
    // Build groups payload, normalized to compact group numbers starting at 1.
    const groupsRaw: { groupNumber: number; participantIds: string[] }[] = [];
    usedGroupNumbers.forEach((n, idx) => {
      const ids = participants
        .filter(p => groupByPart.get(p.id) === n)
        .map(p => p.id);
      if (ids.length === 0) return;
      groupsRaw.push({ groupNumber: idx + 1, participantIds: ids });
    });
    // Sanity: per-group size limit.
    const tooBig = groupsRaw.find(g => g.participantIds.length > MAX_PER_GROUP);
    if (tooBig) {
      toast.error(`El grupo ${tooBig.groupNumber} tiene más de ${MAX_PER_GROUP} jugadores`);
      return;
    }

    setSubmitting(true);
    try {
      // Build per-participant Course HCP + tee overrides from current UI state.
      const overrides = new Map<string, ParticipantPlayOverride>();
      participants.forEach(p => {
        const tee = teeByPart.get(p.id) ?? 'white';
        const index = Number(p.handicap_for_leaderboard ?? 0);
        overrides.set(p.id, { courseHandicap: computeCourseHcp(index, tee), teeColor: tee });
      });
      const roundId = await createRoundFromCup({
        leaderboardId,
        organizerProfileId,
        courseId,
        teeColor,
        startingHole,
        roundHoles,
        date,
        groups: groupsRaw,
        playerOverrides: overrides,
      });
      toast.success('Ronda creada y vinculada');
      queryClient.invalidateQueries({ queryKey: ['leaderboard_events'] });
      onCreated(roundId);
      onClose();
    } catch (err: any) {

      console.error('createRoundFromCup error:', err);
      toast.error('Error al crear ronda: ' + (err?.message ?? 'desconocido'));
    } finally {
      setSubmitting(false);
    }
  };

  const renderGroupPicker = (partId: string) => {
    const current = groupByPart.get(partId) ?? null;
    const options: (number | 'add' | 'none')[] = [...usedGroupNumbers];
    if (nextGroupNumber && !usedGroupNumbers.includes(nextGroupNumber)) options.push('add');
    options.push('none');
    return (
      <div className="flex gap-1 shrink-0 flex-wrap justify-end">
        {options.map(opt => {
          if (opt === 'add') {
            return (
              <button
                key="add"
                type="button"
                onClick={() => setPartGroup(partId, nextGroupNumber!)}
                className="h-6 px-1.5 rounded text-[10px] font-semibold border border-dashed border-muted-foreground/50 text-muted-foreground hover:bg-muted"
              >
                +
              </button>
            );
          }
          if (opt === 'none') {
            const active = current === null;
            return (
              <button
                key="none"
                type="button"
                onClick={() => setPartGroup(partId, null)}
                className={cn(
                  'h-6 px-1.5 rounded text-[10px] font-semibold border',
                  active ? 'bg-destructive/20 border-destructive text-destructive' : 'border-muted-foreground/30 text-muted-foreground',
                )}
                title="No juega esta ronda"
              >
                —
              </button>
            );
          }
          const n = opt as number;
          const active = current === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => setPartGroup(partId, n)}
              className={cn(
                'h-6 w-6 rounded text-[10px] font-bold border',
                active ? 'bg-foreground text-background border-foreground' : 'border-muted-foreground/30 text-muted-foreground hover:bg-muted',
              )}
            >
              G{n}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !submitting) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Crear Ronda y Grupos de Juego
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: course + meta */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Fecha</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs h-8">
                    <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                    {format(date, "d 'de' MMMM, yyyy", { locale: es })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && setDate(d)}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <CourseSelect
              selectedCourseId={courseId}
              onChange={setCourseId}
              teeColor={teeColor}
              onTeeColorChange={setTeeColor}
              startingHole={startingHole}
              onStartingHoleChange={setStartingHole}
              roundHoles={roundHoles}
              onRoundHolesChange={setRoundHoles}
              enabled={true}
            />
          </div>

          {/* Step 2: groups builder */}
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">
                Grupos de Juego ({playingCount}/{participants.length})
              </Label>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px] gap-1"
                onClick={autoBalance}
                type="button"
              >
                <Sparkles className="h-3 w-3" /> Auto-armar
              </Button>
            </div>

            {/* Group capacity summary */}
            {usedGroupNumbers.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {usedGroupNumbers.map(n => (
                  <span
                    key={n}
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded font-semibold',
                      (groupCounts.get(n) ?? 0) > MAX_PER_GROUP
                        ? 'bg-destructive/20 text-destructive'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    G{n}: {groupCounts.get(n) ?? 0}
                  </span>
                ))}
              </div>
            )}

            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
              {participants.map(p => {
                const color = p.cup_team_id ? teamColorById.get(p.cup_team_id) : undefined;
                const tee = teeByPart.get(p.id) ?? 'white';
                const index = Number(p.handicap_for_leaderboard ?? 0);
                const ch = computeCourseHcp(index, tee);
                return (
                  <div
                    key={p.id}
                    className="flex flex-col gap-1.5 p-1.5 border rounded-lg min-w-0"
                    style={color ? { borderLeft: `3px solid ${color}` } : undefined}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <PlayerAvatar initials={p.initials} background={p.avatar_color} size="xs" />
                      <span className="text-xs font-medium truncate flex-1 min-w-0">
                        {formatPlayerName(p.display_name)}
                      </span>
                      {renderGroupPicker(p.id)}
                    </div>
                    <div className="flex items-center justify-between gap-2 pl-7">
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        Index {index.toFixed(1)} → <span className="font-semibold text-foreground">CH {ch}</span>
                      </span>
                      <TeePicker
                        value={tee}
                        onChange={(t) => setTeeByPart(prev => new Map(prev).set(p.id, t))}
                        size="xs"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

          </div>

          <div className="flex gap-2 pt-2 border-t">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={handleCreate}
              disabled={submitting || !courseId || playingCount === 0}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Crear Ronda
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center -mt-1">
            La ronda quedará vinculada a esta competencia y los matches en espera
            se asignarán automáticamente.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
