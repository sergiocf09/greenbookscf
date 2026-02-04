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

  const [saving, setSaving] = useState(false);

  // Reset scores when dialog opens with new data
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
    }
  }, [open, currentScores]);

  const handleStrokesChange = useCallback((hole: number, value: string) => {
    if (value === '') {
      setScores(prev => ({
        ...prev,
        [hole]: { ...prev[hole], strokes: '' },
      }));
      return;
    }
    const num = parseInt(value, 10);
    if (Number.isFinite(num) && num >= 0) {
      setScores(prev => ({
        ...prev,
        [hole]: { ...prev[hole], strokes: num },
      }));
    }
  }, []);

  const handlePuttsChange = useCallback((hole: number, value: string) => {
    if (value === '') {
      setScores(prev => ({
        ...prev,
        [hole]: { ...prev[hole], putts: '' },
      }));
      return;
    }
    const num = parseInt(value, 10);
    if (Number.isFinite(num) && num >= 0) {
      setScores(prev => ({
        ...prev,
        [hole]: { ...prev[hole], putts: num },
      }));
    }
  }, []);

  // Count filled holes
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
    // Collect all scores that have strokes entered
    const scoresToSave: { holeNumber: number; strokes: number; putts: number }[] = [];
    
    for (let h = 1; h <= 18; h++) {
      const entry = scores[h];
      const strokes = typeof entry.strokes === 'number' ? entry.strokes : 0;
      const putts = typeof entry.putts === 'number' ? entry.putts : 2;
      
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
      toast.success(`${scoresToSave.length} hoyos guardados`);
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

        <div className="space-y-4">
          {/* Front 9 */}
          <Card>
            <CardContent className="p-3">
              <div className="text-xs font-semibold text-muted-foreground mb-2">Front 9</div>
              <div className="grid grid-cols-10 gap-1 text-xs">
                {/* Header Row */}
                <div className="font-medium text-muted-foreground text-center">Hoyo</div>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(h => (
                  <div key={h} className="text-center font-semibold">{h}</div>
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
                  <div key={h} className="text-center font-semibold">{h}</div>
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

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || filledHoles === 0}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Guardando...' : `Guardar ${filledHoles} hoyo${filledHoles !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
