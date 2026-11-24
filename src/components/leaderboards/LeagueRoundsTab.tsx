import React, { useState } from 'react';
import { trs } from '@/i18n/tr';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  History,
  Link2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Unlink,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  type LeagueAuditEntry,
  type LeagueLinkedRound,
  formatAuditDate,
  formatAuditEntryLine,
  formatRoundDateDDMMYYYY,
  getReasonNotCountedText,
} from '@/lib/leagueRoundsAudit';
import { LeagueLinkCandidatesDialog } from '@/components/leaderboards/LeagueLinkCandidatesDialog';

interface LeagueRoundsTabProps {
  leaderboardId: string;
  isCreator: boolean;
  isCompleted: boolean;
  savedMinPlayers?: number;
  rounds: LeagueLinkedRound[];
  roundsLoading: boolean;
  roundsError: string | null;
  onRetryRounds: () => void;
  auditEntries: LeagueAuditEntry[];
  auditLoading: boolean;
  auditHasMore: boolean;
  auditLoadingMore: boolean;
  onLoadMoreAudit: () => void;
  onOpenLinkDialog: () => void;
  onAfterMutation: () => Promise<void>;
}

export const LeagueRoundsTab: React.FC<LeagueRoundsTabProps> = ({
  leaderboardId,
  isCreator,
  isCompleted,
  savedMinPlayers,
  rounds,
  roundsLoading,
  roundsError,
  onRetryRounds,
  auditEntries,
  auditLoading,
  auditHasMore,
  auditLoadingMore,
  onLoadMoreAudit,
  onOpenLinkDialog,
  onAfterMutation,
}) => {
  const [unlinkTarget, setUnlinkTarget] = useState<LeagueLinkedRound | null>(null);
  const [unlinkReason, setUnlinkReason] = useState('');
  const [unlinking, setUnlinking] = useState(false);

  const [recalcOpen, setRecalcOpen] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [candidatesOpen, setCandidatesOpen] = useState(false);

  const handleConfirmUnlink = async () => {
    if (!unlinkTarget) return;
    setUnlinking(true);
    try {
      const trimmed = unlinkReason.trim();
      const { error } = await supabase.rpc('unlink_league_round', {
        p_leaderboard_id: leaderboardId,
        p_round_id: unlinkTarget.round_id,
        p_reason: trimmed || undefined,
      });
      if (error) throw error;
      toast.success(trs('Ronda desvinculada'));
      setUnlinkTarget(null);
      setUnlinkReason('');
      await onAfterMutation();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUnlinking(false);
    }
  };

  const handleConfirmRecalculate = async () => {
    setRecalculating(true);
    try {
      const { data, error } = await supabase.rpc('recalculate_league', {
        p_leaderboard_id: leaderboardId,
      });
      if (error) throw error;
      const count = Number(data ?? 0);
      toast.success(`${count} ${trs(count === 1 ? 'ronda recalculada' : 'rondas recalculadas')}`);
      setRecalcOpen(false);
      await onAfterMutation();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRecalculating(false);
    }
  };

  const handleConfirmReopen = async () => {
    setReopening(true);
    try {
      const { error } = await supabase.rpc('reopen_leaderboard', {
        p_leaderboard_id: leaderboardId,
      });
      if (error) throw error;
      toast.success(trs('Liga reabierta'));
      setReopenOpen(false);
      await onAfterMutation();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setReopening(false);
    }
  };

  const roundStatusLabel = (status: string) => {
    if (status === 'completed') return trs('Cerrada');
    if (status === 'in_progress') return trs('En curso');
    return trs('En preparación');
  };

  return (
    <ScrollArea className="h-full w-full px-3 pb-4 [&>div>div]:!block">
      <div className="space-y-4">
        {/* Header: count + link buttons */}
        <div className="space-y-2">
          <p className="text-sm font-semibold">
            {rounds.length} {trs(rounds.length === 1 ? 'ronda ligada' : 'rondas ligadas')}
          </p>
          {isCreator && !isCompleted && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={onOpenLinkDialog} className="h-8 gap-1.5 text-xs">
                <Link2 className="h-3.5 w-3.5" />
                {trs('Ligar ronda')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCandidatesOpen(true)}
                className="h-8 gap-1.5 text-xs"
              >
                <Search className="h-3.5 w-3.5" />
                {trs('Buscar rondas candidatas')}
              </Button>
            </div>
          )}
        </div>

        {/* Linked rounds list / loading / error */}
        {roundsLoading && rounds.length === 0 ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : roundsError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center space-y-2">
            <div className="flex items-center justify-center gap-1.5 text-sm font-medium text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {trs('Error cargando rondas ligadas')}
            </div>
            <p className="text-xs text-muted-foreground break-words">{roundsError}</p>
            <Button variant="outline" size="sm" onClick={onRetryRounds}>
              {trs('Reintentar')}
            </Button>
          </div>
        ) : rounds.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-6">
            {trs('Aún no hay rondas ligadas a esta liga.')}
          </div>
        ) : (
          <div className="space-y-2.5">
            {rounds.map((r) => (
              <div
                key={r.round_id}
                className="bg-card border border-border rounded-xl p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">
                      {formatRoundDateDDMMYYYY(r.date)} · {r.course_name || '—'}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {trs('Organizador')}: {r.organizer_name || '—'}
                    </div>
                  </div>
                  <Badge
                    variant={r.status === 'completed' ? 'secondary' : 'outline'}
                    className="shrink-0 text-[10px]"
                  >
                    {roundStatusLabel(r.status)}
                  </Badge>
                </div>

                {r.counts_in_standings ? (
                  <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {trs('Cuenta en standings')} ({r.players_counted} {trs('de')} {r.players_total}{' '}
                      {trs(r.players_total === 1 ? 'jugador' : 'jugadores')})
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {trs('No cuenta')}: {getReasonNotCountedText(r.reason_not_counted)}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <span className="text-[11px] text-muted-foreground leading-tight min-w-0">
                    {trs('Ligada por')} {r.linked_by_name || '—'} {trs('el')}{' '}
                    {formatAuditDate(r.linked_at)}
                  </span>
                  {isCreator && !isCompleted && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive shrink-0 gap-1"
                      onClick={() => {
                        setUnlinkReason('');
                        setUnlinkTarget(r);
                      }}
                    >
                      <Unlink className="h-3.5 w-3.5" />
                      {trs('Desvincular')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Creator action bar */}
        {isCreator && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 min-w-[140px] gap-1.5 text-xs"
              onClick={() => setRecalcOpen(true)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {trs('Recalcular standings')}
            </Button>
            {isCompleted && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 min-w-[120px] gap-1.5 text-xs"
                onClick={() => setReopenOpen(true)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {trs('Reabrir liga')}
              </Button>
            )}
          </div>
        )}

        {/* Audit log section (visible to all members) */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border text-sm font-semibold">
            <History className="h-4 w-4 text-primary shrink-0" />
            {trs('Bitácora de la liga')}
          </div>
          {auditLoading && auditEntries.length === 0 ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : auditEntries.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              {trs('Aún no hay movimientos registrados')}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {auditEntries.map((entry) => (
                <div key={entry.id} className="px-3 py-2 text-xs text-foreground leading-snug break-words">
                  {formatAuditEntryLine(entry)}
                </div>
              ))}
              {auditHasMore && (
                <div className="p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    disabled={auditLoadingMore}
                    onClick={onLoadMoreAudit}
                  >
                    {auditLoadingMore && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                    {trs('Ver más')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirm Unlink Dialog */}
      <AlertDialog
        open={unlinkTarget !== null}
        onOpenChange={(open) => {
          if (!open && !unlinking) {
            setUnlinkTarget(null);
            setUnlinkReason('');
          }
        }}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{trs('Desvincular ronda')}</AlertDialogTitle>
            <AlertDialogDescription>
              {trs('Se quitará esta ronda de la liga y se recalcularán los standings. La ronda en sí no se borra.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="unlink-reason-input" className="text-xs">
              {trs('Motivo')}
            </Label>
            <Input
              id="unlink-reason-input"
              value={unlinkReason}
              onChange={(e) => setUnlinkReason(e.target.value)}
              placeholder={trs('Ej. Ronda de práctica')}
              disabled={unlinking}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unlinking}>{trs('Cancelar')}</AlertDialogCancel>
            <Button variant="destructive" onClick={handleConfirmUnlink} disabled={unlinking}>
              {unlinking && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {trs('Desvincular')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Recalculate Dialog */}
      <AlertDialog
        open={recalcOpen}
        onOpenChange={(open) => {
          if (!recalculating) setRecalcOpen(open);
        }}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{trs('Recalcular standings')}</AlertDialogTitle>
            <AlertDialogDescription>
              {trs('Se volverán a calcular los puntajes de todas las rondas ligadas a esta liga.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={recalculating}>{trs('Cancelar')}</AlertDialogCancel>
            <Button onClick={handleConfirmRecalculate} disabled={recalculating}>
              {recalculating && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {trs('Recalcular standings')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Reopen Dialog */}
      <AlertDialog
        open={reopenOpen}
        onOpenChange={(open) => {
          if (!reopening) setReopenOpen(open);
        }}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{trs('Reabrir liga')}</AlertDialogTitle>
            <AlertDialogDescription>
              {trs('Los standings dejarán de estar congelados y podrás ligar o desvincular rondas')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reopening}>{trs('Cancelar')}</AlertDialogCancel>
            <Button onClick={handleConfirmReopen} disabled={reopening}>
              {reopening && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {trs('Reabrir liga')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isCreator && !isCompleted && (
        <LeagueLinkCandidatesDialog
          open={candidatesOpen}
          onOpenChange={setCandidatesOpen}
          leaderboardId={leaderboardId}
          savedMinPlayers={savedMinPlayers}
          onAfterMutation={onAfterMutation}
        />
      )}
    </ScrollArea>
  );
};