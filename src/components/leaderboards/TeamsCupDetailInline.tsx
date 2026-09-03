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
import { formatPlayerName, formatPlayerNameShort, disambiguateInitials } from '@/lib/playerInput';
import { PlayerNameTwoLine } from '@/components/leaderboards/PlayerNameTwoLine';
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
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Loader2, Plus, ChevronDown, ChevronRight, Pencil, Trash2, UserPlus,
  Check, X, Hash, Copy, Share2, Settings, Link2, Unlink,
  Calendar, MapPin, CheckCircle, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CupMatchEditorDialog } from '@/components/leaderboards/CupMatchEditorDialog';
import { CupSettingsDialog } from '@/components/leaderboards/CupSettingsDialog';
import { LinkRoundToLeaderboardDialog } from '@/components/leaderboards/LinkRoundToLeaderboardDialog';
import { AddCupParticipantsDialog } from '@/components/leaderboards/AddCupParticipantsDialog';
import { TeePicker, type TeeColor } from '@/components/leaderboards/TeePicker';
import { CreateRoundFromCupDialog } from '@/components/leaderboards/CreateRoundFromCupDialog';
import { cupSlotKey, cupSessionLabel } from '@/types/leaderboard';
import { ManageFoursomesDialog } from '@/components/leaderboards/ManageFoursomesDialog';
import { useActiveRoundForLink } from '@/hooks/useActiveRoundForLink';
import { TeamsCupShareImage } from '@/components/leaderboards/TeamsCupShareImage';


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

const TEE_LABEL_ES: Record<string, string> = {
  blue: 'Azul', white: 'Blanco', yellow: 'Dorado', red: 'Rojo',
};

function formatIndex(v: number): string {
  // Show one decimal for non-integer values, otherwise compact integer.
  return Number.isInteger(v) ? `${v}` : v.toFixed(1);
}

/* ── CupMatchRow ─────────────────────────────────── */

interface MatchRowProps {
  match: CupMatch;
  teams: CupTeam[];
  participants: CupParticipant[];
  result: CupMatchResult | undefined;
  isCreator: boolean;
  /** Initials map disambiguated across ALL leaderboard participants. */
  initialsMap: Map<string, string>;
  onEdit: () => void;
  onDelete: () => void;
}

