import React from 'react';
import { trs } from '@/i18n/tr';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { cn } from '@/lib/utils';
import { fmtMoney } from '@/lib/formatMoney';
import { summarizePrizeItems, type PrizeSummaryChip } from '@/lib/prizeResultStats';

export interface PrizeCardItem { kind?: 'pool' | 'award'; refId?: string; label: string; place?: number; tied?: boolean; amount: number }

/** Short chip text: "1º Stableford", "T2 Neto", "Oyes ×2" (amounts and places live in the detail). */
export const prizeSummaryChipLabel = (c: PrizeSummaryChip): string => {
  if (c.kind === 'pool') return `${c.tied ? `T${c.place}` : `${c.place}º`} ${c.label || trs('Bolsa')}`;
  return c.count > 1 ? `${c.label} ×${c.count}` : c.label;
};

/** One player's prize summary (avatar, name, amber total, compact concept chips). */
export const PrizePlayerCard: React.FC<{
  name: string;
  initials: string;
  color: string;
  total: number;
  items: PrizeCardItem[];
  isMe?: boolean;
}> = ({ name, initials, color, total, items, isMe = false }) => {
  const chips = summarizePrizeItems(items);
  return (
    <div className={cn('rounded-lg border bg-card p-2.5', isMe && 'border-primary border-2 bg-primary/5')}>
      <div className="flex items-center gap-2">
        <PlayerAvatar initials={initials} background={color} size="md" isLoggedInUser={isMe} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{name}</p>
          {isMe && <p className="text-[10px] font-semibold text-primary uppercase">{trs('Tu premio')}</p>}
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {chips.map(c => (
                <span
                  key={c.key}
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap',
                    c.kind === 'pool'
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                      : 'bg-muted text-foreground',
                  )}
                >
                  {prizeSummaryChipLabel(c)}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className="text-xl font-extrabold tabular-nums text-amber-600 dark:text-amber-400 shrink-0">
          {fmtMoney(total)}
        </span>
      </div>
    </div>
  );
};
