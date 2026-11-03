import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ScoreStepperProps {
  label: string;
  value: number;
  min: number;
  onChange: (next: number) => void;
  className?: string;
  rightSlot?: React.ReactNode;
}

/**
 * Optimistic stepper: the number updates on the same frame as the tap, while the
 * (heavier) parent update — bet recalculation, persistence — runs as a
 * low-priority transition so it never blocks visual feedback.
 */
export const ScoreStepper: React.FC<ScoreStepperProps> = ({
  label,
  value,
  min,
  onChange,
  className,
  rightSlot,
}) => {
  const [local, setLocal] = React.useState(value);
  const localRef = React.useRef(value);

  React.useEffect(() => {
    localRef.current = value;
    setLocal(value);
  }, [value]);

  const commit = (next: number) => {
    if (next === localRef.current) return;
    localRef.current = next;
    setLocal(next);
    React.startTransition(() => onChange(next));
  };

  const displayValue = local === 0 ? (min === 0 ? 0 : '-') : local;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-xs text-muted-foreground w-10">{label}</span>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-full touch-manipulation select-none active:scale-90 active:bg-muted transition-transform"
          onClick={() => commit(Math.max(min, localRef.current - 1))}
          disabled={local <= min}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>

        <div className="w-8 text-center flex items-center justify-center gap-1">
          <span className="text-lg font-bold">{displayValue}</span>
          {rightSlot}
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-full touch-manipulation select-none active:scale-90 active:bg-muted transition-transform"
          onClick={() => commit(localRef.current + 1)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};
