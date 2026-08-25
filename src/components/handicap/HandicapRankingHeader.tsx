import { cn } from '@/lib/utils';
import type { HandicapRankingSortKey } from '@/lib/handicapRankingUtils';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface Props {
  sortKey: HandicapRankingSortKey;
  sortDirection: 'asc' | 'desc';
  onSortChange: (sortKey: HandicapRankingSortKey) => void;
  title?: string;
}

const options: Array<{ key: HandicapRankingSortKey; label: string; width: string }> = [
  { key: 'handicap', label: 'HCP', width: 'w-[44px]' },
  { key: 'average', label: 'Prom', width: 'w-[40px]' },
  { key: 'best', label: 'Mejor', width: 'w-[40px]' },
];

export const HandicapRankingHeader = ({ sortKey, sortDirection, onSortChange, title = 'Jugador' }: Props) => (
  <div className="flex items-center justify-between">
    <span className="text-xs font-medium text-muted-foreground">{title}</span>
    <div className="flex items-center shrink-0">
      <span className="w-[40px] text-center text-[9px] font-medium text-muted-foreground leading-tight">Δ30d</span>
      {options.map((option) => {
        const isActive = sortKey === option.key;
        return (
          <button
            key={option.key}
            type="button"
            className={cn(
              'flex flex-col items-center justify-center py-0.5 transition-colors',
              option.width,
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => onSortChange(option.key)}
          >
            <span className={cn('text-[10px] font-semibold leading-tight', isActive && 'text-foreground')}>{option.label}</span>
            <div className="flex">
              <ChevronUp className={cn('h-2 w-2', isActive && sortDirection === 'asc' ? 'text-foreground' : 'text-muted-foreground/30')} />
              <ChevronDown className={cn('h-2 w-2', isActive && sortDirection === 'desc' ? 'text-foreground' : 'text-muted-foreground/30')} />
            </div>
          </button>
        );
      })}
    </div>
  </div>
);
