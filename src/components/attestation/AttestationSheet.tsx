import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollText, Check, Users, Calendar, MapPin, Loader2 } from 'lucide-react';
import { AttestationRound } from '@/hooks/useAttestation';
import { toast } from 'sonner';

interface AttestationSheetProps {
  open: boolean;
  onClose: () => void;
  rounds: AttestationRound[];
  isAttesting: boolean;
  onAttest: (roundId: string) => Promise<void>;
}

export const AttestationSheet: React.FC<AttestationSheetProps> = ({
  open,
  onClose,
  rounds,
  isAttesting,
  onAttest,
}) => {
  const [attestingId, setAttestingId] = useState<string | null>(null);

  const handleAttest = async (roundId: string) => {
    setAttestingId(roundId);
    try {
      await onAttest(roundId);
      toast.success('Scores atestados correctamente');
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toast.error((err as any)?.message ?? 'No se pudo atestar la ronda');
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
            Confirma que los scores de estas rondas son correctos. Solo se necesita un jugador. No incluye apuestas.
          </SheetDescription>
        </SheetHeader>

        {rounds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <Check className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Sin rondas pendientes de atestar</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {rounds.map((round) => (
              <div
                key={round.roundId}
                className="rounded-xl border border-border bg-card p-3 space-y-2.5"
              >
                {/* Header */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{round.courseName}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3 shrink-0" />
                    <span>{formatDate(round.roundDate)}</span>
                  </div>
                </div>

                {/* Organizer + other players */}
                <div className="space-y-1 text-xs">
                  <p className="text-muted-foreground">
                    Organizador: <span className="text-foreground font-medium">{round.organizerName}</span>
                  </p>
                  {round.playerNames.length > 0 && (
                    <div className="flex items-start gap-1.5 text-muted-foreground">
                      <Users className="h-3 w-3 shrink-0 mt-0.5" />
                      <p className="leading-tight">
                        {round.playerNames.slice(0, 3).join(' · ')}
                        {round.playerNames.length > 3 && ` +${round.playerNames.length - 3}`}
                      </p>
                    </div>
                  )}
                </div>

                {/* My result + CTA */}
                <div className="flex items-end justify-between pt-2 border-t border-border/50">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Tu resultado</p>
                    <p className="text-lg font-bold tabular-nums text-foreground">
                      {round.myTotalStrokes > 0 ? `${round.myTotalStrokes} golpes` : '—'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAttest(round.roundId)}
                    disabled={isAttesting || attestingId === round.roundId}
                    className="gap-1.5"
                  >
                    {attestingId === round.roundId ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Atestando...
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Atestar
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
