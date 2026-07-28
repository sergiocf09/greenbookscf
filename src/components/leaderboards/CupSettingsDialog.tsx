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
import type { CupFormat, CupTeam, CupMatch } from '@/hooks/useTeamsCup';
import { CupDaysEditor } from '@/components/leaderboards/CupDaysEditor';
import { getCupDays, cupSlotKey, type CupDay } from '@/types/leaderboard';

const TEAM_COLORS = [
  { hex: '#ef4444', label: 'Rojo' },
  { hex: '#3B82F6', label: 'Azul' },
  { hex: '#22c55e', label: 'Verde' },
  { hex: '#f97316', label: 'Naranja' },
  { hex: '#8b5cf6', label: 'Morado' },
  { hex: '#0B6B3A', label: 'Verde Augusta' },
  { hex: '#C9A227', label: 'Dorado Augusta' },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event: {
    id: string;
    name: string;
    description: string | null;
    cup_format?: string | null;
    rules_json?: any;
    start_date?: string | null;
  };
  teams: CupTeam[];
  /** Used to prevent deleting days/sessions that already have matches. */
  matches?: CupMatch[];
  onUpdateTeam: (
    teamId: string,
    updates: Partial<Pick<CupTeam, 'name' | 'color'>>,
  ) => Promise<void> | void;
  onSaved: () => void | Promise<void>;
  onDeleteRequest: () => void;
}

export const CupSettingsDialog: React.FC<Props> = ({
  open, onOpenChange, event, teams, matches = [], onUpdateTeam, onSaved, onDeleteRequest,
}) => {
  const [name, setName] = useState(event.name);
  const [description, setDescription] = useState(event.description || '');
  const [format, setFormat] = useState<CupFormat>(
    (event.cup_format as CupFormat) || 'match_individual'
  );
  const [defaultPoints, setDefaultPoints] = useState<number>(
    Number(event.rules_json?.default_points_per_match ?? 1)
  );

  // Local team draft state — flushed on Save
  const [teamAName, setTeamAName] = useState(teams[0]?.name ?? 'Equipo A');
  const [teamAColor, setTeamAColor] = useState(teams[0]?.color ?? '#3B82F6');
  const [teamBName, setTeamBName] = useState(teams[1]?.name ?? 'Equipo B');
  const [teamBColor, setTeamBColor] = useState(teams[1]?.color ?? '#ef4444');

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(event.name);
      setDescription(event.description || '');
      setFormat((event.cup_format as CupFormat) || 'match_individual');
      setDefaultPoints(Number(event.rules_json?.default_points_per_match ?? 1));
      setTeamAName(teams[0]?.name ?? 'Equipo A');
      setTeamAColor(teams[0]?.color ?? '#3B82F6');
      setTeamBName(teams[1]?.name ?? 'Equipo B');
      setTeamBColor(teams[1]?.color ?? '#ef4444');
    }
  }, [open, event, teams]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    setSaving(true);
    try {
      const newRules = {
        ...(event.rules_json || {}),
        default_points_per_match: defaultPoints,
      };
      const { error } = await supabase
        .from('leaderboard_events')
        .update({
          name: name.trim(),
          description: description.trim() || null,
          cup_format: format,
          rules_json: newRules,
        } as any)
        .eq('id', event.id);
      if (error) throw error;

      // Persist team changes only when something actually changed
      const teamA = teams[0];
      const teamB = teams[1];
      if (teamA) {
        const patch: Partial<Pick<CupTeam, 'name' | 'color'>> = {};
        const nA = teamAName.trim() || 'Equipo A';
        if (nA !== teamA.name) patch.name = nA;
        if (teamAColor !== teamA.color) patch.color = teamAColor;
        if (Object.keys(patch).length > 0) await onUpdateTeam(teamA.id, patch);
      }
      if (teamB) {
        const patch: Partial<Pick<CupTeam, 'name' | 'color'>> = {};
        const nB = teamBName.trim() || 'Equipo B';
        if (nB !== teamB.name) patch.name = nB;
        if (teamBColor !== teamB.color) patch.color = teamBColor;
        if (Object.keys(patch).length > 0) await onUpdateTeam(teamB.id, patch);
      }

      toast.success('Cambios guardados');
      onOpenChange(false);
      await onSaved();
    } catch (err: any) {
      toast.error('Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const renderColorPicker = (
    selected: string,
    onPick: (hex: string) => void,
  ) => (
    <div className="flex gap-1.5 mt-1">
      {TEAM_COLORS.map(c => (
        <button
          key={c.hex}
          type="button"
          onClick={() => onPick(c.hex)}
          aria-label={c.label}
          className="w-7 h-7 rounded-full transition-all"
          style={{
            backgroundColor: c.hex,
            boxShadow: selected === c.hex
              ? '0 0 0 2px hsl(var(--background)), 0 0 0 4px ' + c.hex
              : 'none',
          }}
        />
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
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

          {/* Formato + Puntos por match en una sola línea (formato más ancho) */}
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <div className="min-w-0">
              <Label>Formato de juego</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as CupFormat)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="match_individual">Match Play Individual</SelectItem>
                  <SelectItem value="fourball">Fourball (Best Ball)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-20">
              <Label className="whitespace-nowrap">Pts P/Match</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={defaultPoints}
                onChange={(e) => setDefaultPoints(parseFloat(e.target.value) || 0)}
                className="text-center px-1"
              />
            </div>
          </div>

          {/* Team editor (name + color) */}
          {(teams[0] || teams[1]) && (
            <div className="border-t pt-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground">Equipos</p>
              <div className="grid grid-cols-2 gap-3">
                {teams[0] && (
                  <div>
                    <Label className="text-xs" style={{ color: teamAColor }}>
                      Equipo A
                    </Label>
                    <Input
                      value={teamAName}
                      onChange={e => setTeamAName(e.target.value)}
                      maxLength={20}
                      className="h-8 text-sm"
                    />
                    {renderColorPicker(teamAColor, setTeamAColor)}
                  </div>
                )}
                {teams[1] && (
                  <div>
                    <Label className="text-xs" style={{ color: teamBColor }}>
                      Equipo B
                    </Label>
                    <Input
                      value={teamBName}
                      onChange={e => setTeamBName(e.target.value)}
                      maxLength={20}
                      className="h-8 text-sm"
                    />
                    {renderColorPicker(teamBColor, setTeamBColor)}
                  </div>
                )}
              </div>
            </div>
          )}

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
