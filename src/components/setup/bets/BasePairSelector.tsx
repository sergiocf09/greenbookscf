import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Users, Wand2, Shuffle, ChevronLeft } from 'lucide-react';
import { AmountInput } from './AmountInput';
import { TeamHandicapMode } from '@/types/golf';
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
import type { BasePairDefaults } from './basePairGenerator';
import { getPairCombos, findPairComboIndex } from './basePairGenerator';

interface BasePairSelectorProps {
  /** Player options already filtered by the participation matrix (5 or 6) */
  playerOptions: Array<{ value: string; label: string }>;
  basePair?: [string, string];
  onChangeBasePair?: (pair: [string, string]) => void;
  /** Number of matches already configured for this bet */
  existingCount: number;
  /** Which bet family we are generating for */
  variant: 'foursomes' | 'carritos';
  isNineHole?: boolean;
  /** 5 = base pair vs the other 3 · 6 = 3 fixed pairs round robin */
  mode?: 5 | 6;
  /** Current 3 pairs (6-player mode) so the shuffle can detect its position */
  sixPairs?: Array<[string, string]>;
  /** Generate the 3 matches. mode 'replace' clears existing ones first (5 players) */
  onGenerate?: (
    base: [string, string],
    others: string[],
    mode: 'replace' | 'add',
    defaults: BasePairDefaults
  ) => void;
  /** Generate the 3 round-robin matches from 3 fixed pairs (6 players) */
  onGenerateSix?: (
    pairs: Array<[string, string]>,
    mode: 'replace' | 'add',
    defaults: BasePairDefaults
  ) => void;
}


