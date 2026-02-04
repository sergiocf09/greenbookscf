/**
 * Quick Score Entry Component
 * 
 * Vertical list view for rapidly entering and confirming scores hole-by-hole.
 * Each row has +/- steppers for strokes/putts and a confirm button.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { GolfCourse, PlayerScore } from '@/types/golf';
import { Zap, Minus, Plus, Check, ArrowLeft } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

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

interface HoleRowProps {
  holeNumber: number;
  par: number;
  strokes: number;
  putts: number;
  isConfirmed: boolean;
  isHighlighted: boolean;
  onStrokesChange: (value: number) => void;
  onPuttsChange: (value: number) => void;
  onConfirm: () => void;
  saving: boolean;
}

const HoleRow: React.FC<HoleRowProps> = ({
  holeNumber,
  par,
  strokes,
  putts,
  isConfirmed,
  isHighlighted,
  onStrokesChange,
  onPuttsChange,
  onConfirm,
  saving,
}) => {
  // Get score color based on relation to par
  const getScoreColor = () => {
    const diff = strokes - par;
    if (diff <= -2) return 'text-golf-gold font-bold';
    if (diff === -1) return 'text-green-600 font-bold';
    if (diff === 0) return 'text-foreground font-semibold';
    if (diff === 1) return 'text-orange-500 font-bold';
    if (diff >= 2) return 'text-destructive font-bold';
    return '';
  };

  return (
    <div className={cn(
      "flex items-center gap-2 py-2 px-3 border-b border-border last:border-b-0",
      isConfirmed && "bg-green-50 dark:bg-green-950/20"
    )}>
      {/* Hole Number with green ring if highlighted */}
      <div className="flex items-center justify-center w-8">
        <span className={cn(
          "w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold",
          isHighlighted && "ring-2 ring-green-500 bg-white dark:bg-background",
          isConfirmed && "bg-green-500 text-white ring-0"
        )}>
          {holeNumber}
        </span>
      </div>

      {/* Par */}
      <div className="w-10 text-center">
        <span className="text-xs text-muted-foreground block">Par</span>
        <span className="text-sm font-medium">{par}</span>
      </div>

      {/* Strokes Stepper */}
      <div className="flex items-center gap-1 flex-1">
        <span className="text-xs text-muted-foreground w-12">Golpes</span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-full shrink-0"
          onClick={() => onStrokesChange(Math.max(1, strokes - 1))}
          disabled={strokes <= 1 || isConfirmed}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <span className={cn("w-8 text-center text-lg font-bold", getScoreColor())}>
          {strokes}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-full shrink-0"
          onClick={() => onStrokesChange(strokes + 1)}
          disabled={strokes >= 15 || isConfirmed}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {/* Putts Stepper */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground w-10">Putts</span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-full shrink-0"
          onClick={() => onPuttsChange(Math.max(0, putts - 1))}
          disabled={putts <= 0 || isConfirmed}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <span className="w-6 text-center text-lg font-bold text-muted-foreground">
          {putts}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-full shrink-0"
          onClick={() => onPuttsChange(Math.min(putts + 1, strokes))}
          disabled={putts >= strokes || isConfirmed}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {/* Confirm Button */}
      <Button
        variant={isConfirmed ? "default" : "outline"}
        size="sm"
        className={cn(
          "ml-2 shrink-0 w-20",
          isConfirmed && "bg-green-600 hover:bg-green-600 text-white"
        )}
        onClick={onConfirm}
        disabled={isConfirmed || saving}
      >
        {isConfirmed ? (
          <><Check className="h-4 w-4 mr-1" /> OK</>
        ) : (
          'Confirmar'
        )}
      </Button>
    </div>
  );
};

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
  // Initialize state from current scores - use par as default for strokes, 2 for putts
  const [scores, setScores] = useState<Record<number, { strokes: number; putts: number }>>(() => {
    const initial: Record<number, { strokes: number; putts: number }> = {};
    for (let h = 1; h <= 18; h++) {
      const existing = currentScores.find(s => s.holeNumber === h);
      const par = course.holes[h - 1]?.par || 4;
      initial[h] = {
        strokes: existing?.strokes && existing.strokes > 0 ? existing.strokes : par,
        putts: existing?.putts !== undefined && existing.putts >= 0 ? existing.putts : 2,
      };
    }
    return initial;
  });

  // Track which holes have been confirmed in this session
  const [confirmedInSession, setConfirmedInSession] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      const initial: Record<number, { strokes: number; putts: number }> = {};
      for (let h = 1; h <= 18; h++) {
        const existing = currentScores.find(s => s.holeNumber === h);
        const par = course.holes[h - 1]?.par || 4;
        initial[h] = {
          strokes: existing?.strokes && existing.strokes > 0 ? existing.strokes : par,
          putts: existing?.putts !== undefined && existing.putts >= 0 ? existing.putts : 2,
        };
      }
      setScores(initial);
      setConfirmedInSession(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleStrokesChange = useCallback((hole: number, value: number) => {
    setScores(prev => {
      const newPutts = Math.min(prev[hole].putts, value); // Ensure putts don't exceed strokes
      return {
        ...prev,
        [hole]: { strokes: value, putts: newPutts },
      };
    });
  }, []);

  const handlePuttsChange = useCallback((hole: number, value: number) => {
    setScores(prev => ({
      ...prev,
      [hole]: { ...prev[hole], putts: value },
    }));
  }, []);

  const handleConfirmHole = useCallback(async (holeNumber: number) => {
    const entry = scores[holeNumber];
    if (!entry || entry.strokes <= 0) return;

    setSaving(true);
    try {
      await onSaveScores([{
        holeNumber,
        strokes: entry.strokes,
        putts: Math.min(entry.putts, entry.strokes),
      }]);
      setConfirmedInSession(prev => new Set(prev).add(holeNumber));
      toast.success(`Hoyo ${holeNumber} confirmado`);
    } catch (error: any) {
      console.error('Error confirming hole:', error);
      toast.error(error?.message || 'Error al confirmar');
    } finally {
      setSaving(false);
    }
  }, [scores, onSaveScores]);

  // Get par for a hole
  const getPar = (hole: number) => course.holes[hole - 1]?.par || 4;

  // Check if player is "new" (has no confirmed holes of their own)
  const isNewPlayer = useMemo(() => {
    return !currentScores.some(s => s.confirmed === true);
  }, [currentScores]);

  // Check if hole was already confirmed (before this session)
  const wasAlreadyConfirmed = useCallback((hole: number) => {
    const existing = currentScores.find(s => s.holeNumber === hole);
    return existing?.confirmed === true;
  }, [currentScores]);

  // Check if hole is confirmed (either before or during this session)
  const isHoleConfirmed = useCallback((hole: number) => {
    return wasAlreadyConfirmed(hole) || confirmedInSession.has(hole);
  }, [wasAlreadyConfirmed, confirmedInSession]);

  // Check if hole should show green ring (group progress for new players)
  const isHoleHighlighted = useCallback((hole: number) => {
    if (isNewPlayer && !confirmedInSession.has(hole)) {
      return roundConfirmedHoles.has(hole);
    }
    return false;
  }, [isNewPlayer, confirmedInSession, roundConfirmedHoles]);

  // Calculate totals
  const frontTotal = useMemo(() => {
    let total = 0;
    for (let h = 1; h <= 9; h++) {
      if (isHoleConfirmed(h)) {
        total += scores[h]?.strokes || 0;
      }
    }
    return total || '-';
  }, [scores, isHoleConfirmed]);

  const backTotal = useMemo(() => {
    let total = 0;
    for (let h = 10; h <= 18; h++) {
      if (isHoleConfirmed(h)) {
        total += scores[h]?.strokes || 0;
      }
    }
    return total || '-';
  }, [scores, isHoleConfirmed]);

  const confirmedCount = useMemo(() => {
    let count = 0;
    for (let h = 1; h <= 18; h++) {
      if (isHoleConfirmed(h)) count++;
    }
    return count;
  }, [isHoleConfirmed]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b">
          <DialogTitle className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-primary" />
            <span>Captura Rápida</span>
          </DialogTitle>
          <div className="flex items-center gap-2 mt-2">
            <PlayerAvatar initials={playerInitials} background={playerColor} size="sm" />
            <span className="font-semibold">{playerName}</span>
            <span className="text-sm text-muted-foreground ml-auto">
              {confirmedCount}/18 hoyos
            </span>
          </div>
        </DialogHeader>

        {/* Visual legend for new players */}
        {isNewPlayer && roundConfirmedHoles.size > 0 && (
          <div className="text-xs text-muted-foreground bg-muted/50 px-4 py-2 flex items-center gap-2">
            <span className="w-4 h-4 rounded-full ring-2 ring-green-500 bg-white inline-block flex-shrink-0" />
            <span>= Avance del grupo</span>
          </div>
        )}

        <ScrollArea className="flex-1 px-2">
          {/* Front 9 */}
          <div className="mb-2">
            <div className="text-xs font-semibold text-muted-foreground px-3 py-1 bg-muted/30 sticky top-0">
              Front 9
            </div>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(h => (
              <HoleRow
                key={h}
                holeNumber={h}
                par={getPar(h)}
                strokes={scores[h]?.strokes || getPar(h)}
                putts={scores[h]?.putts ?? 2}
                isConfirmed={isHoleConfirmed(h)}
                isHighlighted={isHoleHighlighted(h)}
                onStrokesChange={(v) => handleStrokesChange(h, v)}
                onPuttsChange={(v) => handlePuttsChange(h, v)}
                onConfirm={() => handleConfirmHole(h)}
                saving={saving}
              />
            ))}
            <div className="text-right text-sm font-semibold px-3 py-1 bg-muted/20">
              OUT: <span className="text-primary">{frontTotal}</span>
            </div>
          </div>

          {/* Back 9 */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground px-3 py-1 bg-muted/30 sticky top-0">
              Back 9
            </div>
            {[10, 11, 12, 13, 14, 15, 16, 17, 18].map(h => (
              <HoleRow
                key={h}
                holeNumber={h}
                par={getPar(h)}
                strokes={scores[h]?.strokes || getPar(h)}
                putts={scores[h]?.putts ?? 2}
                isConfirmed={isHoleConfirmed(h)}
                isHighlighted={isHoleHighlighted(h)}
                onStrokesChange={(v) => handleStrokesChange(h, v)}
                onPuttsChange={(v) => handlePuttsChange(h, v)}
                onConfirm={() => handleConfirmHole(h)}
                saving={saving}
              />
            ))}
            <div className="text-right text-sm font-semibold px-3 py-1 bg-muted/20">
              IN: <span className="text-primary">{backTotal}</span>
            </div>
          </div>

          {/* Total */}
          <div className="text-center text-lg font-bold py-3 border-t bg-card">
            Total: <span className="text-primary">
              {typeof frontTotal === 'number' && typeof backTotal === 'number'
                ? frontTotal + backTotal
                : '-'}
            </span>
          </div>
        </ScrollArea>

        {/* Footer with back button */}
        <div className="p-3 border-t bg-card">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)} 
            className="w-full"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Regresar al Scorecard
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
