/**
 * Quick Score Entry Component
 * 
 * Compact vertical list for rapidly entering scores hole-by-hole.
 * Auto-confirms when user modifies strokes or putts.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { GolfCourse, PlayerScore } from '@/types/golf';
import { Zap, Minus, Plus, Check, ArrowLeft } from 'lucide-react';


interface QuickScoreEntryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerName: string;
  playerInitials: string;
  playerColor: string;
  playerId: string;
  course: GolfCourse;
  currentScores: PlayerScore[];
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
  const getScoreColor = () => {
    const diff = strokes - par;
    if (diff <= -2) return 'text-golf-gold font-bold';
    if (diff === -1) return 'text-green-600 font-bold';
    if (diff === 0) return 'text-foreground';
    if (diff === 1) return 'text-orange-500 font-bold';
    if (diff >= 2) return 'text-destructive font-bold';
    return '';
  };

  return (
    <div className={cn(
      "grid grid-cols-[2.5rem_2rem_1fr_1fr_3rem] items-center gap-1 py-1.5 px-2 border-b border-border/50",
      isConfirmed && "bg-green-50 dark:bg-green-950/30"
    )}>
      {/* Hole Number */}
      <div className="flex justify-center">
        <span className={cn(
          "w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold",
          isHighlighted && !isConfirmed && "ring-2 ring-green-500 bg-background",
          isConfirmed && "bg-green-500/20 text-green-700 dark:text-green-400 ring-2 ring-green-500"
        )}>
          {holeNumber}
        </span>
      </div>

      {/* Par */}
      <span className="text-center text-sm text-muted-foreground">{par}</span>

      {/* Strokes Stepper */}
      <div className="flex items-center justify-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full"
          onClick={() => onStrokesChange(Math.max(1, strokes - 1))}
          disabled={strokes <= 1}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <span className={cn("w-6 text-center text-base font-semibold", getScoreColor())}>
          {strokes}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full"
          onClick={() => onStrokesChange(strokes + 1)}
          disabled={strokes >= 15}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {/* Putts Stepper */}
      <div className="flex items-center justify-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full"
          onClick={() => onPuttsChange(Math.max(0, putts - 1))}
          disabled={putts <= 0}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <span className="w-5 text-center text-base text-muted-foreground">
          {putts}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full"
          onClick={() => onPuttsChange(Math.min(putts + 1, strokes))}
          disabled={putts >= strokes}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {/* Confirm Button */}
      <div className="flex justify-center">
        {isConfirmed ? (
          <span className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center">
            <Check className="h-4 w-4 text-white" />
          </span>
        ) : (
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 rounded-full border-muted-foreground/30"
            onClick={onConfirm}
            disabled={saving}
          >
            <Check className="h-3 w-3 text-muted-foreground" />
          </Button>
        )}
      </div>
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
  const [scores, setScores] = useState<Record<number, { strokes: number; putts: number }>>({});
  const [confirmedInSession, setConfirmedInSession] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const pendingSaveRef = useRef<{ hole: number; strokes: number; putts: number } | null>(null);

  // Initialize scores when dialog opens
  useEffect(() => {
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
  }, [open, currentScores, course.holes]);

  // Auto-save when strokes/putts change - uses pendingSaveRef values to avoid stale closure
  const saveHole = useCallback(async (holeNumber: number, strokesVal?: number, puttsVal?: number) => {
    // Use provided values or fall back to current state
    const strokes = strokesVal ?? scores[holeNumber]?.strokes;
    const putts = puttsVal ?? scores[holeNumber]?.putts;
    
    if (!strokes || strokes <= 0) return;
    
    setSaving(true);
    try {
      await onSaveScores([{
        holeNumber,
        strokes,
        putts: Math.min(putts ?? 2, strokes),
      }]);
      setConfirmedInSession(prev => new Set(prev).add(holeNumber));
    } catch (error: any) {
      console.error('Error saving hole:', error);
      toast.error(error?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }, [scores, onSaveScores]);

  const handleStrokesChange = useCallback((hole: number, value: number) => {
    const newPutts = Math.min(scores[hole]?.putts ?? 2, value);
    setScores(prev => ({ ...prev, [hole]: { strokes: value, putts: newPutts } }));
    
    // Auto-confirm after a short delay - pass values directly to avoid stale closure
    pendingSaveRef.current = { hole, strokes: value, putts: newPutts };
    setTimeout(() => {
      if (pendingSaveRef.current?.hole === hole) {
        saveHole(hole, pendingSaveRef.current.strokes, pendingSaveRef.current.putts);
      }
    }, 800);
  }, [scores, saveHole]);

  const handlePuttsChange = useCallback((hole: number, value: number) => {
    const currentStrokes = scores[hole]?.strokes ?? 4;
    setScores(prev => ({ ...prev, [hole]: { ...prev[hole], putts: value } }));
    
    // Auto-confirm after a short delay - pass values directly to avoid stale closure
    pendingSaveRef.current = { hole, strokes: currentStrokes, putts: value };
    setTimeout(() => {
      if (pendingSaveRef.current?.hole === hole) {
        saveHole(hole, pendingSaveRef.current.strokes, pendingSaveRef.current.putts);
      }
    }, 800);
  }, [scores, saveHole]);

  const handleConfirmHole = useCallback((holeNumber: number) => {
    const entry = scores[holeNumber];
    saveHole(holeNumber, entry?.strokes, entry?.putts);
  }, [scores, saveHole]);

  const getPar = (hole: number) => course.holes[hole - 1]?.par || 4;

  const isNewPlayer = useMemo(() => {
    return !currentScores.some(s => s.confirmed === true);
  }, [currentScores]);

  const wasAlreadyConfirmed = useCallback((hole: number) => {
    return currentScores.find(s => s.holeNumber === hole)?.confirmed === true;
  }, [currentScores]);

  const isHoleConfirmed = useCallback((hole: number) => {
    return wasAlreadyConfirmed(hole) || confirmedInSession.has(hole);
  }, [wasAlreadyConfirmed, confirmedInSession]);

  const isHoleHighlighted = useCallback((hole: number) => {
    if (isNewPlayer && !confirmedInSession.has(hole)) {
      return roundConfirmedHoles.has(hole);
    }
    return false;
  }, [isNewPlayer, confirmedInSession, roundConfirmedHoles]);

  const confirmedCount = useMemo(() => {
    let count = 0;
    for (let h = 1; h <= 18; h++) {
      if (isHoleConfirmed(h)) count++;
    }
    return count;
  }, [isHoleConfirmed]);

  const frontTotal = useMemo(() => {
    let total = 0;
    for (let h = 1; h <= 9; h++) {
      if (isHoleConfirmed(h)) total += scores[h]?.strokes || 0;
    }
    return total || '-';
  }, [scores, isHoleConfirmed]);

  const backTotal = useMemo(() => {
    let total = 0;
    for (let h = 10; h <= 18; h++) {
      if (isHoleConfirmed(h)) total += scores[h]?.strokes || 0;
    }
    return total || '-';
  }, [scores, isHoleConfirmed]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm h-[85vh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-4 pt-4 pb-2 border-b space-y-2 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-primary" />
            Captura Rápida
          </DialogTitle>
          <div className="flex items-center gap-2">
            <PlayerAvatar initials={playerInitials} background={playerColor} size="sm" />
            <span className="font-medium text-sm">{playerName}</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {confirmedCount}/18
            </span>
          </div>
        </DialogHeader>

        {/* Column Headers */}
        <div className="grid grid-cols-[2.5rem_2rem_1fr_1fr_3rem] items-center gap-1 px-2 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground border-b shrink-0">
          <span className="text-center">Hoyo</span>
          <span className="text-center">Par</span>
          <span className="text-center">Golpes</span>
          <span className="text-center">Putts</span>
          <span className="text-center">OK</span>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {/* Front 9 */}
          <div className="text-[10px] font-semibold text-muted-foreground px-2 py-1 bg-muted/30">
            IDA (1-9)
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
          <div className="text-right text-xs font-medium px-3 py-1 bg-muted/20 border-b">
            OUT: <span className="text-primary font-bold">{frontTotal}</span>
          </div>

          {/* Back 9 */}
          <div className="text-[10px] font-semibold text-muted-foreground px-2 py-1 bg-muted/30">
            VUELTA (10-18)
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
          <div className="text-right text-xs font-medium px-3 py-1 bg-muted/20">
            IN: <span className="text-primary font-bold">{backTotal}</span>
          </div>

          {/* Total */}
          <div className="text-center text-sm font-bold py-2 border-t bg-card">
            Total: <span className="text-primary">
              {typeof frontTotal === 'number' && typeof backTotal === 'number'
                ? frontTotal + backTotal
                : '-'}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)} 
            className="w-full h-9"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Regresar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};