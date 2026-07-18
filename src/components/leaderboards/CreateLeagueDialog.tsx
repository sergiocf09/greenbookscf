import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Plus, Trash2, Trophy, Target, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format, addMonths } from 'date-fns';

export interface LeagueRulesJson {
  scoring_system: 'strokes' | 'stableford' | 'points';
  score_basis: 'gross' | 'net' | 'stableford';
  aggregation: 'sum' | 'best_n' | 'average';
  best_n: number | null;
  min_rounds_to_qualify: number;
  points_per_position: number[];
  period_months: number;
  allow_open_join: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (params: {
    name: string;
    description?: string;
    start_date: string;
    end_date: string;
    competition_type: 'league';
    scoring_modes: string[];
    rules_json: LeagueRulesJson;
  }) => Promise<any>;
}

const DEFAULT_POINTS = [10, 7, 5, 3, 1];
const PERIOD_OPTIONS = [
  { value: 1, label: '1 mes' },
  { value: 2, label: '2 meses' },
  { value: 3, label: '3 meses' },
  { value: 6, label: '6 meses' },
  { value: 12, label: '1 año' },
];

export const CreateLeagueDialog: React.FC<Props> = ({ open, onClose, onCreate }) => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scoringSystem, setScoringSystem] = useState<'strokes' | 'stableford' | 'points'>('points');
  const [scoreBasis, setScoreBasis] = useState<'gross' | 'net'>('net');
  const [aggregation, setAggregation] = useState<'sum' | 'best_n' | 'average'>('sum');
  const [bestN, setBestN] = useState('5');
  const [minRounds, setMinRounds] = useState('3');
  const [periodMonths, setPeriodMonths] = useState(6);
  const [allowOpenJoin, setAllowOpenJoin] = useState(true);
  const [pointsPerPosition, setPointsPerPosition] = useState<string[]>(DEFAULT_POINTS.map(String));
  const [saving, setSaving] = useState(false);

  const addPointsPlace = () => setPointsPerPosition(prev => [...prev, '0']);
  const removePointsPlace = (idx: number) => setPointsPerPosition(prev => prev.filter((_, i) => i !== idx));
  const updatePoints = (idx: number, val: string) =>
    setPointsPerPosition(prev => prev.map((p, i) => (i === idx ? val : p)));

  const reset = () => {
    setName('');
    setDescription('');
    setScoringSystem('points');
    setScoreBasis('net');
    setAggregation('sum');
    setBestN('5');
    setMinRounds('3');
    setPeriodMonths(6);
    setAllowOpenJoin(true);
    setPointsPerPosition(DEFAULT_POINTS.map(String));
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('El nombre de la liga es obligatorio');
      return;
    }

    const startDate = today;
    const endDate = format(addMonths(new Date(), periodMonths), 'yyyy-MM-dd');

    const parsedPoints = pointsPerPosition.map(p => parseFloat(p) || 0);
    const parsedBestN = aggregation === 'best_n' ? (parseInt(bestN) || null) : null;
    const parsedMinRounds = parseInt(minRounds) || 0;

    const scoringModes =
      scoringSystem === 'stableford'
        ? ['stableford']
        : scoreBasis === 'gross'
        ? ['gross']
        : ['gross', 'net'];

    const rules: LeagueRulesJson = {
      scoring_system: scoringSystem,
      score_basis: scoringSystem === 'stableford' ? 'stableford' : scoreBasis,
      aggregation,
      best_n: parsedBestN,
      min_rounds_to_qualify: parsedMinRounds,
      points_per_position: scoringSystem === 'points' ? parsedPoints : [],
      period_months: periodMonths,
      allow_open_join: allowOpenJoin,
    };

    setSaving(true);
    try {
      const result = await onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        start_date: startDate,
        end_date: endDate,
        competition_type: 'league',
        scoring_modes: scoringModes,
        rules_json: rules,
      });
      if (result) {
        reset();
        onClose();
      }
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
    <Dialog
      open={open}
      onOpenChange={o => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Nueva Liga
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh]">
          <div className="px-5 py-4 space-y-5">
            {/* Nombre y descripción */}
            <div className="space-y-2">
              <Label>Nombre de la liga *</Label>
              <Input
                placeholder="Ej: Liga GreenBook 2026"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Descripción (opcional)</Label>
              <Input
                placeholder="Descripción breve"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            {/* Duración */}
            <div className="space-y-2">
              <Label>Duración</Label>
              <Select value={String(periodMonths)} onValueChange={v => setPeriodMonths(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Termina el {format(addMonths(new Date(), periodMonths), 'dd/MM/yyyy')}
              </p>
            </div>

            {/* Sistema de scoring */}
            <div className="space-y-2">
              <Label>Sistema de scoring</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['points', 'strokes', 'stableford'] as const).map(sys => (
                  <button
                    key={sys}
                    type="button"
                    onClick={() => setScoringSystem(sys)}
                    className={cn(
                      'flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-colors',
                      scoringSystem === sys
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                    )}
                  >
                    {systemIcon[sys]}
                    <span>
                      {sys === 'points' ? 'Puntos' : sys === 'strokes' ? 'Golpes' : 'Stableford'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Score basis */}
            {scoringSystem !== 'stableford' && (
              <div className="space-y-2">
                <Label>Base de clasificación por jornada</Label>
                <div className="flex gap-2">
                  {(['gross', 'net'] as const).map(b => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setScoreBasis(b)}
                      className={cn(
                        'flex-1 py-2 rounded-md text-xs font-semibold border transition-colors',
                        scoreBasis === b
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted text-muted-foreground border-border'
                      )}
                    >
                      {b === 'gross' ? 'Gross (sin handicap)' : 'Neto (con handicap)'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tabla de puntos */}
            {scoringSystem === 'points' && (
              <div className="space-y-2">
                <Label>Puntos por posición</Label>
                <div className="space-y-1.5">
                  {pointsPerPosition.map((pts, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs font-medium w-14 shrink-0">{idx + 1}° lugar</span>
                      <Input
                        value={pts}
                        onChange={e => updatePoints(idx, e.target.value)}
                        className="h-8 text-sm"
                        inputMode="numeric"
                      />
                      <span className="text-[11px] text-muted-foreground">pts</span>
                      {pointsPerPosition.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePointsPlace(idx)}
                          className="text-muted-foreground hover:text-destructive p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground pt-1">
                    Los lugares no listados reciben 0 puntos
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={addPointsPlace} className="w-full mt-1">
                  <Plus className="h-3 w-3 mr-1" />
                  Agregar lugar
                </Button>
              </div>
            )}

            {/* Aggregation strokes/stableford */}
            {scoringSystem !== 'points' && (
              <div className="space-y-2">
                <Label>¿Cómo se acumulan las jornadas?</Label>
                <Select value={aggregation} onValueChange={v => setAggregation(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sum">Suma de todas las jornadas</SelectItem>
                    <SelectItem value="average">Promedio de todas las jornadas</SelectItem>
                    <SelectItem value="best_n">Las mejores N jornadas</SelectItem>
                  </SelectContent>
                </Select>
                {aggregation === 'best_n' && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs">Contar las mejores</span>
                    <Input
                      value={bestN}
                      onChange={e => setBestN(e.target.value)}
                      className="h-8 w-20 text-sm"
                      inputMode="numeric"
                    />
                    <span className="text-xs">jornadas</span>
                  </div>
                )}
              </div>
            )}

            {/* Aggregation puntos */}
            {scoringSystem === 'points' && (
              <div className="space-y-2">
                <Label>Jornadas que cuentan</Label>
                <Select value={aggregation} onValueChange={v => setAggregation(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sum">Todas las jornadas</SelectItem>
                    <SelectItem value="best_n">Las mejores N jornadas</SelectItem>
                  </SelectContent>
                </Select>
                {aggregation === 'best_n' && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs">Contar las mejores</span>
                    <Input
                      value={bestN}
                      onChange={e => setBestN(e.target.value)}
                      className="h-8 w-20 text-sm"
                      inputMode="numeric"
                    />
                    <span className="text-xs">jornadas</span>
                  </div>
                )}
              </div>
            )}

            {/* Mínimo de rondas */}
            <div className="space-y-2">
              <Label>Mínimo de jornadas para clasificar</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={minRounds}
                  onChange={e => setMinRounds(e.target.value)}
                  className="h-8 w-20 text-sm"
                  inputMode="numeric"
                />
                <span className="text-xs text-muted-foreground">
                  {parseInt(minRounds) === 0 ? '(sin mínimo)' : 'jornadas jugadas'}
                </span>
              </div>
            </div>

            {/* Unión abierta */}
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Unión abierta por código</p>
                <p className="text-[11px] text-muted-foreground">
                  Cualquiera con el código puede unirse
                </p>
              </div>
              <Switch checked={allowOpenJoin} onCheckedChange={setAllowOpenJoin} />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="px-5 py-3 border-t gap-2">
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Crear Liga
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