export const BasePairSelector: React.FC<BasePairSelectorProps> = ({
  playerOptions,
  basePair,
  onChangeBasePair,
  existingCount,
  variant,
  isNineHole,
  mode: playersMode = 5,
  sixPairs,
  onGenerate,
  onGenerateSix,
}) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isFoursomes = variant === 'foursomes';
  const isSix = playersMode === 6;

  const [scoringType, setScoringType] = useState<BasePairDefaults['scoringType']>(
    isFoursomes ? 'lowBall' : 'all'
  );
  const [handicapMode, setHandicapMode] = useState<TeamHandicapMode>('individual');
  const [frontAmount, setFrontAmount] = useState(100);
  const [backAmount, setBackAmount] = useState(100);
  const [totalAmount, setTotalAmount] = useState(100);
  const [continua, setContinua] = useState(false);
  const [unitsEnabled, setUnitsEnabled] = useState(false);
  const [unitsValue, setUnitsValue] = useState(25);
  const [oyesesEnabled, setOyesesEnabled] = useState(false);
  const [oyesesValue, setOyesesValue] = useState(25);
  const [oyesesModality, setOyesesModality] =
    useState<'acumulados' | 'sangron'>('acumulados');

  const p1 = basePair?.[0] ?? '';
  const p2 = basePair?.[1] ?? '';

  const others = useMemo(
    () => playerOptions.map((o) => o.value).filter((id) => id !== p1 && id !== p2),
    [playerOptions, p1, p2]
  );

  /* ── 6-player mode: pick the trio of pairs before generating ── */
  const combos = useMemo(
    () => (isSix ? getPairCombos(playerOptions.map((o) => o.value)) : []),
    [isSix, playerOptions]
  );
  const detectedIdx =
    isSix && sixPairs && sixPairs.length === 3
      ? findPairComboIndex(combos, sixPairs[0], sixPairs[1], sixPairs[2])
      : -1;
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const comboIdx = pickedIdx ?? (detectedIdx >= 0 ? detectedIdx : 0);
  const activeCombo = combos[comboIdx];
  const activePairs: Array<[string, string]> = activeCombo
    ? [activeCombo.teamA, activeCombo.teamB, activeCombo.teamC!].filter(Boolean) as Array<[string, string]>
    : [];

  const cycle = (delta: number) => {
    if (!combos.length) return;
    setPickedIdx(((comboIdx + delta) % combos.length + combos.length) % combos.length);
  };

  const shortLabel = (id: string) =>
    playerOptions.find((o) => o.value === id)?.label.split(' ')[0] ?? '—';

  const isValid = isSix
    ? activePairs.length === 3
    : !!p1 && !!p2 && p1 !== p2 && others.length === 3;
  const matchOnly18 = isFoursomes && scoringType === 'matchOnly' && continua;

  const run = (mode: 'replace' | 'add') => {
    if (!isValid) return;
    const defaults: BasePairDefaults = {
      scoringType,
      handicapMode,
      frontAmount,
      backAmount,
      totalAmount,
      ...(isFoursomes
        ? {
            continua: scoringType === 'matchOnly' ? continua : false,
            unitsEnabled,
            unitsValue,
            oyesesEnabled,
            oyesesValue,
            oyesesModality,
          }
        : {}),
    };
    if (isSix) onGenerateSix?.(activePairs, mode, defaults);
    else onGenerate?.([p1, p2], others, mode, defaults);
  };

  const handleClick = () => {
    if (existingCount > 0) setConfirmOpen(true);
    else run('add');
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2.5 mb-3">
      <div className="flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-primary shrink-0" />
        <p className="text-xs font-medium text-foreground">
          {isSix ? 'Generar 3 partidos (6 jugadores)' : 'Pareja base (5 jugadores)'}
        </p>
      </div>
      <p className="text-[10px] text-muted-foreground leading-tight">
        {isSix
          ? 'Elige la terna de parejas con el Shuffle, define la configuración común y genera los 3 partidos (todos contra todos). Después puedes editar cada partido.'
          : 'Elige los 2 jugadores que se mantienen juntos, define la configuración común y genera los 3 matches contra todas las combinaciones de los otros 3. Después puedes editar o eliminar cada match.'}
      </p>

      {isSix ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] text-muted-foreground">Parejas</Label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => cycle(-1)}
                className="flex items-center text-[11px] text-primary border border-primary/30 rounded-md px-1.5 py-1 hover:bg-primary/5 transition-colors"
                aria-label="Combinación anterior"
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => cycle(1)}
                className="flex items-center gap-1 text-[11px] text-primary border border-primary/30 rounded-md px-2 py-1 hover:bg-primary/5 transition-colors"
                title={`Ciclar combinaciones (${combos.length} opciones)`}
              >
                <Shuffle className="h-3 w-3" />
                Shuffle
                <span className="text-[9px] text-muted-foreground ml-0.5">
                  {comboIdx + 1}/{combos.length}
                </span>
              </button>
            </div>
          </div>
          <p className="text-[10px] font-medium text-foreground">
            {activePairs.map((pr) => pr.map(shortLabel).join('+')).join('  /  ')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {[0, 1].map((slot) => (
            <div key={slot} className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                Jugador base {slot + 1}
              </Label>
              <Select
                value={(slot === 0 ? p1 : p2) || undefined}
                onValueChange={(v) =>
                  onChangeBasePair?.(
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
      )}


      {/* ── Configuración común de los 3 matches ── */}
      <div className="space-y-2 pt-2 border-t border-primary/15">
        <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          Configuración para los 3 {isSix ? 'partidos' : 'matches'}
        </Label>


        <div className="flex items-center justify-between">
          <Label className="text-[10px] font-semibold text-primary">Modalidad Juego</Label>
          <Select
            value={scoringType}
            onValueChange={(v) => setScoringType(v as BasePairDefaults['scoringType'])}
          >
            <SelectTrigger className="h-7 w-40 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lowBall">Bola Baja</SelectItem>
              <SelectItem value="highBall">Bola Alta</SelectItem>
              <SelectItem value="combined">Bola Baja + Bola Alta</SelectItem>
              {isFoursomes ? (
                <SelectItem value="matchOnly">Match Play</SelectItem>
              ) : (
                <SelectItem value="all">Suma Total (Todos)</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-[10px] font-semibold text-primary">Modalidad HCP</Label>
          <Select
            value={handicapMode}
            onValueChange={(v) => setHandicapMode(v as TeamHandicapMode)}
          >
            <SelectTrigger className="h-7 w-40 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="individual">Full Hándicap</SelectItem>
              <SelectItem value="baseCero">Base Cero</SelectItem>
              <SelectItem value="diferencialEquipo">Diferencial Equipo</SelectItem>
              <SelectItem value="slidingEquipo">Sliding Equipo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isFoursomes && scoringType === 'matchOnly' && (
          <div className="flex items-center justify-between">
            <Label className="text-[10px] text-muted-foreground">
              Match Play por 18 hoyos
            </Label>
            <Switch checked={continua} onCheckedChange={setContinua} className="scale-75" />
          </div>
        )}

        {matchOnly18 ? (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground text-center block">
              Match 18 (único)
            </Label>
            <AmountInput label="" value={totalAmount} onChange={setTotalAmount} />
          </div>
        ) : isNineHole ? (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground text-center block">
              Front 9
            </Label>
            <AmountInput label="" value={frontAmount} onChange={setFrontAmount} />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground text-center block">
                Front 9
              </Label>
              <AmountInput label="" value={frontAmount} onChange={setFrontAmount} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground text-center block">
                Back 9
              </Label>
              <AmountInput label="" value={backAmount} onChange={setBackAmount} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground text-center block">
                Total 18
              </Label>
              <AmountInput label="" value={totalAmount} onChange={setTotalAmount} />
            </div>
          </div>
        )}

        {isFoursomes && (
          <>
            <div className="flex items-center justify-between pt-1">
              <Label className="text-[10px] text-muted-foreground">⭐ Unidades</Label>
              <Switch
                checked={unitsEnabled}
                onCheckedChange={setUnitsEnabled}
                className="scale-75"
              />
            </div>
            {unitsEnabled && (
              <AmountInput label="" value={unitsValue} onChange={setUnitsValue} />
            )}

            <div className="flex items-center justify-between">
              <Label className="text-[10px] text-muted-foreground">Oyeses</Label>
              <Switch
                checked={oyesesEnabled}
                onCheckedChange={setOyesesEnabled}
                className="scale-75"
              />
            </div>
            {oyesesEnabled && (
              <div className="space-y-2">
                <AmountInput label="" value={oyesesValue} onChange={setOyesesValue} />
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] text-muted-foreground">Modalidad Oyeses</Label>
                  <Select
                    value={oyesesModality}
                    onValueChange={(v) => setOyesesModality(v as 'acumulados' | 'sangron')}
                  >
                    <SelectTrigger className="h-7 w-32 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="acumulados">Acumulados</SelectItem>
                      <SelectItem value="sangron">Sangrón</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </>
        )}
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
