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

export const ScoreStepper: React.FC<ScoreStepperProps> = ({
  label,
  value,
  min,
  onChange,
  className,
  rightSlot,
}) => {
  const displayValue = value === 0 ? (min === 0 ? 0 : '-') : value;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-xs text-muted-foreground w-10">{label}</span>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-6 w-6 rounded-full"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
        >
          <Minus className="h-3 w-3" />
        </Button>

        <div className="w-8 text-center flex items-center justify-center gap-1">
          <span className="text-lg font-bold">{displayValue}</span>
          {rightSlot}
        </div>

        <Button
          variant="outline"
          size="icon"
          className="h-6 w-6 rounded-full"
          onClick={() => onChange(value + 1)}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};
