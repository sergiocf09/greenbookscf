import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamsCup, CupMatch, CupTeam, CupParticipant, CupMatchResult, CupFormat } from '@/hooks/useTeamsCup';
import { useLeaderboardDetail } from '@/hooks/useLeaderboards';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft, Loader2, Plus, ChevronDown, Pencil, Trash2, User, LogOut,
  Check, X, Hash, Copy, Share2, Settings, RefreshCw,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import GreenBookLogo from '@/components/GreenBookLogo';
import { ProfileDialog } from '@/components/ProfileDialog';
import { CupMatchEditorDialog } from '@/components/leaderboards/CupMatchEditorDialog';

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

  const getName = (id: string | null) => {
    if (!id) return null;
    return participants.find(p => p.id === id);
  };

  const renderSide = (ids: (string | null)[], teamColor: string) => (
    <div
      className="p-2 rounded-lg space-y-1 min-h-[48px] flex flex-col justify-center"
      style={{ backgroundColor: teamColor + '26' }}
    >
      {ids.filter(Boolean).map(id => {
        const p = getName(id);
        if (!p) return <span key={id} className="text-xs italic text-muted-foreground">— Sin asignar —</span>;
        return (
          <div key={p.id} className="flex items-center gap-1.5">
            <PlayerAvatar initials={p.initials} background={p.avatar_color} size="xs" />
            <span className="text-xs font-medium truncate">{p.display_name}</span>
          </div>
        );
      })}
      {ids.every(id => !id) && (
        <span className="text-xs italic text-muted-foreground">— Sin asignar —</span>
      )}
    </div>
  );

  // Result display
  const rtype = result?.match_closed ? result.result_type : (match.result_type || 'pending');
  const standing = result?.current_standing || 'VS';
  const closed = result?.match_closed ?? false;

  const renderCenter = () => {
    const colorA = teamA?.color || '#3B82F6';
    const colorB = teamB?.color || '#ef4444';

    if (rtype === 'pending' || (!result && !match.result_type)) {
      return <span className="text-xs text-muted-foreground">VS</span>;
    }

    let standingColor = 'hsl(var(--muted-foreground))';
    let standingText = standing;

    if (rtype === 'a_wins' || (rtype === 'in_progress' && standing.startsWith('A'))) {
      standingColor = colorA;
      standingText = standing.replace(/^A\s*/, '');
    } else if (rtype === 'b_wins' || (rtype === 'in_progress' && standing.startsWith('B'))) {
      standingColor = colorB;
      standingText = standing.replace(/^B\s*/, '');
    } else if (rtype === 'halved' || standing === 'AS') {
      standingText = 'AS';
    }

    return (
      <div className="flex flex-col items-center gap-0.5">
        <span
          className={cn('text-sm font-bold', closed && 'text-base')}
          style={{ color: standingColor }}
        >
          {standingText}
        </span>
        {rtype === 'halved' && (
          <span className="text-[10px] text-muted-foreground">½ + ½</span>
        )}
        {/* Points */}
        <div className="text-[10px]">
          {rtype === 'a_wins' && <span style={{ color: colorA }}>1pt</span>}
          {rtype === 'b_wins' && <span style={{ color: colorB }}>1pt</span>}
          {rtype === 'halved' && (
            <>
              <span style={{ color: colorA }}>½</span>
              <span className="text-muted-foreground"> · </span>
              <span style={{ color: colorB }}>½</span>
            </>
          )}
        </div>
        {match.strokes_advantage > 0 && (
          <span className="text-[9px] text-muted-foreground">
            {match.advantage_side === 'a' ? 'A' : 'B'} +{match.strokes_advantage}
          </span>
        )}
      </div>
    );
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-2">
        <div className="grid grid-cols-[1fr_80px_1fr] gap-1 items-center">
          {renderSide(
            [match.player_a1_id, match.player_a2_id],
            teamA?.color || '#3B82F6',
          )}
          <div className="text-center flex flex-col items-center justify-center">
            {renderCenter()}
          </div>
          {renderSide(
            [match.player_b1_id, match.player_b2_id],
            teamB?.color || '#ef4444',
          )}
        </div>
        {isCreator && (
          <div className="flex justify-end gap-1 mt-1">
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={onEdit}>
              <Pencil className="h-3 w-3" /> Editar
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-destructive" onClick={onDelete}>
              <Trash2 className="h-3 w-3" /> Eliminar
            </Button>
          </div>
        )}
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

/* ── TeamsCupDetail page ─────────────────────────── */

const TeamsCupDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const cup = useTeamsCup(id || null);
  const { event, isCreator: isCreatorFlag } = useLeaderboardDetail(id || null);
  const isCreator = isCreatorFlag;

  const queryClient = useQueryClient();

  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [showMatchEditor, setShowMatchEditor] = useState(false);
  const [editingMatch, setEditingMatch] = useState<CupMatch | null>(null);
  const [showAssignPanel, setShowAssignPanel] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    if (!id) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('leaderboard_events')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('Competencia eliminada');
      queryClient.invalidateQueries({ queryKey: ['leaderboard_events'] });
      navigate('/leaderboards');
    } catch (err: any) {
      toast.error('Error al eliminar: ' + err.message);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Local state for debounced handicap updates
  const hcpTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const [localHcps, setLocalHcps] = useState<Map<string, number>>(new Map());

  const handleHcpChange = (participantId: string, value: number) => {
    setLocalHcps(prev => new Map(prev).set(participantId, value));
    const existing = hcpTimers.current.get(participantId);
    if (existing) clearTimeout(existing);
    hcpTimers.current.set(participantId, setTimeout(() => {
      cup.updateMatchHandicap(participantId, value);
    }, 1000));
  };

  const getHcp = (p: CupParticipant) => localHcps.get(p.id) ?? p.match_handicap;

  if (cup.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const teamA = cup.teams[0] ?? null;
  const teamB = cup.teams[1] ?? null;
  const st = cup.standings;

  const cupFormat = (event as any)?.cup_format || 'match_individual';

  const partsA = cup.participants.filter(p => p.cup_team_id === teamA?.id);
  const partsB = cup.participants.filter(p => p.cup_team_id === teamB?.id);
  const partsNone = cup.participants.filter(p => !p.cup_team_id || (teamA && teamB && p.cup_team_id !== teamA.id && p.cup_team_id !== teamB.id));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/leaderboards')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </div>
        <GreenBookLogo height={24} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <User className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowProfileDialog(true)}>
              <User className="h-4 w-4 mr-2" /> Perfil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" /> Cerrar Sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        {/* Event name */}
        <h1 className="text-lg font-bold text-center">{event?.name || 'Teams Cup'}</h1>

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
              {/* Bicolor bar */}
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
              {/* Team A */}
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
              {/* Team B */}
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
      </div>

      {/* ── Assignment Panel (Sheet as Dialog) ─── */}
      <Dialog open={showAssignPanel} onOpenChange={setShowAssignPanel}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Asignar Equipos y Hándicaps</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {cup.participants.map(p => (
              <div key={p.id} className="flex items-center gap-2 p-2 border rounded-lg">
                <PlayerAvatar initials={p.initials} background={p.avatar_color} size="sm" />
                <span className="text-sm font-medium truncate flex-1 min-w-0">{p.display_name}</span>
                <div className="flex gap-1 shrink-0">
                  {teamA && (
                    <button
                      onClick={() => cup.assignTeam(p.id, p.cup_team_id === teamA.id ? null : teamA.id)}
                      className={cn(
                        'w-7 h-7 rounded-md border-2 text-[10px] font-bold transition-all',
                        p.cup_team_id === teamA.id
                          ? 'text-white'
                          : 'bg-transparent',
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
                        p.cup_team_id === teamB.id
                          ? 'text-white'
                          : 'bg-transparent',
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
                    className="w-14 h-7 text-center text-xs"
                  />
                </div>
              </div>
            ))}
          </div>
          <Button className="w-full mt-2" onClick={() => setShowAssignPanel(false)}>
            Cerrar
          </Button>
        </DialogContent>
      </Dialog>

      {/* ── Match Editor ─── */}
      <CupMatchEditorDialog
        open={showMatchEditor}
        leaderboardId={id || ''}
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

      <ProfileDialog open={showProfileDialog} onOpenChange={setShowProfileDialog} />
    </div>
  );
};

export default TeamsCupDetail;
