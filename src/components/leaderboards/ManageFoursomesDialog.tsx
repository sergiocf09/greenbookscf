import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Users, ArrowRightLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { calculateCourseHandicap } from '@/lib/usgaHandicap';
import type { CupParticipant, TeeColor } from '@/hooks/useTeamsCup';

interface Props {
  open: boolean;
  onClose: () => void;
  roundId: string;
  leaderboardId: string;
  participants: CupParticipant[];
  onChanged: () => void;
  /** Called when the linked round no longer exists in DB. */
  onRoundMissing?: () => void;
}

interface GroupRow {
  /** db id (null for groups added in this session that haven't been persisted) */
  dbId: string | null;
  groupNumber: number;
}

/**
 * Manage foursomes (round_groups + round_players) for the round linked to a
 * Team Cup leaderboard. Only the organizer should see this entry point.
 *
 * Lets the organizer:
 *  - Move existing players between groups.
 *  - Assign Cup participants that aren't yet in the round to a group
 *    (creates a `round_players` row with Course-HCP computed from tee + course).
 *  - Remove a player from the round (kept in the Cup, just doesn't play).
 *  - Add a new empty group / remove an empty group.
 */
export const ManageFoursomesDialog: React.FC<Props> = ({
  open, onClose, roundId, leaderboardId, participants, onChanged, onRoundMissing,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  /**
   * Map<participantId, groupNumber | null>
   *  - groupNumber: target foursome (1..N).
   *  - null: participant does NOT play this round.
   */
  const [assignment, setAssignment] = useState<Map<string, number | null>>(new Map());
  /** Original assignment + player metadata (for diffing on save). */
  const [originalRoundPlayers, setOriginalRoundPlayers] = useState<Map<string, {
    rpId: string;
    groupNumber: number;
  }>>(new Map());
  const [courseId, setCourseId] = useState<string | null>(null);
  const [coursePar, setCoursePar] = useState<number>(72);
  const [teeData, setTeeData] = useState<Map<string, { rating: number; slope: number }>>(new Map());

  /* ── Load round groups + players ──────────────────────── */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Revalidate the round still exists before touching anything else.
      const { data: roundExists, error: roundCheckErr } = await supabase
        .from('rounds')
        .select('id, course_id')
        .eq('id', roundId)
        .maybeSingle();
      if (roundCheckErr) throw roundCheckErr;
      if (!roundExists) {
        toast.error('La ronda enlazada fue eliminada. Crea una nueva.');
        onRoundMissing?.();
        onClose();
        return;
      }

      const [groupsRes, playersRes] = await Promise.all([
        supabase.from('round_groups')
          .select('id, group_number')
          .eq('round_id', roundId)
          .order('group_number'),
        supabase.from('round_players')
          .select('id, profile_id, guest_name, group_id')
          .eq('round_id', roundId),
      ]);
      if (groupsRes.error) throw groupsRes.error;
      if (playersRes.error) throw playersRes.error;

      const gRows: GroupRow[] = (groupsRes.data ?? []).map((g: any) => ({
        dbId: g.id, groupNumber: g.group_number,
      }));
      setGroups(gRows);

      const gNumById = new Map<string, number>();
      gRows.forEach(g => { if (g.dbId) gNumById.set(g.dbId, g.groupNumber); });

      const cid = roundExists.course_id ?? null;
      setCourseId(cid);
      if (cid) {
        const [teesRes, holesRes] = await Promise.all([
          supabase.from('course_tees').select('tee_color, course_rating, slope_rating').eq('course_id', cid),
          supabase.from('course_holes').select('par').eq('course_id', cid),
        ]);
        const tMap = new Map<string, { rating: number; slope: number }>();
        (teesRes.data ?? []).forEach((t: any) => {
          tMap.set(t.tee_color, { rating: Number(t.course_rating) || 72, slope: Number(t.slope_rating) || 113 });
        });
        setTeeData(tMap);
        const par = (holesRes.data ?? []).reduce((s: number, h: any) => s + (Number(h.par) || 0), 0);
        setCoursePar(par || 72);
      }

      // Build map participant → group number (by profile_id or guest_name match)
      const origMap = new Map<string, { rpId: string; groupNumber: number }>();
      const assignMap = new Map<string, number | null>();
      participants.forEach(p => assignMap.set(p.id, null));

      (playersRes.data ?? []).forEach((rp: any) => {
        const part = participants.find(p =>
          (p.profile_id && rp.profile_id === p.profile_id) ||
          (!p.profile_id && rp.guest_name === p.display_name)
        );
        if (!part) return;
        const gNum = gNumById.get(rp.group_id) ?? 1;
        origMap.set(part.id, { rpId: rp.id, groupNumber: gNum });
        assignMap.set(part.id, gNum);
      });
      setOriginalRoundPlayers(origMap);
      setAssignment(assignMap);
    } catch (err: any) {
      toast.error('Error al cargar foursomes: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [roundId, participants, onRoundMissing, onClose]);

  useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  /* ── Local helpers ────────────────────────────────────── */

  const moveTo = (participantId: string, groupNumber: number | null) => {
    setAssignment(prev => {
      const next = new Map(prev);
      next.set(participantId, groupNumber);
      return next;
    });
  };

  const addGroup = () => {
    const nextNum = (groups.length === 0 ? 1 : Math.max(...groups.map(g => g.groupNumber)) + 1);
    setGroups(prev => [...prev, { dbId: null, groupNumber: nextNum }]);
  };

  const removeGroup = (groupNumber: number) => {
    // Only allow if empty in current assignment.
    const occupied = Array.from(assignment.values()).some(g => g === groupNumber);
    if (occupied) {
      toast.error('Mueve a los jugadores de este grupo antes de eliminarlo');
      return;
    }
    setGroups(prev => prev.filter(g => g.groupNumber !== groupNumber));
  };

  const playersInGroup = (groupNumber: number): CupParticipant[] => {
    return participants.filter(p => assignment.get(p.id) === groupNumber);
  };
  const unassigned = participants.filter(p => assignment.get(p.id) == null);

  /* ── Save ─────────────────────────────────────────────── */

  const handleSave = async () => {
    setSaving(true);
    try {
      // 0. Revalidate the round still exists — RLS inserts will silently fail
      //    (42501) if the round was deleted or reorganized elsewhere.
      const { data: roundCheck, error: roundCheckErr } = await supabase
        .from('rounds')
        .select('id')
        .eq('id', roundId)
        .maybeSingle();
      if (roundCheckErr) throw roundCheckErr;
      if (!roundCheck) {
        toast.error('La ronda enlazada ya no existe. Crea una nueva desde la tarjeta superior.');
        onRoundMissing?.();
        onClose();
        return;
      }

      // 1. Persist any new groups (dbId === null) and build map number → id.
      const numToId = new Map<number, string>();
      groups.forEach(g => { if (g.dbId) numToId.set(g.groupNumber, g.dbId); });

      const newGroupRows = groups.filter(g => !g.dbId);
      if (newGroupRows.length > 0) {
        const { data: inserted, error: insErr } = await supabase
          .from('round_groups')
          .insert(newGroupRows.map(g => ({ round_id: roundId, group_number: g.groupNumber })))
          .select('id, group_number');
        if (insErr) throw insErr;
        (inserted ?? []).forEach((row: any) => numToId.set(row.group_number, row.id));
      }

      // 2. Identify groups removed from local state for deferred deletion.
      const localGroupNums = new Set(groups.map(g => g.groupNumber));
      const { data: dbGroups } = await supabase
        .from('round_groups')
        .select('id, group_number')
        .eq('round_id', roundId);
      const groupsToDelete = (dbGroups ?? []).filter((g: any) => !localGroupNums.has(g.group_number));

      // 3. Diff participants.
      for (const part of participants) {
        const target = assignment.get(part.id);
        const orig = originalRoundPlayers.get(part.id);

        if (orig && target == null) {
          const { error } = await supabase.from('round_players').delete().eq('id', orig.rpId);
          if (error) throw error;
        } else if (orig && target != null && target !== orig.groupNumber) {
          const newGid = numToId.get(target);
          if (!newGid) throw new Error(`Grupo ${target} no encontrado`);
          const { error } = await supabase.from('round_players').update({ group_id: newGid }).eq('id', orig.rpId);
          if (error) throw error;
        } else if (!orig && target != null) {
          const gid = numToId.get(target);
          if (!gid) throw new Error(`Grupo ${target} no encontrado`);
          const tee = (part.tee_color ?? 'white') as TeeColor;
          const td = teeData.get(tee);
          const index = Number(part.handicap_for_leaderboard ?? 0);
          const courseHcp = td
            ? calculateCourseHandicap(index, td.slope, td.rating, coursePar)
            : Math.round(index);

          const insertRow: any = {
            round_id: roundId,
            group_id: gid,
            handicap_for_round: courseHcp,
            tee_color: tee,
            is_organizer: false,
          };
          if (part.profile_id) {
            insertRow.profile_id = part.profile_id;
          } else {
            insertRow.guest_name = part.display_name;
            insertRow.guest_initials = part.initials;
            insertRow.guest_color = part.avatar_color;
          }
          const { error } = await supabase.from('round_players').insert(insertRow);
          if (error) throw error;
        }
      }

      // 4. Delete the groups marked for removal (now empty).
      for (const g of groupsToDelete) {
        const { error } = await supabase.from('round_groups').delete().eq('id', g.id);
        if (error) console.warn('Could not delete group:', error.message);
      }

      toast.success('Foursomes actualizados');
      onChanged();
      onClose();
    } catch (err: any) {
      // RLS rejection — almost always means the round was deleted/reorganized.
      if (err?.code === '42501') {
        toast.error('No tienes permisos sobre esta ronda o fue eliminada. Vuelve a crearla desde la tarjeta superior.');
        onRoundMissing?.();
        onClose();
      } else {
        toast.error('Error al guardar: ' + err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  /* ── Remove participant from the whole Cup (organizer action) ─────── */
  const removeFromCup = async (participantId: string) => {
    try {
      // Drop them from this round first (best-effort), then deactivate in Cup.
      const orig = originalRoundPlayers.get(participantId);
      if (orig) {
        await supabase.from('round_players').delete().eq('id', orig.rpId);
      }
      const { error } = await supabase
        .from('leaderboard_participants')
        .update({ is_active: false, cup_team_id: null })
        .eq('id', participantId);
      if (error) throw error;
      toast.success('Eliminado del Cup');
      onChanged();
      await loadData();
    } catch (err: any) {
      toast.error('Error al eliminar del Cup: ' + err.message);
    }
  };

  const hasChanges = useMemo(() => {
    // Any new groups
    if (groups.some(g => !g.dbId)) return true;
    // Any assignment change
    for (const part of participants) {
      const target = assignment.get(part.id);
      const orig = originalRoundPlayers.get(part.id);
      if (!orig && target != null) return true;
      if (orig && target == null) return true;
      if (orig && target != null && orig.groupNumber !== target) return true;
    }
    return false;
  }, [groups, assignment, originalRoundPlayers, participants]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md p-3 gap-2">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-sm">Foursomes de la Ronda</DialogTitle>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || loading || !hasChanges}
            className="h-8 w-full text-xs"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            {hasChanges ? 'Guardar cambios' : 'Cerrar'}
          </Button>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {/* Unassigned bucket */}
            {unassigned.length > 0 && (
              <UnassignedSection
                players={unassigned}
                groups={groups}
                onAssign={moveTo}
              />
            )}

            {/* Groups */}
            {groups.map(g => (
              <GroupSection
                key={g.groupNumber}
                groupNumber={g.groupNumber}
                isNew={!g.dbId}
                players={playersInGroup(g.groupNumber)}
                allGroups={groups}
                onMove={moveTo}
                onRemoveGroup={() => removeGroup(g.groupNumber)}
              />
            ))}

            <Button
              size="sm"
              variant="outline"
              onClick={addGroup}
              className="w-full h-8 text-xs gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar Foursome
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

/* ── Sub-components ──────────────────────────────────────── */

interface UnassignedProps {
  players: CupParticipant[];
  groups: GroupRow[];
  onAssign: (participantId: string, groupNumber: number) => void;
}
const UnassignedSection: React.FC<UnassignedProps> = ({ players, groups, onAssign }) => (
  <div className="rounded-md border border-dashed border-amber-400/60 bg-amber-50/40 dark:bg-amber-900/10 p-2 space-y-1.5">
    <div className="flex items-center gap-1.5">
      <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700 dark:text-amber-300">
        Sin asignar ({players.length})
      </Badge>
      <span className="text-[10px] text-muted-foreground">Estos jugadores no juegan esta ronda hasta que los agregues a un foursome.</span>
    </div>
    {players.map(p => (
      <div key={p.id} className="flex items-center gap-2 py-1">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{p.display_name}</p>
          <p className="text-[10px] text-muted-foreground">
            HCP {p.handicap_for_leaderboard} · {p.tee_color ?? 'sin tee'}
          </p>
        </div>
        {groups.length === 0 ? (
          <span className="text-[10px] text-muted-foreground">Crea un foursome</span>
        ) : (
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1">
                <Plus className="h-3 w-3" /> Asignar
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-36 p-1">
              <div className="space-y-0.5">
                {groups.map(g => (
                  <button
                    key={g.groupNumber}
                    onClick={() => onAssign(p.id, g.groupNumber)}
                    className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
                  >
                    Foursome {g.groupNumber}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    ))}
  </div>
);

interface GroupSectionProps {
  groupNumber: number;
  isNew: boolean;
  players: CupParticipant[];
  allGroups: GroupRow[];
  onMove: (participantId: string, groupNumber: number | null) => void;
  onRemoveGroup: () => void;
}
const GroupSection: React.FC<GroupSectionProps> = ({
  groupNumber, isNew, players, allGroups, onMove, onRemoveGroup,
}) => (
  <div className={cn(
    'rounded-md border bg-card p-2 space-y-1.5',
    isNew ? 'border-primary/60' : 'border-border'
  )}>
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold">Foursome {groupNumber}</span>
        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{players.length}</Badge>
        {isNew && <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-primary/50 text-primary">Nuevo</Badge>}
      </div>
      {players.length === 0 && (
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={onRemoveGroup}
          title="Eliminar foursome (vacío)"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}
    </div>
    {players.length === 0 ? (
      <p className="text-[10px] text-muted-foreground italic px-1">Sin jugadores</p>
    ) : (
      players.map(p => (
        <div key={p.id} className="flex items-center gap-2 py-1 border-t border-border/50 first:border-t-0">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{p.display_name}</p>
            <p className="text-[10px] text-muted-foreground">
              HCP {p.match_handicap} · {p.tee_color ?? 'sin tee'}
            </p>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="icon" variant="ghost" className="h-6 w-6" title="Mover">
                <ArrowRightLeft className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-40 p-1">
              <div className="space-y-0.5">
                {allGroups.filter(g => g.groupNumber !== groupNumber).map(g => (
                  <button
                    key={g.groupNumber}
                    onClick={() => onMove(p.id, g.groupNumber)}
                    className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
                  >
                    Mover a Foursome {g.groupNumber}
                  </button>
                ))}
                <button
                  onClick={() => onMove(p.id, null)}
                  className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-destructive/10 text-destructive"
                >
                  Quitar de la ronda
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      ))
    )}
  </div>
);
