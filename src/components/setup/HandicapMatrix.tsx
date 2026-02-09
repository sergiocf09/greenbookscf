/**
 * HandicapMatrix - Definición de Hándicaps entre Jugadores
 * 
 * Pantalla única y central para definir cuántos golpes da o recibe
 * cada jugador respecto a cada otro jugador de la ronda.
 * 
 * Esta es la ÚNICA fuente de verdad para hándicaps bilaterales.
 * 
 * Features:
 * - Shows current strokes between players
 * - Shows sliding suggestions from previous rounds (if available)
 * - Allows manual override of strokes
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Player, PlayerGroup } from '@/types/golf';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2, Users, ArrowRight, ArrowLeft, Minus, Plus, Save, RefreshCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatPlayerName, disambiguateInitials } from '@/lib/playerInput';
import { supabase } from '@/integrations/supabase/client';
import { devLog, devError } from '@/lib/logger';
import { Badge } from '@/components/ui/badge';

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
  const [slidingSuggestions, setSlidingSuggestions] = useState<Map<string, SlidingSuggestion>>(new Map());

  // Get all players including those in additional groups
  // Sorted so that logged-in player appears first
  const allPlayers = useMemo(() => {
    const mainPlayers = [...players];
    playerGroups.forEach((g) => {
      g.players.forEach((p) => {
        if (!mainPlayers.some((mp) => mp.id === p.id)) {
          mainPlayers.push(p);
        }
      });
    });
    
    // Sort to put logged-in player first
    return mainPlayers.sort((a, b) => {
      const aIsBase = a.id === basePlayerId || a.profileId === basePlayerId;
      const bIsBase = b.id === basePlayerId || b.profileId === basePlayerId;
      if (aIsBase && !bIsBase) return -1;
      if (!aIsBase && bIsBase) return 1;
      return 0;
    });
  }, [players, playerGroups, basePlayerId]);

  // Disambiguate initials across all players
  const disambiguatedInitials = useMemo(() => disambiguateInitials(allPlayers), [allPlayers]);

  // Load sliding suggestions for logged-in player pairs
  useEffect(() => {
    const loadSlidingSuggestions = async () => {
      // Get all logged-in players' profile IDs
      const profileIds = allPlayers
        .filter(p => p.profileId)
        .map(p => p.profileId!);
      
      if (profileIds.length < 2) return;

      try {
        // Query sliding_current for all pairs where both players are in our list
        const { data, error } = await supabase
          .from('sliding_current')
          .select('*')
          .or(
            profileIds.map(id => `player_a_profile_id.eq.${id}`).join(',')
          );

        if (error) {
          devError('Error loading sliding suggestions:', error);
          return;
        }

        // Filter to only include pairs where BOTH players are in our list
        const profileIdSet = new Set(profileIds);
        const filtered = (data || []).filter(entry =>
          profileIdSet.has(entry.player_a_profile_id) &&
          profileIdSet.has(entry.player_b_profile_id)
        );

        // Build suggestions map keyed by "profileA::profileB" (normalized)
        const suggestionsMap = new Map<string, SlidingSuggestion>();
        for (const entry of filtered) {
          const key = `${entry.player_a_profile_id}::${entry.player_b_profile_id}`;
          suggestionsMap.set(key, {
            playerAProfileId: entry.player_a_profile_id,
            playerBProfileId: entry.player_b_profile_id,
            suggestedStrokes: entry.strokes_a_gives_b_current,
            lastRoundId: entry.last_round_id,
          });
        }

        setSlidingSuggestions(suggestionsMap);
        devLog('Loaded sliding suggestions for', suggestionsMap.size, 'pairs');
      } catch (err) {
        devError('Exception loading sliding suggestions:', err);
      }
    };

    loadSlidingSuggestions();
  }, [allPlayers]);

  // Get sliding suggestion for a specific rival (relative to selected player)
  const getSlidingSuggestion = useCallback(
    (rivalId: string): { strokes: number; hasSliding: boolean } => {
      const selectedPlayerProfile = allPlayers.find(p => p.id === selectedPlayerId)?.profileId;
      const rivalProfile = allPlayers.find(p => p.id === rivalId)?.profileId;

      if (!selectedPlayerProfile || !rivalProfile) {
        return { strokes: 0, hasSliding: false };
      }

      // Normalize the pair (smaller ID first)
      const [normA, normB] = selectedPlayerProfile < rivalProfile
        ? [selectedPlayerProfile, rivalProfile]
        : [rivalProfile, selectedPlayerProfile];
      
      const key = `${normA}::${normB}`;
      const suggestion = slidingSuggestions.get(key);

      if (!suggestion) {
        return { strokes: 0, hasSliding: false };
      }

      // If selected player is normA, strokes are direct
      // If selected player is normB, we need to negate
      const strokes = selectedPlayerProfile === normA 
        ? suggestion.suggestedStrokes 
        : -suggestion.suggestedStrokes;

      return { strokes, hasSliding: true };
    },
    [selectedPlayerId, allPlayers, slidingSuggestions]
  );

  const selectedPlayer = allPlayers.find((p) => p.id === selectedPlayerId);
  const rivals = allPlayers.filter((p) => p.id !== selectedPlayerId);

  // Update pending changes locally
  const updatePendingStrokes = useCallback(
    (rivalId: string, strokes: number) => {
      const key = `${selectedPlayerId}::${rivalId}`;
      setPendingChanges((prev) => new Map(prev).set(key, strokes));
    },
    [selectedPlayerId]
  );

  // Apply sliding suggestion to a rival
  const applySlidingSuggestion = useCallback(
    (rivalId: string) => {
      const { strokes, hasSliding } = getSlidingSuggestion(rivalId);
      if (hasSliding) {
        updatePendingStrokes(rivalId, strokes);
        toast.success('Sugerencia de Sliding aplicada');
      }
    },
    [getSlidingSuggestion, updatePendingStrokes]
  );

  // Get the current strokes for a rival (from pending or saved)
  const getStrokesForRival = useCallback(
    (rivalId: string): number => {
      const key = `${selectedPlayerId}::${rivalId}`;
      if (pendingChanges.has(key)) {
        return pendingChanges.get(key)!;
      }
      return getStrokesForLocalPair(selectedPlayerId, rivalId);
    },
    [selectedPlayerId, pendingChanges, getStrokesForLocalPair]
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

  // Check if roundPlayerIds is ready
  const hasRoundPlayerIds = roundPlayerIds.size > 0;

  // Save all pending changes
  const saveAllChanges = useCallback(async () => {
    if (pendingChanges.size === 0) {
      toast.info('No hay cambios pendientes');
      return;
    }

    if (!hasRoundPlayerIds) {
      toast.error('Los datos de jugadores aún no están listos. Espera un momento y vuelve a intentar.');
      console.error('roundPlayerIds is empty, cannot save handicaps');
      return;
    }

    setSaving(true);
    let successCount = 0;
    let errorCount = 0;
    const failedPlayers: string[] = [];

    for (const [key, strokes] of pendingChanges.entries()) {
      // Key format is "playerAId::playerBId" (using :: as separator to avoid UUID conflicts)
      const separatorIndex = key.indexOf('::');
      if (separatorIndex === -1) {
        console.error('Invalid pending change key format:', key);
        errorCount++;
        continue;
      }
      const playerAId = key.substring(0, separatorIndex);
      const playerBId = key.substring(separatorIndex + 2);
      const success = await setStrokesForLocalPair(playerAId, playerBId, strokes);
      if (success) {
        successCount++;
      } else {
        errorCount++;
        // Find player names for better error message
        const playerA = allPlayers.find(p => p.id === playerAId);
        const playerB = allPlayers.find(p => p.id === playerBId);
        if (playerA && playerB) {
          failedPlayers.push(`${playerA.name} - ${playerB.name}`);
        }
      }
    }

    setSaving(false);
    setPendingChanges(new Map());

    if (errorCount === 0) {
      toast.success(`${successCount} hándicap(s) guardado(s)`);
    } else {
      toast.error(`Error guardando: ${failedPlayers.join(', ')}`);
    }
  }, [pendingChanges, setStrokesForLocalPair, hasRoundPlayerIds, allPlayers]);

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

  // Show loading state if roundPlayerIds map is not ready yet
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
                  initials={disambiguatedInitials.get(player.id) || player.initials}
                  background={player.color}
                  size="sm"
                  isLoggedInUser={player.id === basePlayerId || player.profileId === basePlayerId}
                />
                <span className="text-sm font-medium">{formatPlayerName(player.name)}</span>
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
                    initials={disambiguatedInitials.get(selectedPlayer.id) || selectedPlayer.initials}
                  background={selectedPlayer.color}
                  size="md"
                  isLoggedInUser={selectedPlayer.id === basePlayerId || selectedPlayer.profileId === basePlayerId}
                />
                <div>
                  <CardTitle className="text-base">{formatPlayerName(selectedPlayer.name)}</CardTitle>
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
              const key = `${selectedPlayerId}::${rival.id}`;
              const hasChange = pendingChanges.has(key);
              const isGiving = strokes > 0;
              const isReceiving = strokes < 0;
              
              // Get sliding suggestion for this rival
              const sliding = getSlidingSuggestion(rival.id);
              const hasSliding = sliding.hasSliding;
              const slidingDiffers = hasSliding && sliding.strokes !== strokes;

              return (
                <div
                  key={rival.id}
                  className={cn(
                    'flex flex-col gap-2 p-3 rounded-lg border',
                    hasChange ? 'border-primary bg-primary/5' : 'border-border'
                  )}
                >
                  <div className="flex items-center gap-3">
                    {/* Rival info */}
                    <div className="flex items-center gap-2 min-w-[100px]">
                      <PlayerAvatar
                        initials={disambiguatedInitials.get(rival.id) || rival.initials}
                        background={rival.color}
                        size="sm"
                        isLoggedInUser={rival.id === basePlayerId || rival.profileId === basePlayerId}
                      />
                      <span className="text-sm font-medium truncate">{formatPlayerName(rival.name)}</span>
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

                      <div className="flex items-center gap-1 min-w-[90px] justify-center">
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
                      className="w-14 h-8 text-center text-sm"
                      min={-36}
                      max={36}
                    />

                    {hasChange && (
                      <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                        <RefreshCw className="h-2.5 w-2.5 text-primary-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Sliding suggestion row */}
                  {hasSliding && slidingDiffers && (
                    <div className="flex items-center justify-between pl-10 pr-2">
                      <Badge 
                        variant="outline" 
                        className="gap-1 text-xs bg-amber-50 text-amber-700 border-amber-300"
                      >
                        <Sparkles className="h-3 w-3" />
                        Sliding sugerido: {sliding.strokes > 0 ? `Da ${sliding.strokes}` : sliding.strokes < 0 ? `Recibe ${Math.abs(sliding.strokes)}` : 'Scratch'}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-amber-700 hover:text-amber-800 hover:bg-amber-100"
                        onClick={() => applySlidingSuggestion(rival.id)}
                      >
                        Aplicar
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <ArrowRight className="h-3 w-3 text-destructive" />
          <span>Da golpes (desventaja)</span>
        </div>
        <div className="flex items-center gap-1">
          <ArrowLeft className="h-3 w-3 text-green-600" />
          <span>Recibe golpes (ventaja)</span>
        </div>
        {slidingSuggestions.size > 0 && (
          <div className="flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-amber-600" />
            <span>Sugerencia de Sliding</span>
          </div>
        )}
      </div>
    </div>
  );
};
