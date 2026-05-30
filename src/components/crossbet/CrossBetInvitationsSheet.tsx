import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Swords, MapPin, Check, X, Loader2 } from 'lucide-react';
import { CrossBetInvitation } from '@/hooks/useCrossBets';
import { fmtMoney } from '@/lib/formatMoney';

interface CrossBetInvitationsSheetProps {
  open: boolean;
  onClose: () => void;
  invitations: CrossBetInvitation[];
  isAccepting: boolean;
  isDeclining: boolean;
  onAccept: (invitationId: string) => Promise<void>;
  onDecline: (invitationId: string) => Promise<void>;
}

const BET_LABELS: Record<string, string> = {
  medal: 'Medal', putts: 'Putts', matchPlay: 'Match Play',
  units: 'Unidades', manchas: 'Manchas', bloques: 'Bloques', presiones: 'Presiones',
};

function summarizeBetConfig(cfg: Record<string, any>): string {
  const active = Object.entries(cfg)
    .filter(([k, v]) => (v as any)?.enabled && BET_LABELS[k])
    .map(([k, v]) => {
      const amount = (v as any)?.amount ?? (v as any)?.totalAmount;
      return amount ? `${BET_LABELS[k]} $${fmtMoney(amount)}` : BET_LABELS[k];
    });
  return active.length > 0 ? active.join(' · ') : 'Sin apuestas definidas';
}

export const CrossBetInvitationsSheet: React.FC<CrossBetInvitationsSheetProps> = ({
  open, onClose, invitations, isAccepting, isDeclining, onAccept, onDecline,
}) => {
  const [actionId, setActionId] = useState<string | null>(null);

  const handle = async (fn: (id: string) => Promise<void>, id: string) => {
    setActionId(id);
    try { await fn(id); } finally { setActionId(null); }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto pb-safe">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Swords className="h-5 w-5 text-primary" />
            <SheetTitle className="text-base">Invitaciones de Cruce</SheetTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            Alguien quiere cruzar tarjeta contigo. Al aceptar quedas registrado en su ronda.
          </p>
        </SheetHeader>
        {invitations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Swords className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Sin invitaciones pendientes</p>
          </div>
        ) : (
          <div className="space-y-3">
            {invitations.map((inv) => {
              const busy = actionId === inv.invitationId;
              return (
                <div key={inv.invitationId} className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <PlayerAvatar initials={inv.initiatorInitials} background={inv.initiatorColor} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{inv.initiatorName}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{inv.courseName}</span>
                        {inv.holesPlayed > 0 && <span className="shrink-0">· Hoyo {inv.holesPlayed}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="bg-muted/30 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Apuestas propuestas</p>
                    <p className="text-xs font-medium">{summarizeBetConfig(inv.betConfigProposal)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline"
                      className="flex-1 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                      disabled={busy} onClick={() => handle(onDecline, inv.invitationId)}>
                      {busy && isDeclining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      Declinar
                    </Button>
                    <Button size="sm" className="flex-1 gap-1.5"
                      disabled={busy} onClick={() => handle(onAccept, inv.invitationId)}>
                      {busy && isAccepting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Aceptar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
