import React, { useEffect, useState } from 'react';
import { trs } from '@/i18n/tr';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Plus, Trash2, Trophy, Target, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { LeagueRulesJson } from '@/components/leaderboards/CreateLeagueDialog';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event: {
    id: string;
    name: string;
    description?: string | null;
    start_date: string;
    end_date?: string | null;
    scoring_modes?: string[] | null;
    rules_json?: Record<string, any> | null;
  };
  onSaved?: () => void;
}

const DEFAULT_POINTS = [10, 7, 5, 3, 1];

export const EditLeagueConfigDialog: React.FC<Props> = ({ open, onOpenChange, event, onSaved }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [scoringSystem, setScoringSystem] = useState<'strokes' | 'stableford' | 'points'>('points');
  const [scoreBasis, setScoreBasis] = useState<'gross' | 'net'>('net');
  const [aggregation, setAggregation] = useState<'sum' | 'best_n' | 'average'>('sum');
  const [bestN, setBestN] = useState('5');
  const [minRounds, setMinRounds] = useState('0');
  const [minPlayersPerRound, setMinPlayersPerRound] = useState('2');
  const [allowOpenJoin, setAllowOpenJoin] = useState(true);
  const [pointsPerPosition, setPointsPerPosition] = useState<string[]>(DEFAULT_POINTS.map(String));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const r = (event.rules_json || {}) as Partial<LeagueRulesJson>;
    setName(event.name || '');
    setDescription(event.description || '');
    setStartDate(event.start_date || '');
    setEndDate(event.end_date || '');
    const sys = r.scoring_system || 'points';
    setScoringSystem(sys);
    setScoreBasis(r.score_basis === 'gross' ? 'gross' : 'net');
    const agg = r.aggregation || 'sum';
    setAggregation(sys === 'points' && agg === 'average' ? 'sum' : agg);
    setBestN(r.best_n != null ? String(r.best_n) : '5');
    setMinRounds(String(r.min_rounds_to_qualify ?? 0));
    setMinPlayersPerRound(String(r.min_players_per_round ?? 2));
    setAllowOpenJoin(r.allow_open_join ?? true);
    const pts = Array.isArray(r.points_per_position) && r.points_per_position.length > 0
      ? r.points_per_position.map(String)
      : DEFAULT_POINTS.map(String);
    setPointsPerPosition(pts);
  }, [open, event]);

  const handleScoringSystemChange = (sys: 'points' | 'strokes' | 'stableford') => {
    setScoringSystem(sys);
    if (sys === 'points' && aggregation === 'average') {
      setAggregation('sum');
    }
  };

  const addPointsPlace = () => setPointsPerPosition((prev) => [...prev, '0']);
  const removePointsPlace = (idx: number) => setPointsPerPosition((prev) => prev.filter((_, i) => i !== idx));
  const updatePoints = (idx: number, val: string) =>
    setPointsPerPosition((prev) => prev.map((p, i) => (i === idx ? val : p)));

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(trs('El nombre de la liga es obligatorio'));
      return;
    }
    if (!startDate) {
      toast.error(trs('La fecha de inicio es obligatoria'));
      return;
    }
    if (endDate && endDate < startDate) {
      toast.error(trs('La fecha de fin no puede ser anterior a la fecha de inicio'));
      return;
    }

    let parsedBestN: number | null = null;
    if (aggregation === 'best_n') {
      const n = Number.parseInt(bestN, 10);
      if (!Number.isInteger(n) || n < 1) {
        toast.error(trs('Las mejores jornadas deben ser al menos 1'));
        return;
      }
      parsedBestN = n;
    }

    const parsedMinRounds = Number.parseInt(minRounds, 10);
    if (Number.isNaN(parsedMinRounds) || parsedMinRounds < 0) {
      toast.error(trs('El mínimo de jornadas debe ser 0 o mayor'));
      return;
    }

    const parsedMinPlayers = Number.parseInt(minPlayersPerRound, 10);
    if (!Number.isInteger(parsedMinPlayers) || parsedMinPlayers < 1 || parsedMinPlayers > 12) {
      toast.error(trs('El mínimo de jugadores debe estar entre 1 y 12'));
      return;
    }

    const parsedPoints = pointsPerPosition.map((p) => Number.parseFloat(p));
    if (scoringSystem === 'points' && (parsedPoints.length === 0 || parsedPoints.some((p) => !Number.isFinite(p) || p < 0))) {
      toast.error(trs('Verifica los puntos por posición (números mayores o iguales a 0)'));
      return;
    }

    const prevRules = (event.rules_json || {}) as Record<string, any>;
    const nextScoreBasis = scoringSystem === 'stableford' ? 'stableford' : scoreBasis;
    const nextPoints = scoringSystem === 'points' ? parsedPoints : [];
    const nextRules = {
      ...prevRules,
      scoring_system: scoringSystem,
      score_basis: nextScoreBasis,
      aggregation: scoringSystem === 'points' && aggregation === 'average' ? 'sum' : aggregation,
      best_n: parsedBestN,
      min_rounds_to_qualify: parsedMinRounds,
      points_per_position: nextPoints,
      allow_open_join: allowOpenJoin,
      min_players_per_round: parsedMinPlayers,
    };

    const scoringModes =
      scoringSystem === 'stableford'
        ? ['stableford']
        : scoreBasis === 'gross'
          ? ['gross']
          : ['gross', 'net'];

    const scoringChanged =
      prevRules.scoring_system !== nextRules.scoring_system ||
      prevRules.score_basis !== nextRules.score_basis ||
      JSON.stringify(prevRules.points_per_position ?? []) !== JSON.stringify(nextPoints);

    setSaving(true);
    try {
      const { error } = await supabase
        .from('leaderboard_events')
        .update({
          name: name.trim(),
          description: description.trim() || null,
          start_date: startDate,
          end_date: endDate || null,
          scoring_modes: scoringModes,
          rules_json: nextRules as any,
        })
        .eq('id', event.id);
      if (error) throw error;

      if (scoringChanged) {
        const { error: recalcError } = await supabase.rpc('recalculate_league', {
          p_leaderboard_id: event.id,
        });
        if (recalcError) throw recalcError;
      }

      toast.success(trs('Configuración actualizada'));
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(trs('Error: ') + err.message);
    } finally {
      setSaving(false);
    }
  };

  const systemIcon: Record<string, React.ReactNode> = {
    strokes: <Target className="h-5 w-5" />,
    stableford: <TrendingUp className="h-5 w-5" />,
    points: <Trophy className="h-5 w-5" />,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            {trs('Editar configuración de liga')}
          </DialogTitle>
          <DialogDescription>{trs('Modifica fechas, sistema de puntos y reglas de clasificación.')}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh]">
          <div className="px-5 py-4 space-y-5">
            <div className="space-y-2">
              <Label>{trs('Nombre de la liga *')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>{trs('Descripción (opcional)')}</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{trs('Fecha de inicio *')}</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{trs('Fecha de fin')}</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{trs('Sistema de scoring')}</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['points', 'strokes', 'stableford'] as const).map((sys) => (
                  <button
                    key={sys}
                    type="button"
                    onClick={() => handleScoringSystemChange(sys)}
                    className={cn(
                      'flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-colors',
                      scoringSystem === sys
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted text-muted-foreground border-border hover:bg-muted/80',
                    )}
                  >
                    {systemIcon[sys]}
                    <span>
                      {sys === 'points' ? trs('Puntos') : sys === 'strokes' ? trs('Golpes') : trs('Stableford')}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {scoringSystem !== 'stableford' && (
              <div className="space-y-2">
                <Label>{trs('Base de clasificación por jornada')}</Label>
                <div className="flex gap-2">
                  {(['gross', 'net'] as const).map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setScoreBasis(b)}
                      className={cn(
                        'flex-1 py-2 rounded-md text-xs font-semibold border transition-colors',
                        scoreBasis === b
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted text-muted-foreground border-border',
                      )}
                    >
                      {b === 'gross' ? trs('Gross (sin handicap)') : trs('Neto (con handicap)')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {scoringSystem === 'points' && (
              <div className="space-y-2">
                <Label>{trs('Puntos por posición')}</Label>
                <div className="space-y-1.5">
                  {pointsPerPosition.map((pts, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs font-medium w-14 shrink-0">{idx + 1}° {trs('lugar')}</span>
                      <Input
                        value={pts}
                        onChange={(e) => updatePoints(idx, e.target.value)}
                        className="h-8 text-sm"
                        inputMode="decimal"
                      />
                      <span className="text-[11px] text-muted-foreground">{trs('pts')}</span>
                      {pointsPerPosition.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePointsPlace(idx)}
                          className="text-muted-foreground hover:text-destructive p-1"
                          aria-label={trs('Quitar lugar')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground pt-1">
                    {trs('Los lugares no listados reciben 0 puntos')}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={addPointsPlace} className="w-full mt-1">
                  <Plus className="h-3 w-3 mr-1" />
                  {trs('Agregar lugar')}
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <Label>{scoringSystem === 'points' ? trs('Jornadas que cuentan') : trs('¿Cómo se acumulan las jornadas?')}</Label>
              <Select value={aggregation} onValueChange={(v) => setAggregation(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sum">
                    {scoringSystem === 'points' ? trs('Todas las jornadas') : trs('Suma de todas las jornadas')}
                  </SelectItem>
                  {scoringSystem !== 'points' && (
                    <SelectItem value="average">{trs('Promedio de todas las jornadas')}</SelectItem>
                  )}
                  <SelectItem value="best_n">{trs('Las mejores N jornadas')}</SelectItem>
                </SelectContent>
              </Select>
              {aggregation === 'best_n' && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs">{trs('Contar las mejores')}</span>
                  <Input
                    type="number"
                    min={1}
                    value={bestN}
                    onChange={(e) => setBestN(e.target.value)}
                    className="h-8 w-20 text-sm"
                    inputMode="numeric"
                  />
                  <span className="text-xs">{trs('jornadas')}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>{trs('Mínimo de jornadas para clasificar')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  value={minRounds}
                  onChange={(e) => setMinRounds(e.target.value)}
                  className="h-8 w-20 text-sm"
                  inputMode="numeric"
                />
                <span className="text-xs text-muted-foreground">
                  {Number.parseInt(minRounds, 10) === 0 ? trs('(sin mínimo)') : trs('jornadas jugadas')}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{trs('Mínimo de jugadores de la liga para sugerir una ronda')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={minPlayersPerRound}
                  onChange={(e) => setMinPlayersPerRound(e.target.value)}
                  className="h-8 w-20 text-sm"
                  inputMode="numeric"
                />
                <span className="text-xs text-muted-foreground">{trs('jugadores')}</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{trs('Unión abierta por código')}</p>
                <p className="text-[11px] text-muted-foreground">{trs('Cualquiera con el código puede unirse')}</p>
              </div>
              <Switch checked={allowOpenJoin} onCheckedChange={setAllowOpenJoin} />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="px-5 py-3 border-t gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {trs('Cancelar')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {trs('Guardar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};