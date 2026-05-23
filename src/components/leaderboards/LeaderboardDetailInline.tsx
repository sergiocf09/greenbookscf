import React, { useState, useMemo, useEffect } from 'react';
import { useLeaderboardDetail, StandingsEntry } from '@/hooks/useLeaderboards';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Loader2, Trophy, Share2, Users, Copy, Hash, Link2, Unlink, Pencil, Trash2, Settings, CheckCircle, RefreshCw } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatPlayerName } from '@/lib/playerInput';
import { EditLeaderboardConfigDialog } from './EditLeaderboardConfigDialog';

type SortMode = 'gross' | 'net' | 'stableford';

interface LeaderboardDetailInlineProps {
  leaderboardId: string;
  onBack: () => void;
  onLinkRound?: () => void;
  onUnlinkRound?: () => void;
  hasActiveRound?: boolean;
  isRoundLinked?: boolean;
}

export const LeaderboardDetailInline: React.FC<LeaderboardDetailInlineProps> = ({
  leaderboardId,
  onBack,
  onLinkRound,
  onUnlinkRound,
  hasActiveRound,
  isRoundLinked,
}) => {
  const { profile } = useAuth();
  const { event, participants, standings, loading, fetchDetail, isCreator, closeLeaderboard, reopenLeaderboard } = useLeaderboardDetail(leaderboardId);

  const [sortMode, setSortMode] = useState<SortMode>('net');
  // Sync sortMode to first available scoring mode once event loads
  useEffect(() => {
    const modes = (event?.scoring_modes || []) as SortMode[];
    if (modes.length > 0 && !modes.includes(sortMode)) {
      setSortMode(modes[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closeConfirmText, setCloseConfirmText] = useState('');
  const [showEditConfig, setShowEditConfig] = useState(false);

  // Refresh when link status changes so the list/scores update immediately after (des)vincular
  useEffect(() => {
    fetchDetail();
  }, [fetchDetail, isRoundLinked]);

  const sortedStandings = useMemo(() => {
    const filtered = standings.filter(s => s.holesPlayed > 0);
    const unplayed = standings.filter(s => s.holesPlayed === 0);

    filtered.sort((a, b) => {
      if (sortMode === 'gross') return a.grossVsPar - b.grossVsPar;
      if (sortMode === 'stableford') return b.stablefordTotal - a.stablefordTotal;
      return a.netVsPar - b.netVsPar;
    });

    return [...filtered, ...unplayed];
  }, [standings, sortMode]);

  const formatVsPar = (value: number): string => {
    if (value === 0) return 'E';
    return value > 0 ? `+${value}` : `${value}`;
  };

  const getVsParColor = (value: number): string => {
    if (value < 0) return 'text-green-600 font-semibold';
    if (value === 0) return 'text-foreground font-semibold';
    if (value <= 3) return 'text-orange-500 font-semibold';
    return 'text-destructive font-semibold';
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

  const handleRename = async () => {
    if (!renameValue.trim() || !event) return;
    setRenaming(true);
    try {
      const { error } = await supabase
        .from('leaderboard_events')
        .update({ name: renameValue.trim() })
        .eq('id', event.id);
      if (error) throw error;
      toast.success('Nombre actualizado');
      setShowRenameDialog(false);
      fetchDetail();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = async () => {
    if (!event) return;
    try {
      // Delete in order: scores, rounds, participants, event
      await supabase.from('leaderboard_scores').delete().eq('leaderboard_id', event.id);
      await supabase.from('leaderboard_rounds').delete().eq('leaderboard_id', event.id);
      await supabase.from('leaderboard_participants').delete().eq('leaderboard_id', event.id);
      const { error } = await supabase.from('leaderboard_events').delete().eq('id', event.id);
      if (error) throw error;
      toast.success('Leaderboard eliminado');
      onBack();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Leaderboard no encontrado</p>
        <Button variant="outline" onClick={onBack} className="mt-4">Volver</Button>
      </div>
    );
  }

  const availableModes = event.scoring_modes || ['gross', 'net'];

  return (
    <div className="space-y-2">
      {/* Top bar: code chip + actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0" />

        <div className="flex items-center gap-1 shrink-0">
          {hasActiveRound && !isRoundLinked && onLinkRound && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onLinkRound}
              aria-label="Vincular ronda"
              title="Vincular ronda activa"
            >
              <Link2 className="h-4 w-4" />
            </Button>
          )}
          {hasActiveRound && isRoundLinked && onUnlinkRound && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onUnlinkRound}
              aria-label="Desvincular ronda"
              title="Desvincular ronda"
              className="text-destructive hover:text-destructive"
            >
              <Unlink className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={copyShareLink} aria-label="Compartir">
            <Share2 className="h-4 w-4" />
          </Button>
          {isCreator && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Configuración">
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { setRenameValue(event.name); setShowRenameDialog(true); }}>
                  <Pencil className="h-4 w-4 mr-2" /> Editar nombre
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowEditConfig(true)}>
                  <Settings className="h-4 w-4 mr-2" /> Editar configuración
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => { setShowDeleteConfirm(true); setDeleteConfirmText(''); }}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Eliminar leaderboard
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
      </div>

      {/* Tournament name + mode on one line */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 min-w-0">
          <Trophy className="h-5 w-5 text-amber-500 shrink-0" />
          <span className="font-semibold text-lg truncate">{event.name}</span>
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap ml-2">
          {availableModes.map(m => m === 'gross' ? 'Gross' : m === 'net' ? 'Neto' : 'Stableford').join(' · ')}
        </span>
      </div>


      {/* Leaderboard table */}
      <Card>
        <CardHeader className="pb-1 pt-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Leaderboard</CardTitle>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {participants.length}
            </span>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-2 pt-0">
          {availableModes.length > 1 && (
            <div className="px-4 mb-2">
              <Tabs value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
                <TabsList className="w-full h-8">
                  {availableModes.includes('gross') && (
                    <TabsTrigger value="gross" className="flex-1 text-xs h-7">Gross</TabsTrigger>
                  )}
                  {availableModes.includes('net') && (
                    <TabsTrigger value="net" className="flex-1 text-xs h-7">Neto</TabsTrigger>
                  )}
                  {availableModes.includes('stableford') && (
                    <TabsTrigger value="stableford" className="flex-1 text-xs h-7">Stableford</TabsTrigger>
                  )}
                </TabsList>
              </Tabs>
            </div>
          )}

          {sortedStandings.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No hay participantes registrados
            </p>
          ) : (
            <table className="table-fixed w-full caption-bottom text-sm">
              <thead className="[&_tr]:border-b">
                <tr className="text-xs border-b">
                  <th className="h-8 w-8 text-center px-1 py-1 font-medium text-muted-foreground">#</th>
                  <th className="h-8 px-1 py-1 text-left font-medium text-muted-foreground">Jugador</th>
                  <th className="h-8 text-center w-10 px-1 py-1 font-medium text-muted-foreground">Hcp</th>
                  <th className="h-8 text-center w-10 px-1 py-1 font-medium text-muted-foreground">Hoyos</th>
                  <th className="h-8 text-center w-14 px-1 py-1 font-medium text-muted-foreground">
                    {sortMode === 'stableford' ? 'Pts' : 'Score'}
                  </th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {sortedStandings.map((entry, idx) => {
                  const hasPlayed = entry.holesPlayed > 0;
                  const scoreValue = sortMode === 'gross'
                    ? entry.grossVsPar
                    : sortMode === 'stableford'
                      ? entry.stablefordTotal
                      : entry.netVsPar;

                  return (
                    <tr key={entry.participant.id} className="text-sm border-b hover:bg-muted/50 transition-colors">
                      <td className="text-center font-bold text-muted-foreground px-1 py-1.5 text-base">
                        {hasPlayed ? idx + 1 : '-'}
                      </td>
                      <td className="px-1 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <PlayerAvatar
                            initials={entry.participant.initials || '??'}
                            background={entry.participant.avatar_color || '#3B82F6'}
                            size="sm"
                            isLoggedInUser={entry.participant.profile_id === profile?.id}
                          />
                          <span className="font-semibold text-sm truncate">
                            {formatPlayerName(entry.participant.display_name)}
                          </span>
                        </div>
                      </td>
                      <td className="text-center text-xs text-foreground font-bold px-1 py-1.5">
                        {entry.participant.handicap_for_leaderboard}
                      </td>
                      <td className="text-center text-xs text-foreground font-bold px-1 py-1.5">
                        {hasPlayed ? entry.holesPlayed : '-'}
                      </td>
                      <td className={cn(
                        'text-center text-base px-1 py-1.5',
                        hasPlayed
                          ? sortMode === 'stableford'
                            ? 'font-extrabold text-amber-600'
                            : getVsParColor(scoreValue)
                          : 'text-muted-foreground'
                      )}>
                        {hasPlayed
                          ? sortMode === 'stableford'
                            ? scoreValue
                            : formatVsPar(scoreValue)
                          : '-'
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Rename dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar nombre del leaderboard</DialogTitle>
            <DialogDescription>Actualiza el nombre visible del leaderboard.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-lb">Nombre</Label>
            <Input id="rename-lb" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRename()} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>Cancelar</Button>
            <Button disabled={!renameValue.trim() || renaming} onClick={handleRename}>
              {renaming && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar leaderboard?</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Se eliminarán el leaderboard y todos sus participantes.
              Escribe <strong>ELIMINAR</strong> para confirmar.
            </DialogDescription>
          </DialogHeader>
          <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="Escribe ELIMINAR" className="uppercase" />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={deleteConfirmText.toLowerCase() !== 'eliminar'} onClick={handleDelete}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close competition confirmation dialog */}
      <Dialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cerrar esta competencia?</DialogTitle>
            <DialogDescription>
              Pasará a Historial. Los resultados quedan guardados y se pueden consultar.
              Puedes reactivarla más adelante si es necesario. Escribe <strong>CERRAR</strong> para confirmar.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={closeConfirmText}
            onChange={(e) => setCloseConfirmText(e.target.value)}
            placeholder="Escribe CERRAR"
            className="uppercase"
          />
          <DialogFooter className="gap-2">
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isCreator && event && (
        <EditLeaderboardConfigDialog
          open={showEditConfig}
          onOpenChange={setShowEditConfig}
          event={{
            id: event.id,
            name: event.name,
            description: event.description,
            start_date: event.start_date,
            scoring_modes: event.scoring_modes || ['gross', 'net'],
          }}
          onSaved={fetchDetail}
        />
      )}
    </div>
  );
};
