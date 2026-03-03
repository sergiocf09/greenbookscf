import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { ManualCourseData, ManualHoleData } from '@/hooks/useManualCourse';
import { Check } from 'lucide-react';

interface Props {
  data: ManualCourseData;
  onChange: (d: ManualCourseData) => void;
  onBack: () => void;
  onNext: () => void;
}

type EntryPhase = 'par' | 'index' | 'yards';

export const HolesEntryStep: React.FC<Props> = ({ data, onChange, onBack, onNext }) => {
  const [currentHole, setCurrentHole] = useState(0); // 0-indexed
  const [phase, setPhase] = useState<EntryPhase>('par');

  const holes = data.holes;
  const usedIndices = useMemo(() => new Set(holes.map(h => h.strokeIndex).filter(Boolean)), [holes]);

  const updateHole = (idx: number, partial: Partial<ManualHoleData>) => {
    const updated = [...holes];
    updated[idx] = { ...updated[idx], ...partial };
    onChange({ ...data, holes: updated });
  };

  const selectPar = (par: number) => {
    updateHole(currentHole, { par });
    // Auto-advance
    if (currentHole < 17) {
      setCurrentHole(currentHole + 1);
    } else {
      // All done with par, move to index phase
      setPhase('index');
      setCurrentHole(0);
    }
  };

  const selectIndex = (idx: number) => {
    updateHole(currentHole, { strokeIndex: idx });
    // Find next hole without index
    const nextEmpty = holes.findIndex((h, i) => i > currentHole && !h.strokeIndex);
    if (nextEmpty >= 0) {
      setCurrentHole(nextEmpty);
    } else {
      // Check if all holes have index
      const remaining = holes.filter((h, i) => i !== currentHole && !h.strokeIndex);
      if (remaining.length === 0) {
        if (data.captureYards) {
          setPhase('yards');
          setCurrentHole(0);
        }
        // else done - user clicks Continuar
      } else {
        setCurrentHole(holes.findIndex((h, i) => !h.strokeIndex && i !== currentHole));
      }
    }
  };

  const allParsSet = holes.every(h => h.par !== null);
  const allIndicesSet = holes.every(h => h.strokeIndex !== null);
  const allYardsSet = !data.captureYards || holes.every(h => h.yards !== null);
  const canContinue = allParsSet && allIndicesSet && allYardsSet;

  // Summary counts
  const parsSet = holes.filter(h => h.par !== null).length;
  const indicesSet = holes.filter(h => h.strokeIndex !== null).length;

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex gap-2 text-xs text-muted-foreground">
        <span className={cn(phase === 'par' && 'font-bold text-foreground')}>
          Par ({parsSet}/18)
        </span>
        <span>•</span>
        <span className={cn(phase === 'index' && 'font-bold text-foreground')}>
          Índice ({indicesSet}/18)
        </span>
        {data.captureYards && (
          <>
            <span>•</span>
            <span className={cn(phase === 'yards' && 'font-bold text-foreground')}>
              Yardas
            </span>
          </>
        )}
      </div>

      {/* Hole tabs */}
      <div className="grid grid-cols-9 gap-1">
        {holes.map((h, i) => {
          const isComplete = phase === 'par' ? h.par !== null : phase === 'index' ? h.strokeIndex !== null : h.yards !== null;
          return (
            <button
              key={i}
              onClick={() => setCurrentHole(i)}
              className={cn(
                'text-xs font-medium h-7 rounded transition-colors',
                i === currentHole
                  ? 'bg-primary text-primary-foreground'
                  : isComplete
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* Current hole label */}
      <div className="text-center">
        <span className="text-lg font-bold">Hoyo {currentHole + 1}</span>
        {holes[currentHole].par && (
          <span className="ml-2 text-sm text-muted-foreground">Par {holes[currentHole].par}</span>
        )}
        {holes[currentHole].strokeIndex && (
          <span className="ml-2 text-sm text-muted-foreground">HCP {holes[currentHole].strokeIndex}</span>
        )}
      </div>

      {/* PAR phase */}
      {phase === 'par' && (
        <div className="space-y-2">
          <Label className="text-sm">Selecciona el par</Label>
          <div className="flex gap-3 justify-center">
            {[3, 4, 5].map(p => (
              <button
                key={p}
                onClick={() => selectPar(p)}
                className={cn(
                  'w-16 h-16 rounded-xl text-2xl font-bold transition-all',
                  holes[currentHole].par === p
                    ? 'bg-primary text-primary-foreground scale-105'
                    : 'bg-muted hover:bg-accent'
                )}
              >
                {p}
              </button>
            ))}
          </div>
          {allParsSet && (
            <Button variant="outline" className="w-full" onClick={() => { setPhase('index'); setCurrentHole(holes.findIndex(h => !h.strokeIndex) >= 0 ? holes.findIndex(h => !h.strokeIndex) : 0); }}>
              Pares completos → Continuar a Índice
            </Button>
          )}
        </div>
      )}

      {/* INDEX phase */}
      {phase === 'index' && (
        <div className="space-y-2">
          <Label className="text-sm">Selecciona el índice de hándicap</Label>
          <div className="grid grid-cols-6 gap-1.5">
            {Array.from({ length: 18 }, (_, i) => i + 1).map(idx => {
              const isUsed = usedIndices.has(idx) && holes[currentHole].strokeIndex !== idx;
              const isSelected = holes[currentHole].strokeIndex === idx;
              return (
                <button
                  key={idx}
                  disabled={isUsed}
                  onClick={() => selectIndex(idx)}
                  className={cn(
                    'h-9 rounded text-sm font-medium transition-all',
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : isUsed
                        ? 'bg-muted/50 text-muted-foreground/30 cursor-not-allowed'
                        : 'bg-muted hover:bg-accent'
                  )}
                >
                  {isUsed && !isSelected ? (
                    <Check className="h-3 w-3 mx-auto text-muted-foreground/30" />
                  ) : (
                    idx
                  )}
                </button>
              );
            })}
          </div>
          {!allParsSet && (
            <Button variant="ghost" size="sm" onClick={() => { setPhase('par'); setCurrentHole(holes.findIndex(h => !h.par) >= 0 ? holes.findIndex(h => !h.par) : 0); }}>
              ← Volver a Pares
            </Button>
          )}
        </div>
      )}

      {/* YARDS phase */}
      {phase === 'yards' && data.captureYards && (
        <div className="space-y-2">
          <Label className="text-sm">Yardas</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={holes[currentHole].yards ?? ''}
            onChange={e => {
              updateHole(currentHole, { yards: e.target.value ? Number(e.target.value) : null });
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && currentHole < 17) {
                setCurrentHole(currentHole + 1);
              }
            }}
            placeholder={`Yardas hoyo ${currentHole + 1}`}
            autoFocus
          />
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={currentHole === 0} onClick={() => setCurrentHole(currentHole - 1)}>
              ← Anterior
            </Button>
            <Button variant="ghost" size="sm" disabled={currentHole === 17} onClick={() => setCurrentHole(currentHole + 1)}>
              Siguiente →
            </Button>
          </div>
        </div>
      )}

      {/* Yards toggle */}
      {(phase === 'par' || phase === 'index') && (
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <Switch
            checked={data.captureYards}
            onCheckedChange={v => onChange({ ...data, captureYards: v })}
          />
          <Label className="text-sm text-muted-foreground">Capturar yardas por hoyo</Label>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1">
          ← Datos base
        </Button>
        <Button disabled={!canContinue} onClick={onNext} className="flex-1">
          Revisar campo
        </Button>
      </div>
    </div>
  );
};
