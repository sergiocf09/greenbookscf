import { Button } from '@/components/ui/button';
import { ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HandicapRankingSortKey } from '@/lib/handicapRankingUtils';

interface Props {
  sortKey: HandicapRankingSortKey;
  onSortChange: (sortKey: HandicapRankingSortKey) => void;
  title?: string;
}

const options: Array<{ key: HandicapRankingSortKey; label: string }> = [
  { key: 'handicap', label: 'HCP' },
  { key: 'average', label: 'Prom' },
  { key: 'best', label: 'Mejor' },
];

export const HandicapRankingHeader = ({ sortKey, onSortChange, title = 'Jugador' }: Props) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-sm">{title}</span>
    <div className="flex items-center gap-1">
      {options.map((option) => (
        <Button
          key={option.key}
          type="button"
          variant={sortKey === option.key ? 'secondary' : 'ghost'}
          size="sm"
          className={cn('h-7 px-2 text-[11px] font-medium', sortKey !== option.key && 'text-muted-foreground')}
          onClick={() => onSortChange(option.key)}
        >
          {option.label}
          <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      ))}
    </div>
  </div>
);