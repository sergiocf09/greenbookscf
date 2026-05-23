import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Plus, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { MultiDayRulesJson } from '@/types/leaderboard';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event: {
    id: string;
    name: string;
    description?: string | null;
    scoring_modes: string[];
    rules_json: Record<string, any>;
  };
  onSaved?: () => void;
}

const MODES = [
  { key: 'gross', label: 'Medal Gross' },
  { key: 'net', label: 'Medal Neto' },
  { key: 'stableford', label: 'Stableford' },
];

export const EditMultiDayConfigDialog: React.FC<Props> = ({ open, onOpenChange, event, onSaved }) => {
  const initialRules = (event.rules_json || {}) as MultiDayRulesJson;
  const [name, setName] = useState(event.name);
  const [description, setDescription] = useState(event.description || '');
  const [modes, setModes] = useState<string[]>(event.scoring_modes || ['gross', 'net']);
  const [days, setDays] = useState<Array<{ date: string; label: string }>>(
    (initialRules.days || []).map(d => ({ date: d.date, label: d.label || '' })),
  );
  const [aggregation, setAggregation] = useState<'sum' | 'best_n'>(initialRules.aggregation || 'sum');
  const [bestN, setBestN] = useState<number>(initialRules.best_n || 2);
  const [linkedDates, setLinkedDates] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const r = (event.rules_json || {}) as MultiDayRulesJson;
    setName(event.name);
    setDescription(event.description || '');
    setModes(event.scoring_modes || ['gross', 'net']);
    setDays((r.days || []).map(d => ({ date: d.date, label: d.label || '' })));
    setAggregation(r.aggregation || 'sum');
    setBestN(r.best_n || 2);

    // Fetch linked rounds' dates so we warn about deleting their day
    (async () => {
      const { data: linked } = await supabase
        .from('leaderboard_rounds')
        .select('round_id')
        .eq('leaderboard_id', event.id);
      const ids = (linked || []).map(l => l.round_id);
      if (ids.length === 0) { setLinkedDates(new Set()); return; }
      const { data: rounds } = await supabase.from('rounds').select('date').in('id', ids);
      setLinkedDates(new Set((rounds || []).map(r => r.date as string)));
    })();
  }, [open, event]);

  const toggleMode = (m: string) =>
    setModes(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);

  const addDay = () => setDays(prev => [...prev, { date: prev[prev.length - 1]?.date || '', label: '' }]);
  const removeDay = (idx: number) => {
    const d = days[idx];
    if (d?.date && linkedDates.has(d.date)) {
      toast.error('No puedes eliminar este día: hay rondas vinculadas con esa fecha.');
      return;
    }
    setDays(prev => prev.filter((_, i) => i !== idx));
  };
  const updateDay = (idx: number, field: 'date' | 'label', value: string) =>
    setDays(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d));

  const sortedDays = useMemo(
    () => [...days].filter(d => d.date).sort((a, b) => a.date.localeCompare(b.date)),
    [days],
  );

  const orphanLinked = useMemo(() => {
    const dayDates = new Set(sortedDays.map(d => d.date));
    return [...linkedDates].filter(d => !dayDates.has(d));
  }, [sortedDays, linkedDates]);

  const handleSave = async () => {
    if (!name.trim() || modes.length === 0 || sortedDays.length < 2) {
      toast.error('Verifica nombre, modalidades y al menos 2 días con fecha');
      return;
    }
    setSaving(true);
    try {
      const rules: MultiDayRulesJson = {
        days: sortedDays.map((d, i) => ({
          day_number: i + 1,
          date: d.date,
          label: d.label.trim() || undefined,
        })),
        aggregation,
        best_n: aggregation === 'best_n' ? Math.min(bestN, sortedDays.length) : undefined,
      };
      const { error } = await supabase
        .from('leaderboard_events')
        .update({
          name: name.trim(),
          description: description.trim() || null,
          scoring_modes: modes,
          start_date: sortedDays[0].date,
          end_date: sortedDays[sortedDays.length - 1].date,
          rules_json: rules as unknown as Record<string, any>,
        })
        .eq('id', event.id);
      if (error) throw error;
      toast.success('Configuración actualizada');
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar configuración (Multi-día)</DialogTitle>
          <DialogDescription>Ajusta días, modalidades y agregación.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nombre *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <Label>Descripción</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          <div className="space-y-2 border-l-2 border-primary/30 pl-3">
            <Label className="text-xs">Días del torneo *</Label>
            {days.map((day, idx) => {
              const isLinked = day.date && linkedDates.has(day.date);
              return (
                <div key={idx} className="flex items-center gap-1.5">
                  <span className="text-xs w-12 shrink-0">Día {idx + 1}</span>
                  <Input
                    type="date"
                    value={day.date}
                    onChange={e => updateDay(idx, 'date', e.target.value)}
                    className="h-8 text-xs flex-1"
                  />
                  <Input
                    placeholder="Etiqueta"
                    value={day.label}
                    onChange={e => updateDay(idx, 'label', e.target.value)}
                    className="h-8 text-xs flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => removeDay(idx)}
                    disabled={days.length <= 2 || isLinked}
                    title={isLinked ? 'Hay rondas vinculadas con esta fecha' : undefined}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
            <Button variant="outline" size="sm" className="text-xs h-7 w-full" onClick={addDay}>
              <Plus className="h-3 w-3 mr-1" /> Agregar día
            </Button>

            {orphanLinked.length > 0 && (
              <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded p-2 mt-1">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  Hay rondas vinculadas cuya fecha ya no coincide con ningún día configurado:{' '}
                  <strong>{orphanLinked.join(', ')}</strong>. No se contabilizarán hasta que sus fechas estén en los días del torneo.
                </span>
              </div>
            )}

            <div className="space-y-1 mt-2">
              <Label className="text-xs">Agregación</Label>
              <select
                value={aggregation}
                onChange={e => setAggregation(e.target.value as 'sum' | 'best_n')}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="sum">Suma total de todos los días</option>
                <option value="best_n">Mejores N días</option>
              </select>
              {aggregation === 'best_n' && (
                <div className="flex items-center gap-1.5 mt-1">
                  <Label className="text-xs">N =</Label>
                  <Input
                    type="number"
                    min={1}
                    max={sortedDays.length || 1}
                    value={bestN}
                    onChange={e => setBestN(parseInt(e.target.value) || 1)}
                    className="h-7 w-16 text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">de {sortedDays.length} días</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <Label>Modalidades *</Label>
            <div className="mt-1 flex flex-col gap-2">
              {MODES.map(m => (
                <label key={m.key} className="flex cursor-pointer items-center gap-2">
                  <Checkbox checked={modes.includes(m.key)} onCheckedChange={() => toggleMode(m.key)} />
                  <span className="text-sm">{m.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!name.trim() || modes.length === 0 || sortedDays.length < 2 || saving}
            onClick={handleSave}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditMultiDayConfigDialog;
