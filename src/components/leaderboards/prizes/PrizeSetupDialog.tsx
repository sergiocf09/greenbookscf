import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { trs } from '@/i18n/tr';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowDown, ArrowUp, Award, Loader2, Lock, Percent, Plus, Sparkles, Trash2, X,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { cn } from '@/lib/utils';
import { fmtMoney } from '@/lib/formatMoney';
import {
  autoAssignCategoriesByHandicap, DEFAULT_PRIZE_CONFIG, normalizePrizeConfig, normalizeSpecialAwards,
  presetTiers, validatePrizeConfig,
} from '@/lib/leaderboardPrizes';
import { mergeGeneratedSlots } from '@/lib/prizeSlots';
import { useLeaderboardPrizes, type LeaderboardPrizesState } from '@/hooks/useLeaderboardPrizes';
import { useLeaderboardPar3Slots } from '@/hooks/useLeaderboardPar3Slots';
import type {
  MultiDayDay, PrizeCategory, PrizeConfig, PrizeMode, PrizePool, PrizeTier, SpecialAward,
} from '@/types/leaderboard';

export interface PrizeSetupParticipant {
  id: string;
  display_name: string;
  initials: string;
  avatar_color: string;
  handicap_for_leaderboard: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leaderboardId: string;
  isMultiDay: boolean;
  scoringModes: string[];
  days?: MultiDayDay[];
  participants: PrizeSetupParticipant[];
}

const NONE = '__none';
const ALL_MODES: PrizeMode[] = ['gross', 'net', 'stableford'];
const MODE_LABEL: Record<PrizeMode, string> = { gross: 'Gross', net: 'Neto', stableford: 'Stableford' };
const MAX_PLACES = 20;

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const cents = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : 0;
};
const poolSubtotal = (p: PrizePool) => p.tiers.reduce((s, t) => s + cents(t.amount), 0) / 100;
const defaultPoolLabel = (mode: PrizeMode, categoryName?: string | null) =>
  categoryName ? `${trs(MODE_LABEL[mode])} · ${trs('Cat.')} ${categoryName}` : trs(MODE_LABEL[mode]);
const nextCategoryName = (cats: PrizeCategory[]) => {
  const used = new Set(cats.map(c => c.name.trim().toUpperCase()));
  for (let i = 0; i < 26; i++) {
    const l = String.fromCharCode(65 + i);
    if (!used.has(l)) return l;
  }
  return String(cats.length + 1);
};
const snapshotOf = (config: PrizeConfig, awards: SpecialAward[]) => JSON.stringify({ config, awards });

/* ── Inputs that never emit NaN / negatives ── */

const toText = (v: number | null | undefined) => (v == null ? '' : String(v));

const AmountInput: React.FC<{
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}> = ({ value, onChange, disabled, className, ariaLabel }) => {
  const parse = (t: string) => {
    const n = parseFloat(t);
    return Number.isFinite(n) && n > 0 ? round2(n) : 0;
  };
  const [text, setText] = useState(value ? String(value) : '');
  useEffect(() => {
    setText(t => (parse(t) === (value || 0) ? t : value ? String(value) : ''));
  }, [value]);
  return (
    <Input
      type="text"
      inputMode="decimal"
      placeholder="0"
      aria-label={ariaLabel}
      disabled={disabled}
      value={text}
      onChange={e => {
        const t = e.target.value.replace(',', '.').replace(/\s/g, '');
        if (!/^\d*\.?\d{0,2}$/.test(t)) return;
        setText(t);
        onChange(parse(t));
      }}
      onBlur={() => setText(value ? String(value) : '')}
      className={cn('h-8 text-sm tabular-nums', className)}
    />
  );
};

