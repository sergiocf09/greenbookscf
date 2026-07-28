import React, { useEffect, useMemo, useState } from 'react';
// (navigation kept local — caller decides where to go after onCreated)
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar as CalendarIcon, Loader2, Users, Sparkles, Shuffle } from 'lucide-react';
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
import { cupSessionLabel, type CupDay } from '@/types/leaderboard';

interface Props {
  open: boolean;
  onClose: () => void;
  leaderboardId: string;
  organizerProfileId: string;
  participants: CupParticipant[];
  teams: CupTeam[];
  matches: CupMatch[];
  /** Days/sessions configured for the cup (multi-day support). */
  days?: CupDay[];
  /** Slot preselected by the caller (chip currently active). */
  defaultDay?: number;
  defaultSession?: number;
  onCreated: (roundId: string) => void;
  /**
   * If set, the dialog rebuilds foursomes on this existing round instead of
   * creating a new round. Used to recover when all round_groups were wiped.
   */
  existingRoundId?: string | null;
}

const MAX_PER_GROUP = 6;
const MAX_GROUPS = 6;

export const CreateRoundFromCupDialog: React.FC<Props> = ({
  open, onClose, leaderboardId, organizerProfileId, participants, teams, matches, onCreated,
  existingRoundId, days = [], defaultDay = 1, defaultSession = 1,
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

  const [slot, setSlot] = useState<{ day: number; session: number }>({ day: defaultDay, session: defaultSession });

  const slotOptions = useMemo(
    () => days.flatMap(d => d.sessions.map(sess => ({
      key: `${d.day_number}-${sess.session_number}`,
      day: d.day_number,
      session: sess.session_number,
      date: d.date ?? null,
      label: cupSessionLabel(d, sess, d.sessions.length > 1),
    }))),
    [days],
  );
  const isMultiSlot = slotOptions.length > 1;

  /** Matches of the targeted slot — used for foursome ordering. */
  const slotMatches = useMemo(
    () => matches.filter(m => (m.day_number ?? 1) === slot.day && (m.session_number ?? 1) === slot.session),
    [matches, slot],
  );

  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<'config' | 'review'>('config');

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
    const opt = slotOptions.find(o => o.day === defaultDay && o.session === defaultSession) ?? slotOptions[0];
    setSlot({ day: opt?.day ?? 1, session: opt?.session ?? 1 });
    setDate(opt?.date ? new Date(`${opt.date}T12:00:00`) : new Date());
    setPhase('config');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, participants, defaultDay, defaultSession]);

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

  /**
   * Reorder participants so players that share a match (1v1 or fourball) appear
   * consecutively, grouped by match_order. Unmatched players go at the end.
   * This makes it trivial for the organizer to assign them to the same group.
   */
  const orderedParticipants = useMemo(() => {
    const byId = new Map(participants.map(p => [p.id, p]));
    const used = new Set<string>();
    const ordered: CupParticipant[] = [];
    const sortedMatches = [...slotMatches].sort((a, b) => (a.match_order ?? 0) - (b.match_order ?? 0));
    for (const m of sortedMatches) {
      const ids = [m.player_a1_id, m.player_a2_id, m.player_b1_id, m.player_b2_id]
        .filter((x): x is string => !!x);
      for (const id of ids) {
        if (used.has(id)) continue;
        const p = byId.get(id);
        if (p) { ordered.push(p); used.add(id); }
      }
    }
    // Append any participant not in a match (alphabetical).
    const rest = participants
      .filter(p => !used.has(p.id))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
    return [...ordered, ...rest];
  }, [participants, slotMatches]);

  /** Map participantId → match_order (first match they appear in). */
  const matchOrderByPart = useMemo(() => {
    const m = new Map<string, number>();
    for (const match of slotMatches) {
      const ids = [match.player_a1_id, match.player_a2_id, match.player_b1_id, match.player_b2_id]
        .filter((x): x is string => !!x);
      for (const id of ids) if (!m.has(id)) m.set(id, match.match_order ?? 0);
    }
    return m;
  }, [slotMatches]);

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

  /**
   * Auto-armar: keep all players that share a match in the SAME group,
   * filling groups up to 4 (foursomes) and overflowing to the next group.
   * Unmatched players are appended after, also packed by 4.
   */
  const autoBalance = () => {
    const next = new Map<string, number | null>();
    let group = 1;
    let groupSize = 0;
    const target = 4;

    const placeMatchUnit = (ids: string[]) => {
      // If adding this unit would exceed the foursome target, advance group.
      if (groupSize > 0 && groupSize + ids.length > target && group < MAX_GROUPS) {
        group++;
        groupSize = 0;
      }
      for (const id of ids) {
        if (next.has(id)) continue;
        next.set(id, group);
        groupSize++;
      }
    };

    const sortedMatches = [...slotMatches].sort((a, b) => (a.match_order ?? 0) - (b.match_order ?? 0));
    for (const m of sortedMatches) {
      const ids = [m.player_a1_id, m.player_a2_id, m.player_b1_id, m.player_b2_id]
        .filter((x): x is string => !!x);
      if (ids.length > 0) placeMatchUnit(ids);
    }
    // Unmatched players fill remaining slots (1-by-1).
    const unmatched = participants.filter(p => !next.has(p.id));
    for (const p of unmatched) placeMatchUnit([p.id]);

    // Anyone we still couldn't place → mark as not playing.
    participants.forEach(p => { if (!next.has(p.id)) next.set(p.id, null); });
    setGroupByPart(next);
  };

  /**
   * Pure random shuffle: ignore matches; distribute all participants in
   * foursomes of 4 (last group may be 1-3). Useful for casual tournaments
   * with lots of guests where the organizer wants to randomize quickly.
   */
  const randomShuffle = () => {
    const ids = participants.map(p => p.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const next = new Map<string, number | null>();
    ids.forEach((id, idx) => {
      const group = Math.min(Math.floor(idx / 4) + 1, MAX_GROUPS);
      next.set(id, group);
    });
    participants.forEach(p => { if (!next.has(p.id)) next.set(p.id, null); });
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
        existingRoundId: existingRoundId ?? null,
        targetSlot: isMultiSlot ? slot : null,
      });
      toast.success(existingRoundId ? 'Foursomes recreados' : 'Ronda creada y vinculada');
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
            <Users className="h-4 w-4" /> {existingRoundId ? 'Recrear Foursomes' : 'Crear Ronda y Grupos de Juego'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: course + meta */}
          <div className="space-y-3">
            {isMultiSlot && (
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Jornada</Label>
                <select
                  value={`${slot.day}-${slot.session}`}
                  onChange={e => {
                    const opt = slotOptions.find(o => o.key === e.target.value);
                    if (!opt) return;
                    setSlot({ day: opt.day, session: opt.session });
                    if (opt.date) setDate(new Date(`${opt.date}T12:00:00`));
                  }}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs max-w-[60%]"
                >
                  {slotOptions.map(o => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>
            )}

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
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] gap-1"
                  onClick={randomShuffle}
                  type="button"
                  title="Distribuir al azar en foursomes de 4"
                >
                  <Shuffle className="h-3 w-3" /> Al azar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] gap-1"
                  onClick={autoBalance}
                  type="button"
                  title="Respetar matches y armar foursomes"
                >
                  <Sparkles className="h-3 w-3" /> Auto-armar
                </Button>
              </div>
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
              {orderedParticipants.map((p, idx) => {
                const color = p.cup_team_id ? teamColorById.get(p.cup_team_id) : undefined;
                const tee = teeByPart.get(p.id) ?? 'white';
                const index = Number(p.handicap_for_leaderboard ?? 0);
                const ch = computeCourseHcp(index, tee);
                const matchOrd = matchOrderByPart.get(p.id);
                const prevMatchOrd = idx > 0 ? matchOrderByPart.get(orderedParticipants[idx - 1].id) : undefined;
                const showMatchSep = matchOrd !== undefined && matchOrd !== prevMatchOrd;
                return (
                  <React.Fragment key={p.id}>
                    {showMatchSep && (
                      <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-semibold pt-1 pl-1">
                        Match #{matchOrd}
                      </div>
                    )}
                    <div
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
                  </React.Fragment>
                );
              })}
            </div>

          </div>

          {phase === 'config' ? (
            <>
              <div className="flex gap-2 pt-2 border-t">
                <Button variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    if (!courseId) { toast.error('Selecciona el campo'); return; }
                    if (playingCount === 0) { toast.error('Asigna al menos un jugador a un grupo'); return; }
                    setPhase('review');
                  }}
                  disabled={submitting || !courseId || playingCount === 0}
                >
                  Revisar Grupos
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center -mt-1">
                Verás un resumen antes de confirmar. La ronda quedará vinculada y
                los matches en espera se asignarán automáticamente.
              </p>
            </>
          ) : (
            <ReviewGroups
              usedGroupNumbers={usedGroupNumbers}
              groupCounts={groupCounts}
              groupByPart={groupByPart}
              orderedParticipants={orderedParticipants}
              teamColorById={teamColorById}
              matchOrderByPart={matchOrderByPart}
              maxPerGroup={MAX_PER_GROUP}
              onBack={() => setPhase('config')}
              onConfirm={handleCreate}
              submitting={submitting}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ── Review Step ─────────────────────────────────── */

interface ReviewGroupsProps {
  usedGroupNumbers: number[];
  groupCounts: Map<number, number>;
  groupByPart: Map<string, number | null>;
  orderedParticipants: CupParticipant[];
  teamColorById: Map<string, string>;
  matchOrderByPart: Map<string, number>;
  maxPerGroup: number;
  onBack: () => void;
  onConfirm: () => void;
  submitting: boolean;
}

const ReviewGroups: React.FC<ReviewGroupsProps> = ({
  usedGroupNumbers, groupByPart, orderedParticipants,
  teamColorById, matchOrderByPart, maxPerGroup, onBack, onConfirm, submitting,
}) => {
  const benchedInMatch = orderedParticipants.filter(
    p => groupByPart.get(p.id) == null && matchOrderByPart.has(p.id),
  );

  return (
    <div className="space-y-3 pt-2 border-t">
      <p className="text-xs font-semibold text-center">Confirma los grupos</p>

      {benchedInMatch.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-2 text-[11px] text-amber-800 dark:text-amber-200">
          <strong>Atención:</strong> {benchedInMatch.length} jugador(es) con match
          asignado no jugarán esta ronda. Sus matches quedarán sin uno de los
          contendientes.
          <ul className="mt-1 list-disc pl-4">
            {benchedInMatch.map(p => (
              <li key={p.id}>{formatPlayerName(p.display_name)} · Match #{matchOrderByPart.get(p.id)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
        {usedGroupNumbers.map(n => {
          const members = orderedParticipants.filter(p => groupByPart.get(p.id) === n);
          const overCap = members.length > maxPerGroup;
          return (
            <div key={n} className={cn(
              'border rounded-lg p-2',
              overCap ? 'border-destructive bg-destructive/5' : 'border-border',
            )}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold">Grupo {n}</span>
                <span className={cn(
                  'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                  overCap ? 'bg-destructive/20 text-destructive' : 'bg-muted text-muted-foreground',
                )}>
                  {members.length} jugador{members.length !== 1 ? 'es' : ''}
                </span>
              </div>
              <div className="space-y-1">
                {members.map(p => {
                  const color = p.cup_team_id ? teamColorById.get(p.cup_team_id) : undefined;
                  const matchOrd = matchOrderByPart.get(p.id);
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 py-0.5 pl-2 min-w-0"
                      style={color ? { borderLeft: `3px solid ${color}` } : undefined}
                    >
                      <PlayerAvatar initials={p.initials} background={p.avatar_color} size="xs" />
                      <span className="text-xs truncate flex-1 min-w-0">
                        {formatPlayerName(p.display_name)}
                      </span>
                      {matchOrd !== undefined && (
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-semibold shrink-0">
                          M#{matchOrd}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 pt-1 border-t">
        <Button variant="outline" className="flex-1" onClick={onBack} disabled={submitting}>
          ← Editar
        </Button>
        <Button className="flex-1" onClick={onConfirm} disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
          Confirmar y Crear
        </Button>
      </div>
    </div>
  );
};
