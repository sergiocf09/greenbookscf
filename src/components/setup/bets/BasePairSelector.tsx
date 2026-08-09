import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Users, Wand2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

interface BasePairSelectorProps {
  /** Player options already filtered by the participation matrix (must be 5) */
  playerOptions: Array<{ value: string; label: string }>;
  basePair?: [string, string];
  onChangeBasePair: (pair: [string, string]) => void;
  /** Number of matches already configured for this bet */
  existingCount: number;
  /** Generate the 3 matches. mode 'replace' clears existing ones first */
  onGenerate: (base: [string, string], others: string[], mode: 'replace' | 'add') => void;
}

export const BasePairSelector: React.FC<BasePairSelectorProps> = ({
  playerOptions,
  basePair,
  onChangeBasePair,
  existingCount,
  onGenerate,
}) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const p1 = basePair?.[0] ?? '';
  const p2 = basePair?.[1] ?? '';

  const others = useMemo(
    () => playerOptions.map((o) => o.value).filter((id) => id !== p1 && id !== p2),
    [playerOptions, p1, p2]
  );

  const isValid = !!p1 && !!p2 && p1 !== p2 && others.length === 3;

  const run = (mode: 'replace' | 'add') => {
    if (!isValid) return;
    onGenerate([p1, p2], others, mode);
  };

  const handleClick = () => {
    if (existingCount > 0) setConfirmOpen(true);
    else run('add');
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2.5 mb-3">
      <div className="flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-primary shrink-0" />
        <p className="text-xs font-medium text-foreground">Pareja base (5 jugadores)</p>
      </div>
      <p className="text-[10px] text-muted-foreground leading-tight">
        Elige los 2 jugadores que se mantienen juntos y genera los 3 matches contra
        todas las combinaciones de los otros 3. Después puedes editar o eliminar cada match.
      </p>

      <div className="grid grid-cols-2 gap-2">
        {[0, 1].map((slot) => (
          <div key={slot} className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Jugador base {slot + 1}
            </Label>
            <Select
              value={(slot === 0 ? p1 : p2) || undefined}
              onValueChange={(v) =>
                onChangeBasePair(
                  slot === 0 ? [v, p2 === v ? '' : p2] : [p1 === v ? '' : p1, v]
                )
              }
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {playerOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <Button
        size="sm"
        variant="secondary"
        className="w-full gap-1.5"
        disabled={!isValid}
        onClick={handleClick}
      >
        <Wand2 className="h-3.5 w-3.5" />
        Generar 3 matches
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ya hay matches configurados</AlertDialogTitle>
            <AlertDialogDescription>
              Puedes reemplazar los {existingCount} matches existentes por los 3 de la
              pareja base, o agregar únicamente los que falten sin borrar nada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="mt-0">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => run('add')}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
            >
              Agregar faltantes
            </AlertDialogAction>
            <AlertDialogAction onClick={() => run('replace')}>
              Reemplazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
