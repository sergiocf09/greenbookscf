import React, { useCallback, useEffect, useRef, useState } from 'react';
import { trs } from '@/i18n/tr';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AlertCircle, Link2, Loader2, Minus, Plus, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { formatRoundDateDDMMYYYY } from '@/lib/leagueRoundsAudit';
import {
  type LeagueLinkCandidate,
  MIN_PLAYERS_RANGE,
  formatCandidatePlayersLabels,
  getEffectiveMinPlayers,
} from '@/lib/leagueLinkCandidates';

const PAGE_SIZE = 20;

interface LeagueLinkCandidatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leaderboardId: string;
  savedMinPlayers?: number;
  onAfterMutation: () => Promise<void>;
}

export const LeagueLinkCandidatesDialog: React.FC<LeagueLinkCandidatesDialogProps> = ({
  open,
  onOpenChange,
  leaderboardId,
  savedMinPlayers,
  onAfterMutation,
}) => {
  const [minPlayers, setMinPlayers] = useState<number>(() => getEffectiveMinPlayers(savedMinPlayers));
  const [includeInProgress, setIncludeInProgress] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [candidates, setCandidates] = useState<LeagueLinkCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [saveRuleOpen, setSaveRuleOpen] = useState(false);
  const [savingRule, setSavingRule] = useState(false);

  const [linkTarget, setLinkTarget] = useState<LeagueLinkCandidate | null>(null);
  const [linking, setLinking] = useState(false);
  const [handicapPreview, setHandicapPreview] = useState<{ round_player_id: string; display_name: string; effective_handicap: number; handicap_mode: string }[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    setHandicapPreview([]);
    setPreviewError(false);
    if (!linkTarget) return;
    let cancelled = false;
    setPreviewLoading(true);
    supabase.rpc('get_league_round_handicaps', {
      p_leaderboard_id: leaderboardId, p_round_id: linkTarget.round_id,
    }).then(({ data, error }) => {
      if (cancelled) return;
      setPreviewLoading(false);
      if (error) { setPreviewError(true); toast.error(error.message); }
      else setHandicapPreview(data ?? []);
    });
    return () => { cancelled = true; };
  }, [linkTarget, leaderboardId]);

  const requestIdRef = useRef(0);

  // Reset filters when opening
  useEffect(() => {
    if (open) {
      setMinPlayers(getEffectiveMinPlayers(savedMinPlayers));
      setIncludeInProgress(false);
      setSearchInput('');
      setDebouncedSearch('');
    }
  }, [open, savedMinPlayers]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchCandidates = useCallback(
    async (offset = 0, append = false) => {
      const reqId = ++requestIdRef.current;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }

      try {
        const { data, error: rpcError } = await supabase.rpc('get_league_link_candidates', {
          p_leaderboard_id: leaderboardId,
          p_min_players: minPlayers,
          p_include_in_progress: includeInProgress,
          p_search: debouncedSearch || undefined,
          p_limit: PAGE_SIZE + 1,
          p_offset: offset,
        });
        if (reqId !== requestIdRef.current) return;
        if (rpcError) throw rpcError;
        const rows = (data ?? []) as unknown as LeagueLinkCandidate[];
        const more = rows.length > PAGE_SIZE;
        const page = more ? rows.slice(0, PAGE_SIZE) : rows;
        setHasMore(more);
        setCandidates((prev) => (append ? [...prev, ...page] : page));
      } catch (err: any) {
        if (reqId !== requestIdRef.current) return;
        const msg = err?.message ?? trs('Error cargando rondas candidatas');
        if (append) toast.error(msg);
        else setError(msg);
      } finally {
        if (reqId === requestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [leaderboardId, minPlayers, includeInProgress, debouncedSearch],
  );

  useEffect(() => {
    if (!open) return;
    fetchCandidates(0, false);
  }, [open, fetchCandidates]);

  const handleConfirmSaveRule = async () => {
    setSavingRule(true);
    try {
      const { error: rpcError } = await supabase.rpc('set_league_min_players', {
        p_leaderboard_id: leaderboardId,
        p_min_players: minPlayers,
      });
      if (rpcError) throw rpcError;
      toast.success(trs('Regla guardada'));
      setSaveRuleOpen(false);
      await onAfterMutation();
    } catch (err: any) {
      toast.error(err?.message ?? trs('Error cargando rondas candidatas'));
    } finally {
      setSavingRule(false);
    }
  };

  const handleConfirmLink = async () => {
    if (!linkTarget) return;
    setLinking(true);
    try {
      const { error: rpcError } = await supabase.rpc('link_league_candidate_round', {
        p_leaderboard_id: leaderboardId,
        p_round_id: linkTarget.round_id,
      });
      if (rpcError) throw rpcError;
      const linkedId = linkTarget.round_id;
      toast.success(trs('Ronda ligada a la liga'));
      setCandidates((prev) => prev.filter((c) => c.round_id !== linkedId));
      setLinkTarget(null);
      await onAfterMutation();
    } catch (err: any) {
      toast.error(err?.message ?? trs('Error cargando rondas candidatas'));
    } finally {
      setLinking(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md max-h-[88vh] p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base pr-6">
              <Search className="h-4 w-4 text-primary shrink-0" />
              {trs('Rondas candidatas')}
            </DialogTitle>
          </DialogHeader>

          {/* Controls */}
          <div className="px-4 py-3 space-y-3 border-b border-border shrink-0">
            {/* Stepper + save rule */}
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-medium leading-tight">
                  {trs('Mínimo de jugadores de la liga')}
                </Label>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={trs('Disminuir mínimo')}
                    disabled={minPlayers <= MIN_PLAYERS_RANGE.min}
                    onClick={() => setMinPlayers((v) => Math.max(MIN_PLAYERS_RANGE.min, v - 1))}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">
                    {minPlayers}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={trs('Aumentar mínimo')}
                    disabled={minPlayers >= MIN_PLAYERS_RANGE.max}
                    onClick={() => setMinPlayers((v) => Math.min(MIN_PLAYERS_RANGE.max, v + 1))}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setSaveRuleOpen(true)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {trs('Guardar como regla de la liga')}
                </button>
              </div>
            </div>

            {/* Include in progress switch */}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label htmlFor="include-in-progress-switch" className="text-xs font-medium">
                  {trs('Incluir rondas en curso')}
                </Label>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {trs('Una ronda en curso no suma hasta que se cierre')}
                </p>
              </div>
              <Switch
                id="include-in-progress-switch"
                checked={includeInProgress}
                onCheckedChange={setIncludeInProgress}
              />
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={trs('Buscar por campo u organizador')}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          {/* Results list */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2.5">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center space-y-2">
                <div className="flex items-center justify-center gap-1.5 text-sm font-medium text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {trs('Error cargando rondas candidatas')}
                </div>
                <p className="text-xs text-muted-foreground break-words">{error}</p>
                <Button variant="outline" size="sm" onClick={() => fetchCandidates(0, false)}>
                  {trs('Reintentar')}
                </Button>
              </div>
            ) : candidates.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-8 px-2 leading-relaxed">
                {trs('No hay rondas candidatas con estos criterios. Prueba bajando el mínimo de jugadores')}
              </div>
            ) : (
              <>
                {candidates.map((c) => {
                  const { matchedLabel, guestsLabel } = formatCandidatePlayersLabels(
                    c.league_players_matched,
                    c.matched_names,
                    c.guests_in_round,
                  );
                  const statusLabel = c.status === 'completed' ? trs('Cerrada') : trs('En curso');

                  return (
                    <div
                      key={c.round_id}
                      className="bg-card border border-border rounded-xl p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">
                            {formatRoundDateDDMMYYYY(c.date)} · {c.course_name || '—'}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {trs('Organizador')}: {c.organizer_name || '—'}
                          </div>
                        </div>
                        <Badge
                          variant={c.status === 'completed' ? 'secondary' : 'outline'}
                          className="shrink-0 text-[10px]"
                        >
                          {statusLabel}
                        </Badge>
                      </div>

                      <div className="flex items-end justify-between gap-2 pt-0.5">
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-start gap-1.5 text-xs text-foreground leading-snug">
                            <Users className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                            <span className="break-words">{matchedLabel}</span>
                          </div>
                          {guestsLabel && (
                            <div className="text-[11px] text-muted-foreground pl-5 leading-tight">
                              {guestsLabel}
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          className="h-7 px-2.5 text-xs shrink-0 gap-1"
                          onClick={() => setLinkTarget(c)}
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          {trs('Ligar')}
                        </Button>
                      </div>
                    </div>
                  );
                })}

                {hasMore && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    disabled={loadingMore}
                    onClick={() => fetchCandidates(candidates.length, true)}
                  >
                    {loadingMore && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                    {trs('Ver más')}
                  </Button>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Save Rule */}
      <AlertDialog
        open={saveRuleOpen}
        onOpenChange={(next) => {
          if (!savingRule) setSaveRuleOpen(next);
        }}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{trs('Guardar regla de la liga')}</AlertDialogTitle>
            <AlertDialogDescription>
              {trs('Se actualizará el mínimo sugerido de jugadores por ronda a')} {minPlayers}{' '}
              {trs('y quedará registrado en la bitácora.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingRule}>{trs('Cancelar')}</AlertDialogCancel>
            <Button onClick={handleConfirmSaveRule} disabled={savingRule}>
              {savingRule && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {trs('Guardar')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Link Candidate Round */}
      <AlertDialog
        open={linkTarget !== null}
        onOpenChange={(next) => {
          if (!next && !linking) setLinkTarget(null);
        }}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{trs('Ligar ronda candidata')}</AlertDialogTitle>
            <AlertDialogDescription>
              {linkTarget
                ? `${trs('La ronda de')} ${linkTarget.organizer_name || '—'} ${trs('del')} ${formatRoundDateDDMMYYYY(linkTarget.date)} ${trs('contará para los puntos de la liga. Podrás desvincularla después. Queda registrado en la bitácora.')}`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-[35vh] overflow-y-auto space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{trs(handicapPreview[0]?.handicap_mode === 'per_round' ? 'Hándicap guardado en esta ronda' : 'Hándicap fijo de la liga')}</p>
            {previewLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {handicapPreview.map(player => (
              <div key={player.round_player_id} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 break-words">{player.display_name}</span>
                <span className="shrink-0 tabular-nums">HCP {player.effective_handicap}</span>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={linking}>{trs('Cancelar')}</AlertDialogCancel>
            <Button onClick={handleConfirmLink} disabled={linking || previewLoading || previewError}>
              {linking && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {trs('Ligar')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};