import React from 'react';
import { DollarSign, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AmountInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  allowNegative?: boolean;
}

export const AmountInput: React.FC<AmountInputProps> = ({ 
  label, 
  value, 
  onChange, 
  step = 25,
  min = 0,
  allowNegative = false 
}) => {
  const handleIncrement = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(value + step);
  };
  
  const handleDecrement = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newValue = value - step;
    onChange(allowNegative ? newValue : Math.max(min, newValue));
  };
  
  return (
    <div className={label ? "flex items-center justify-between" : "flex items-center justify-center"}>
      {label && <Label className="text-xs text-muted-foreground">{label}</Label>}
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-6 w-6 shrink-0 rounded-sm"
          onClick={handleDecrement}
          onMouseDown={(e) => e.stopPropagation()}
          disabled={!allowNegative && value <= min}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <div className="flex items-center">
          <DollarSign className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
          <Input
            type="number"
            value={value}
            onChange={(e) => onChange(parseInt(e.target.value) || 0)}
            onFocus={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="h-6 w-11 text-[11px] text-center px-0"
            min={allowNegative ? undefined : min}
            step={step}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-6 w-6 shrink-0 rounded-sm"
          onClick={handleIncrement}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};

// Variant without dollar sign for points
export const PointInput: React.FC<Omit<AmountInputProps, 'allowNegative'> & { allowNegative?: boolean }> = ({ 
  label, 
  value, 
  onChange, 
  step = 1,
  min,
  allowNegative = true
}) => {
  const handleIncrement = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(value + step);
  };
  
  const handleDecrement = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newValue = value - step;
    if (min !== undefined && !allowNegative) {
      onChange(Math.max(min, newValue));
    } else {
      onChange(newValue);
    }
  };
  
  return (
    <div className="flex items-center justify-between">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={handleDecrement}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
          onFocus={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="h-7 w-14 text-sm text-center px-1"
          step={step}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={handleIncrement}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};
