import React from 'react';
import { Trophy, ChevronRight } from 'lucide-react';
import { trs } from '@/i18n/tr';
import { cn } from '@/lib/utils';

export type PrizeEntryStatus = { exists: boolean; status?: string | null } | null | undefined;

export const prizeStatusLabel = (p: PrizeEntryStatus): string => {
  if (!p?.exists) return trs('Sin configurar');
  if (p.status === 'final') return trs('Final');
  if (p.status === 'live') return trs('En vivo');
  return trs('Borrador');
};

/** Compact header chip shown to the creator. */
export const PrizesChip: React.FC<{ prizes: PrizeEntryStatus; onClick: () => void }> = ({ prizes, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'text-[11px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 border transition-colors',
      prizes?.exists
        ? 'border-accent bg-accent/15 text-foreground'
        : 'border-dashed border-primary text-primary hover:bg-primary/10',
    )}
  >
    <Trophy className="h-3 w-3" />
    {prizes?.exists ? `${trs('Premios')} · ${prizeStatusLabel(prizes)}` : trs('Agregar premios')}
  </button>
);

/** Section inside the tournament settings dialog. */
export const PrizesConfigSection: React.FC<{ prizes: PrizeEntryStatus; onOpen: () => void }> = ({ prizes, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className="w-full flex items-center gap-3 rounded-md border p-3 text-left hover:bg-muted/50"
  >
    <Trophy className="h-5 w-5 text-primary shrink-0" />
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium">{trs('Premios')}</div>
      <div className="text-xs text-muted-foreground">
        {trs('Estado')}: {prizeStatusLabel(prizes)} · {trs('Puedes configurarlos antes de vincular rondas')}
      </div>
    </div>
    <span className="text-xs text-primary font-medium inline-flex items-center">
      {trs('Configurar premios')}<ChevronRight className="h-4 w-4" />
    </span>
  </button>
);
