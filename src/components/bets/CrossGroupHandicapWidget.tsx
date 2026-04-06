import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Player } from '@/types/golf';
import { useSlidingPersistence } from '@/hooks/useSlidingPersistence';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CrossGroupHandicapWidgetProps {
  basePlayer: Player;
  rival: Player;
  getStrokesForLocalPair?: (localIdA: string, localIdB: string) => number;
  setStrokesForLocalPair?: (localIdA: string, localIdB: string, strokes: number) => Promise<boolean>;
  isHistorical?: boolean;
}

const CrossGroupHandicapWidget: React.FC<CrossGroupHandicapWidgetProps> = ({
  basePlayer,
  rival,
  getStrokesForLocalPair,
  setStrokesForLocalPair,
  isHistorical,
}) => {
  const { getSuggestedStrokes } = useSlidingPersistence();
  const [slidingSuggestion, setSlidingSuggestion] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Default strokes = rounded difference between handicaps (base - rival)
  // Positive = base gives strokes to rival; negative = rival gives strokes to base
  const defaultStrokes = Math.round(basePlayer.handicap - rival.handicap);

  // Current strokes from round_handicaps (live)
  // getStrokesForLocalPair(A, B) = strokes A gives to B
  const currentStrokes = getStrokesForLocalPair
    ? getStrokesForLocalPair(basePlayer.id, rival.id)
    : defaultStrokes;

  // Local display value (optimistic)
  const [localStrokes, setLocalStrokes] = useState<number>(currentStrokes);

  // Sync if external state changes (realtime updates from other clients)
  useEffect(() => {
    setLocalStrokes(currentStrokes);
  }, [currentStrokes]);

  // Load sliding suggestion for this pair (by profileId)
  useEffect(() => {
    if (!basePlayer.profileId || !rival.profileId) return;
    getSuggestedStrokes(basePlayer.profileId, rival.profileId).then(setSlidingSuggestion);
  }, [basePlayer.profileId, rival.profileId, getSuggestedStrokes]);

  const saveStrokes = useCallback(async (strokes: number) => {
    if (!setStrokesForLocalPair) return;
    setIsSaving(true);
    try {
      await setStrokesForLocalPair(basePlayer.id, rival.id, strokes);
    } finally {
      setIsSaving(false);
    }
  }, [setStrokesForLocalPair, basePlayer.id, rival.id]);

  const handleChange = (delta: number) => {
    const next = localStrokes + delta;
    setLocalStrokes(next);
    // Debounce save 400ms
    if (pendingRef.current) clearTimeout(pendingRef.current);
    pendingRef.current = setTimeout(() => {
      void saveStrokes(next);
    }, 400);
  };

  const handleApplySuggestion = () => {
    if (slidingSuggestion === null) return;
    setLocalStrokes(slidingSuggestion);
    if (pendingRef.current) clearTimeout(pendingRef.current);
    void saveStrokes(slidingSuggestion);
  };

  const handleApplyDefault = () => {
    setLocalStrokes(defaultStrokes);
    if (pendingRef.current) clearTimeout(pendingRef.current);
    void saveStrokes(defaultStrokes);
  };

  const canEdit = !!setStrokesForLocalPair && !isHistorical;

  // Describe who gives strokes
  const description = (() => {
    if (localStrokes === 0) return 'Scratch';
    const giver = localStrokes > 0 ? basePlayer.name.split(' ')[0] : rival.name.split(' ')[0];
    const receiver = localStrokes > 0 ? rival.name.split(' ')[0] : basePlayer.name.split(' ')[0];
    return `${giver} da ${Math.abs(localStrokes)} golpe(s) a ${receiver}`;
  })();

  return (
    <Card className="border-accent/40 bg-accent/5">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs flex items-center gap-2 text-accent-foreground">
          <Users className="h-3.5 w-3.5" />
          Ventaja entre grupos
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-3 px-3 space-y-2">
        {/* Main stepper row */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">{description}</div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 rounded-full"
                onClick={() => handleChange(-1)}
                disabled={isSaving}
              >
                <Minus className="h-3 w-3" />
              </Button>
            )}
            <div className={cn(
              'w-10 text-center text-xl font-bold',
              localStrokes > 0 ? 'text-destructive' : localStrokes < 0 ? 'text-green-600' : 'text-muted-foreground'
            )}>
              {localStrokes > 0 ? `+${localStrokes}` : localStrokes}
            </div>
            {canEdit && (
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 rounded-full"
                onClick={() => handleChange(1)}
                disabled={isSaving}
              >
                <Plus className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Helper chips */}
        {canEdit && (
          <div className="flex gap-2 flex-wrap">
            {/* Reset to USGA difference */}
            {localStrokes !== defaultStrokes && (
              <button
                type="button"
                onClick={handleApplyDefault}
                className="text-[10px] px-2 py-0.5 rounded-full border border-muted-foreground/30 text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                ↩ USGA ({defaultStrokes > 0 ? `+${defaultStrokes}` : defaultStrokes})
              </button>
            )}
            {/* Sliding suggestion */}
            {slidingSuggestion !== null && localStrokes !== slidingSuggestion && (
              <button
                type="button"
                onClick={handleApplySuggestion}
                className="text-[10px] px-2 py-0.5 rounded-full border border-amber-400/50 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors flex items-center gap-1"
              >
                ✨ Sliding ({slidingSuggestion > 0 ? `+${slidingSuggestion}` : slidingSuggestion})
              </button>
            )}
            {slidingSuggestion !== null && localStrokes === slidingSuggestion && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-600 border border-amber-400/30">
                ✨ Usando Sliding
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Bilateral Detail Component - Reorganized with bet type rows and override capability

export { CrossGroupHandicapWidget };
export type { CrossGroupHandicapWidgetProps };
