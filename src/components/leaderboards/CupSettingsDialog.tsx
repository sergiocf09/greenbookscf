import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Trash2, Save } from 'lucide-react';
import type { CupFormat } from '@/hooks/useTeamsCup';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event: {
    id: string;
    name: string;
    description: string | null;
    cup_format?: string | null;
  };
  onSaved: () => void | Promise<void>;
  onDeleteRequest: () => void;
}

export const CupSettingsDialog: React.FC<Props> = ({
  open, onOpenChange, event, onSaved, onDeleteRequest,
}) => {
  const [name, setName] = useState(event.name);
  const [description, setDescription] = useState(event.description || '');
  const [format, setFormat] = useState<CupFormat>(
    (event.cup_format as CupFormat) || 'match_individual'
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(event.name);
      setDescription(event.description || '');
      setFormat((event.cup_format as CupFormat) || 'match_individual');
    }
  }, [open, event]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('leaderboard_events')
        .update({
          name: name.trim(),
          description: description.trim() || null,
          cup_format: format,
        } as any)
        .eq('id', event.id);
      if (error) throw error;
      toast.success('Cambios guardados');
      onOpenChange(false);
      await onSaved();
    } catch (err: any) {
      toast.error('Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Configurar competencia</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Nombre *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la competencia"
            />
          </div>

          <div>
            <Label>Descripción</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional"
              rows={2}
            />
          </div>

          <div>
            <Label>Formato de juego</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as CupFormat)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="match_individual">Match Play Individual</SelectItem>
                <SelectItem value="fourball">Fourball (Best Ball)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Aplica como valor por defecto para nuevos matches.
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-2 border-t">
            <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Guardar cambios
            </Button>
            <Button
              variant="outline"
              onClick={onDeleteRequest}
              className="w-full gap-2 text-destructive border-destructive/40 hover:bg-destructive/10"
              disabled={saving}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar competencia
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
