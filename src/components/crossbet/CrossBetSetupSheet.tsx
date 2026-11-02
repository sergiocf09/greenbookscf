import { trs } from '@/i18n/tr';
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

export type CrossBetConfig = Record<string, { enabled: boolean; amount: number }>;

const CROSS_BETS: { key: string; label: string; amount: number }[] = [
  { key: 'medal', label: 'Medal', amount: 100 },
  { key: 'pressures', label: 'Presiones', amount: 50 },
  { key: 'matchPlay', label: 'Match Play', amount: 100 },
  { key: 'putts', label: 'Putts', amount: 50 },
  { key: 'skins', label: 'Skins', amount: 50 },
  { key: 'caros', label: 'Caros', amount: 50 },
  { key: 'oyeses', label: 'Oyeses', amount: 50 },
  { key: 'rayas', label: 'Rayas', amount: 50 },
  { key: 'units', label: 'Unidades', amount: 50 },
  { key: 'manchas', label: 'Manchas', amount: 50 },
  { key: 'culebras', label: 'Culebras', amount: 50 },
  { key: 'bloques', label: 'Bloques', amount: 100 },
];

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
  const [config, setConfig] = useState<CrossBetConfig>(() =>
    Object.fromEntries(CROSS_BETS.map(b => [b.key, { enabled: b.key === 'medal', amount: b.amount }])));

  const update = (key: string, patch: Partial<{ enabled: boolean; amount: number }>) =>
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
            <SheetTitle className="text-base">{trs("Cruzar tarjeta")}</SheetTitle>
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
                {targetHolesPlayed && targetHolesPlayed > 0 && <span className="shrink-0">{trs("· Hoyo")}{' '}{targetHolesPlayed}</span>}
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

        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{trs("Apuestas del cruce")}</p>
        {CROSS_BETS.map(b => (
          <BetToggleRow key={b.key} label={trs(b.label)} enabled={!!config[b.key]?.enabled} amount={config[b.key]?.amount}
            onToggle={v => update(b.key, { enabled: v })} onAmountChange={v => update(b.key, { amount: v })} />
        ))}

        <p className="text-[10px] text-muted-foreground mt-4 mb-4">
          {trs("El rival recibirá una invitación. Estas apuestas son solo entre ustedes dos y no dependen de lo configurado en cada ronda.")}
        </p>

        {sendError && (
          <p className="text-xs text-destructive mb-2 text-center">
            {(sendError as any)?.message?.includes('subscription_required')
              ? trs("Ambos jugadores necesitan suscripción Pro para cruzar tarjeta.")
              : trs("Error al enviar invitación. Intenta de nuevo.")}
          </p>
        )}

        <Button className="w-full gap-2" disabled={isSending || !hasAnyBet} onClick={handleSend}>
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          {trs("Enviar Invitación")}
        </Button>
      </SheetContent>
    </Sheet>
  );
};
