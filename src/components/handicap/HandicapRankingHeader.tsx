import { cn } from '@/lib/utils';
import type { HandicapRankingSortKey } from '@/lib/handicapRankingUtils';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface Props {
  sortKey: HandicapRankingSortKey;
  sortDirection: 'asc' | 'desc';
  onSortChange: (sortKey: HandicapRankingSortKey) => void;
  title?: string;
}

const options: Array<{ key: HandicapRankingSortKey; label: string }> = [
  { key: 'handicap', label: 'HCP' },
  { key: 'average', label: 'Prom' },
  { key: 'best', label: 'Mejor' },
];

export const HandicapRankingHeader = ({ sortKey, sortDirection, onSortChange, title = 'Jugador' }: Props) => (
  <div className="flex items-center justify-between">
    <span className="text-xs font-medium text-muted-foreground">{title}</span>
    <div className="flex items-center gap-0.5">
      {options.map((option) => {
        const isActive = sortKey === option.key;
        return (
          <button
            key={option.key}
            type="button"
            className={cn(
              'flex flex-col items-center px-2 py-0.5 rounded transition-colors min-w-[36px]',
              isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => onSortChange(option.key)}
          >
            <span className="text-[10px] font-semibold leading-tight">{option.label}</span>
            <div className="flex gap-0">
              <ChevronUp className={cn('h-2.5 w-2.5', isActive && sortDirection === 'asc' ? 'text-foreground' : 'text-muted-foreground/40')} />
              <ChevronDown className={cn('h-2.5 w-2.5', isActive && sortDirection === 'desc' ? 'text-foreground' : 'text-muted-foreground/40')} />
            </div>
          </button>
        );
      })}
    </div>
  </div>
);
