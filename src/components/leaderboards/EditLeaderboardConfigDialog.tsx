import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event: {
    id: string;
    name: string;
    description?: string | null;
    start_date: string;
    scoring_modes: string[];
  };
  onSaved?: () => void;
}

const MODES = [
  { key: 'gross', label: 'Medal Gross' },
  { key: 'net', label: 'Medal Neto' },
  { key: 'stableford', label: 'Stableford' },
];

export const EditLeaderboardConfigDialog: React.FC<Props> = ({ open, onOpenChange, event, onSaved }) => {
  const [name, setName] = useState(event.name);
  const [description, setDescription] = useState(event.description || '');
  const [startDate, setStartDate] = useState(event.start_date);
  const [modes, setModes] = useState<string[]>(event.scoring_modes || ['gross', 'net']);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(event.name);
      setDescription(event.description || '');
      setStartDate(event.start_date);
      setModes(event.scoring_modes || ['gross', 'net']);
    }
  }, [open, event]);

  const toggleMode = (m: string) =>
    setModes(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);

  const handleSave = async () => {
    if (!name.trim() || modes.length === 0) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('leaderboard_events')
        .update({
          name: name.trim(),
          description: description.trim() || null,
          start_date: startDate,
          scoring_modes: modes,
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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar configuración</DialogTitle>
          <DialogDescription>Modifica los datos del leaderboard.</DialogDescription>
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
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
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
          <Button disabled={!name.trim() || modes.length === 0 || saving} onClick={handleSave}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditLeaderboardConfigDialog;
