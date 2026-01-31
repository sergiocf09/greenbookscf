/**
 * HandicapMatrix - Definición de Hándicaps entre Jugadores
 * 
 * Pantalla única y central para definir cuántos golpes da o recibe
 * cada jugador respecto a cada otro jugador de la ronda.
 * 
 * Esta es la ÚNICA fuente de verdad para hándicaps bilaterales.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { Player, PlayerGroup } from '@/types/golf';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2, Users, ArrowRight, ArrowLeft, Check, Minus, Plus, Save, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface HandicapMatrixProps {
  players: Player[];
  playerGroups: PlayerGroup[];
  basePlayerId: string;
  roundPlayerIds: Map<string, string>;
  // Functions from useRoundHandicaps
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
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(basePlayerId);
  const [pendingChanges, setPendingChanges] = useState<Map<string, number>>(new Map());
  const [saving, setSaving] = useState(false);

  // Get all players including those in additional groups
  const allPlayers = useMemo(() => {
    const mainPlayers = [...players];
    playerGroups.forEach((g) => {
      g.players.forEach((p) => {
        if (!mainPlayers.some((mp) => mp.id === p.id)) {
          mainPlayers.push(p);
        }
      });
    });
    return mainPlayers;
  }, [players, playerGroups]);

  const selectedPlayer = allPlayers.find((p) => p.id === selectedPlayerId);
  const rivals = allPlayers.filter((p) => p.id !== selectedPlayerId);

  // Get the current strokes for a rival (from pending or saved)
  const getStrokesForRival = useCallback(
    (rivalId: string): number => {
      const key = `${selectedPlayerId}-${rivalId}`;
      if (pendingChanges.has(key)) {
        return pendingChanges.get(key)!;
      }
      return getStrokesForLocalPair(selectedPlayerId, rivalId);
    },
    [selectedPlayerId, pendingChanges, getStrokesForLocalPair]
  );

  // Update pending changes locally
  const updatePendingStrokes = useCallback(
    (rivalId: string, strokes: number) => {
      const key = `${selectedPlayerId}-${rivalId}`;
      setPendingChanges((prev) => new Map(prev).set(key, strokes));
    },
    [selectedPlayerId]
  );

  // Increment/decrement strokes
  const adjustStrokes = useCallback(
    (rivalId: string, delta: number) => {
      const current = getStrokesForRival(rivalId);
      const newValue = Math.max(-36, Math.min(36, current + delta));
      updatePendingStrokes(rivalId, newValue);
    },
    [getStrokesForRival, updatePendingStrokes]
  );

  // Save all pending changes
  const saveAllChanges = useCallback(async () => {
    if (pendingChanges.size === 0) {
      toast.info('No hay cambios pendientes');
      return;
    }

    setSaving(true);
    let successCount = 0;
    let errorCount = 0;

    for (const [key, strokes] of pendingChanges.entries()) {
      const [playerAId, playerBId] = key.split('-');
      const success = await setStrokesForLocalPair(playerAId, playerBId, strokes);
      if (success) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    setSaving(false);
    setPendingChanges(new Map());

    if (errorCount === 0) {
      toast.success(`${successCount} hándicap(s) guardado(s)`);
    } else {
      toast.warning(`${successCount} guardados, ${errorCount} con error`);
    }
  }, [pendingChanges, setStrokesForLocalPair]);

  // Check if there are pending changes
  const hasPendingChanges = pendingChanges.size > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Cargando hándicaps...</span>
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
      {/* Header with description */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Definición de Hándicaps
          </CardTitle>
          <CardDescription>
            Define cuántos golpes da o recibe cada jugador respecto a los demás.
            Esta configuración es la fuente única de verdad para todas las apuestas.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Player selector */}
      <Card>
        <CardHeader className="pb-2">
          <Label className="text-xs text-muted-foreground">Selecciona un jugador base</Label>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2">
            {allPlayers.map((player) => (
              <button
                key={player.id}
                onClick={() => {
                  if (hasPendingChanges) {
                    toast.warning('Guarda los cambios antes de cambiar de jugador');
                    return;
                  }
                  setSelectedPlayerId(player.id);
                }}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border transition-all',
                  selectedPlayerId === player.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <PlayerAvatar
                  initials={player.initials}
                  background={player.color}
                  size="sm"
                  isLoggedInUser={player.id === basePlayerId || player.profileId === basePlayerId}
                />
                <span className="text-sm font-medium">{player.name}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Handicap assignments for selected player */}
      {selectedPlayer && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PlayerAvatar
                  initials={selectedPlayer.initials}
                  background={selectedPlayer.color}
                  size="md"
                  isLoggedInUser={selectedPlayer.id === basePlayerId || selectedPlayer.profileId === basePlayerId}
                />
                <div>
                  <CardTitle className="text-base">{selectedPlayer.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">HCP Base: {selectedPlayer.handicap}</p>
                </div>
              </div>

              {hasPendingChanges && (
                <Button
                  onClick={saveAllChanges}
                  disabled={saving}
                  className="gap-2"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Guardar
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {rivals.map((rival) => {
              const strokes = getStrokesForRival(rival.id);
              const key = `${selectedPlayerId}-${rival.id}`;
              const hasChange = pendingChanges.has(key);
              const isGiving = strokes > 0;
              const isReceiving = strokes < 0;

              return (
                <div
                  key={rival.id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border',
                    hasChange ? 'border-primary bg-primary/5' : 'border-border'
                  )}
                >
                  {/* Rival info */}
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <PlayerAvatar
                      initials={rival.initials}
                      background={rival.color}
                      size="sm"
                      isLoggedInUser={rival.id === basePlayerId || rival.profileId === basePlayerId}
                    />
                    <span className="text-sm font-medium truncate">{rival.name}</span>
                  </div>

                  {/* Strokes control */}
                  <div className="flex-1 flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => adjustStrokes(rival.id, -1)}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>

                    <div className="flex items-center gap-1 min-w-[100px] justify-center">
                      {isGiving && (
                        <>
                          <ArrowRight className="h-4 w-4 text-destructive" />
                          <span className="text-destructive font-bold">Da {Math.abs(strokes)}</span>
                        </>
                      )}
                      {isReceiving && (
                        <>
                          <ArrowLeft className="h-4 w-4 text-green-600" />
                          <span className="text-green-600 font-bold">Recibe {Math.abs(strokes)}</span>
                        </>
                      )}
                      {strokes === 0 && (
                        <span className="text-muted-foreground">Scratch</span>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => adjustStrokes(rival.id, 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Quick input */}
                  <Input
                    type="number"
                    value={strokes}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      updatePendingStrokes(rival.id, Math.max(-36, Math.min(36, val)));
                    }}
                    className="w-16 h-8 text-center text-sm"
                    min={-36}
                    max={36}
                  />

                  {hasChange && (
                    <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <RefreshCw className="h-2.5 w-2.5 text-primary-foreground" />
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <ArrowRight className="h-3 w-3 text-destructive" />
          <span>Da golpes (desventaja)</span>
        </div>
        <div className="flex items-center gap-1">
          <ArrowLeft className="h-3 w-3 text-green-600" />
          <span>Recibe golpes (ventaja)</span>
        </div>
      </div>
    </div>
  );
};
