import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { devError } from '@/lib/devLog';

interface DeleteRoundButtonProps {
  roundId: string | null;
  /** Called after a successful delete so the app can reset its local round state. */
  onDeleted: () => void;
  disabled?: boolean;
}

export function DeleteRoundButton({ roundId, onDeleted, disabled }: DeleteRoundButtonProps) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const canDelete = confirmText.trim().toUpperCase() === 'ELIMINAR';

  const handleDelete = async () => {
    if (!roundId || !canDelete) return;
    setDeleting(true);
    try {
      const { error } = await supabase.rpc('delete_round_with_financials', { p_round_id: roundId });
      if (error) throw error;
      toast.success('Ronda eliminada por completo');
      setOpen(false);
      setConfirmText('');
      onDeleted();
    } catch (err) {
      devError('Error deleting round from results screen:', err);
      toast.error('No se pudo eliminar la ronda. Solo el organizador puede eliminarla.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => { setConfirmText(''); setOpen(true); }}
        disabled={disabled || !roundId}
        className="w-full border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-4 w-4 mr-2" />
        Eliminar Ronda
      </Button>

      <AlertDialog open={open} onOpenChange={(o) => { if (!deleting) { setOpen(o); if (!o) setConfirmText(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta ronda?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Se borra <strong>todo</strong> lo que se configuró y capturó: jugadores,
                  hándicaps, scores, apuestas y balances.
                </p>
                <p>
                  <strong>No se guarda nada</strong> en el historial, ni en estadísticas,
                  ni en balances entre jugadores. Es irreversible.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="delete-round-confirm" className="text-xs">
              Escribe <strong>ELIMINAR</strong> para confirmar
            </Label>
            <Input
              id="delete-round-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="ELIMINAR"
              autoComplete="off"
              autoCapitalize="characters"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!canDelete || deleting}
            >
              {deleting ? 'Eliminando...' : 'Eliminar definitivamente'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
