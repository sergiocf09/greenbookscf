import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Swords, MapPin, Loader2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AmountInput } from '@/components/setup/bets/AmountInput';

interface BetToggleRowProps {
  label: string;
  enabled: boolean;
  amount?: number;
  onToggle: (v: boolean) => void;
  onAmountChange?: (v: number) => void;
}

const BetToggleRow: React.FC<BetToggleRowProps> = ({ label, enabled, amount, onToggle, onAmountChange }) => (
  <div className="flex items-center gap-3 py-2.5 border-b border-border/30 last:border-0">
    <button type="button" onClick={() => onToggle(!enabled)}
      className={cn('w-10 h-5 rounded-full transition-colors shrink-0 relative', enabled ? 'bg-primary' : 'bg-muted')}>
      <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', enabled ? 'left-5' : 'left-0.5')} />
    </button>
    <span className="text-sm flex-1">{label}</span>
    {enabled && onAmountChange && amount !== undefined && (
      <div className="w-24"><AmountInput label="" value={amount} onChange={onAmountChange} /></div>
    )}
  </div>
);

export interface CrossBetConfig {
  medal?: { enabled: boolean; amount: number };
  putts?: { enabled: boolean; amount: number };
  matchPlay?: { enabled: boolean; amount: number };
  units?: { enabled: boolean; amount: number };
  manchas?: { enabled: boolean; amount: number };
  bloques?: { enabled: boolean; amount: number };
}

interface CrossBetSetupSheetProps {
  open: boolean;
  onClose: () => void;
  targetProfileId: string;
  targetName: string;
  targetInitials: string;
  targetColor: string;
  targetCourseName?: string;
  targetHolesPlayed?: number;
  slidingStrokes?: number;
  isSending: boolean;
  sendError: Error | null;
  onSend: (betConfig: CrossBetConfig) => Promise<void>;
}

export const CrossBetSetupSheet: React.FC<CrossBetSetupSheetProps> = ({
  open, onClose, targetName, targetInitials, targetColor,
  targetCourseName, targetHolesPlayed, slidingStrokes,
  isSending, sendError, onSend,
}) => {
  const [config, setConfig] = useState<CrossBetConfig>({
    medal:     { enabled: true,  amount: 100 },
    putts:     { enabled: false, amount: 50  },
    matchPlay: { enabled: false, amount: 100 },
    units:     { enabled: false, amount: 50  },
    manchas:   { enabled: false, amount: 50  },
    bloques:   { enabled: false, amount: 100 },
  });

  const update = (key: keyof CrossBetConfig, patch: Partial<{ enabled: boolean; amount: number }>) =>
    setConfig(prev => ({ ...prev, [key]: { ...prev[key]!, ...patch } }));

  const handleSend = async () => { await onSend(config); onClose(); };
  const hasAnyBet = Object.values(config).some(v => v?.enabled);

  const slidingLabel = slidingStrokes === undefined ? null
    : slidingStrokes === 0 ? 'Scratch'
    : slidingStrokes > 0 ? `Das ${slidingStrokes} strokes`
    : `Recibes ${Math.abs(slidingStrokes)} strokes`;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto pb-safe">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Swords className="h-5 w-5 text-primary" />
            <SheetTitle className="text-base">Cruzar tarjeta</SheetTitle>
          </div>
        </SheetHeader>

        <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border mb-4">
          <PlayerAvatar initials={targetInitials} background={targetColor} size="md" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{targetName}</p>
            {targetCourseName && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{targetCourseName}</span>
                {targetHolesPlayed && targetHolesPlayed > 0 && <span className="shrink-0">· Hoyo {targetHolesPlayed}</span>}
              </div>
            )}
            {slidingLabel && (
              <p className={cn('text-xs font-medium mt-0.5',
                slidingStrokes === 0 ? 'text-muted-foreground' : slidingStrokes! > 0 ? 'text-destructive' : 'text-green-700')}>
                Sliding: {slidingLabel}
              </p>
            )}
          </div>
        </div>

        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Apuestas del cruce</p>
        <BetToggleRow label="Medal"      enabled={!!config.medal?.enabled}     amount={config.medal?.amount}
          onToggle={v => update('medal', { enabled: v })}     onAmountChange={v => update('medal', { amount: v })} />
        <BetToggleRow label="Putts"      enabled={!!config.putts?.enabled}     amount={config.putts?.amount}
          onToggle={v => update('putts', { enabled: v })}     onAmountChange={v => update('putts', { amount: v })} />
        <BetToggleRow label="Match Play" enabled={!!config.matchPlay?.enabled} amount={config.matchPlay?.amount}
          onToggle={v => update('matchPlay', { enabled: v })} onAmountChange={v => update('matchPlay', { amount: v })} />
        <BetToggleRow label="Unidades"   enabled={!!config.units?.enabled}     amount={config.units?.amount}
          onToggle={v => update('units', { enabled: v })}     onAmountChange={v => update('units', { amount: v })} />
        <BetToggleRow label="Manchas"    enabled={!!config.manchas?.enabled}   amount={config.manchas?.amount}
          onToggle={v => update('manchas', { enabled: v })}   onAmountChange={v => update('manchas', { amount: v })} />
        <BetToggleRow label="Bloques"    enabled={!!config.bloques?.enabled}   amount={config.bloques?.amount}
          onToggle={v => update('bloques', { enabled: v })}   onAmountChange={v => update('bloques', { amount: v })} />

        <p className="text-[10px] text-muted-foreground mt-4 mb-4">
          El rival recibirá una invitación. Las apuestas aplican al sliding bilateral que ya tienen entre ustedes.
        </p>

        {sendError && (
          <p className="text-xs text-destructive mb-2 text-center">
            {(sendError as any)?.message?.includes('subscription_required')
              ? 'Ambos jugadores necesitan suscripción Pro para cruzar tarjeta.'
              : 'Error al enviar invitación. Intenta de nuevo.'}
          </p>
        )}

        <Button className="w-full gap-2" disabled={isSending || !hasAnyBet} onClick={handleSend}>
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          Enviar Invitación
        </Button>
      </SheetContent>
    </Sheet>
  );
};