const CupMatchRow: React.FC<MatchRowProps> = ({
  match, teams, participants, result, isCreator, initialsMap, onEdit, onDelete,
}) => {
  const teamA = teams[0];
  const teamB = teams[1];
  const colorA = teamA?.color || '#3B82F6';
  const colorB = teamB?.color || '#ef4444';

  const getName = (id: string | null) => {
    if (!id) return null;
    return participants.find(p => p.id === id);
  };

  // Determine which specific participant carries the stroke badge.
  // Individual: only one player on the receiving side.
  // Fourball: explicit `stroke_receiver_player_id`, falls back to higher-HCP of the receiving pair.
  const strokeReceiverId: string | null = (() => {
    if (match.strokes_advantage === 0 || match.advantage_side === 'none') return null;
    if (match.format === 'match_individual') {
      return match.advantage_side === 'a' ? match.player_a1_id : match.player_b1_id;
    }
    if (match.stroke_receiver_player_id) return match.stroke_receiver_player_id;
    const ids = match.advantage_side === 'a'
      ? [match.player_a1_id, match.player_a2_id]
      : [match.player_b1_id, match.player_b2_id];
    const pair = ids.map(id => getName(id)).filter(Boolean) as CupParticipant[];
    if (pair.length === 0) return null;
    return pair.reduce((hi, p) => p.match_handicap > hi.match_handicap ? p : hi).id;
  })();

  const renderSide = (ids: (string | null)[], teamColor: string, teamSide: 'a' | 'b') => {
    const filledIds = ids.filter(Boolean) as string[];
    return (
      <div
        className="p-2 rounded-lg min-h-[68px] flex flex-col justify-center min-w-0"
        style={{ backgroundColor: teamColor + '26' }}
      >
        <div className="flex flex-col gap-1.5">
          {filledIds.length === 0 && (
            <span className="text-xs italic text-muted-foreground">— Sin asignar —</span>
          )}
          {filledIds.map(id => {
            const p = getName(id);
            if (!p) return null;
            const isReceiver = strokeReceiverId === p.id && match.advantage_side === teamSide;
            const displayInitials = initialsMap.get(p.id) || p.initials;
            return (
              <div key={p.id} className="flex items-center gap-1.5 min-w-0">
                <PlayerAvatar
                  initials={displayInitials}
                  background={p.avatar_color}
                  size="xs"
                  className="border-0"
                />
                <div className="min-w-0 flex-1 leading-tight">
                  <PlayerNameTwoLine
                    name={p.display_name}
                    className="text-[13px] font-medium"
                  />
                  {isReceiver && (
                    <span
                      className="block text-[10px] font-bold leading-none mt-0.5"
                      style={{ color: teamColor }}
                    >
                      +{match.strokes_advantage} {match.strokes_advantage === 1 ? 'golpe' : 'golpes'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

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
                  'a',
                )}
                <div className="text-center flex flex-col items-center justify-center">
                  {renderCenter()}
                </div>
                {renderSide(
                  [match.player_b1_id, match.player_b2_id],
                  colorB,
                  'b',
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
  const { event, isCreator, closeLeaderboard, reopenLeaderboard } = useLeaderboardDetail(leaderboardId);
  const queryClient = useQueryClient();

  const [showMatchEditor, setShowMatchEditor] = useState(false);
  const [editingMatch, setEditingMatch] = useState<CupMatch | null>(null);
  const [showAssignPanel, setShowAssignPanel] = useState(false);
  const [showAddParticipants, setShowAddParticipants] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [matchToDelete, setMatchToDelete] = useState<CupMatch | null>(null);
  const [deletingMatch, setDeletingMatch] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [isRoundLinked, setIsRoundLinked] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [linkedRoundInfo, setLinkedRoundInfo] = useState<{ date: string | null; courseName: string | null; roundId: string | null; hasFoursomes: boolean }>({ date: null, courseName: null, roundId: null, hasFoursomes: false });
  const [linkedRoundRefresh, setLinkedRoundRefresh] = useState(0);
  const [showManageFoursomes, setShowManageFoursomes] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closeConfirmText, setCloseConfirmText] = useState('');
  const [showCreateRound, setShowCreateRound] = useState(false);
  const [participantToRemove, setParticipantToRemove] = useState<CupParticipant | null>(null);
  const [removingParticipant, setRemovingParticipant] = useState(false);
  const [addingSelf, setAddingSelf] = useState(false);
  /** null = vista acumulada (todos los días); si no, slot "day-session". */
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [showShareImage, setShowShareImage] = useState(false);


  const creatorIsParticipant = !!(profile && cup.participants.some(p => p.profile_id === profile.id));

  const handleAddSelf = async () => {
    if (!profile) return;
    setAddingSelf(true);
    try {
      const indexRaw = Number(profile.current_handicap);
      const indexHcp = Number.isFinite(indexRaw) ? indexRaw : 0;
      const { error } = await supabase
        .from('leaderboard_participants')
        .upsert(
          [{
            leaderboard_id: leaderboardId,
            profile_id: profile.id,
            handicap_for_leaderboard: indexHcp,            // decimal index
            match_handicap: Math.round(indexHcp),           // integer column
            tee_color: 'white',
            cup_team_id: null,
            is_active: true,
          }],
          { onConflict: 'leaderboard_id,profile_id' }
        );
      if (error) throw error;
      toast.success('Te agregaste como jugador');
      await cup.fetchAll();
    } catch (err: any) {
      toast.error('Error al agregarte: ' + err.message);
    } finally {
      setAddingSelf(false);
    }
  };

  /** Returns the match_order numbers where this participant appears, if any. */
  const matchesContainingParticipant = (participantId: string): number[] => {
    return cup.matches
      .filter(m =>
        m.player_a1_id === participantId ||
        m.player_a2_id === participantId ||
        m.player_b1_id === participantId ||
        m.player_b2_id === participantId
      )
      .map(m => m.match_order ?? 0);
  };

  const handleRemoveParticipant = async () => {
    if (!participantToRemove) return;
    setRemovingParticipant(true);
    try {
      const { error } = await supabase
        .from('leaderboard_participants')
        .update({ is_active: false, cup_team_id: null })
        .eq('id', participantToRemove.id);
      if (error) throw error;
      toast.success(`${formatPlayerName(participantToRemove.display_name)} eliminado`);
      setParticipantToRemove(null);
      await cup.fetchAll();
    } catch (err: any) {
      toast.error('Error al eliminar: ' + err.message);
    } finally {
      setRemovingParticipant(false);
    }
  };

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

  // Load linked-round meta (date + course name) to show in the header strip.
  useEffect(() => {
    let cancelled = false;
    const loadMeta = async () => {
      if (!leaderboardId) {
        setLinkedRoundInfo({ date: null, courseName: null, roundId: null, hasFoursomes: false });
        return;
      }
      const { data: linkRows } = await supabase
        .from('leaderboard_rounds')
        .select('round_id, added_at')
        .eq('leaderboard_id', leaderboardId)
        .order('added_at', { ascending: false })
        .limit(1);
      const linkedId = linkRows?.[0]?.round_id;
      if (!linkedId) {
        if (!cancelled) setLinkedRoundInfo({ date: null, courseName: null, roundId: null, hasFoursomes: false });
        return;
      }
      const { data: round } = await supabase
        .from('rounds')
        .select('date, course_id')
        .eq('id', linkedId)
        .maybeSingle();
      let courseName: string | null = null;
      if (round?.course_id) {
        const { data: course } = await supabase
          .from('golf_courses')
          .select('name')
          .eq('id', round.course_id)
          .maybeSingle();
        courseName = course?.name ?? null;
      }
      // Check if there are foursomes with players (round_players rows imply round_groups exist).
      const { count: playersCount } = await supabase
        .from('round_players')
        .select('id', { count: 'exact', head: true })
        .eq('round_id', linkedId);
      const hasFoursomes = (playersCount ?? 0) > 0;
      if (!cancelled) {
        setLinkedRoundInfo({ date: round?.date ?? null, courseName, roundId: linkedId, hasFoursomes });
      }
    };
    loadMeta();
    return () => { cancelled = true; };
  }, [leaderboardId, isRoundLinked, linkedRoundRefresh]);

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
      setShowUnlinkConfirm(false);
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
      // Clean up children first (no FK cascades in DB)
      await supabase.from('cup_matches').delete().eq('leaderboard_id', leaderboardId);
      await supabase.from('cup_teams').delete().eq('leaderboard_id', leaderboardId);
      await supabase.from('leaderboard_scores').delete().eq('leaderboard_id', leaderboardId);
      await supabase.from('leaderboard_rounds').delete().eq('leaderboard_id', leaderboardId);
      await supabase.from('leaderboard_participants').delete().eq('leaderboard_id', leaderboardId);
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

  const handleDeleteMatch = async () => {
    if (!matchToDelete) return;
    setDeletingMatch(true);
    try {
      await cup.deleteMatch(matchToDelete.id);
      setMatchToDelete(null);
    } finally {
      setDeletingMatch(false);
    }
  };

  // ── Deferred assignment-panel state ─────────────────────
  // Local team + index + tee drafts. Nothing is written to the DB while the
  // user taps around. On dialog close we diff & batch-save in a single call.
  const [draftTeams, setDraftTeams] = useState<Map<string, string | null>>(new Map());
  const [draftHcps, setDraftHcps] = useState<Map<string, number>>(new Map());
  const [draftTees, setDraftTees] = useState<Map<string, TeeColor>>(new Map());

  const getDraftTeam = (p: CupParticipant) =>
    draftTeams.has(p.id) ? draftTeams.get(p.id)! : p.cup_team_id;
  const getDraftHcp = (p: CupParticipant) =>
    draftHcps.has(p.id) ? draftHcps.get(p.id)! : p.handicap_for_leaderboard;
  const getDraftTee = (p: CupParticipant): TeeColor =>
    draftTees.has(p.id) ? draftTees.get(p.id)! : ((p.tee_color as TeeColor | null) ?? 'white');

  const setDraftTeam = (id: string, teamId: string | null) =>
    setDraftTeams(prev => new Map(prev).set(id, teamId));
  const setDraftHcp = (id: string, value: number) =>
    setDraftHcps(prev => new Map(prev).set(id, value));
  const setDraftTee = (id: string, value: TeeColor) =>
    setDraftTees(prev => new Map(prev).set(id, value));

  // Pull the latest Handicap Index from each player's profile into the drafts.
  const [refreshingIndexes, setRefreshingIndexes] = useState(false);
  const refreshIndexesFromProfiles = async () => {
    const ids = cup.participants.map(p => p.profile_id).filter((v): v is string => !!v);
    if (ids.length === 0) {
      toast.info('No hay jugadores registrados para actualizar');
      return;
    }
    setRefreshingIndexes(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, current_handicap')
        .in('id', ids);
      if (error) throw error;
      const byProfile = new Map((data ?? []).map(r => [r.id, Number(r.current_handicap)]));
      let changed = 0;
      setDraftHcps(prev => {
        const next = new Map(prev);
        for (const p of cup.participants) {
          if (!p.profile_id) continue;
          const live = byProfile.get(p.profile_id);
          if (live === undefined || !Number.isFinite(live)) continue;
          const current = next.has(p.id) ? next.get(p.id)! : p.handicap_for_leaderboard;
          if (Math.abs(live - current) < 0.05) continue;
          next.set(p.id, live);
          changed++;
        }
        return next;
      });
      toast.success(
        changed > 0
          ? `${changed} hándicap(s) actualizados — revisa y presiona Guardar`
          : 'Todos los hándicaps ya están al día'
      );
    } catch (err) {
      console.error('refreshIndexesFromProfiles', err);
      toast.error('No se pudieron actualizar los hándicaps');
    } finally {
      setRefreshingIndexes(false);
    }
  };

  const flushAssignDrafts = async () => {
    const updates: Array<{
      id: string;
      cup_team_id?: string | null;
      match_handicap?: number;
      handicap_for_leaderboard?: number;
      tee_color?: TeeColor | null;
    }> = [];
    for (const p of cup.participants) {
      const patch: typeof updates[number] = { id: p.id };
      let dirty = false;
      const teamChanged = draftTeams.has(p.id) && draftTeams.get(p.id) !== p.cup_team_id;
      const hcpChanged = draftHcps.has(p.id) && draftHcps.get(p.id) !== p.handicap_for_leaderboard;
      const teeChanged = draftTees.has(p.id) && draftTees.get(p.id) !== p.tee_color;

      if (teamChanged) {
        patch.cup_team_id = draftTeams.get(p.id)!;
        dirty = true;
      }
      if (hcpChanged) {
        const newIndex = draftHcps.get(p.id)!;
        patch.handicap_for_leaderboard = newIndex;
        patch.match_handicap = Math.round(newIndex);
        dirty = true;
      }
      if (teeChanged) {
        patch.tee_color = draftTees.get(p.id)!;
        dirty = true;
      }
      if (dirty) updates.push(patch);
    }
    if (updates.length > 0) {
      const saved = await cup.batchUpdateParticipants(updates);
      if (!saved) return;
      toast.success(`Cambios guardados (${updates.length})`);
    }
    setDraftTeams(new Map());
    setDraftHcps(new Map());
    setDraftTees(new Map());
    return true;
  };


  // Initials disambiguation across ALL leaderboard participants so that
  // homonymous players (e.g. several "Alejandro S...") get distinct avatars
  // (ASU / ASA / ASB) regardless of which match they appear in.
  const initialsMap = React.useMemo(() => {
    return disambiguateInitials(
      cup.participants.map(p => ({
        id: p.id,
        name: p.display_name,
        initials: p.initials,
      })) as any,
    );
  }, [cup.participants]);

  if (cup.loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const teamA = cup.teams[0] ?? null;
  const teamB = cup.teams[1] ?? null;

  // Slot chips: one per day/session. Only shown when the cup spans more
  // than a single day/session.
  const slotOptions = cup.days.flatMap(d =>
    d.sessions.map(sess => ({
      key: cupSlotKey(d.day_number, sess.session_number),
      day_number: d.day_number,
      session_number: sess.session_number,
      label: cupSessionLabel(d, sess, d.sessions.length > 1),
      format: sess.format,
    })),
  );
  const isMultiSlot = slotOptions.length > 1;
  const activeSlot = isMultiSlot ? selectedSlot : null;
  const activeSlotOption = activeSlot
    ? slotOptions.find(o => o.key === activeSlot) ?? null
    : null;

  // Accumulated scoreboard (all days) stays visible always; when a slot is
  // selected we additionally show that slot's partial score.
  const st = cup.standings;
  const slotSt = activeSlot ? cup.standingsBySlot.get(activeSlot) ?? null : null;

  const visibleMatches = activeSlotOption
    ? cup.matches.filter(m =>
        (m.day_number ?? 1) === activeSlotOption.day_number &&
        (m.session_number ?? 1) === activeSlotOption.session_number)
    : cup.matches;

  /* ── Sharing ─────────────────────────────────────
   * A slot can only be shared once its linked round has been closed by the
   * organizer. In the accumulated (Total) view we allow sharing as soon as at
   * least one day is closed; days still in play are labelled as such.
   */
  const slotStatusLabel = (key: string): string => {
    if (cup.isSlotClosed(key)) return 'Cerrado';
    const s = cup.standingsBySlot.get(key);
    if (s && (s.has_in_progress || s.matches_completed > 0)) return 'En juego';
    return 'Pendiente';
  };
  const canShareSelection = activeSlot
    ? cup.isSlotClosed(activeSlot)
    : slotOptions.some(o => cup.isSlotClosed(o.key));

  const shareMatchesData = (() => {
    const source = activeSlotOption
      ? cup.matches.filter(m =>
          (m.day_number ?? 1) === activeSlotOption.day_number &&
          (m.session_number ?? 1) === activeSlotOption.session_number)
      : cup.matches;
    const nameOf = (id: string | null) => {
      if (!id) return null;
      const p = cup.participants.find(x => x.id === id);
      return p ? formatPlayerNameShort(p.display_name) : null;
    };
    return [...source]
      .sort((a, b) => {
        const ga = cup.getMatchGroupNumber(a);
        const gb = cup.getMatchGroupNumber(b);
        if (ga !== gb) return (ga === Infinity ? 1e9 : ga) - (gb === Infinity ? 1e9 : gb);
        return (a.match_order ?? 0) - (b.match_order ?? 0);
      })
      .map(m => {
        const res = cup.matchResults.get(m.id);
        const closed = res?.match_closed ?? false;
        const diff = res ? res.side_a_holes_won - res.side_b_holes_won : 0;
        const rtype = closed
          ? res!.result_type
          : (m.result_override ? m.result_type : (res ? res.result_type : 'pending'));
        let winner: 'a' | 'b' | 'halved' | null = null;
        if (rtype === 'a_wins') winner = 'a';
        else if (rtype === 'b_wins') winner = 'b';
        else if (rtype === 'halved') winner = 'halved';
        else if (rtype === 'in_progress' && (res?.holes_played ?? 0) > 0) {
          winner = diff > 0 ? 'a' : diff < 0 ? 'b' : 'halved';
        }
        let resultText = 'VS';
        let resultNote: string | undefined;
        if (closed) {
          resultText = res?.current_standing
            ? res.current_standing.replace(/^[AB]\s*/, '')
            : formatRunning(diff);
          resultNote = 'Final';
        } else if (rtype === 'in_progress' && (res?.holes_played ?? 0) > 0) {
          resultText = formatRunning(diff);
          resultNote = `thru ${res!.holes_played}`;
        } else if (m.result_override && m.result_type) {
          resultText = m.result_detail || formatRunning(diff);
          resultNote = 'Final';
        } else {
          resultText = '—';
          resultNote = 'Pendiente';
        }
        const g = cup.getMatchGroupNumber(m);
        return {
          group: g === Infinity ? null : g,
          sideA: [nameOf(m.player_a1_id), nameOf(m.player_a2_id)].filter(Boolean) as string[],
          sideB: [nameOf(m.player_b1_id), nameOf(m.player_b2_id)].filter(Boolean) as string[],
          resultText,
          resultNote,
          winner,
        };
      });
  })();

  const shareSlots = activeSlotOption
    ? undefined
    : slotOptions.map(o => {
        const s = cup.standingsBySlot.get(o.key);
        return {
          label: o.label,
          points_a: s?.points_a ?? 0,
          points_b: s?.points_b ?? 0,
          statusLabel: slotStatusLabel(o.key),
        };
      });

  const shareRoundInfo = (() => {
    const roundId = activeSlot
      ? cup.standingsBySlot.get(activeSlot)?.round_id ?? null
      : null;
    if (roundId) {
      const info = cup.roundInfoById.get(roundId);
      if (info) return { courseName: info.courseName, date: info.date };
    }
    return { courseName: linkedRoundInfo.courseName, date: linkedRoundInfo.date };
  })();


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
      {/* Top bar: actions (centered, sits comfortably below subheader) */}
      <div className="flex items-center justify-center gap-1">
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
            onClick={() => setShowUnlinkConfirm(true)}
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
        {event?.code && (
          <button
            type="button"
            onClick={copyCode}
            className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-border bg-muted/40 hover:bg-muted text-xs font-mono"
            aria-label="Copiar código"
            title="Copiar código del leaderboard"
          >
            <Hash className="h-3 w-3 text-muted-foreground" />
            <span className="font-semibold tracking-wide">{event.code}</span>
          </button>
        )}
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
        {isCreator && event && (
          event.status === 'active' ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-muted-foreground border-muted-foreground/30 text-xs"
              onClick={() => { setCloseConfirmText(''); setShowCloseConfirm(true); }}
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Cerrar competencia
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground text-xs gap-1.5"
              onClick={reopenLeaderboard}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reactivar competencia
            </Button>
          )
        )}
      </div>

      {/* Event title + meta (date + location, no description) */}
      <div className="text-center space-y-1">
        <h1 className="text-lg font-bold leading-tight">{event?.name || 'Teams Cup'}</h1>
        {(linkedRoundInfo.date || linkedRoundInfo.courseName) && (
          <div className="flex items-center justify-center gap-3 text-[11px] text-muted-foreground flex-wrap">
            {linkedRoundInfo.date && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(linkedRoundInfo.date + 'T12:00:00').toLocaleDateString('es-MX', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </span>
            )}
            {linkedRoundInfo.courseName && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {linkedRoundInfo.courseName}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-[10px]">
            {activeSlotOption
              ? (activeSlotOption.format === 'fourball' ? 'Fourball (Best Ball)' : 'Match Play Individual')
              : isMultiSlot
                ? `${cup.days.length} ${cup.days.length === 1 ? 'día' : 'días'} · ${slotOptions.length} sesiones`
                : (cupFormat === 'fourball' ? 'Fourball (Best Ball)' : 'Match Play Individual')}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {cup.participants.length} jugadores
          </Badge>
        </div>
      </div>

      {/* ── Day / session chips + share ─── */}
      {isMultiSlot && (
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setSelectedSlot(null)}
              className={`shrink-0 h-7 px-3 rounded-full text-xs font-medium border transition-colors ${
                activeSlot === null
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              Total
            </button>
            {slotOptions.map(o => {
              const s2 = cup.standingsBySlot.get(o.key);
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setSelectedSlot(o.key)}
                  className={`shrink-0 h-7 px-3 rounded-full text-xs font-medium border transition-colors ${
                    activeSlot === o.key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  {o.label}
                  {s2 && s2.matches_total > 0 && (
                    <span className="ml-1 opacity-80">{s2.points_a}–{s2.points_b}</span>
                  )}
                </button>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="shrink-0 h-7 w-7"
            disabled={!canShareSelection}
            onClick={() => canShareSelection
              ? setShowShareImage(true)
              : toast.info('Disponible cuando el organizador cierre la ronda')}
            title={canShareSelection
              ? 'Compartir resultado'
              : 'Disponible cuando el organizador cierre la ronda'}
            aria-label="Compartir resultado"
          >
            <Share2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Single-day cups: share button under the header */}
      {!isMultiSlot && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={!canShareSelection}
            onClick={() => setShowShareImage(true)}
            title={canShareSelection
              ? 'Compartir resultado'
              : 'Disponible cuando el organizador cierre la ronda'}
          >
            <Share2 className="h-3.5 w-3.5" />
            Compartir resultado
          </Button>
        </div>
      )}


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
              {isMultiSlot && <span className="font-medium">Acumulado · </span>}
              {st.matches_total} matches · {st.matches_completed} completados
              {st.has_in_progress && <span className="ml-1 italic">· en vivo</span>}
            </p>
            {slotSt && (
              <div className="mt-3 pt-3 border-t text-center">
                <p className="text-[11px] text-muted-foreground">
                  {activeSlotOption?.label}
                </p>
                <p className="text-lg font-bold">
                  <span style={{ color: st.team_a?.color }}>{slotSt.points_a}</span>
                  <span className="text-muted-foreground font-light mx-1.5">—</span>
                  <span style={{ color: st.team_b?.color }}>{slotSt.points_b}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {slotSt.matches_total} matches · {slotSt.matches_completed} completados
                  {slotSt.has_in_progress && <span className="ml-1 italic">· en vivo</span>}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-5 text-center text-sm text-muted-foreground">
            Configura los matches para ver el marcador
          </CardContent>
        </Card>
      )}

      {/* ── Total view: per-day breakdown (matches live inside each day) ─── */}
      {isMultiSlot && !activeSlotOption && (
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Por jornada</h2>
              <p className="text-[11px] text-muted-foreground">Toca para ver matches</p>
            </div>

            {slotOptions.map(o => {
              const s = cup.standingsBySlot.get(o.key);
              const status = slotStatusLabel(o.key);
              const pa = s?.points_a ?? 0;
              const pb = s?.points_b ?? 0;
              const total = pa + pb;
              const done = s?.matches_completed ?? 0;
              const tot = s?.matches_total ?? 0;
              const pct = tot > 0 ? Math.round((done / tot) * 100) : 0;
              const statusClass = status === 'Cerrado'
                ? 'bg-primary/15 text-primary border-primary/30'
                : status === 'En juego'
                  ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                  : 'bg-muted text-muted-foreground border-border';

              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setSelectedSlot(o.key)}
                  className="w-full rounded-xl border border-border bg-muted/40 hover:bg-muted/70 active:scale-[0.99] transition-all px-3.5 py-3 text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                      <p className="text-lg font-bold truncate">{o.label}</p>
                    </div>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${statusClass}`}>
                      {status}
                    </Badge>
                  </div>

                  <div className="flex items-end justify-center gap-4 mt-2">
                    <div className="text-center min-w-0">
                      <p className="text-3xl font-black tabular-nums leading-none" style={{ color: st?.team_a?.color }}>
                        {pa}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate mt-1 max-w-[110px]">
                        {st?.team_a?.name ?? 'Equipo A'}
                      </p>
                    </div>
                    <span className="text-lg text-muted-foreground font-light leading-none pb-4">—</span>
                    <div className="text-center min-w-0">
                      <p className="text-3xl font-black tabular-nums leading-none" style={{ color: st?.team_b?.color }}>
                        {pb}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate mt-1 max-w-[110px]">
                        {st?.team_b?.name ?? 'Equipo B'}
                      </p>
                    </div>
                  </div>

                  <div className="h-2 rounded-full overflow-hidden flex mt-2.5 bg-muted">
                    {total > 0 && (
                      <>
                        <div className="h-full" style={{ width: `${(pa / total) * 100}%`, backgroundColor: st?.team_a?.color }} />
                        <div className="h-full" style={{ width: `${(pb / total) * 100}%`, backgroundColor: st?.team_b?.color }} />
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{done}</span>/{tot} matches completados
                      {tot > 0 && <span className="ml-1">· {pct}%</span>}
                    </p>
                    <span className="flex items-center gap-0.5 text-xs font-medium text-primary shrink-0">
                      Ver <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Section 2: Matches (only inside a day; Total shows the breakdown) ─── */}
      {(!isMultiSlot || !!activeSlotOption) && (
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

        {visibleMatches.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-1">
            {activeSlotOption
              ? 'No hay matches en esta jornada todavía.'
              : <>Aún no hay matches. Usa <span className="font-medium">+ Agregar Match</span> para crear el primero.</>}
          </p>
        ) : (
          <div className="space-y-4">
            {(() => {
              const grouped = new Map<number, CupMatch[]>();
              for (const m of visibleMatches) {
                const g = cup.getMatchGroupNumber(m);
                if (!grouped.has(g)) grouped.set(g, []);
                grouped.get(g)!.push(m);
              }
              const entries = Array.from(grouped.entries())
                .sort(([a], [b]) => (a === Infinity ? 1 : b === Infinity ? -1 : a - b))
                .map(([g, ms]) => ({
                  groupNumber: g,
                  matches: ms.sort((a, b) => (a.match_order ?? 0) - (b.match_order ?? 0)),
                }));
              return entries.map(({ groupNumber, matches }) => (
                <div key={groupNumber === Infinity ? 'ungrouped' : groupNumber} className="space-y-2">
                  {entries.length > 1 && groupNumber !== Infinity && (
                    <div className="flex items-center gap-1.5 px-1">
                      <span className="text-[11px] font-semibold text-muted-foreground">Grupo {groupNumber}</span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  {matches.map(m => (
                    <CupMatchRow
                      key={m.id}
                      match={m}
                      teams={cup.teams}
                      participants={cup.participants}
                      result={cup.matchResults.get(m.id)}
                      isCreator={isCreator}
                      initialsMap={initialsMap}
                      onEdit={() => { setEditingMatch(m); setShowMatchEditor(true); }}
                      onDelete={() => setMatchToDelete(m)}
                    />
                  ))}
                </div>
              ));
            })()}
          </div>
        )}
      </div>
      )}


      {/* ── Section 2.5: Crear Ronda y Grupos de Juego (creator only) ─── */}
      {isCreator && cup.participants.length >= 2 && (!linkedRoundInfo.date || !linkedRoundInfo.hasFoursomes) && (
        <Card className="border-dashed border-primary/40">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Crear Ronda y Grupos de Juego</p>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                  Genera la ronda donde estos jugadores capturarán sus scores y arma los
                  foursomes. La ronda queda enlazada automáticamente.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="w-full gap-1"
              onClick={() => setShowCreateRound(true)}
            >
              <Plus className="h-3.5 w-3.5" /> {linkedRoundInfo.roundId ? 'Recrear Foursomes' : 'Crear Ronda desde esta Cup'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Section 2.6: Manage Foursomes (creator only, once a round is linked) ─── */}
      {isCreator && linkedRoundInfo.roundId && linkedRoundInfo.hasFoursomes && cup.participants.length > 0 && (
        <Card className="border-primary/30">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Foursomes de la Ronda</p>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                  Mueve jugadores entre foursomes, agrega nuevos grupos o suma
                  jugadores que se incorporen después (incluye invitados).
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-1"
              onClick={() => setShowManageFoursomes(true)}
            >
              <Settings className="h-3.5 w-3.5" /> Editar Foursomes
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Section 3: Participants ─── */}

      {isCreator && cup.participants.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-4 text-center space-y-2">
            <p className="text-sm font-medium">Aún no hay jugadores</p>
            <p className="text-xs text-muted-foreground">
              Agrega participantes para empezar a armar los matches.
            </p>
            <div className="flex flex-col gap-2 pt-1">
              {!creatorIsParticipant && profile && (
                <Button size="sm" variant="outline" className="gap-1" onClick={handleAddSelf} disabled={addingSelf}>
                  {addingSelf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                  Agregarme como jugador
                </Button>
              )}
              <Button size="sm" className="gap-1" onClick={() => setShowAddParticipants(true)}>
                <Plus className="h-3.5 w-3.5" /> Agregar Jugadores
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <Collapsible open={participantsOpen} onOpenChange={setParticipantsOpen}>
        <div className="flex items-center justify-between gap-2">
          <CollapsibleTrigger className="flex items-center gap-1.5 text-base font-semibold">
            Participantes
            <ChevronDown className={cn('h-4 w-4 transition-transform', participantsOpen && 'rotate-180')} />
          </CollapsibleTrigger>
          {isCreator && (
            <div className="flex gap-1.5 flex-wrap justify-end">
              {!creatorIsParticipant && profile && (
                <Button size="sm" variant="outline" className="gap-1" onClick={handleAddSelf} disabled={addingSelf}>
                  {addingSelf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                  Agregarme
                </Button>
              )}
              <Button size="sm" className="gap-1" onClick={() => setShowAddParticipants(true)}>
                <Plus className="h-3.5 w-3.5" /> Agregar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAssignPanel(true)}
                disabled={cup.participants.length === 0}
              >
                Asignar Equipos
              </Button>
            </div>
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
                <div key={p.id} className="flex items-center gap-1.5 py-1 min-w-0">
                  <PlayerAvatar initials={p.initials} background={p.avatar_color} size="xs" />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-medium truncate block">{formatPlayerName(p.display_name)}</span>
                    <span className="text-[10px] text-muted-foreground">
                      Index {formatIndex(p.handicap_for_leaderboard)}
                      {p.tee_color && ` · ${TEE_LABEL_ES[p.tee_color] ?? p.tee_color}`}
                    </span>
                  </div>
                  {isCreator && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setParticipantToRemove(p)}
                      aria-label={`Eliminar a ${p.display_name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div className="min-w-0">
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
                <div key={p.id} className="flex items-center gap-1.5 py-1 min-w-0">
                  <PlayerAvatar initials={p.initials} background={p.avatar_color} size="xs" />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-medium truncate block">{formatPlayerName(p.display_name)}</span>
                    <span className="text-[10px] text-muted-foreground">
                      Index {formatIndex(p.handicap_for_leaderboard)}
                      {p.tee_color && ` · ${TEE_LABEL_ES[p.tee_color] ?? p.tee_color}`}
                    </span>
                  </div>
                  {isCreator && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setParticipantToRemove(p)}
                      aria-label={`Eliminar a ${p.display_name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
          {partsNone.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Sin equipo asignado</p>
              {partsNone.map(p => (
                <div key={p.id} className="flex items-center gap-1.5 py-1 min-w-0">
                  <PlayerAvatar initials={p.initials} background={p.avatar_color} size="xs" />
                  <span className="text-xs font-medium truncate flex-1 min-w-0">{formatPlayerName(p.display_name)}</span>
                  <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200 ml-auto shrink-0">
                    Pendiente
                  </Badge>
                  {isCreator && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setParticipantToRemove(p)}
                      aria-label={`Eliminar a ${p.display_name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* ── Assignment Panel (deferred saves on close) ─── */}
      <Dialog open={showAssignPanel} onOpenChange={async (open) => {
        if (!open) {
          const saved = await flushAssignDrafts();
          if (!saved) return;
        }
        setShowAssignPanel(open);
      }}>
        <DialogContent
          className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:w-full sm:max-w-sm mx-auto max-h-[85vh] overflow-y-auto overflow-x-hidden p-2 box-border [&>button.absolute]:hidden"
          style={{ width: 'calc(100vw - 2rem)', maxWidth: 'calc(100vw - 2rem)' }}
        >
          {(() => {
            // Detect pending changes vs. saved state.
            const hasChanges = cup.participants.some(p => {
              const teamChanged = draftTeams.has(p.id) && draftTeams.get(p.id) !== p.cup_team_id;
              const hcpChanged = draftHcps.has(p.id) && draftHcps.get(p.id) !== p.handicap_for_leaderboard;
              const teeChanged = draftTees.has(p.id) && draftTees.get(p.id) !== p.tee_color;
              return teamChanged || hcpChanged || teeChanged;
            });

            const renderRow = (p: CupParticipant) => {
              const draftTeam = getDraftTeam(p);
              return (
                <div key={p.id} className="flex items-center gap-0.5 p-1 border rounded-lg min-w-0">
                  <span className="text-xs font-medium truncate flex-1 min-w-0">{formatPlayerName(p.display_name)}</span>
                  <div className="flex gap-0.5 shrink-0">
                    {teamA && (
                      <button
                        type="button"
                        onClick={() => setDraftTeam(p.id, draftTeam === teamA.id ? null : teamA.id)}
                        className="w-4 h-4 rounded-md border-2 text-[8px] font-bold transition-all"
                        style={{
                          borderColor: teamA.color,
                          backgroundColor: draftTeam === teamA.id ? teamA.color : 'transparent',
                          color: draftTeam === teamA.id ? '#fff' : teamA.color,
                        }}
                      >
                        A
                      </button>
                    )}
                    {teamB && (
                      <button
                        type="button"
                        onClick={() => setDraftTeam(p.id, draftTeam === teamB.id ? null : teamB.id)}
                        className="w-4 h-4 rounded-md border-2 text-[8px] font-bold transition-all"
                        style={{
                          borderColor: teamB.color,
                          backgroundColor: draftTeam === teamB.id ? teamB.color : 'transparent',
                          color: draftTeam === teamB.id ? '#fff' : teamB.color,
                        }}
                      >
                        B
                      </button>
                    )}
                  </div>
                  <div className="h-4 w-px bg-border shrink-0 mx-0.5" aria-hidden="true" />
                  <TeePicker
                    value={getDraftTee(p)}
                    onChange={(v) => setDraftTee(p.id, v)}
                    size="xxs"
                    className="gap-0.5"
                  />
                  <Input
                    type="number"
                    step="0.1"
                    min="-10"
                    max="54"
                    value={getDraftHcp(p)}
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      setDraftHcp(p.id, Number.isFinite(v) ? v : 0);
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="w-9 h-6 px-0.5 text-center text-xs shrink-0"
                    aria-label="HCP Index"
                    title="HCP Index"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setParticipantToRemove(p)}
                    aria-label={`Eliminar a ${p.display_name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              );
            };

            // Build views from drafts so the user sees instant local feedback.
            const draftPartsNone = cup.participants.filter(p => !getDraftTeam(p)).sort(byName);
            const draftPartsA = teamA ? cup.participants.filter(p => getDraftTeam(p) === teamA.id).sort(byName) : [];
            const draftPartsB = teamB ? cup.participants.filter(p => getDraftTeam(p) === teamB.id).sort(byName) : [];

            // Column header: name | Equipo | sep | Tee | HCP | (trash)
            const ColumnHeader = () => (
              <div className="flex items-center gap-0.5 px-1 pb-0.5 min-w-0">
                <span className="flex-1 min-w-0" />
                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground text-center" style={{ width: teamA && teamB ? '2.125rem' : '1.125rem' }}>
                  Eq.
                </span>
                <span className="w-px shrink-0 mx-0.5" />
                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground text-center" style={{ width: '4.5rem' }}>
                  Tee
                </span>
                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground text-center" style={{ width: '2.25rem' }}>
                  HCP
                </span>
                <span className="w-5 shrink-0" />
              </div>
            );

            return (
              <div className="space-y-2">
                <div className="sticky top-0 z-10 -mx-2.5 px-2.5 pt-1 pb-2 bg-background border-b space-y-2">
                  <DialogTitle className="text-base">Asignar Equipos y Hándicaps</DialogTitle>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 flex-1 text-xs min-w-0"
                      disabled={refreshingIndexes}
                      onClick={() => void refreshIndexesFromProfiles()}
                      title="Traer el Hándicap Index actual de cada jugador"
                    >
                      {refreshingIndexes
                        ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                      <span className="truncate">Actualizar Index</span>
                    </Button>
                    <Button
                      size="sm"
                      variant={hasChanges ? 'default' : 'outline'}
                      className="h-8 flex-1 text-xs min-w-0"
                      onClick={async () => {
                        const saved = await flushAssignDrafts();
                        if (saved) setShowAssignPanel(false);
                      }}
                    >
                      Guardar
                    </Button>
                  </div>
                </div>
                {draftPartsNone.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground">Sin asignar</p>
                    <ColumnHeader />
                    <div className="space-y-1.5">{draftPartsNone.map(renderRow)}</div>
                  </div>
                )}
                {teamA && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold" style={{ color: teamA.color }}>
                      {teamA.name}
                    </p>
                    {draftPartsA.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic px-1">Sin jugadores</p>
                    ) : (
                      <>
                        <ColumnHeader />
                        <div className="space-y-1.5">{draftPartsA.map(renderRow)}</div>
                      </>
                    )}
                  </div>
                )}
                {teamB && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold" style={{ color: teamB.color }}>
                      {teamB.name}
                    </p>
                    {draftPartsB.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic px-1">Sin jugadores</p>
                    ) : (
                      <>
                        <ColumnHeader />
                        <div className="space-y-1.5">{draftPartsB.map(renderRow)}</div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Match Editor ─── */}
      <CupMatchEditorDialog
        open={showMatchEditor}
        leaderboardId={leaderboardId}
        match={editingMatch}
        teams={cup.teams}
        participants={cup.participants}
        allMatches={cup.matches}
        days={cup.days}
        defaultDay={activeSlotOption?.day_number ?? 1}
        defaultSession={activeSlotOption?.session_number ?? 1}
        participantsForSlot={(d, sess) =>
          cup.participantsForRound(cup.standingsBySlot.get(cupSlotKey(d, sess))?.round_id ?? null)}
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
        calcFourballHandicap={cup.calcFourballHandicap}
      />

      {/* ── Add Participants Dialog (mounted only when open) ─── */}
      {showAddParticipants && (
        <AddCupParticipantsDialog
          open={showAddParticipants}
          onClose={() => setShowAddParticipants(false)}
          leaderboardId={leaderboardId}
          teams={cup.teams}
          existingProfileIds={new Set(cup.participants.map(p => p.profile_id).filter(Boolean) as string[])}
          existingGuestNames={new Set(cup.participants.filter(p => !p.profile_id).map(p => p.display_name))}
          onAdded={() => { cup.fetchAll(); setParticipantsOpen(true); }}
          selfOption={!creatorIsParticipant && profile ? {
            displayName: profile.display_name,
            initials: profile.initials,
            avatarColor: profile.avatar_color,
            handicap: Number(profile.current_handicap) || 0,
            onAddSelf: async () => {
              await handleAddSelf();
              setParticipantsOpen(true);
            },
          } : null}
        />
      )}

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

      {/* ── Create Round From Cup Dialog (creator only) ─── */}
      {isCreator && profile && showCreateRound && (
        <CreateRoundFromCupDialog
          open={showCreateRound}
          onClose={() => setShowCreateRound(false)}
          leaderboardId={leaderboardId}
          organizerProfileId={profile.id}
          participants={cup.participants}
          teams={cup.teams}
          matches={cup.matches}
          days={cup.days}
          defaultDay={activeSlotOption?.day_number ?? 1}
          defaultSession={activeSlotOption?.session_number ?? 1}
          existingRoundId={linkedRoundInfo.roundId}
          onCreated={async () => {
            await cup.fetchAll();
            setLinkedRoundRefresh(n => n + 1);
          }}
        />
      )}

      {/* ── Manage Foursomes Dialog (creator only, post-round-creation) ─── */}
      {isCreator && linkedRoundInfo.roundId && (
        <ManageFoursomesDialog
          open={showManageFoursomes}
          onClose={() => setShowManageFoursomes(false)}
          roundId={linkedRoundInfo.roundId}
          leaderboardId={leaderboardId}
          participants={cup.participants}
          onChanged={async () => {
            await cup.fetchAll();
            setLinkedRoundRefresh(n => n + 1);
          }}
          onRoundMissing={() => {
            // Round was deleted out from under us — close dialog and refresh
            // so the "Crear Ronda" card reappears.
            setShowManageFoursomes(false);
            setLinkedRoundRefresh(n => n + 1);
          }}
        />
      )}

      {/* ── Share result image ─── */}
      {showShareImage && teamA && teamB && (
        <TeamsCupShareImage
          open={showShareImage}
          onClose={() => setShowShareImage(false)}
          cupName={event?.name || 'Teams Cup'}
          subtitle={activeSlotOption ? activeSlotOption.label : 'Total acumulado'}
          courseName={shareRoundInfo.courseName}
          date={shareRoundInfo.date}
          teamA={{
            name: teamA.name || 'Equipo A',
            color: teamA.color || '#3B82F6',
            points: (activeSlot ? slotSt?.points_a : st?.points_a) ?? 0,
          }}
          teamB={{
            name: teamB.name || 'Equipo B',
            color: teamB.color || '#ef4444',
            points: (activeSlot ? slotSt?.points_b : st?.points_b) ?? 0,
          }}
          slots={shareSlots}
          matches={shareMatchesData}
        />
      )}


      {/* ── Settings Dialog (creator only) ─── */}
      {isCreator && event && (
        <CupSettingsDialog
          open={showSettings}
          onOpenChange={setShowSettings}
          event={event as any}
          teams={cup.teams}
          matches={cup.matches}
          onUpdateTeam={(teamId, updates) => cup.updateTeam(teamId, updates)}
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

      {/* ── Close Competition Confirm (typed CERRAR) ─── */}
      <Dialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cerrar esta competencia?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Pasará a Historial. Los resultados quedan guardados y se pueden consultar.
            Puedes reactivarla más adelante si es necesario. Escribe <strong>CERRAR</strong> para confirmar.
          </p>
          <Input
            value={closeConfirmText}
            onChange={(e) => setCloseConfirmText(e.target.value)}
            placeholder="Escribe CERRAR"
            className="uppercase"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCloseConfirm(false)}>Cancelar</Button>
            <Button
              disabled={closeConfirmText.trim().toLowerCase() !== 'cerrar'}
              onClick={async () => {
                await closeLeaderboard();
                setShowCloseConfirm(false);
                setCloseConfirmText('');
              }}
            >
              Cerrar competencia
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={showUnlinkConfirm} onOpenChange={setShowUnlinkConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desvincular ronda?</AlertDialogTitle>
            <AlertDialogDescription>
              Al desvincular la ronda, todos los matches configurados perderán su
              vínculo con los resultados en vivo y volverán a estado "pending".
              Tendrás que volver a vincular y reconfigurar para evitar reprocesos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unlinking}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={unlinking}
              onClick={(e) => { e.preventDefault(); handleUnlinkRound(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {unlinking && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Desvincular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Match Confirm ─── */}
      <AlertDialog
        open={!!matchToDelete}
        onOpenChange={(open) => { if (!open) setMatchToDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este match?</AlertDialogTitle>
            <AlertDialogDescription>
              Se quitará de la competencia y no contará para el marcador. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingMatch}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingMatch}
              onClick={(e) => { e.preventDefault(); handleDeleteMatch(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingMatch && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Remove Participant Confirm ─── */}
      <AlertDialog
        open={!!participantToRemove}
        onOpenChange={(open) => { if (!open) setParticipantToRemove(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar a {participantToRemove ? formatPlayerName(participantToRemove.display_name) : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                if (!participantToRemove) return null;
                const inMatches = matchesContainingParticipant(participantToRemove.id);
                if (inMatches.length > 0) {
                  return (
                    <>
                      Este jugador aparece en {inMatches.length === 1 ? 'el match' : 'los matches'}{' '}
                      <strong>#{inMatches.sort((a, b) => a - b).join(', #')}</strong>.
                      Primero edita o elimina {inMatches.length === 1 ? 'ese match' : 'esos matches'} y vuelve a intentar.
                    </>
                  );
                }
                return 'Saldrá de esta competencia. Podrás volver a agregarlo más adelante si lo necesitas.';
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removingParticipant}>Cancelar</AlertDialogCancel>
            {participantToRemove && matchesContainingParticipant(participantToRemove.id).length === 0 && (
              <AlertDialogAction
                disabled={removingParticipant}
                onClick={(e) => { e.preventDefault(); handleRemoveParticipant(); }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {removingParticipant && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Eliminar
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
