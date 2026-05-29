import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollText, Check, Calendar, MapPin, Loader2, User } from 'lucide-react';
import { AttestationRound } from '@/hooks/useAttestation';
import { toast } from 'sonner';

interface AttestationSheetProps {
  open: boolean;
  onClose: () => void;
  rounds: AttestationRound[];
  isAttesting: boolean;
  onAttest: (roundPlayerId: string) => Promise<void>;
}

export const AttestationSheet: React.FC<AttestationSheetProps> = ({
  open,
  onClose,
  rounds,
  isAttesting,
  onAttest,
}) => {
  const [attestingId, setAttestingId] = useState<string | null>(null);

  const handleAttest = async (roundPlayerId: string, name: string) => {
    setAttestingId(roundPlayerId);
    try {
      await onAttest(roundPlayerId);
      toast.success(`Score de ${name} atestado`);
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toast.error((err as any)?.message ?? 'No se pudo atestar');
    } finally {
      setAttestingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-primary" />
            Scores Attestation
          </SheetTitle>
          <SheetDescription>
            Confirma los scores de tus compañeros de ronda. No puedes atestar tu propio score.
          </SheetDescription>
        </SheetHeader>

        {rounds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <Check className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Sin scores pendientes de atestar</p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {rounds.map((round) => (
              <div
                key={round.roundId}
                className="rounded-xl border border-border bg-card p-3 space-y-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{round.courseName}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3 shrink-0" />
                    <span>{formatDate(round.roundDate)}</span>
                    <span className="mx-1">·</span>
                    <span>Org: {round.organizerName}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {round.pendingPlayers.map((pp) => (
                    <div
                      key={pp.roundPlayerId}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/40 px-2.5 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate">{pp.name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                          {pp.totalStrokes > 0 ? `${pp.totalStrokes} golpes` : 'Sin score'}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleAttest(pp.roundPlayerId, pp.name)}
                        disabled={isAttesting || attestingId === pp.roundPlayerId}
                        className="gap-1.5 shrink-0"
                      >
                        {attestingId === pp.roundPlayerId ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ...
                          </>
                        ) : (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Atestar
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
