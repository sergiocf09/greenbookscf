import React, { useState, useEffect } from 'react';
import { useTeamsCup, CupMatch, CupTeam, CupParticipant, CupMatchResult, CupHoleBreakdown } from '@/hooks/useTeamsCup';
import { useLeaderboardDetail } from '@/hooks/useLeaderboards';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Loader2, Plus, ChevronDown, Pencil, Trash2,
  Check, X, Hash, Copy, Share2, Settings, Link2, Unlink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CupMatchEditorDialog } from '@/components/leaderboards/CupMatchEditorDialog';
import { CupSettingsDialog } from '@/components/leaderboards/CupSettingsDialog';
import { LinkRoundToLeaderboardDialog } from '@/components/leaderboards/LinkRoundToLeaderboardDialog';
import { useActiveRoundForLink } from '@/hooks/useActiveRoundForLink';

/* ── helpers ─────────────────────────────────────── */

/**
 * Convert a "running A-up" delta into match-play notation:
 *   3 → '3UP', -2 → '2DN', 0 → 'AS'
 * (perspective is always Team A; UI flips color based on sign)
 */
function formatRunning(delta: number): string {
  if (delta === 0) return 'AS';
  if (delta > 0) return `${delta}UP`;
  return `${Math.abs(delta)}DN`;
}

/* ── CupMatchRow ─────────────────────────────────── */

