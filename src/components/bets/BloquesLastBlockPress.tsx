import { useId } from 'react';
import { Zap } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { trs } from '@/i18n/tr';
import { fmtMoney } from '@/lib/formatMoney';
import type { BloqueResult } from '@/lib/bets/bloques';

interface Props {
  block: BloqueResult;
  onChange: (pressed: boolean) => void;
  amountsHidden?: boolean;
}

export function BloquesLastBlockPress({ block, onChange, amountsHidden = false }: Props) {
  const id = useId();
  const pressed = block.multiplier > 1;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-2 py-2">
      <div className="min-w-0 space-y-1">
        <Label htmlFor={id} className="flex items-center gap-1.5 text-xs leading-snug">
          <Zap className="h-3.5 w-3.5 shrink-0 text-primary" />
          {trs('Presión último bloque ×2')}
        </Label>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          B{block.blockNumber} · h{block.startHole}–{block.endHole} · ×{block.multiplier} · {amountsHidden ? '••••' : `$${fmtMoney(block.amountAtStake)}`}
        </div>
      </div>
      <Switch id={id} checked={pressed} onCheckedChange={onChange} className="shrink-0" />
    </div>
  );
}