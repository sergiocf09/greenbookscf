import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatCloseAttemptReport, type CloseAttemptReport } from '@/lib/closeAttemptReport';
import { Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface CloseAttemptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: CloseAttemptReport | null;
  onRetry?: () => void;
}

export const CloseAttemptDialog: React.FC<CloseAttemptDialogProps> = ({
  open,
  onOpenChange,
  report,
  onRetry,
}) => {
  const [copying, setCopying] = useState(false);

  const text = useMemo(() => (report ? formatCloseAttemptReport(report) : ''), [report]);
  const failedStage = report?.failedStage ?? report?.stages.find((s) => !s.ok)?.stage;

  const copy = async () => {
    if (!text) return;
    try {
      setCopying(true);
      await navigator.clipboard.writeText(text);
      toast.success('Reporte copiado');
    } catch {
      toast.error('No se pudo copiar el reporte');
    } finally {
      setCopying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Diagnóstico de cierre</DialogTitle>
        </DialogHeader>

        {!report ? (
          <div className="text-sm text-muted-foreground">No hay reporte disponible.</div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm">
              <div>
                <span className="text-muted-foreground">Ronda:</span> {report.roundId}
              </div>
              <div>
                <span className="text-muted-foreground">Etapa fallida:</span> {failedStage ?? '—'}
              </div>
              {report.invalidProfileIds.length > 0 && (
                <div className="mt-2">
                  <div className="text-muted-foreground">profileId inválidos detectados:</div>
                  <ul className="list-disc pl-5">
                    {report.invalidProfileIds.map((x) => (
                      <li key={`${x.playerId}-${x.profileId}`}>[{x.name}] {x.profileId}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={copy} disabled={copying || !text}>
                <Copy className="h-4 w-4 mr-2" />
                Copiar reporte
              </Button>
              {onRetry && (
                <Button type="button" onClick={onRetry}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reintentar
                </Button>
              )}
            </div>

            <ScrollArea className="h-[360px] rounded-md border bg-muted/20 p-3">
              <pre className="text-xs whitespace-pre-wrap break-words">{text}</pre>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
