import React, { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { fmtMoney } from '@/lib/formatMoney';
import { cn } from '@/lib/utils';
import { Loader2, Trash2, Plus, History, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { PreAppBalance, PreAppBalanceSummary } from '@/hooks/usePreAppBalances';

interface PreAppBalanceSheetProps {
  open: boolean;
  onClose: () => void;
  rivalName: string;
  rivalProfileId: string | null;
  summary: PreAppBalanceSummary | undefined;
  onAdd: (params: {
    rival_profile_id: string | null;
    rival_name: string;
    year: number | null;
    amount: number;
    note?: string;
  }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onUpdate?: (id: string, params: {
    year: number | null;
    amount: number;
    note?: string | null;
  }) => Promise<void>;
}

const CURRENT_YEAR = new Date().getFullYear();

export const PreAppBalanceSheet: React.FC<PreAppBalanceSheetProps> = ({
  open,
  onClose,
  rivalName,
  rivalProfileId,
  summary,
  onAdd,
  onDelete,
  onUpdate,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amountStr, setAmountStr] = useState('');
  const [yearStr, setYearStr] = useState('');
  const [note, setNote] = useState('');
  const [sign, setSign] = useState<'pos' | 'neg'>('pos');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const total = summary?.totalAmount ?? 0;
  const entries = summary?.entries ?? [];

  const resetForm = () => {
    setAmountStr('');
    setYearStr('');
    setNote('');
    setSign('pos');
    setShowForm(false);
    setEditingId(null);
  };

  const startEdit = (entry: PreAppBalance) => {
    setEditingId(entry.id);
    setShowForm(true);
    setSign(entry.amount >= 0 ? 'pos' : 'neg');
    setAmountStr(String(Math.abs(entry.amount)));
    setYearStr(entry.year ? String(entry.year) : '');
    setNote(entry.note ?? '');
  };

  const handleSubmit = async () => {
    const rawAmount = parseFloat(amountStr.replace(/,/g, ''));
    if (isNaN(rawAmount) || rawAmount <= 0) {
      toast.error('Ingresa un monto válido mayor a cero');
      return;
    }
    const amount = sign === 'pos' ? rawAmount : -rawAmount;
    const yearNum = yearStr.trim() ? parseInt(yearStr.trim(), 10) : null;
    if (yearNum !== null && (isNaN(yearNum) || yearNum < 1950 || yearNum > CURRENT_YEAR)) {
      toast.error(`Año inválido (1950–${CURRENT_YEAR})`);
      return;
    }
    setSaving(true);
    try {
      if (editingId && onUpdate) {
        await onUpdate(editingId, {
          year: yearNum,
          amount,
          note: note.trim() || null,
        });
        toast.success('Registro actualizado');
      } else {
        await onAdd({
          rival_profile_id: rivalProfileId,
          rival_name: rivalName,
          year: yearNum,
          amount,
          note: note.trim() || undefined,
        });
        toast.success('Registro guardado');
      }
      resetForm();
    } catch {
      toast.error('Error guardando registro');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDelete(id);
      toast.success('Registro eliminado');
      if (editingId === id) resetForm();
    } catch {
      toast.error('Error eliminando registro');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { resetForm(); onClose(); } }}>
      <SheetContent side="bottom" className="h-[85vh] flex flex-col gap-3">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" />
            Balance Pre-GB vs {rivalName}
          </SheetTitle>
          <SheetDescription className="text-xs">
            Solo visible para ti. No afecta rankings ni balances compartidos.
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center justify-between p-3 bg-muted/40 border border-border rounded-lg">
          <span className="text-xs text-muted-foreground">Total pre-GB:</span>
          <span className={cn(
            'text-lg font-bold tabular-nums',
            total > 0 ? 'text-green-600 dark:text-green-500' :
            total < 0 ? 'text-destructive' : 'text-muted-foreground'
          )}>
            {total > 0 ? '+' : total < 0 ? '-' : ''}${fmtMoney(Math.abs(total))}
          </span>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-2 pr-2">
            {entries.length === 0 && !showForm && (
              <p className="text-xs text-muted-foreground text-center py-6 px-3">
                Sin registros pre-GB. Agrega el balance histórico que tenías con este rival antes de usar la app.
              </p>
            )}

            {entries
              .slice()
              .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
              .map((entry: PreAppBalance) => (
                <div
                  key={entry.id}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 bg-card border rounded-lg',
                    editingId === entry.id ? 'border-primary' : 'border-border'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">
                        {entry.year ? String(entry.year) : 'Sin año'}
                      </span>
                      {entry.note && (
                        <span className="text-[11px] text-muted-foreground truncate">{entry.note}</span>
                      )}
                    </div>
                  </div>
                  <span className={cn(
                    'text-sm font-bold tabular-nums shrink-0',
                    entry.amount > 0 ? 'text-green-600 dark:text-green-500' : 'text-destructive'
                  )}>
                    {entry.amount > 0 ? '+' : '-'}${fmtMoney(Math.abs(entry.amount))}
                  </span>
                  {onUpdate && (
                    <button
                      onClick={() => startEdit(entry)}
                      disabled={deletingId === entry.id || saving}
                      className="text-muted-foreground hover:text-primary transition-colors p-1 shrink-0"
                      title="Editar registro"
                      aria-label="Editar registro"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(entry.id)}
                    disabled={deletingId === entry.id}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1 shrink-0"
                    title="Eliminar registro"
                    aria-label="Eliminar registro"
                  >
                    {deletingId === entry.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              ))}

            {showForm && (
              <div className="p-3 bg-card border border-border rounded-lg space-y-3">
                <div className="text-xs font-medium text-muted-foreground">
                  {editingId ? 'Editando registro' : 'Nuevo registro'}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSign('pos')}
                    className={cn(
                      'flex-1 py-2 rounded-md text-sm font-semibold border transition-colors',
                      sign === 'pos'
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-muted text-muted-foreground border-border'
                    )}
                  >
                    Gané 📈
                  </button>
                  <button
                    type="button"
                    onClick={() => setSign('neg')}
                    className={cn(
                      'flex-1 py-2 rounded-md text-sm font-semibold border transition-colors',
                      sign === 'neg'
                        ? 'bg-destructive text-white border-destructive'
                        : 'bg-muted text-muted-foreground border-border'
                    )}
                  >
                    Perdí 📉
                  </button>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Monto (MXN)</Label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      value={amountStr}
                      onChange={(e) => setAmountStr(e.target.value)}
                      className="pl-6"
                      inputMode="decimal"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Año (opcional)</Label>
                  <Input
                    value={yearStr}
                    onChange={(e) => setYearStr(e.target.value)}
                    inputMode="numeric"
                    placeholder={`1950–${CURRENT_YEAR}`}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Nota (opcional)</Label>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={100}
                    placeholder="Ej. cierre de año"
                  />
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={resetForm} disabled={saving}>
                    Cancelar
                  </Button>
                  <Button className="flex-1" onClick={handleSubmit} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    {editingId ? 'Actualizar' : 'Guardar'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <Separator />

        {!showForm && (
          <Button className="w-full" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Agregar registro pre-GB
          </Button>
        )}
      </SheetContent>
    </Sheet>
  );
};