interface MatchRowProps {
  match: CupMatch;
  teams: CupTeam[];
  participants: CupParticipant[];
  result: CupMatchResult | undefined;
  isCreator: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

const CupMatchRow: React.FC<MatchRowProps> = ({
  match, teams, participants, result, isCreator, onEdit, onDelete,
}) => {
  const teamA = teams[0];
  const teamB = teams[1];
  const colorA = teamA?.color || '#3B82F6';
  const colorB = teamB?.color || '#ef4444';

  const getName = (id: string | null) => {
    if (!id) return null;
    return participants.find(p => p.id === id);
  };

  const renderSide = (ids: (string | null)[], teamColor: string) => (
    <div
      className="p-2 rounded-lg space-y-1 min-h-[52px] flex flex-col justify-center"
      style={{ backgroundColor: teamColor + '26' }}
    >
      {ids.filter(Boolean).map(id => {
        const p = getName(id);
        if (!p) return <span key={id} className="text-xs italic text-muted-foreground">— Sin asignar —</span>;
        return (
          <div key={p.id} className="flex items-start gap-1.5">
            <PlayerAvatar initials={p.initials} background={p.avatar_color} size="xs" />
            <span className="text-xs font-medium leading-tight break-words min-w-0 flex-1">{p.display_name}</span>
          </div>
        );
      })}
      {ids.every(id => !id) && (
        <span className="text-xs italic text-muted-foreground">— Sin asignar —</span>
      )}
    </div>
  );

  const closed = result?.match_closed ?? false;
  const holesPlayed = result?.holes_played ?? 0;
  const diff = result ? (result.side_a_holes_won - result.side_b_holes_won) : 0;
  const rtype = closed ? result!.result_type : (match.result_type || (result ? result.result_type : 'pending'));

  let centerColor: string = 'hsl(var(--muted-foreground))';
  if (rtype === 'a_wins' || (rtype === 'in_progress' && diff > 0)) centerColor = colorA;
  else if (rtype === 'b_wins' || (rtype === 'in_progress' && diff < 0)) centerColor = colorB;

  let centerText = 'VS';
  if (rtype !== 'pending' && (holesPlayed > 0 || closed)) {
    centerText = formatRunning(diff);
  }

  const pts = match.points_per_match ?? 1;
  const breakdown: CupHoleBreakdown[] = result?.hole_breakdown ?? [];
  const hasBreakdown = breakdown.length > 0;

  const renderCenter = () => (
    <div className="flex flex-col items-center gap-0.5 leading-none">
      <span
        className="text-2xl font-extrabold tracking-tight"
        style={{ color: centerColor }}
      >
        {centerText}
      </span>
      {!closed && holesPlayed > 0 && (
        <span className="text-[9px] text-muted-foreground mt-0.5">thru {holesPlayed}</span>
      )}
      {closed && result?.current_standing && centerText !== 'AS' && (
        <span className="text-[9px] font-semibold mt-0.5" style={{ color: centerColor }}>
          {result.current_standing.replace(/^[AB]\s*/, 'Final ')}
        </span>
      )}
      <div className="text-[10px] mt-0.5">
        {(rtype === 'a_wins' || (!closed && rtype === 'in_progress' && diff > 0)) && (
          <span style={{ color: colorA }}>{pts}pt{pts !== 1 ? 's' : ''}</span>
        )}
        {(rtype === 'b_wins' || (!closed && rtype === 'in_progress' && diff < 0)) && (
          <span style={{ color: colorB }}>{pts}pt{pts !== 1 ? 's' : ''}</span>
        )}
        {(rtype === 'halved' || (!closed && rtype === 'in_progress' && diff === 0 && holesPlayed > 0)) && (
          <>
            <span style={{ color: colorA }}>{pts / 2}</span>
            <span className="text-muted-foreground"> · </span>
            <span style={{ color: colorB }}>{pts / 2}</span>
          </>
        )}
      </div>
      {match.strokes_advantage > 0 && (
        <span className="text-[9px] text-muted-foreground mt-0.5">
          {match.advantage_side === 'a' ? 'A' : 'B'} +{match.strokes_advantage}
        </span>
      )}
    </div>
  );

  const renderHoleCell = (h: CupHoleBreakdown) => {
    const text = formatRunning(h.running_a_up);
    const color =
      h.running_a_up > 0 ? colorA :
      h.running_a_up < 0 ? colorB :
      'hsl(var(--muted-foreground))';
    return (
      <div
        key={h.hole}
        className="flex flex-col items-center justify-center rounded p-1 bg-muted/40"
      >
        <span className="text-[9px] text-muted-foreground leading-none">{h.hole}</span>
        <span className="text-[10px] font-bold leading-tight mt-0.5" style={{ color }}>
          {text}
        </span>
      </div>
    );
  };

  const renderTooltipBody = () => {
    if (!hasBreakdown) {
      return (
        <p className="text-xs text-muted-foreground text-center py-2">
          Sin hoyos jugados todavía.
        </p>
      );
    }
    const byHole = new Map(breakdown.map(b => [b.hole, b]));
    const front = Array.from({ length: 9 }, (_, i) => i + 1);
    const back = Array.from({ length: 9 }, (_, i) => i + 10);
    const placeholder = (n: number) => (
      <div key={n} className="flex flex-col items-center justify-center rounded p-1 bg-muted/20">
        <span className="text-[9px] text-muted-foreground leading-none">{n}</span>
        <span className="text-[10px] text-muted-foreground/60 leading-tight mt-0.5">—</span>
      </div>
    );
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-9 gap-1">
          {front.map(n => byHole.has(n) ? renderHoleCell(byHole.get(n)!) : placeholder(n))}
        </div>
        <div className="grid grid-cols-9 gap-1">
          {back.map(n => byHole.has(n) ? renderHoleCell(byHole.get(n)!) : placeholder(n))}
        </div>
        <div className="flex items-center justify-center gap-3 text-[10px] text-muted-foreground pt-1 border-t">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: colorA }} />
            {teamA?.name || 'Equipo A'}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: colorB }} />
            {teamB?.name || 'Equipo B'}
          </span>
        </div>
      </div>
    );
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-2">
        <div className="flex items-stretch gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex-1 text-left grid grid-cols-[1fr_68px_1fr] gap-1 items-stretch hover:opacity-95 transition-opacity min-w-0"
                aria-label="Ver detalle por hoyo"
              >
                {renderSide(
                  [match.player_a1_id, match.player_a2_id],
                  colorA,
                )}
                <div className="text-center flex flex-col items-center justify-center">
                  {renderCenter()}
                </div>
                {renderSide(
                  [match.player_b1_id, match.player_b2_id],
                  colorB,
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-3" align="center">
              <div className="space-y-2">
                <div className="text-xs font-semibold text-center">
                  Estado por hoyo
                </div>
                {renderTooltipBody()}
              </div>
            </PopoverContent>
          </Popover>

          {isCreator && (
            <div className="flex flex-col gap-1 shrink-0 justify-center">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onEdit}
                aria-label="Editar match"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={onDelete}
                aria-label="Eliminar match"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

/* ── EditableTeamName ────────────────────────────── */

interface EditableTeamNameProps {
  team: CupTeam | null;
  fallback: string;
  canEdit: boolean;
  onSave: (newName: string) => void;
  className?: string;
  size?: 'sm' | 'md';
}

const EditableTeamName: React.FC<EditableTeamNameProps> = ({
  team, fallback, canEdit, onSave, className, size = 'md',
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(team?.name || fallback);

  React.useEffect(() => {
    if (!editing) setDraft(team?.name || fallback);
  }, [team?.name, fallback, editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && team && trimmed !== team.name) {
      onSave(trimmed);
    } else {
      setDraft(team?.name || fallback);
    }
    setEditing(false);
  };

  const cancel = () => {
    setDraft(team?.name || fallback);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 justify-center">
        <Input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') cancel();
          }}
          className={cn('h-7 px-2 py-0 text-center', size === 'sm' ? 'text-xs' : 'text-sm')}
          maxLength={20}
        />
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={commit}>
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={cancel}>
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={!canEdit}
      onClick={() => canEdit && setEditing(true)}
      className={cn(
        'inline-flex items-center gap-1 group',
        canEdit && 'cursor-pointer hover:opacity-80',
        className,
      )}
      style={{ color: team?.color }}
    >
      <span className="truncate">{team?.name || fallback}</span>
      {canEdit && (
        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
      )}
    </button>
  );
};

/* ── Inline Component ────────────────────────────── */

interface Props {
  leaderboardId: string;
  onBack: () => void;
}

export const TeamsCupDetailInline: React.FC<Props> = ({ leaderboardId, onBack }) => {
  const { profile } = useAuth();
  const cup = useTeamsCup(leaderboardId);
  const { event, isCreator } = useLeaderboardDetail(leaderboardId);
  const queryClient = useQueryClient();

  const [showMatchEditor, setShowMatchEditor] = useState(false);
  const [editingMatch, setEditingMatch] = useState<CupMatch | null>(null);
  const [showAssignPanel, setShowAssignPanel] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [isRoundLinked, setIsRoundLinked] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const activeRound = useActiveRoundForLink();

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!leaderboardId || !activeRound.roundId) {
        setIsRoundLinked(false);
        return;
      }
      const { data } = await supabase
        .from('leaderboard_rounds')
        .select('id')
        .eq('leaderboard_id', leaderboardId)
        .eq('round_id', activeRound.roundId)
        .maybeSingle();
      if (!cancelled) setIsRoundLinked(!!data);
    };
    check();
    return () => { cancelled = true; };
  }, [leaderboardId, activeRound.roundId]);

  const handleUnlinkRound = async () => {
    if (!leaderboardId || !activeRound.roundId) return;
    setUnlinking(true);
    try {
      const roundId = activeRound.roundId;
      await supabase.from('leaderboard_rounds')
        .delete().eq('leaderboard_id', leaderboardId).eq('round_id', roundId);
      await supabase.from('leaderboard_scores')
        .delete().eq('leaderboard_id', leaderboardId).eq('round_id', roundId);
      await supabase.from('leaderboard_participants')
        .delete().eq('leaderboard_id', leaderboardId).eq('source_round_id', roundId);
      await supabase.from('cup_matches')
        .update({ round_id: null, status: 'pending' } as any)
        .eq('leaderboard_id', leaderboardId).eq('round_id', roundId);

      toast.success('Ronda desvinculada');
      setIsRoundLinked(false);
      await cup.fetchAll();
    } catch (err: any) {
      toast.error('Error al desvincular: ' + err.message);
    } finally {
      setUnlinking(false);
    }
  };

  const copyCode = () => {
    if (event?.code) {
      navigator.clipboard.writeText(event.code);
      toast.success('Código copiado');
    }
  };

  const copyShareLink = () => {
    if (event?.code) {
      const url = `${window.location.origin}/leaderboards/join/${event.code}`;
      navigator.clipboard.writeText(url);
      toast.success('Link copiado');
    }
  };

  const handleDeleteEvent = async () => {
    if (!leaderboardId) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('leaderboard_events')
        .delete()
        .eq('id', leaderboardId);
      if (error) throw error;
      toast.success('Competencia eliminada');
      queryClient.invalidateQueries({ queryKey: ['leaderboard_events'] });
      onBack();
    } catch (err: any) {
      toast.error('Error al eliminar: ' + err.message);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const [localHcps, setLocalHcps] = useState<Map<string, number>>(new Map());

  const handleHcpChange = (participantId: string, value: number) => {
    setLocalHcps(prev => new Map(prev).set(participantId, value));
  };

  const commitHcp = (participantId: string) => {
    const v = localHcps.get(participantId);
    if (v === undefined) return;
    const orig = cup.participants.find(p => p.id === participantId)?.match_handicap;
    if (v !== orig) cup.updateMatchHandicap(participantId, v);
  };

  const getHcp = (p: CupParticipant) => localHcps.get(p.id) ?? p.match_handicap;

  if (cup.loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const teamA = cup.teams[0] ?? null;
  const teamB = cup.teams[1] ?? null;
  const st = cup.standings;

  const cupFormat = (event as any)?.cup_format || 'match_individual';

  const byName = (a: CupParticipant, b: CupParticipant) =>
    a.display_name.localeCompare(b.display_name, 'es', { sensitivity: 'base' });
  const partsA = cup.participants.filter(p => p.cup_team_id === teamA?.id).sort(byName);
  const partsB = cup.participants.filter(p => p.cup_team_id === teamB?.id).sort(byName);
  const partsNone = cup.participants
    .filter(p => !p.cup_team_id || (teamA && teamB && p.cup_team_id !== teamA.id && p.cup_team_id !== teamB.id))
    .sort(byName);

  return (
    <div className="space-y-3">
      {/* Top bar: code chip + actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {event?.code && (
            <button
              onClick={copyCode}
              className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md hover:bg-muted/80 transition-colors"
            >
              <Hash className="h-3 w-3" />
              <span className="font-mono font-bold">{event.code}</span>
              <Copy className="h-3 w-3 ml-0.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {activeRound.roundId && !isRoundLinked && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowLinkDialog(true)}
              aria-label="Vincular ronda"
              title="Vincular ronda activa"
            >
              <Link2 className="h-4 w-4" />
            </Button>
          )}
          {activeRound.roundId && isRoundLinked && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleUnlinkRound}
              disabled={unlinking}
              aria-label="Desvincular ronda"
              title="Desvincular ronda"
              className="text-destructive hover:text-destructive"
            >
              {unlinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={copyShareLink} aria-label="Compartir">
            <Share2 className="h-4 w-4" />
          </Button>
          {isCreator && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSettings(true)}
              aria-label="Configuración"
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Event title + meta */}
      <div className="text-center space-y-1.5">
        <h1 className="text-lg font-bold">{event?.name || 'Teams Cup'}</h1>
        {event?.description && (
          <p className="text-xs text-muted-foreground">{event.description}</p>
        )}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-[10px]">
            {cupFormat === 'fourball' ? 'Fourball (Best Ball)' : 'Match Play Individual'}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {cup.participants.length} jugadores
          </Badge>
        </div>
      </div>

      {/* ── Section 1: Global Scoreboard ─── */}
      {st ? (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="text-center flex-1 min-w-0">
                <div className="text-sm font-semibold">
                  <EditableTeamName
                    team={st.team_a}
                    fallback="Equipo A"
                    canEdit={isCreator}
                    onSave={(name) => st.team_a && cup.updateTeam(st.team_a.id, { name })}
                  />
                </div>
                <p className="text-4xl font-bold mt-1">{st.points_a}</p>
              </div>
              <span className="text-xl text-muted-foreground font-light mx-3">—</span>
              <div className="text-center flex-1 min-w-0">
                <div className="text-sm font-semibold">
                  <EditableTeamName
                    team={st.team_b}
                    fallback="Equipo B"
                    canEdit={isCreator}
                    onSave={(name) => st.team_b && cup.updateTeam(st.team_b.id, { name })}
                  />
                </div>
                <p className="text-4xl font-bold mt-1">{st.points_b}</p>
              </div>
            </div>
            <div className="h-3 rounded-full overflow-hidden flex mt-4 bg-muted">
              {st.matches_total > 0 ? (
                <>
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${(st.points_a / st.matches_total) * 100}%`,
                      backgroundColor: st.team_a?.color,
                    }}
                  />
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${(st.points_b / st.matches_total) * 100}%`,
                      backgroundColor: st.team_b?.color,
                    }}
                  />
                </>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              {st.matches_total} matches · {st.matches_completed} completados
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-5 text-center text-sm text-muted-foreground">
            Configura los matches para ver el marcador
          </CardContent>
        </Card>
      )}

      {/* ── Section 2: Matches ─── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold">Matches</h2>
          {isCreator && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => { setEditingMatch(null); setShowMatchEditor(true); }}
            >
              <Plus className="h-3.5 w-3.5" /> Agregar Match
            </Button>
          )}
        </div>

        {cup.matches.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No hay matches configurados aún</p>
            {isCreator && (
              <Button
                className="mt-3 gap-1"
                onClick={() => { setEditingMatch(null); setShowMatchEditor(true); }}
              >
                <Plus className="h-4 w-4" /> Crear primer match
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {cup.matches.map(m => (
              <CupMatchRow
                key={m.id}
                match={m}
                teams={cup.teams}
                participants={cup.participants}
                result={cup.matchResults.get(m.id)}
                isCreator={isCreator}
                onEdit={() => { setEditingMatch(m); setShowMatchEditor(true); }}
                onDelete={() => cup.deleteMatch(m.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Section 3: Participants ─── */}
      <Collapsible open={participantsOpen} onOpenChange={setParticipantsOpen}>
        <div className="flex items-center justify-between">
          <CollapsibleTrigger className="flex items-center gap-1.5 text-base font-semibold">
            Participantes
            <ChevronDown className={cn('h-4 w-4 transition-transform', participantsOpen && 'rotate-180')} />
          </CollapsibleTrigger>
          {isCreator && (
            <Button variant="outline" size="sm" onClick={() => setShowAssignPanel(true)}>
              Asignar Equipos
            </Button>
          )}
        </div>
        <CollapsibleContent className="mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-semibold mb-1">
                <EditableTeamName
                  team={teamA}
                  fallback="Equipo A"
                  canEdit={isCreator}
                  onSave={(name) => teamA && cup.updateTeam(teamA.id, { name })}
                  size="sm"
                />
              </div>
              {partsA.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Sin jugadores</p>
              ) : partsA.map(p => (
                <div key={p.id} className="flex items-center gap-1.5 py-1">
                  <PlayerAvatar initials={p.initials} background={p.avatar_color} size="xs" />
                  <div className="min-w-0">
                    <span className="text-xs font-medium truncate block">{p.display_name}</span>
                    <span className="text-[10px] text-muted-foreground">Hcp: {p.match_handicap}</span>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div className="text-xs font-semibold mb-1">
                <EditableTeamName
                  team={teamB}
                  fallback="Equipo B"
                  canEdit={isCreator}
                  onSave={(name) => teamB && cup.updateTeam(teamB.id, { name })}
                  size="sm"
                />
              </div>
              {partsB.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Sin jugadores</p>
              ) : partsB.map(p => (
                <div key={p.id} className="flex items-center gap-1.5 py-1">
                  <PlayerAvatar initials={p.initials} background={p.avatar_color} size="xs" />
                  <div className="min-w-0">
                    <span className="text-xs font-medium truncate block">{p.display_name}</span>
                    <span className="text-[10px] text-muted-foreground">Hcp: {p.match_handicap}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {partsNone.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Sin equipo asignado</p>
              {partsNone.map(p => (
                <div key={p.id} className="flex items-center gap-1.5 py-1">
                  <PlayerAvatar initials={p.initials} background={p.avatar_color} size="xs" />
                  <span className="text-xs font-medium truncate">{p.display_name}</span>
                  <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200 ml-auto">
                    Pendiente
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* ── Assignment Panel ─── */}
      <Dialog open={showAssignPanel} onOpenChange={(open) => {
        if (!open) {
          // Commit any pending edits when closing
          localHcps.forEach((_v, id) => commitHcp(id));
        }
        setShowAssignPanel(open);
      }}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Asignar Equipos y Hándicaps</DialogTitle>
          </DialogHeader>
          {(() => {
            const renderRow = (p: CupParticipant) => (
              <div key={p.id} className="flex items-center gap-2 p-2 border rounded-lg">
                <PlayerAvatar initials={p.initials} background={p.avatar_color} size="sm" />
                <span className="text-sm font-medium truncate flex-1 min-w-0">{p.display_name}</span>
                <div className="flex gap-1 shrink-0">
                  {teamA && (
                    <button
                      onClick={() => cup.assignTeam(p.id, p.cup_team_id === teamA.id ? null : teamA.id)}
                      className={cn(
                        'w-7 h-7 rounded-md border-2 text-[10px] font-bold transition-all',
                        p.cup_team_id === teamA.id ? 'text-white' : 'bg-transparent',
                      )}
                      style={{
                        borderColor: teamA.color,
                        backgroundColor: p.cup_team_id === teamA.id ? teamA.color : 'transparent',
                        color: p.cup_team_id === teamA.id ? '#fff' : teamA.color,
                      }}
                    >
                      A
                    </button>
                  )}
                  {teamB && (
                    <button
                      onClick={() => cup.assignTeam(p.id, p.cup_team_id === teamB.id ? null : teamB.id)}
                      className={cn(
                        'w-7 h-7 rounded-md border-2 text-[10px] font-bold transition-all',
                        p.cup_team_id === teamB.id ? 'text-white' : 'bg-transparent',
                      )}
                      style={{
                        borderColor: teamB.color,
                        backgroundColor: p.cup_team_id === teamB.id ? teamB.color : 'transparent',
                        color: p.cup_team_id === teamB.id ? '#fff' : teamB.color,
                      }}
                    >
                      B
                    </button>
                  )}
                </div>
                <div className="shrink-0">
                  <Label className="text-[9px] text-muted-foreground block text-center">Hcp match</Label>
                  <Input
                    type="number"
                    value={getHcp(p)}
                    onChange={e => handleHcpChange(p.id, parseInt(e.target.value) || 0)}
                    onBlur={() => commitHcp(p.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="w-14 h-7 text-center text-xs"
                  />
                </div>
              </div>
            );

            return (
              <div className="space-y-3">
                {partsNone.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground">Sin asignar</p>
                    <div className="space-y-2">{partsNone.map(renderRow)}</div>
                  </div>
                )}
                {teamA && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold" style={{ color: teamA.color }}>
                      {teamA.name}
                    </p>
                    {partsA.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic px-1">Sin jugadores</p>
                    ) : (
                      <div className="space-y-2">{partsA.map(renderRow)}</div>
                    )}
                  </div>
                )}
                {teamB && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold" style={{ color: teamB.color }}>
                      {teamB.name}
                    </p>
                    {partsB.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic px-1">Sin jugadores</p>
                    ) : (
                      <div className="space-y-2">{partsB.map(renderRow)}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          <Button className="w-full mt-3" onClick={() => setShowAssignPanel(false)}>
            Cerrar
          </Button>
        </DialogContent>
      </Dialog>

      {/* ── Match Editor ─── */}
      <CupMatchEditorDialog
        open={showMatchEditor}
        leaderboardId={leaderboardId}
        match={editingMatch}
        teams={cup.teams}
        participants={cup.participants}
        defaultFormat={cupFormat}
        onClose={() => { setShowMatchEditor(false); setEditingMatch(null); }}
        onSave={async (params) => {
          if (editingMatch) {
            await cup.updateMatch(editingMatch.id, params);
          } else {
            await cup.createMatch(params);
          }
        }}
        calcMatchHandicap={cup.calcMatchHandicap}
      />

      {/* ── Link Round Dialog ─── */}
      <LinkRoundToLeaderboardDialog
        open={showLinkDialog}
        onOpenChange={async (open) => {
          setShowLinkDialog(open);
          if (!open) {
            if (leaderboardId && activeRound.roundId) {
              const { data } = await supabase
                .from('leaderboard_rounds')
                .select('id')
                .eq('leaderboard_id', leaderboardId)
                .eq('round_id', activeRound.roundId)
                .maybeSingle();
              setIsRoundLinked(!!data);
            }
            await cup.fetchAll();
          }
        }}
        roundId={activeRound.roundId}
        players={activeRound.players}
        playerGroups={activeRound.playerGroups}
        profileId={profile?.id}
        preselectedLeaderboardId={leaderboardId}
      />

      {/* ── Settings Dialog (creator only) ─── */}
      {isCreator && event && (
        <CupSettingsDialog
          open={showSettings}
          onOpenChange={setShowSettings}
          event={event as any}
          onDeleteRequest={() => {
            setShowSettings(false);
            setShowDeleteConfirm(true);
          }}
          onSaved={async () => {
            queryClient.invalidateQueries({ queryKey: ['leaderboard_events'] });
            await cup.fetchAll();
          }}
        />
      )}

      {/* ── Delete Confirm ─── */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta competencia?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán todos los matches, equipos y participantes vinculados.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); handleDeleteEvent(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
