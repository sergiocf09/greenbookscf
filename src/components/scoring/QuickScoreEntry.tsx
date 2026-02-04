/**
 * Quick Score Entry Component
 * 
 * Grid-based view for rapidly entering scores and putts for all 18 holes.
 * Used when a player is added mid-round or for quick corrections.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { GolfCourse, PlayerScore } from '@/types/golf';
import { Zap, Save } from 'lucide-react';

interface QuickScoreEntryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerName: string;
  playerInitials: string;
  playerColor: string;
  playerId: string;
  course: GolfCourse;
  currentScores: PlayerScore[];
  /** Holes confirmed at round level (by any other player) */
  roundConfirmedHoles?: Set<number>;
  onSaveScores: (scores: { holeNumber: number; strokes: number; putts: number }[]) => Promise<void>;
}

export const QuickScoreEntry: React.FC<QuickScoreEntryProps> = ({
  open,
  onOpenChange,
  playerName,
  playerInitials,
  playerColor,
  playerId,
  course,
  currentScores,
  roundConfirmedHoles = new Set(),
  onSaveScores,
}) => {
  // Initialize state from current scores
  const [scores, setScores] = useState<Record<number, { strokes: number | ''; putts: number | '' }>>(() => {
    const initial: Record<number, { strokes: number | ''; putts: number | '' }> = {};
    for (let h = 1; h <= 18; h++) {
      const existing = currentScores.find(s => s.holeNumber === h);
      initial[h] = {
        strokes: existing?.strokes && existing.strokes > 0 ? existing.strokes : '',
        putts: existing?.putts !== undefined && existing.putts >= 0 ? existing.putts : '',
      };
    }
    return initial;
  });

  // Track which holes the user actually modified in this session (dirty tracking)
  const [dirtyHoles, setDirtyHoles] = useState<Set<number>>(new Set());

  const [saving, setSaving] = useState(false);

  // Keep track of initial values to detect changes, stored as a ref to avoid re-renders
  const initialScoresRef = React.useRef<Record<number, { strokes: number | ''; putts: number | '' }>>({});
  
  // Reset scores AND dirty state ONLY when dialog opens (not on currentScores changes while open)
  React.useEffect(() => {
    if (open) {
      const initial: Record<number, { strokes: number | ''; putts: number | '' }> = {};
      for (let h = 1; h <= 18; h++) {
        const existing = currentScores.find(s => s.holeNumber === h);
        initial[h] = {
          strokes: existing?.strokes && existing.strokes > 0 ? existing.strokes : '',
          putts: existing?.putts !== undefined && existing.putts >= 0 ? existing.putts : '',
        };
      }
      setScores(initial);
      initialScoresRef.current = JSON.parse(JSON.stringify(initial)); // Deep copy
      setDirtyHoles(new Set()); // Reset dirty tracking on open
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]); // Intentionally only depends on 'open' to prevent reset while dialog is open

  const handleStrokesChange = useCallback((hole: number, value: string) => {
    // Always mark as dirty when user interacts - we'll validate against initial on save
    setDirtyHoles(prev => new Set(prev).add(hole));
    
    if (value === '') {
      setScores(prev => ({
        ...prev,
        [hole]: { ...prev[hole], strokes: '' },
      }));
    } else {
      const num = parseInt(value, 10);
      if (Number.isFinite(num) && num >= 0) {
        setScores(prev => ({
          ...prev,
          [hole]: { ...prev[hole], strokes: num },
        }));
      }
    }
  }, []);

  const handlePuttsChange = useCallback((hole: number, value: string) => {
    // Always mark as dirty when user interacts
    setDirtyHoles(prev => new Set(prev).add(hole));
    
    if (value === '') {
      setScores(prev => ({
        ...prev,
        [hole]: { ...prev[hole], putts: '' },
      }));
    } else {
      const num = parseInt(value, 10);
      if (Number.isFinite(num) && num >= 0) {
        setScores(prev => ({
          ...prev,
          [hole]: { ...prev[hole], putts: num },
        }));
      }
    }
  }, []);

  // Helper function to check if a hole should be saved
  // RULE: If the user touched strokes OR putts, and strokes has a valid number > 0, save it
  // This allows: writing strokes only, writing putts only (if strokes exists), or both
  const shouldSaveHole = (hole: number): boolean => {
    // Must have interacted with this hole
    if (!dirtyHoles.has(hole)) return false;
    
    // Must have valid strokes to save (can't save a hole without strokes)
    const strokesVal = scores[hole]?.strokes;
    return typeof strokesVal === 'number' && strokesVal > 0;
  };

  // Count holes that user touched and have valid strokes (these will be saved)
  const dirtyHolesWithInput = useMemo(() => {
    let count = 0;
    for (let h = 1; h <= 18; h++) {
      if (dirtyHoles.has(h)) {
        const strokesVal = scores[h]?.strokes;
        if (typeof strokesVal === 'number' && strokesVal > 0) {
          count++;
        }
      }
    }
    return count;
  }, [scores, dirtyHoles]);

  // Count all filled holes (for display purposes)
  const filledHoles = useMemo(() => {
    return Object.values(scores).filter(s => s.strokes !== '' && typeof s.strokes === 'number' && s.strokes > 0).length;
  }, [scores]);

  // Calculate totals
  const frontTotal = useMemo(() => {
    let total = 0;
    for (let h = 1; h <= 9; h++) {
      const s = scores[h]?.strokes;
      if (typeof s === 'number' && s > 0) total += s;
    }
    return total || '-';
  }, [scores]);

  const backTotal = useMemo(() => {
    let total = 0;
    for (let h = 10; h <= 18; h++) {
      const s = scores[h]?.strokes;
      if (typeof s === 'number' && s > 0) total += s;
    }
    return total || '-';
  }, [scores]);

  const handleSave = async () => {
    // Save holes where the user made input (touched the field and entered a valid value)
    const scoresToSave: { holeNumber: number; strokes: number; putts: number }[] = [];
    
    for (let h = 1; h <= 18; h++) {
      // Only process holes that user interacted with and have valid input
      if (!shouldSaveHole(h)) continue;
      
      const entry = scores[h];
      const strokes = typeof entry.strokes === 'number' ? entry.strokes : 0;
      const putts = typeof entry.putts === 'number' ? entry.putts : 2;
      
      // Only save if there's a valid strokes value
      if (strokes > 0) {
        scoresToSave.push({
          holeNumber: h,
          strokes,
          putts: Math.min(putts, strokes), // Putts can't exceed strokes
        });
      }
    }

    if (scoresToSave.length === 0) {
      toast.error('Ingresa al menos un score');
      return;
    }

    setSaving(true);
    try {
      await onSaveScores(scoresToSave);
      toast.success(`${scoresToSave.length} hoyo${scoresToSave.length !== 1 ? 's' : ''} guardado${scoresToSave.length !== 1 ? 's' : ''} y confirmado${scoresToSave.length !== 1 ? 's' : ''}`);
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving quick scores:', error);
      toast.error(error?.message || 'Error al guardar scores');
    } finally {
      setSaving(false);
    }
  };

  // Get par for display
  const getPar = (hole: number) => course.holes[hole - 1]?.par || 4;

  // Check if player is "new" (has no confirmed holes of their own)
  const isNewPlayer = useMemo(() => {
    return !currentScores.some(s => s.confirmed === true);
  }, [currentScores]);

  // Check if hole should show green circle
  // For new players: show green if confirmed by round (other players)
  // For existing players: show green if confirmed by this player
  const isHoleHighlighted = (hole: number) => {
    if (isNewPlayer) {
      return roundConfirmedHoles.has(hole);
    }
    const existing = currentScores.find(s => s.holeNumber === hole);
    return existing?.confirmed === true;
  };

  // Get score color based on relation to par
  const getScoreStyle = (hole: number, strokes: number | '') => {
    if (strokes === '' || strokes <= 0) return '';
    const par = getPar(hole);
    const diff = strokes - par;
    if (diff <= -2) return 'bg-golf-gold/20 text-golf-gold font-bold';
    if (diff === -1) return 'bg-green-500/20 text-green-600 font-bold';
    if (diff === 0) return 'text-foreground font-semibold';
    if (diff === 1) return 'text-orange-500 font-bold';
    if (diff >= 2) return 'text-destructive font-bold';
    return '';
  };

  // Select all text on focus for easy replacement
  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-primary" />
            <span>Captura Rápida</span>
            <PlayerAvatar initials={playerInitials} background={playerColor} size="sm" />
            <span className="font-normal text-muted-foreground">{playerName}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Visual legend for new players */}
        {isNewPlayer && roundConfirmedHoles.size > 0 && (
          <div className="text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md flex items-center gap-2">
            <span className="w-4 h-4 rounded-full ring-2 ring-green-500 bg-white inline-block flex-shrink-0" />
            <span>= Avance del grupo (referencia). Solo se confirmarán los hoyos donde captures scores.</span>
          </div>
        )}

        <div className="space-y-4">
          {/* Front 9 */}
          <Card>
            <CardContent className="p-3">
              <div className="text-xs font-semibold text-muted-foreground mb-2">Front 9</div>
              <div className="grid grid-cols-10 gap-1 text-xs">
                {/* Header Row */}
                <div className="font-medium text-muted-foreground text-center">Hoyo</div>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(h => (
                  <div key={h} className="flex items-center justify-center">
                    <span className={cn(
                      "w-6 h-6 flex items-center justify-center rounded-full font-semibold",
                      isHoleHighlighted(h) && "ring-2 ring-green-500 bg-white"
                    )}>{h}</span>
                  </div>
                ))}
                
                {/* Par Row */}
                <div className="font-medium text-muted-foreground text-center">Par</div>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(h => (
                  <div key={h} className="text-center text-muted-foreground">{getPar(h)}</div>
                ))}
                
                {/* Strokes Row */}
                <div className="font-medium text-muted-foreground text-center py-1">Golpes</div>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(h => (
                  <Input
                    key={h}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={15}
                    value={scores[h]?.strokes}
                    onChange={(e) => handleStrokesChange(h, e.target.value)}
                    onFocus={handleInputFocus}
                    className={cn(
                      'h-8 text-center px-1 text-sm',
                      getScoreStyle(h, scores[h]?.strokes)
                    )}
                  />
                ))}
                
                {/* Putts Row */}
                <div className="font-medium text-muted-foreground text-center py-1">Putts</div>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(h => (
                  <Input
                    key={h}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={10}
                    value={scores[h]?.putts}
                    onChange={(e) => handlePuttsChange(h, e.target.value)}
                    onFocus={handleInputFocus}
                    className="h-8 text-center px-1 text-sm text-muted-foreground"
                  />
                ))}
              </div>
              <div className="mt-2 text-right text-sm font-semibold">
                OUT: <span className="text-primary">{frontTotal}</span>
              </div>
            </CardContent>
          </Card>

          {/* Back 9 */}
          <Card>
            <CardContent className="p-3">
              <div className="text-xs font-semibold text-muted-foreground mb-2">Back 9</div>
              <div className="grid grid-cols-10 gap-1 text-xs">
                {/* Header Row */}
                <div className="font-medium text-muted-foreground text-center">Hoyo</div>
                {[10, 11, 12, 13, 14, 15, 16, 17, 18].map(h => (
                  <div key={h} className="flex items-center justify-center">
                    <span className={cn(
                      "w-6 h-6 flex items-center justify-center rounded-full font-semibold",
                      isHoleHighlighted(h) && "ring-2 ring-green-500 bg-white"
                    )}>{h}</span>
                  </div>
                ))}
                
                {/* Par Row */}
                <div className="font-medium text-muted-foreground text-center">Par</div>
                {[10, 11, 12, 13, 14, 15, 16, 17, 18].map(h => (
                  <div key={h} className="text-center text-muted-foreground">{getPar(h)}</div>
                ))}
                
                {/* Strokes Row */}
                <div className="font-medium text-muted-foreground text-center py-1">Golpes</div>
                {[10, 11, 12, 13, 14, 15, 16, 17, 18].map(h => (
                  <Input
                    key={h}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={15}
                    value={scores[h]?.strokes}
                    onChange={(e) => handleStrokesChange(h, e.target.value)}
                    onFocus={handleInputFocus}
                    className={cn(
                      'h-8 text-center px-1 text-sm',
                      getScoreStyle(h, scores[h]?.strokes)
                    )}
                  />
                ))}
                
                {/* Putts Row */}
                <div className="font-medium text-muted-foreground text-center py-1">Putts</div>
                {[10, 11, 12, 13, 14, 15, 16, 17, 18].map(h => (
                  <Input
                    key={h}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={10}
                    value={scores[h]?.putts}
                    onChange={(e) => handlePuttsChange(h, e.target.value)}
                    onFocus={handleInputFocus}
                    className="h-8 text-center px-1 text-sm text-muted-foreground"
                  />
                ))}
              </div>
              <div className="mt-2 text-right text-sm font-semibold">
                IN: <span className="text-primary">{backTotal}</span>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {filledHoles} de 18 hoyos capturados
            </span>
            <span className="font-semibold">
              Total: <span className="text-primary text-lg">
                {typeof frontTotal === 'number' && typeof backTotal === 'number'
                  ? frontTotal + backTotal
                  : frontTotal !== '-' || backTotal !== '-'
                    ? `${frontTotal !== '-' ? frontTotal : 0} + ${backTotal !== '-' ? backTotal : 0}`
                    : '-'}
              </span>
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <div className="text-xs text-muted-foreground flex-1">
            {filledHoles > 0 && dirtyHolesWithInput === 0 && (
              <span>Modifica al menos un hoyo para guardar</span>
            )}
            {dirtyHolesWithInput > 0 && (
              <span>Se confirmarán {dirtyHolesWithInput} hoyo{dirtyHolesWithInput !== 1 ? 's' : ''} editado{dirtyHolesWithInput !== 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || dirtyHolesWithInput === 0}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Guardando...' : `Guardar ${dirtyHolesWithInput} hoyo${dirtyHolesWithInput !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