const OptionalNumberInput: React.FC<{
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  allowNegative?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}> = ({ value, onChange, allowNegative, disabled, placeholder, className, ariaLabel }) => {
  const parse = (t: string): number | null => {
    if (t.trim() === '' || t === '-' || t === '.') return null;
    const n = parseFloat(t);
    if (!Number.isFinite(n) || (!allowNegative && n < 0)) return null;
    return round2(n);
  };
  const [text, setText] = useState(toText(value));
  useEffect(() => {
    setText(t => (parse(t) === (value ?? null) ? t : toText(value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const re = allowNegative ? /^-?\d*\.?\d{0,2}$/ : /^\d*\.?\d{0,2}$/;
  return (
    <Input
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      aria-label={ariaLabel}
      disabled={disabled}
      value={text}
      onChange={e => {
        const t = e.target.value.replace(',', '.').replace(/\s/g, '');
        if (!re.test(t)) return;
        setText(t);
        onChange(parse(t));
      }}
      onBlur={() => setText(toText(value))}
      className={cn('h-8 text-sm tabular-nums', className)}
    />
  );
};

const SectionTitle: React.FC<{ title: string; hint?: React.ReactNode }> = ({ title, hint }) => (
  <span className="flex flex-1 items-center justify-between gap-2 pr-2 text-left">
    <span className="text-sm font-semibold">{title}</span>
    {hint != null && <span className="text-[11px] font-normal text-muted-foreground no-underline">{hint}</span>}
  </span>
);

/* ── Dialog ── */

export const PrizeSetupDialog: React.FC<Props> = ({
  open, onOpenChange, leaderboardId, isMultiDay, scoringModes, days, participants,
}) => {
  const { prizes, isCreator, savePrizes, setStatus, saving, refetch } = useLeaderboardPrizes(leaderboardId);
  const par3 = useLeaderboardPar3Slots(leaderboardId, isMultiDay, days, open);

  const availableModes = useMemo<PrizeMode[]>(() => {
    const m = ALL_MODES.filter(x => (scoringModes || []).includes(x));
    return m.length ? m : ['gross', 'net'];
  }, [scoringModes]);

  const [config, setConfig] = useState<PrizeConfig>({ ...DEFAULT_PRIZE_CONFIG });
  const [awards, setAwards] = useState<SpecialAward[]>([]);
  const [baseline, setBaseline] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [useCategories, setUseCategories] = useState(false);
  const [cleanedCount, setCleanedCount] = useState(0);

  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDisableCategories, setConfirmDisableCategories] = useState(false);
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<string | null>(null);
  const [pendingDeletePool, setPendingDeletePool] = useState<string | null>(null);

  const [newPoolMode, setNewPoolMode] = useState<PrizeMode>(availableModes[0]);
  const [newPoolCategory, setNewPoolCategory] = useState<string>(NONE);
  const [percentFor, setPercentFor] = useState<string | null>(null);
  const [percentTotal, setPercentTotal] = useState(0);
  const [percentText, setPercentText] = useState('50/30/20');

  const participantsById = useMemo(() => new Map(participants.map(p => [p.id, p])), [participants]);
  const sortedParticipants = useMemo(
    () => [...participants].sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [participants],
  );

  /* Init draft every time the dialog opens, from fresh data. */
  const initFrom = useCallback((state: LeaderboardPrizesState | null | undefined) => {
    const cfg = normalizePrizeConfig(state?.config ?? DEFAULT_PRIZE_CONFIG);
    let aw = normalizeSpecialAwards(state?.awards ?? []).map(a => ({ ...a }));
    let cleaned = 0;
    if (participants.length > 0) {
      const ids = new Set(participants.map(p => p.id));
      const assignments: Record<string, string> = {};
      for (const [pid, cid] of Object.entries(cfg.assignments)) {
        if (ids.has(pid)) assignments[pid] = cid; else cleaned++;
      }
      const manualExclusions = cfg.manualExclusions.filter(e => {
        const keep = ids.has(e.participantId);
        if (!keep) cleaned++;
        return keep;
      });
      aw = aw.map(a => {
        if (a.winnerParticipantId && !ids.has(a.winnerParticipantId)) {
          cleaned++;
          return { ...a, winnerParticipantId: null };
        }
        return a;
      });
      cfg.assignments = assignments;
      cfg.manualExclusions = manualExclusions;
    }
    setConfig(cfg);
    setAwards(aw);
    setBaseline(snapshotOf(cfg, aw));
    setUseCategories(cfg.categories.length > 0);
    setCleanedCount(cleaned);
    setNewPoolMode(availableModes[0]);
    setNewPoolCategory(NONE);
    setPercentFor(null);
    setInitialized(true);
  }, [participants, availableModes]);

  useEffect(() => {
    if (!open) { setInitialized(false); return; }
    let cancelled = false;
    refetch()
      .then(res => { if (!cancelled) initFrom(res.data ?? prizes); })
      .catch(() => { if (!cancelled) initFrom(prizes); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const readOnly = prizes?.status === 'final';
  const dirty = initialized && snapshotOf(config, awards) !== baseline;

  const requestClose = () => {
    if (dirty && !readOnly) setConfirmDiscard(true);
    else onOpenChange(false);
  };

  /* ── Totals & validation ── */
  const tiersCents = config.pools.reduce((s, p) => s + Math.round(poolSubtotal(p) * 100), 0);
  const awardsCents = awards.reduce((s, a) => s + cents(a.amount), 0);
  const assigned = (tiersCents + awardsCents) / 100;
  const totalPool = config.totalPool ?? null;
  const overBudget = totalPool != null && assigned > totalPool;

  const errors = useMemo(() => validatePrizeConfig(config, awards), [config, awards]);
  const warnings = useMemo(() => {
    const w: string[] = [];
    for (const p of config.pools) {
      if (poolSubtotal(p) === 0) w.push(`${trs('La bolsa')} "${p.label || trs('sin nombre')}" ${trs('no tiene montos.')}`);
      if (!availableModes.includes(p.mode)) {
        w.push(`${trs('La bolsa')} "${p.label || trs('sin nombre')}" ${trs('usa una modalidad que el torneo ya no tiene.')}`);
      }
    }
    const noAmount = awards.filter(a => cents(a.amount) === 0).length;
    if (noAmount > 0) w.push(`${noAmount} ${trs('premio(s) especial(es) sin monto.')}`);
    const noLabel = awards.filter(a => !a.label.trim()).length;
    if (noLabel > 0) w.push(`${noLabel} ${trs('premio(s) especial(es) sin nombre.')}`);
    return w;
  }, [config.pools, awards, availableModes]);

  /* ── Mutators ── */
  const patchPool = (id: string, fn: (p: PrizePool) => PrizePool) =>
    setConfig(c => ({ ...c, pools: c.pools.map(p => (p.id === id ? fn(p) : p)) }));
  const patchAward = (id: string, patch: Partial<SpecialAward>) =>
    setAwards(list => list.map(a => (a.id === id ? { ...a, ...patch } : a)));
  const categoryName = (id: string | null | undefined) => config.categories.find(c => c.id === id)?.name ?? null;

  const addCategory = () =>
    setConfig(c => ({
      ...c,
      categories: [...c.categories, { id: uid('cat'), name: nextCategoryName(c.categories), hcpMin: null, hcpMax: null }],
    }));

  const patchCategory = (id: string, patch: Partial<PrizeCategory>) =>
    setConfig(c => {
      const old = c.categories.find(x => x.id === id);
      const categories = c.categories.map(x => (x.id === id ? { ...x, ...patch } : x));
      const renamed = patch.name !== undefined && old && patch.name !== old.name;
      const pools = renamed
        ? c.pools.map(p =>
            p.categoryId === id && p.label === defaultPoolLabel(p.mode, old!.name)
              ? { ...p, label: defaultPoolLabel(p.mode, patch.name || null) }
              : p,
          )
        : c.pools;
      return { ...c, categories, pools };
    });

  const deleteCategory = (id: string) => {
    setConfig(c => {
      const old = c.categories.find(x => x.id === id);
      const assignments = Object.fromEntries(Object.entries(c.assignments).filter(([, cid]) => cid !== id));
      const pools = c.pools.map(p =>
        p.categoryId === id
          ? {
              ...p,
              categoryId: null,
              label: p.label === defaultPoolLabel(p.mode, old?.name) ? defaultPoolLabel(p.mode) : p.label,
            }
          : p,
      );
      return { ...c, categories: c.categories.filter(x => x.id !== id), assignments, pools };
    });
    setAwards(list => list.map(a => (a.categoryId === id ? { ...a, categoryId: null } : a)));
    if (newPoolCategory === id) setNewPoolCategory(NONE);
  };

  const requestDeleteCategory = (id: string) => {
    if (config.pools.some(p => p.categoryId === id)) setPendingDeleteCategory(id);
    else deleteCategory(id);
  };

  const disableCategories = () => {
    setConfig(c => ({
      ...c,
      categories: [],
      assignments: {},
      pools: c.pools.map(p => {
        if (!p.categoryId) return p;
        const old = c.categories.find(x => x.id === p.categoryId);
        return {
          ...p,
          categoryId: null,
          label: p.label === defaultPoolLabel(p.mode, old?.name) ? defaultPoolLabel(p.mode) : p.label,
        };
      }),
    }));
    setAwards(list => list.map(a => (a.categoryId ? { ...a, categoryId: null } : a)));
    setNewPoolCategory(NONE);
    setUseCategories(false);
  };

  const onToggleCategories = (on: boolean) => {
    if (on) { setUseCategories(true); return; }
    if (config.categories.length > 0) setConfirmDisableCategories(true);
    else setUseCategories(false);
  };

  const autoAssign = () => {
    const result = autoAssignCategoriesByHandicap(
      participants.map(p => ({ id: p.id, handicap: Number(p.handicap_for_leaderboard) })),
      config.categories,
    );
    setConfig(c => ({ ...c, assignments: result }));
    toast.success(`${trs('Asignados')} ${Object.keys(result).length} ${trs('de')} ${participants.length} ${trs('jugadores')}`);
  };

  const setAssignment = (pid: string, cid: string) =>
    setConfig(c => {
      const assignments = { ...c.assignments };
      if (cid === NONE) delete assignments[pid]; else assignments[pid] = cid;
      return { ...c, assignments };
    });

  const addPool = () => {
    const mode = availableModes.includes(newPoolMode) ? newPoolMode : availableModes[0];
    const catId = useCategories && newPoolCategory !== NONE ? newPoolCategory : null;
    const pool: PrizePool = {
      id: uid('pool'),
      mode,
      categoryId: catId,
      label: defaultPoolLabel(mode, categoryName(catId)),
      tiers: [1, 2, 3].map(place => ({ place, amount: 0 })),
      excludeWinnersOf: [],
    };
    setConfig(c => ({ ...c, pools: [...c.pools, pool] }));
  };

  const setPoolMode = (id: string, mode: PrizeMode) =>
    patchPool(id, p => ({
      ...p,
      mode,
      label: p.label === defaultPoolLabel(p.mode, categoryName(p.categoryId))
        ? defaultPoolLabel(mode, categoryName(p.categoryId))
        : p.label,
    }));

  const setPoolCategory = (id: string, value: string) =>
    patchPool(id, p => {
      const catId = value === NONE ? null : value;
      return {
        ...p,
        categoryId: catId,
        label: p.label === defaultPoolLabel(p.mode, categoryName(p.categoryId))
          ? defaultPoolLabel(p.mode, categoryName(catId))
          : p.label,
      };
    });

  const setPlaces = (id: string, raw: number) => {
    const n = Math.max(1, Math.min(MAX_PLACES, Math.round(Number(raw) || 1)));
    patchPool(id, p => {
      const byPlace = new Map<number, number>();
      for (const t of p.tiers) byPlace.set(t.place, (byPlace.get(t.place) ?? 0) + cents(t.amount) / 100);
      const tiers: PrizeTier[] = Array.from({ length: n }, (_, i) => ({ place: i + 1, amount: round2(byPlace.get(i + 1) ?? 0) }));
      return { ...p, tiers };
    });
  };

  const setTierAmount = (id: string, place: number, amount: number) =>
    patchPool(id, p => ({ ...p, tiers: p.tiers.map(t => (t.place === place ? { ...t, amount } : t)) }));

  const parsedPercents = useMemo(
    () => percentText.split(/[\/,;\s]+/).map(Number).filter(n => Number.isFinite(n) && n > 0).slice(0, MAX_PLACES),
    [percentText],
  );
  const percentSum = round2(parsedPercents.reduce((s, n) => s + n, 0));

  const openPercent = (pool: PrizePool) => {
    setPercentFor(pool.id);
    setPercentTotal(poolSubtotal(pool));
    setPercentText('50/30/20');
  };

  const applyPercent = (id: string) => {
    if (percentTotal <= 0) { toast.error(trs('Escribe el monto de la bolsa')); return; }
    if (parsedPercents.length === 0) { toast.error(trs('Escribe al menos un porcentaje')); return; }
    patchPool(id, p => ({ ...p, tiers: presetTiers(percentTotal, parsedPercents) }));
    setPercentFor(null);
  };

  const deletePool = (id: string) => {
    setConfig(c => ({
      ...c,
      pools: c.pools.filter(p => p.id !== id).map(p => ({ ...p, excludeWinnersOf: p.excludeWinnersOf.filter(x => x !== id) })),
      manualExclusions: c.manualExclusions.filter(e => e.poolId !== id),
    }));
    if (percentFor === id) setPercentFor(null);
  };

  const movePool = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= config.pools.length) return;
    const pools = [...config.pools];
    [pools[idx], pools[target]] = [pools[target], pools[idx]];
    let removed = 0;
    const cleaned = pools.map((p, i) => {
      const earlier = new Set(pools.slice(0, i).map(x => x.id));
      const keep = p.excludeWinnersOf.filter(x => earlier.has(x));
      removed += p.excludeWinnersOf.length - keep.length;
      return keep.length === p.excludeWinnersOf.length ? p : { ...p, excludeWinnersOf: keep };
    });
    setConfig(c => ({ ...c, pools: cleaned }));
    if (removed > 0) toast.info(trs('Se quitaron exclusiones que apuntaban a bolsas que ahora van después'));
  };

  const toggleExcludeWinners = (id: string, prevId: string, checked: boolean) =>
    patchPool(id, p => ({
      ...p,
      excludeWinnersOf: checked
        ? [...new Set([...p.excludeWinnersOf, prevId])]
        : p.excludeWinnersOf.filter(x => x !== prevId),
    }));

  const addManualExclusion = (poolId: string, participantId: string) =>
    setConfig(c => (c.manualExclusions.some(e => e.poolId === poolId && e.participantId === participantId)
      ? c
      : { ...c, manualExclusions: [...c.manualExclusions, { poolId, participantId }] }));

  const removeManualExclusion = (poolId: string, participantId: string) =>
    setConfig(c => ({
      ...c,
      manualExclusions: c.manualExclusions.filter(e => !(e.poolId === poolId && e.participantId === participantId)),
    }));

  const generateOyes = () => {
    const merged = mergeGeneratedSlots(awards, par3.slots);
    const added = merged.length - awards.length;
    setAwards(merged);
    if (added > 0) toast.success(`${trs('Se agregaron')} ${added} ${trs('oyes')}`);
    else toast.info(trs('Los oyes de los par 3 ya estaban generados'));
  };

  const addAward = () =>
    setAwards(list => [...list, {
      id: uid('award'), label: '', holeNumber: null, dayNumber: null, amount: 0,
      winnerParticipantId: null, categoryId: null, note: '',
    }]);

  const handleSave = async () => {
    if (readOnly || errors.length > 0) return;
    const finalConfig: PrizeConfig = useCategories
      ? config
      : { ...config, categories: [], assignments: {}, pools: config.pools.map(p => ({ ...p, categoryId: null })) };
    const finalAwards = awards.map(a => ({ ...a, label: a.label.trim(), amount: cents(a.amount) / 100 }));
    const ok = await savePrizes({ config: finalConfig, awards: finalAwards });
    // Saving a new or draft setup publishes it so every participant can follow the prizes live.
    const publish = !prizes?.exists || prizes.status === 'draft';
    const published = ok && publish ? await setStatus('live') : false;
    if (ok) {
      toast.success(published ? trs('Premios guardados y visibles para todos') : trs('Premios guardados'));
      setBaseline(snapshotOf(finalConfig, finalAwards));
      onOpenChange(false);
    }
  };

  if (!isCreator) return null;

  const poolName = (id: string) => config.pools.find(p => p.id === id)?.label || trs('sin nombre');
  const pendingCategory = config.categories.find(c => c.id === pendingDeleteCategory);
  const pendingCategoryPools = config.pools.filter(p => p.categoryId === pendingDeleteCategory).length;
  const assignedCount = Object.keys(config.assignments).length;

  const playerOption = (p: PrizeSetupParticipant) => (
    <SelectItem key={p.id} value={p.id}>
      <span className="flex items-center gap-2">
        <PlayerAvatar initials={p.initials} background={p.avatar_color} size="sm" />
        <span className="truncate">{p.display_name}</span>
      </span>
    </SelectItem>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={v => (v ? onOpenChange(true) : requestClose())}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-1rem)] max-w-md flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="space-y-1 border-b px-4 pb-3 pt-4 text-left">
            <DialogTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              {trs('Configurar premios')}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {trs('Define bolsas por lugar, categorías y premios especiales. Los montos no llevan moneda.')}
            </DialogDescription>
          </DialogHeader>

          {!initialized ? (
            <div className="flex flex-1 items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {readOnly && (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>{trs('Los premios están congelados. Solo puedes consultarlos.')}</span>
                </div>
              )}
              {cleanedCount > 0 && (
                <p className="mt-3 text-[11px] text-muted-foreground">
                  {trs('Se limpiaron')} {cleanedCount} {trs('asignaciones de jugadores que ya no están.')}
                </p>
              )}

              <Accordion type="multiple" defaultValue={['pools']} className="w-full">
                {/* a) Total pool */}
                <AccordionItem value="total">
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <SectionTitle
                      title={trs('Bolsa total')}
                      hint={totalPool != null ? fmtMoney(totalPool) : trs('Opcional')}
                    />
                  </AccordionTrigger>
                  <AccordionContent>
                    <fieldset disabled={readOnly} className="space-y-2">
                      <Label className="text-xs">{trs('Monto total a repartir (opcional)')}</Label>
                      <OptionalNumberInput
                        value={config.totalPool ?? null}
                        onChange={v => setConfig(c => ({ ...c, totalPool: v }))}
                        placeholder={trs('Sin límite')}
                        ariaLabel={trs('Bolsa total')}
                      />
                      <p className={cn('text-xs font-medium', overBudget ? 'text-destructive' : 'text-muted-foreground')}>
                        {trs('Asignado')} {fmtMoney(assigned)}
                        {totalPool != null && <> {trs('de')} {fmtMoney(totalPool)}</>}
                      </p>
                    </fieldset>
                  </AccordionContent>
                </AccordionItem>

                {/* b) Categories */}
                <AccordionItem value="categories">
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <SectionTitle
                      title={trs('Categorías')}
                      hint={useCategories ? `${config.categories.length}` : trs('Apagado')}
                    />
                  </AccordionTrigger>
                  <AccordionContent>
                    <fieldset disabled={readOnly} className="space-y-3">
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-sm">{trs('Usar categorías')}</span>
                        <Switch checked={useCategories} onCheckedChange={onToggleCategories} />
                      </label>

                      {useCategories && (
                        <>
                          <div className="space-y-2">
                            {config.categories.length > 0 && (
                              <div className="grid grid-cols-[1fr_4rem_4rem_1.75rem] gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                <span>{trs('Nombre')}</span>
                                <span className="text-center">{trs('Hcp mín')}</span>
                                <span className="text-center">{trs('Hcp máx')}</span>
                                <span />
                              </div>
                            )}
                            {config.categories.map(cat => (
                              <div key={cat.id} className="grid grid-cols-[1fr_4rem_4rem_1.75rem] items-center gap-1.5">
                                <Input
                                  value={cat.name}
                                  onChange={e => patchCategory(cat.id, { name: e.target.value })}
                                  className="h-8 text-sm"
                                  aria-label={trs('Nombre de la categoría')}
                                />
                                <OptionalNumberInput
                                  value={cat.hcpMin ?? null}
                                  onChange={v => patchCategory(cat.id, { hcpMin: v })}
                                  allowNegative
                                  placeholder="—"
                                  className="text-center"
                                  ariaLabel={trs('Hcp mín')}
                                />
                                <OptionalNumberInput
                                  value={cat.hcpMax ?? null}
                                  onChange={v => patchCategory(cat.id, { hcpMax: v })}
                                  allowNegative
                                  placeholder="—"
                                  className="text-center"
                                  ariaLabel={trs('Hcp máx')}
                                />
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => requestDeleteCategory(cat.id)} aria-label={trs('Eliminar categoría')}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))}
                            <p className="text-[10px] text-muted-foreground">{trs('Rango vacío = sin límite. Ambos extremos se incluyen.')}</p>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" className="h-8 flex-1 text-xs" onClick={addCategory}>
                                <Plus className="mr-1 h-3.5 w-3.5" />{trs('Agregar categoría')}
                              </Button>
                              <Button
                                variant="secondary" size="sm" className="h-8 flex-1 text-xs"
                                onClick={autoAssign} disabled={config.categories.length === 0 || participants.length === 0}
                              >
                                <Sparkles className="mr-1 h-3.5 w-3.5" />{trs('Asignar por hándicap')}
                              </Button>
                            </div>
                          </div>

                          {config.categories.length > 0 && (
                            <div className="space-y-1.5 rounded-md border p-2">
                              <p className="text-xs font-medium">
                                {trs('Jugadores')} · {assignedCount}/{participants.length} {trs('con categoría')}
                              </p>
                              {participants.length === 0 && (
                                <p className="text-xs text-muted-foreground">{trs('Aún no hay jugadores en el torneo.')}</p>
                              )}
                              {sortedParticipants.map(p => (
                                <div key={p.id} className="flex items-center gap-2">
                                  <PlayerAvatar initials={p.initials} background={p.avatar_color} size="md" />
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-medium">{p.display_name}</p>
                                    <p className="text-[10px] text-muted-foreground">{trs('Hcp')} {p.handicap_for_leaderboard}</p>
                                  </div>
                                  <Select value={config.assignments[p.id] ?? NONE} onValueChange={v => setAssignment(p.id, v)}>
                                    <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value={NONE}>{trs('Sin categoría')}</SelectItem>
                                      {config.categories.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.name || trs('sin nombre')}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </fieldset>
                  </AccordionContent>
                </AccordionItem>

                {/* c) Pools */}
                <AccordionItem value="pools">
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <SectionTitle title={trs('Bolsas de premios')} hint={`${config.pools.length}`} />
                  </AccordionTrigger>
                  <AccordionContent>
                    <fieldset disabled={readOnly} className="space-y-3">
                      {config.pools.length === 0 && (
                        <p className="text-xs text-muted-foreground">{trs('Agrega una bolsa para premiar por lugar.')}</p>
                      )}
                      {config.pools.map(pool => {
                        const subtotal = poolSubtotal(pool);
                        const tiers = [...pool.tiers].sort((a, b) => a.place - b.place);
                        return (
                          <div key={pool.id} className="space-y-2 rounded-lg border bg-card p-3 shadow-sm">
                            <div className="flex items-center gap-1.5">
                              <Input
                                value={pool.label}
                                onChange={e => patchPool(pool.id, p => ({ ...p, label: e.target.value }))}
                                className="h-8 flex-1 text-sm font-semibold"
                                aria-label={trs('Nombre de la bolsa')}
                              />
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                                onClick={() => setPendingDeletePool(pool.id)} aria-label={trs('Eliminar bolsa')}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Select value={pool.mode} onValueChange={v => setPoolMode(pool.id, v as PrizeMode)}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {ALL_MODES.filter(m => availableModes.includes(m) || m === pool.mode).map(m => (
                                    <SelectItem key={m} value={m}>{trs(MODE_LABEL[m])}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select
                                value={pool.categoryId ?? NONE}
                                onValueChange={v => setPoolCategory(pool.id, v)}
                                disabled={readOnly || !useCategories || config.categories.length === 0}
                              >
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NONE}>{trs('Todos')}</SelectItem>
                                  {config.categories.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.name || trs('sin nombre')}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs">{trs('Lugares premiados')}</Label>
                              <div className="flex flex-nowrap items-center gap-1.5">
                              {[1, 2, 3, 4, 5].map(n => (
                                <Button
                                  key={n} type="button" size="sm"
                                  variant={tiers.length === n ? 'default' : 'outline'}
                                  className="h-8 w-8 p-0 text-xs tabular-nums"
                                  onClick={() => setPlaces(pool.id, n)}
                                  aria-label={`${n} ${trs('lugares')}`}
                                  aria-pressed={tiers.length === n}
                                >
                                  {n}
                                </Button>
                              ))}
                              <Button
                                type="button" size="sm"
                                variant={tiers.length > 5 ? 'default' : 'outline'}
                                className="h-8 min-w-8 px-2 text-xs tabular-nums"
                                onClick={() => setPlaces(pool.id, Math.max(6, tiers.length + 1))}
                                disabled={tiers.length >= MAX_PLACES}
                                aria-label={trs('Más lugares')}
                              >
                                {tiers.length > 5 ? tiers.length : '+'}
                              </Button>
                              {tiers.length > 5 && (
                                <Button
                                  type="button" size="sm" variant="outline"
                                  className="h-8 w-8 p-0 text-xs"
                                  onClick={() => setPlaces(pool.id, tiers.length + 1)}
                                  disabled={tiers.length >= MAX_PLACES}
                                  aria-label={trs('Más lugares')}
                                >
                                  +
                                </Button>
                              )}
                              </div>
                            </div>
                            <div className="flex items-center">
                              <Button
                                variant="outline" size="sm" className="ml-auto h-8 text-xs"
                                onClick={() => (percentFor === pool.id ? setPercentFor(null) : openPercent(pool))}
                              >
                                <Percent className="mr-1 h-3.5 w-3.5" />{trs('Repartir por porcentaje')}
                              </Button>
                            </div>

                            {percentFor === pool.id && (
                              <div className="space-y-2 rounded-md bg-muted/60 p-2">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <Label className="text-[11px]">{trs('Monto de la bolsa')}</Label>
                                    <AmountInput value={percentTotal} onChange={setPercentTotal} ariaLabel={trs('Monto de la bolsa')} />
                                  </div>
                                  <div>
                                    <Label className="text-[11px]">{trs('Porcentajes')}</Label>
                                    <Input
                                      value={percentText}
                                      onChange={e => setPercentText(e.target.value)}
                                      className="h-8 text-sm tabular-nums"
                                      placeholder="50/30/20"
                                      aria-label={trs('Porcentajes')}
                                    />
                                  </div>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className={cn('text-[11px]', percentSum !== 100 ? 'text-destructive' : 'text-muted-foreground')}>
                                    {trs('Suman')} {percentSum}% · {parsedPercents.length} {trs('lugares')}
                                  </span>
                                  <Button size="sm" className="h-7 text-xs" onClick={() => applyPercent(pool.id)}>
                                    {trs('Aplicar')}
                                  </Button>
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                              {tiers.map(t => (
                                <div key={t.place} className="flex items-center gap-1.5">
                                  <span className="w-10 shrink-0 text-xs font-semibold text-primary">{t.place}º</span>
                                  <AmountInput
                                    value={Number(t.amount) || 0}
                                    onChange={v => setTierAmount(pool.id, t.place, v)}
                                    ariaLabel={`${trs('Lugar')} ${t.place}`}
                                  />
                                </div>
                              ))}
                            </div>
                            <p className="text-right text-xs text-muted-foreground">
                              {trs('Subtotal')}: <span className="font-semibold text-foreground">{fmtMoney(subtotal)}</span>
                            </p>
                          </div>
                        );
                      })}

                      <div className="space-y-2 rounded-lg border border-dashed p-3">
                        <div className="grid grid-cols-2 gap-2">
                          <Select value={newPoolMode} onValueChange={v => setNewPoolMode(v as PrizeMode)}>
                            <SelectTrigger className="h-8 text-xs" aria-label={trs('Modalidad')}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {availableModes.map(m => <SelectItem key={m} value={m}>{trs(MODE_LABEL[m])}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Select
                            value={newPoolCategory}
                            onValueChange={setNewPoolCategory}
                            disabled={readOnly || !useCategories || config.categories.length === 0}
                          >
                            <SelectTrigger className="h-8 text-xs" aria-label={trs('Categoría')}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>{trs('Todos')}</SelectItem>
                              {config.categories.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.name || trs('sin nombre')}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button size="sm" className="h-8 w-full text-xs" onClick={addPool}>
                          <Plus className="mr-1 h-3.5 w-3.5" />{trs('Agregar bolsa')}
                        </Button>
                      </div>
                    </fieldset>
                  </AccordionContent>
                </AccordionItem>

                {/* d) Exclusions */}
                {config.pools.length > 0 && (
                  <AccordionItem value="exclusions">
                    <AccordionTrigger className="py-3 hover:no-underline">
                      <SectionTitle
                        title={trs('Exclusiones y orden')}
                        hint={`${config.pools.reduce((s, p) => s + p.excludeWinnersOf.length, 0) + config.manualExclusions.length}`}
                      />
                    </AccordionTrigger>
                    <AccordionContent>
                      <fieldset disabled={readOnly} className="space-y-3">
                        <p className="text-[11px] text-muted-foreground">
                          {trs('Los empates reparten por igual la suma de los lugares empatados. Solo cobran quienes completan todos los hoyos.')}
                        </p>
                        {config.pools.map((pool, idx) => {
                          const earlier = config.pools.slice(0, idx);
                          const excluded = config.manualExclusions.filter(e => e.poolId === pool.id);
                          const excludedIds = new Set(excluded.map(e => e.participantId));
                          const options = sortedParticipants.filter(p => !excludedIds.has(p.id));
                          return (
                            <div key={pool.id} className="space-y-2 rounded-lg border p-3">
                              <div className="flex items-center gap-1">
                                <span className="w-5 text-xs font-semibold text-muted-foreground">{idx + 1}.</span>
                                <span className="flex-1 truncate text-sm font-semibold">{pool.label || trs('sin nombre')}</span>
                                {config.pools.length > 1 && (
                                  <>
                                    <Button
                                      variant="ghost" size="icon" className="h-7 w-7" disabled={readOnly || idx === 0}
                                      onClick={() => movePool(idx, -1)} aria-label={trs('Subir')}
                                    >
                                      <ArrowUp className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost" size="icon" className="h-7 w-7"
                                      disabled={readOnly || idx === config.pools.length - 1}
                                      onClick={() => movePool(idx, 1)} aria-label={trs('Bajar')}
                                    >
                                      <ArrowDown className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                )}
                              </div>
                              {earlier.map(prev => (
                                <label key={prev.id} className="flex cursor-pointer items-start gap-2 text-xs">
                                  <Checkbox
                                    checked={pool.excludeWinnersOf.includes(prev.id)}
                                    onCheckedChange={v => toggleExcludeWinners(pool.id, prev.id, v === true)}
                                    className="mt-0.5"
                                  />
                                  <span>{trs('Quien gane en')} <strong>{prev.label || trs('sin nombre')}</strong> {trs('no cobra aquí')}</span>
                                </label>
                              ))}
                              <div className="space-y-1.5">
                                <Select
                                  value=""
                                  onValueChange={v => addManualExclusion(pool.id, v)}
                                  disabled={readOnly || options.length === 0}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder={trs('Excluir jugador manualmente')} />
                                  </SelectTrigger>
                                  <SelectContent>{options.map(playerOption)}</SelectContent>
                                </Select>
                                {excluded.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {excluded.map(e => (
                                      <span
                                        key={e.participantId}
                                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]"
                                      >
                                        {participantsById.get(e.participantId)?.display_name ?? trs('Jugador')}
                                        {!readOnly && (
                                          <button
                                            type="button"
                                            onClick={() => removeManualExclusion(pool.id, e.participantId)}
                                            aria-label={trs('Quitar exclusión')}
                                            className="text-muted-foreground hover:text-foreground"
                                          >
                                            <X className="h-3 w-3" />
                                          </button>
                                        )}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </fieldset>
                    </AccordionContent>
                  </AccordionItem>
                )}

                {/* e) Special awards */}
                <AccordionItem value="awards">
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <SectionTitle title={trs('Premios especiales')} hint={`${awards.length}`} />
                  </AccordionTrigger>
                  <AccordionContent>
                    <fieldset disabled={readOnly} className="space-y-3">
                      <div className="flex flex-col gap-2">
                        <Button
                          variant="secondary" size="sm" className="h-8 text-xs"
                          onClick={generateOyes} disabled={readOnly || par3.loading || par3.slots.length === 0}
                        >
                          {par3.loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
                          {trs('Generar oyes de los par 3')}
                        </Button>
                        {!par3.loading && !par3.hasLinkedRounds && (
                          <p className="text-[11px] text-muted-foreground">
                            {trs('Vincula una ronda para generar los oyes automáticamente, o agrégalos manualmente.')}
                          </p>
                        )}
                        {!par3.loading && par3.hasLinkedRounds && par3.slots.length === 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            {trs('No se encontraron hoyos par 3 en las rondas vinculadas. Puedes agregar los oyes manualmente.')}
                          </p>
                        )}
                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addAward}>
                          <Plus className="mr-1 h-3.5 w-3.5" />{trs('Agregar premio especial')}
                        </Button>
                      </div>

                      {awards.map(a => (
                        <div key={a.id} className="space-y-2 rounded-lg border bg-card p-3 shadow-sm">
                          <div className="flex items-center gap-1.5">
                            <Input
                              value={a.label}
                              onChange={e => patchAward(a.id, { label: e.target.value })}
                              placeholder={trs('Ej. Drive más largo')}
                              className="h-8 flex-1 text-sm font-medium"
                              aria-label={trs('Nombre del premio')}
                            />
                            <AmountInput
                              value={Number(a.amount) || 0}
                              onChange={v => patchAward(a.id, { amount: v })}
                              className="w-24"
                              ariaLabel={trs('Monto')}
                            />
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                              onClick={() => setAwards(list => list.filter(x => x.id !== a.id))}
                              aria-label={trs('Eliminar premio')}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <div className={cn('grid gap-2', useCategories && config.categories.length > 0 ? 'grid-cols-2' : 'grid-cols-1')}>
                            <Select
                              value={a.winnerParticipantId ?? NONE}
                              onValueChange={v => patchAward(a.id, { winnerParticipantId: v === NONE ? null : v })}
                            >
                              <SelectTrigger className="h-8 text-xs" aria-label={trs('Ganador')}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>{trs('Sin ganador aún')}</SelectItem>
                                {sortedParticipants.map(playerOption)}
                              </SelectContent>
                            </Select>
                            {useCategories && config.categories.length > 0 && (
                              <Select
                                value={a.categoryId ?? NONE}
                                onValueChange={v => patchAward(a.id, { categoryId: v === NONE ? null : v })}
                              >
                                <SelectTrigger className="h-8 text-xs" aria-label={trs('Categoría')}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NONE}>{trs('Todos')}</SelectItem>
                                  {config.categories.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.name || trs('sin nombre')}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                          <Input
                            value={a.note ?? ''}
                            onChange={e => patchAward(a.id, { note: e.target.value })}
                            placeholder={trs('Nota (opcional)')}
                            className="h-8 text-xs"
                            aria-label={trs('Nota')}
                          />
                        </div>
                      ))}
                    </fieldset>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          )}

          {/* f) Sticky summary */}
          <div className="space-y-2 border-t bg-background px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{trs('Asignado')}</span>
              <span className={cn('font-semibold tabular-nums', overBudget && 'text-destructive')}>
                {fmtMoney(assigned)}{totalPool != null && <span className="font-normal text-muted-foreground"> / {fmtMoney(totalPool)}</span>}
              </span>
            </div>
            {initialized && !readOnly && (errors.length > 0 || warnings.length > 0) && (
              <ul className="max-h-24 space-y-1 overflow-y-auto text-[11px]">
                {errors.map((e, i) => (
                  <li key={`e${i}`} className="flex items-start gap-1.5 text-destructive">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /><span>{trs(e)}</span>
                  </li>
                ))}
                {warnings.map((w, i) => (
                  <li key={`w${i}`} className="flex items-start gap-1.5 text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /><span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={requestClose}>
                {readOnly ? trs('Cerrar') : trs('Cancelar')}
              </Button>
              {!readOnly && (
                <Button className="flex-1" onClick={handleSave} disabled={!initialized || saving || errors.length > 0}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {!prizes?.exists || prizes.status === 'draft' ? trs('Guardar y publicar') : trs('Guardar')}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{trs('¿Descartar cambios?')}</AlertDialogTitle>
            <AlertDialogDescription>{trs('Tienes cambios en los premios que no se han guardado.')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{trs('Seguir editando')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmDiscard(false); onOpenChange(false); }}>
              {trs('Descartar')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDisableCategories} onOpenChange={setConfirmDisableCategories}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{trs('¿Dejar de usar categorías?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {trs('Se quitarán las categorías y las asignaciones de jugadores. Las bolsas por categoría pasarán a Todos.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{trs('Cancelar')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { disableCategories(); setConfirmDisableCategories(false); }}>
              {trs('Quitar categorías')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingDeleteCategory} onOpenChange={v => !v && setPendingDeleteCategory(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{trs('¿Eliminar categoría?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {trs('La categoría')} "{pendingCategory?.name || trs('sin nombre')}" {trs('la usan')} {pendingCategoryPools}{' '}
              {trs('bolsa(s). Esas bolsas pasarán a Todos y sus jugadores quedarán sin categoría.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{trs('Cancelar')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (pendingDeleteCategory) deleteCategory(pendingDeleteCategory); setPendingDeleteCategory(null); }}
            >
              {trs('Eliminar')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingDeletePool} onOpenChange={v => !v && setPendingDeletePool(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{trs('¿Eliminar bolsa?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {trs('Se eliminará')} "{pendingDeletePool ? poolName(pendingDeletePool) : ''}" {trs('con sus lugares y exclusiones.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{trs('Cancelar')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (pendingDeletePool) deletePool(pendingDeletePool); setPendingDeletePool(null); }}
            >
              {trs('Eliminar')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PrizeSetupDialog;
