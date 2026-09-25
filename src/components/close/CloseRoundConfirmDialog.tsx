import { trs } from '@/i18n/tr';
import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { AlertTriangle } from 'lucide-react';

interface CloseRoundConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

export const CloseRoundConfirmDialog: React.FC<CloseRoundConfirmDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
}) => {
  const [confirmText, setConfirmText] = useState('');
  const isConfirmValid = confirmText.toUpperCase() === 'CERRAR';

  const handleConfirm = () => {
    if (isConfirmValid) {
      setConfirmText('');
      onConfirm();
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setConfirmText('');
    }
    onOpenChange(newOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-full bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <AlertDialogTitle>{trs("¿Confirmar cierre de ronda?")}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-3">
            <p>
              {trs("Esta acción es")}{' '}<strong>{trs("irreversible")}</strong>{trs(". Una vez cerrada la ronda:")}
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>{trs("Los scores quedarán guardados permanentemente")}</li>
              <li>{trs("Los resultados de apuestas se calcularán y persistirán")}</li>
              <li>{trs("No se podrán modificar scores ni configuración")}</li>
              <li>{trs("El historial reflejará exactamente este estado")}</li>
            </ul>
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm font-medium mb-2">
                {trs("Para confirmar, escribe")}{' '}<span className="font-mono bg-muted px-1 rounded">{trs("CERRAR")}</span>:
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={trs("Escribe CERRAR")}
                className="font-mono"
                autoComplete="off"
                disabled={isLoading}
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>{trs("Cancelar")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!isConfirmValid || isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? trs("Cerrando...") : trs("Confirmar cierre definitivo")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
