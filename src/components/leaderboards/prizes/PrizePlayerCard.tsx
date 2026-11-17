import React from 'react';
import { trs } from '@/i18n/tr';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { cn } from '@/lib/utils';
import { fmtMoney } from '@/lib/formatMoney';

export interface PrizeCardItem { refId?: string; label: string; place?: number; tied?: boolean; amount: number }

export const prizeItemLabel = (it: PrizeCardItem): string => {
  const place = it.place != null ? ` ${it.place}º` : '';
  const tie = it.tied ? ` ${trs('(empate)')}` : '';
  return `${it.label}${place}${tie} · ${fmtMoney(it.amount)}`;
};

/** One player's prize summary (avatar, name, amber total, concept chips). */
export const PrizePlayerCard: React.FC<{
  name: string;
  initials: string;
  color: string;
  total: number;
  items: PrizeCardItem[];
  isMe?: boolean;
}> = ({ name, initials, color, total, items, isMe = false }) => (
  <div className={cn('rounded-lg border bg-card p-2.5', isMe && 'border-primary border-2 bg-primary/5')}>
    <div className="flex items-center gap-2">
      <PlayerAvatar initials={initials} background={color} size="md" isLoggedInUser={isMe} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm truncate">{name}</p>
        {isMe && <p className="text-[10px] font-semibold text-primary uppercase">{trs('Tu premio')}</p>}
      </div>
      <span className="text-xl font-extrabold tabular-nums text-amber-600 dark:text-amber-400">
        {fmtMoney(total)}
      </span>
    </div>
    <div className="flex flex-wrap gap-1 mt-1.5">
      {items.map((it, i) => (
        <span key={`${it.refId ?? it.label}-${i}`} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground">
          {prizeItemLabel(it)}
        </span>
      ))}
    </div>
  </div>
);
