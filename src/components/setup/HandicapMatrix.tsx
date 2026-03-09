/**
 * HandicapMatrix - Compact Matrix for Bilateral Handicaps
 * 
 * Shows a grid where rows and columns are players.
 * Reading direction: ROW player's perspective.
 * Cell (row=A, col=B) shows how A sees B:
 *   +N = A gives N strokes (red, disadvantage)
 *   -N = A receives N strokes (green, advantage)
 *    0 = Scratch
 * 
 * Tap a cell to open a popover with +/- stepper and sliding suggestion.
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Player, PlayerGroup } from '@/types/golf';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Users, Minus, Plus, Sparkles, ArrowRight, ArrowLeft, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { disambiguateInitials, formatPlayerName } from '@/lib/playerInput';
import { supabase } from '@/integrations/supabase/client';
import { devLog, devError } from '@/lib/logger';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface SlidingSuggestion {
  playerAProfileId: string;
  playerBProfileId: string;
  suggestedStrokes: number;
  lastRoundId: string | null;
}

interface HandicapMatrixProps {
  players: Player[];
  playerGroups: PlayerGroup[];
  basePlayerId: string;
  roundPlayerIds: Map<string, string>;
  getStrokesForLocalPair: (localIdA: string, localIdB: string) => number;
  setStrokesForLocalPair: (localIdA: string, localIdB: string, strokes: number) => Promise<boolean>;
  isLoading?: boolean;
}

export const HandicapMatrix: React.FC<HandicapMatrixProps> = ({
  players,
  playerGroups,
  basePlayerId,
  roundPlayerIds,
  getStrokesForLocalPair,
  setStrokesForLocalPair,
  isLoading = false,
}) => {
  const [pendingChanges, setPendingChanges] = useState<Map<string, number>>(new Map());
  const [saving, setSaving] = useState(false);
  const [slidingSuggestions, setSlidingSuggestions] = useState<Map<string, SlidingSuggestion>>(new Map());

  const totalGroups = 1 + playerGroups.length;

  const defaultGroupIndex = useMemo(() => {
    const inMain = players.some(p => p.id === basePlayerId || p.profileId === basePlayerId);
    if (inMain) return 0;
    for (let i = 0; i < playerGroups.length; i++) {
      if (playerGroups[i].players.some(p => p.id === basePlayerId || p.profileId === basePlayerId)) {
        return i + 1;
      }
    }
    return 0;
  }, [players, playerGroups, basePlayerId]);

  const [selectedGroupIndex, setSelectedGroupIndex] = useState(defaultGroupIndex);

  const getGroupPlayers = (groupIndex: number): Player[] => {
    if (groupIndex === 0) return players;
    return playerGroups[groupIndex - 1]?.players || [];
  };

  const getGroupLabel = (groupIndex: number): string => {
    if (groupIndex === 0) return playerGroups.length > 0 ? 'Grupo 1' : 'Todos';
    return playerGroups[groupIndex - 1]?.name || `Grupo ${groupIndex + 1}`;
  };

  const allPlayers = useMemo(() => {
    const groupPlayers = getGroupPlayers(selectedGroupIndex);
    return [...groupPlayers].sort((a, b) => {
      const aIsBase = a.id === basePlayerId || a.profileId === basePlayerId;
      const bIsBase = b.id === basePlayerId || b.profileId === basePlayerId;
      if (aIsBase && !bIsBase) return -1;
      if (!aIsBase && bIsBase) return 1;
      return 0;
    });
  }, [players, playerGroups, basePlayerId, selectedGroupIndex]);

  const disambiguated = useMemo(() => disambiguateInitials(allPlayers), [allPlayers]);

  // Load sliding suggestions
  useEffect(() => {
    const loadSlidingSuggestions = async () => {
      const profileIds = allPlayers.filter(p => p.profileId).map(p => p.profileId!);
      if (profileIds.length < 2) return;

      try {
        const orConditions = [
          ...profileIds.map(id => `player_a_profile_id.eq.${id}`),
          ...profileIds.map(id => `player_b_profile_id.eq.${id}`)
        ].join(',');

        const { data, error } = await supabase
          .from('sliding_current')
          .select('*')
          .or(orConditions);

        if (error) { devError('Error loading sliding suggestions:', error); return; }

        const profileIdSet = new Set(profileIds);
        const filtered = (data || []).filter(entry =>
          profileIdSet.has(entry.player_a_profile_id) && profileIdSet.has(entry.player_b_profile_id)
        );

        const suggestionsMap = new Map<string, SlidingSuggestion>();
        for (const entry of filtered) {
          suggestionsMap.set(`${entry.player_a_profile_id}::${entry.player_b_profile_id}`, {
            playerAProfileId: entry.player_a_profile_id,
            playerBProfileId: entry.player_b_profile_id,
            suggestedStrokes: entry.strokes_a_gives_b_current,
            lastRoundId: entry.last_round_id,
          });
        }
        setSlidingSuggestions(suggestionsMap);
        devLog('Loaded sliding suggestions for', suggestionsMap.size, 'pairs');
      } catch (err) { devError('Exception loading sliding suggestions:', err); }
    };
    loadSlidingSuggestions();
  }, [allPlayers]);

  /**
   * Get sliding suggestion for rowPlayer→colPlayer direction.
   * Returns strokes from row player's perspective.
   */
  const getSlidingForPair = useCallback((rowPlayerId: string, colPlayerId: string): { strokes: number; hasSliding: boolean } => {
    const rowProfile = allPlayers.find(p => p.id === rowPlayerId)?.profileId;
    const colProfile = allPlayers.find(p => p.id === colPlayerId)?.profileId;
    if (!rowProfile || !colProfile) return { strokes: 0, hasSliding: false };

    const [normA, normB] = rowProfile < colProfile ? [rowProfile, colProfile] : [colProfile, rowProfile];
    const key = `${normA}::${normB}`;
    const suggestion = slidingSuggestions.get(key);
    if (!suggestion) return { strokes: 0, hasSliding: false };

    // strokes_a_gives_b means normA gives to normB
    // If row is normA, direct; if row is normB, negate
    const strokes = rowProfile === normA ? suggestion.suggestedStrokes : -suggestion.suggestedStrokes;
    return { strokes, hasSliding: true };
  }, [allPlayers, slidingSuggestions]);

  /**
   * Get effective strokes for row→col (checking pending changes first).
   * Positive = row gives, Negative = row receives.
   */
  const getStrokesForCell = useCallback((rowId: string, colId: string): number => {
    const key = `${rowId}::${colId}`;
    if (pendingChanges.has(key)) return pendingChanges.get(key)!;
    return getStrokesForLocalPair(rowId, colId);
  }, [pendingChanges, getStrokesForLocalPair]);

  /** Set pending change for a cell (and its mirror) */
  const setCellStrokes = useCallback((rowId: string, colId: string, value: number) => {
    const clamped = Math.max(-36, Math.min(36, value));
    setPendingChanges(prev => {
      const next = new Map(prev);
      next.set(`${rowId}::${colId}`, clamped);
      next.set(`${colId}::${rowId}`, -clamped);
      return next;
    });
  }, []);

  const hasRoundPlayerIds = roundPlayerIds.size > 0;
  const hasPendingChanges = pendingChanges.size > 0;

  /** Save all pending changes */
  const saveAllChanges = useCallback(async () => {
    if (pendingChanges.size === 0) return;
    if (!hasRoundPlayerIds) {
      toast.error('Jugadores aún no sincronizados. Espera un momento.');
      return;
    }
    setSaving(true);
    const saved = new Set<string>();
    let successCount = 0;
    let errorCount = 0;

    for (const [key, strokes] of pendingChanges.entries()) {
      // Avoid saving mirror duplicates
      const [a, b] = key.split('::');
      const canonical = a < b ? `${a}::${b}` : `${b}::${a}`;
      if (saved.has(canonical)) continue;
      saved.add(canonical);

      const canonicalStrokes = a < b ? strokes : -strokes;
      const success = await setStrokesForLocalPair(
        a < b ? a : b,
        a < b ? b : a,
        canonicalStrokes
      );
      if (success) successCount++; else errorCount++;
    }

    setSaving(false);
    setPendingChanges(new Map());
    if (errorCount === 0) toast.success(`${successCount} hándicap(s) guardado(s)`);
    else toast.error(`Error guardando ${errorCount} par(es)`);
  }, [pendingChanges, setStrokesForLocalPair, hasRoundPlayerIds]);

  // --- Render ---

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Cargando hándicaps...</span>
      </div>
    );
  }

  if (!hasRoundPlayerIds && allPlayers.length >= 2) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Sincronizando jugadores...</span>
      </div>
    );
  }

  if (allPlayers.length < 2) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Se necesitan al menos 2 jugadores para definir hándicaps</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Hándicaps Bilaterales
              </CardTitle>
              <CardDescription className="mt-1">
                Cada renglón muestra cómo se ve ese jugador vs. los demás. Toca una celda para ajustar.
              </CardDescription>
            </div>
            {hasPendingChanges && (
              <Button onClick={saveAllChanges} disabled={saving} size="sm" className="gap-1.5">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Guardar
              </Button>
            )}
          </div>
        </CardHeader>

        {/* Group tabs */}
        {totalGroups > 1 && (
          <CardContent className="pt-0 pb-3">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: totalGroups }, (_, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (hasPendingChanges) { toast.warning('Guarda los cambios primero'); return; }
                    setSelectedGroupIndex(i);
                  }}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-lg border transition-all',
                    selectedGroupIndex === i
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  )}
                >
                  {getGroupLabel(i)}
                  <span className="ml-1 text-[10px] opacity-70">({getGroupPlayers(i).length})</span>
                </button>
              ))}
            </div>
          </CardContent>
        )}

        {/* Matrix */}
        <CardContent className="pt-0 px-2">
          <div className="overflow-x-auto -mx-0.5">
            <table className="border-collapse">
              {/* Column headers */}
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-card p-0" />
                  <th className="p-0 w-[3px]"><div className="w-[3px]" /></th>
                  {allPlayers.map(col => {
                    const isBase = col.id === basePlayerId || col.profileId === basePlayerId;
                    return (
                      <th key={col.id} className="p-0.5 text-center" style={{ minWidth: 44 }}>
                        <div className="flex flex-col items-center gap-0.5">
                          <PlayerAvatar
                            initials={disambiguated.get(col.id) || col.initials}
                            background={col.color}
                            size="sm"
                            isLoggedInUser={isBase}
                          />
                          <span className="text-[8px] text-muted-foreground leading-tight truncate max-w-[42px]">
                            {col.name.split(' ')[0]}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {allPlayers.map(row => {
                  const isBaseRow = row.id === basePlayerId || row.profileId === basePlayerId;
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        'border-t border-border/30',
                        isBaseRow && 'bg-primary/5'
                      )}
                    >
                      {/* Row header - name only, no avatar */}
                      <td className="sticky left-0 z-10 bg-card pr-1 py-0.5">
                        <span className={cn(
                          "text-[9px] font-medium whitespace-nowrap leading-tight",
                          isBaseRow ? "text-primary font-semibold" : "text-foreground"
                        )}>
                          {row.name.split(' ')[0]}
                        </span>
                      </td>

                      {/* Separator line */}
                      <td className="p-0 w-[3px] sticky left-[auto] z-[5]">
                        <div className="w-[3px] h-10 bg-gradient-to-b from-primary/80 via-primary to-primary/80 relative mr-1.5">
                          <div className="absolute inset-x-[0.5px] inset-y-0 w-[1px] mx-auto bg-[hsl(45,80%,55%)]/60" />
                        </div>
                      </td>

                      {/* Cells */}
                      {allPlayers.map(col => {
                        if (row.id === col.id) {
                          // Diagonal - self
                          return (
                            <td key={col.id} className="p-0.5 text-center">
                              <div className="w-10 h-10 rounded-md bg-muted/30 flex items-center justify-center mx-auto">
                                <span className="text-muted-foreground/40 text-xs">—</span>
                              </div>
                            </td>
                          );
                        }

                        return (
                          <HandicapCell
                            key={col.id}
                            rowPlayer={row}
                            colPlayer={col}
                            strokes={getStrokesForCell(row.id, col.id)}
                            sliding={getSlidingForPair(row.id, col.id)}
                            hasPendingChange={pendingChanges.has(`${row.id}::${col.id}`)}
                            onChangeStrokes={(v) => setCellStrokes(row.id, col.id, v)}
                            onApplySliding={() => {
                              const s = getSlidingForPair(row.id, col.id);
                              if (s.hasSliding) {
                                setCellStrokes(row.id, col.id, s.strokes);
                                toast.success('Sliding aplicado');
                              }
                            }}
                            disambiguated={disambiguated}
                          />
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-[10px] text-muted-foreground mt-4 pt-3 border-t border-border/30">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-destructive/20 border border-destructive/40" />
              <span>Da golpes</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-green-500/20 border border-green-500/40" />
              <span>Recibe golpes</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-muted/40 border border-border" />
              <span>Scratch</span>
            </div>
            {slidingSuggestions.size > 0 && (
              <div className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-600" />
                <span>Sliding sugerido</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ─── Cell Component ───────────────────────────────────────────

interface HandicapCellProps {
  rowPlayer: Player;
  colPlayer: Player;
  strokes: number;
  sliding: { strokes: number; hasSliding: boolean };
  hasPendingChange: boolean;
  onChangeStrokes: (v: number) => void;
  onApplySliding: () => void;
  disambiguated: Map<string, string>;
}

const HandicapCell: React.FC<HandicapCellProps> = ({
  rowPlayer,
  colPlayer,
  strokes,
  sliding,
  hasPendingChange,
  onChangeStrokes,
  onApplySliding,
  disambiguated,
}) => {
  const isGiving = strokes > 0;
  const isReceiving = strokes < 0;
  const slidingDiffers = sliding.hasSliding && sliding.strokes !== strokes;

  const cellBg = isGiving
    ? 'bg-destructive/15 border-destructive/40 text-destructive'
    : isReceiving
      ? 'bg-green-500/15 border-green-500/40 text-green-700'
      : 'bg-muted/30 border-border/40 text-muted-foreground';

  return (
    <td className="p-0.5 text-center">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'w-10 h-10 rounded-md border flex flex-col items-center justify-center mx-auto transition-all relative',
              cellBg,
              hasPendingChange && 'ring-2 ring-primary/50'
            )}
          >
            <span className="text-sm font-bold leading-none">
              {strokes === 0 ? '0' : strokes > 0 ? `+${strokes}` : `${strokes}`}
            </span>
            <span className="text-[8px] leading-none mt-0.5 opacity-70">
              {isGiving ? 'da' : isReceiving ? 'rec' : ''}
            </span>
            {slidingDiffers && (
              <Sparkles className="h-2.5 w-2.5 text-amber-500 absolute -top-0.5 -right-0.5" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3" align="center" side="top">
          <CellEditor
            rowPlayer={rowPlayer}
            colPlayer={colPlayer}
            strokes={strokes}
            sliding={sliding}
            onChangeStrokes={onChangeStrokes}
            onApplySliding={onApplySliding}
            disambiguated={disambiguated}
          />
        </PopoverContent>
      </Popover>
    </td>
  );
};

// ─── Cell Editor (Popover content) ────────────────────────────

interface CellEditorProps {
  rowPlayer: Player;
  colPlayer: Player;
  strokes: number;
  sliding: { strokes: number; hasSliding: boolean };
  onChangeStrokes: (v: number) => void;
  onApplySliding: () => void;
  disambiguated: Map<string, string>;
}

const CellEditor: React.FC<CellEditorProps> = ({
  rowPlayer,
  colPlayer,
  strokes,
  sliding,
  onChangeStrokes,
  onApplySliding,
  disambiguated,
}) => {
  const isGiving = strokes > 0;
  const isReceiving = strokes < 0;
  const slidingDiffers = sliding.hasSliding && sliding.strokes !== strokes;
  const rowFirstName = formatPlayerName(rowPlayer.name).split(' ')[0];
  const colFirstName = formatPlayerName(colPlayer.name).split(' ')[0];

  return (
    <div className="space-y-3">
      {/* Header: who vs who */}
      <div className="flex items-center gap-2 justify-center">
        <PlayerAvatar
          initials={disambiguated.get(rowPlayer.id) || rowPlayer.initials}
          background={rowPlayer.color}
          size="sm"
        />
        <span className="text-xs font-medium">vs</span>
        <PlayerAvatar
          initials={disambiguated.get(colPlayer.id) || colPlayer.initials}
          background={colPlayer.color}
          size="sm"
        />
      </div>

      {/* Legend */}
      <p className="text-center text-xs text-muted-foreground">
        {isGiving && (
          <><span className="font-semibold text-foreground">{rowFirstName}</span>{' '}
          <span className="text-destructive font-medium">da {Math.abs(strokes)}</span> a {colFirstName}</>
        )}
        {isReceiving && (
          <><span className="font-semibold text-foreground">{rowFirstName}</span>{' '}
          <span className="text-green-700 font-medium">recibe {Math.abs(strokes)}</span> de {colFirstName}</>
        )}
        {strokes === 0 && 'Scratch — sin ventaja'}
      </p>

      {/* Stepper */}
      <div className="flex items-center justify-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={() => onChangeStrokes(strokes - 1)}
          disabled={strokes <= -36}
        >
          <Minus className="h-4 w-4" />
        </Button>

        <div className="w-16 text-center">
          <span className={cn(
            'text-2xl font-bold',
            isGiving ? 'text-destructive' : isReceiving ? 'text-green-700' : 'text-muted-foreground'
          )}>
            {strokes === 0 ? '0' : strokes > 0 ? `+${strokes}` : `${strokes}`}
          </span>
        </div>

        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={() => onChangeStrokes(strokes + 1)}
          disabled={strokes >= 36}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Sliding suggestion */}
      {slidingDiffers && (
        <div className="flex items-center justify-between p-2 rounded-md bg-amber-50 border border-amber-200">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-[11px] text-amber-800">
              Sliding: {sliding.strokes > 0 ? `Da ${sliding.strokes}` : sliding.strokes < 0 ? `Rec ${Math.abs(sliding.strokes)}` : 'Scratch'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] text-amber-700 hover:text-amber-800 hover:bg-amber-100 px-2"
            onClick={onApplySliding}
          >
            Aplicar
          </Button>
        </div>
      )}
    </div>
  );
};
